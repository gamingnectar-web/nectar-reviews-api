require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto'); 

const app = express();

app.use(cors()); 
app.use(express.json());
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "frame-ancestors https://*.myshopify.com https://admin.shopify.com;");
    next();
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// ==========================================
// SAAS SCHEMAS (Multi-Tenant)
// ==========================================
const reviewSchema = new mongoose.Schema({
    shopDomain: { type: String, required: true }, // NEW: Locks review to a specific store
    itemId: { type: String, required: true },
    userId: { type: String, required: true }, 
    email: { type: String }, 
    isAnonymous: { type: Boolean, default: false }, 
    rating: { type: Number, required: true, min: 1, max: 5 },
    headline: { type: String }, 
    comment: { type: String },
    reply: { type: String, default: '' },
    attributes: { type: Map, of: Number }, 
    productTags: { type: [String], default: [] }, 
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'hold'], default: 'pending' },
    verifiedPurchase: { type: Boolean, default: false },
    verificationNote: { type: String, default: '' }, 
    orderId: { type: String }, 
    isDeleted: { type: Boolean, default: false },
    isSpam: { type: Boolean, default: false }, 
    deletedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

reviewSchema.index({ deletedAt: 1 }, { expireAfterSeconds: 2419200 });
// Compound index for fast queries across tenants
reviewSchema.index({ shopDomain: 1, itemId: 1 }); 
const Review = mongoose.model('Review', reviewSchema, 'reviews'); 

const settingsSchema = new mongoose.Schema({
    shopDomain: { type: String, required: true, unique: true }, 
    autoApproveVerified: { type: Boolean, default: false },
    autoApproveMinStars: { type: Number, default: 4 },
    filters: { type: Array, default: [] },
    attributeProfiles: { type: Array, default: [] },
    widgetStyles: {
        primaryColor: { type: String, default: '#000000' },
        starColor: { type: String, default: '#fbbf24' },
        titleSize: { type: Number, default: 26 },
        textSize: { type: Number, default: 15 },
        borderRadius: { type: Number, default: 12 },
        // NEW: Empty State Customization
        emptyStateMode: { type: String, default: 'stars_text' }, // 'hidden', 'text_only', 'stars_text'
        emptyStateText: { type: String, default: 'No reviews yet. Be the first to leave one!' }
    }
});
const Settings = mongoose.model('Settings', settingsSchema, 'settings');

// ==========================================
// MAGIC LINK & VERIFICATION LOGIC
// ==========================================
function generateMagicToken(shopDomain, orderId, email) {
    const secret = process.env.SHOPIFY_API_SECRET || 'fallback-nectar-secret';
    const data = `${String(shopDomain).trim().toLowerCase()}:${String(orderId).trim().toLowerCase()}:${String(email).trim().toLowerCase()}`;
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

// NOTE: For a fully public app, STORE_URL and CLIENT_SECRET will be fetched from a database based on shopDomain. 
// For now, we pass shopDomain through the architecture to prepare it, while using the .env fallback.
async function verifyShopifyOrder(shopDomain, orderId, email, productId) {
    const STORE_URL = shopDomain || process.env.SHOPIFY_STORE_URL; 
    const CLIENT_ID = process.env.SHOPIFY_API_KEY; 
    const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET; 

    if (!STORE_URL || !CLIENT_ID || !CLIENT_SECRET || !email || !orderId) return { verified: false, note: "Missing details." };

    const rawNumber = orderId.replace(/\D/g, ""); 
    const searchTerms = [`#${rawNumber}`, rawNumber]; 
    const authString = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

    for (const term of searchTerms) {
        try {
            const response = await fetch(`https://${STORE_URL}/admin/api/2024-01/orders.json?name=${encodeURIComponent(term)}&status=any`, {
                headers: { 'Authorization': `Basic ${authString}`, 'Content-Type': 'application/json' }
            });
            const data = await response.json();

            if (data.orders && data.orders.length > 0) {
                const order = data.orders.find(o => String(o.order_number) === rawNumber || o.name === `#${rawNumber}` || o.name === rawNumber);
                if (order) {
                    if (!order.email || order.email.toLowerCase() !== email.toLowerCase()) return { verified: false, note: `Wrong email.` };
                    const boughtProduct = order.line_items.some(item => String(item.product_id) === String(productId) || String(item.variant_id) === String(productId));
                    if (!boughtProduct) return { verified: false, note: "Product not in order." };
                    return { verified: true, note: "Successfully verified." };
                }
            }
        } catch (error) { console.error("API Error:", error); }
    }
    return { verified: false, note: "Order ID not found." };
}

// ==========================================
// PUBLIC STOREFRONT ROUTES
// ==========================================
app.get('/', (req, res) => res.send('🚀 Nectar API Live - SaaS Edition'));

app.get('/api/widget/config', async (req, res) => {
    const { shopDomain } = req.query;
    if (!shopDomain) return res.status(400).json({ error: "Missing shopDomain" });
    try {
        const config = await Settings.findOne({ shopDomain: shopDomain });
        res.status(200).json({
            styles: config ? config.widgetStyles : {},
            profiles: config ? config.attributeProfiles : []
        });
    } catch (e) { res.status(500).json({}); }
});

app.get('/api/reviews/:itemId', async (req, res) => {
    const { shopDomain } = req.query;
    if (!shopDomain) return res.status(400).json({ error: "Missing shopDomain" });
    try { 
        const reviews = await Review.find({ 
            shopDomain: shopDomain,
            itemId: String(req.params.itemId), 
            status: 'accepted', 
            isDeleted: { $ne: true }, 
            isSpam: { $ne: true } 
        }).sort({ createdAt: -1 });
        res.status(200).json(reviews); 
    } catch (error) { res.status(500).json({ error: "Fetch error" }); }
});

app.get('/api/reviews/single/:id', async (req, res) => {
    try {
        const review = await Review.findById(req.params.id);
        if (!review) return res.status(404).json({ error: "Not found" });
        res.status(200).json(review);
    } catch (error) { res.status(500).json({ error: "Fetch error" }); }
});

app.post('/api/reviews', async (req, res) => {
    const { shopDomain } = req.body;
    if (!shopDomain) return res.status(400).json({ error: "Missing shopDomain" });

    try {
        let isVerified = req.body.verifiedPurchase; 
        let vNote = "Verified automatically by Shopify.";
        let finalStatus = 'pending';
        let flaggedSpam = false;

        if (!isVerified && req.body.orderId && req.body.email) {
            const checkResult = await verifyShopifyOrder(shopDomain, req.body.orderId, req.body.email, req.body.itemId);
            isVerified = checkResult.verified;
            vNote = checkResult.note;
        } else if (!isVerified && !req.body.orderId) vNote = "No Order ID provided.";

        if (!isVerified && req.body.email) {
            const recentUnverified = await Review.countDocuments({ shopDomain, email: req.body.email, verifiedPurchase: false, createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) }});
            if (recentUnverified >= 2) { flaggedSpam = true; finalStatus = 'rejected'; vNote = "SPAM FLAG: Too many unverified reviews."; }
        }

        const config = await Settings.findOne({ shopDomain: shopDomain });
        if (!flaggedSpam && config && config.autoApproveVerified && isVerified) {
            if (req.body.rating >= config.autoApproveMinStars) finalStatus = 'accepted';
        }

        const newReview = new Review({
            shopDomain: shopDomain,
            itemId: String(req.body.itemId), userId: req.body.userId, email: req.body.email,
            isAnonymous: req.body.isAnonymous, rating: req.body.rating, headline: req.body.headline,
            comment: req.body.comment, attributes: req.body.attributes, productTags: req.body.productTags,
            verifiedPurchase: isVerified, verificationNote: vNote, orderId: req.body.orderId, 
            status: finalStatus, isSpam: flaggedSpam, isDeleted: flaggedSpam, deletedAt: flaggedSpam ? new Date() : null
        });

        res.status(201).json(await newReview.save());
    } catch (error) { res.status(400).json({ error: "Failed to submit" }); }
});

// ==========================================
// MAGIC LINK BULK ROUTES
// ==========================================
app.get('/api/magic-link/order', async (req, res) => {
    const { shopDomain, orderId, email, token } = req.query;
    if (!shopDomain || !orderId || !email || !token) return res.status(400).json({ error: "Missing parameters" });
    
    const expectedToken = generateMagicToken(shopDomain, orderId, email);
    if (token !== expectedToken) return res.status(403).json({ error: "Invalid or expired secure link." });

    const STORE_URL = shopDomain || process.env.SHOPIFY_STORE_URL; 
    const CLIENT_ID = process.env.SHOPIFY_API_KEY; 
    const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET; 
    const authString = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const rawNumber = orderId.replace(/\D/g, ""); 

    try {
        const response = await fetch(`https://${STORE_URL}/admin/api/2024-01/orders.json?name=${encodeURIComponent(rawNumber)}&status=any`, {
            headers: { 'Authorization': `Basic ${authString}`, 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (data.orders && data.orders.length > 0) {
            const order = data.orders.find(o => String(o.order_number) === rawNumber || o.name.includes(rawNumber));
            if (order && order.email.toLowerCase() === email.toLowerCase()) {
                const products = order.line_items.map(item => ({
                    productId: item.product_id, variantId: item.variant_id, name: item.title, image: null 
                })).filter(item => item.productId); 
                return res.status(200).json({ products, customerName: order.customer?.first_name || "Customer" });
            }
        }
        return res.status(404).json({ error: "Order not found" });
    } catch (err) { return res.status(500).json({ error: "Failed to fetch order details" }); }
});

app.post('/api/reviews/bulk', async (req, res) => {
    const { shopDomain, orderId, email, token, reviews } = req.body; 
    if (!shopDomain) return res.status(400).json({ error: "Missing shopDomain" });
    if (token !== generateMagicToken(shopDomain, orderId, email)) return res.status(403).json({ error: "Invalid secure link." });

    try {
        const config = await Settings.findOne({ shopDomain: shopDomain });
        const savedReviews = [];

        for (const rev of reviews) {
            let finalStatus = 'pending';
            if (config && config.autoApproveVerified && rev.rating >= config.autoApproveMinStars) finalStatus = 'accepted';
            const newReview = new Review({
                shopDomain: shopDomain,
                itemId: String(rev.itemId), userId: rev.userId, email: email,
                isAnonymous: rev.isAnonymous, rating: rev.rating, headline: rev.headline,
                comment: rev.comment, attributes: rev.attributes || {}, productTags: rev.productTags || [],
                verifiedPurchase: true, verificationNote: "Auto-Verified via Email Magic Link",
                orderId: orderId, status: finalStatus
            });
            savedReviews.push(await newReview.save());
        }
        res.status(201).json({ message: "Successfully saved bulk reviews", count: savedReviews.length });
    } catch (error) { res.status(400).json({ error: "Failed to submit bulk reviews" }); }
});

app.get('/api/admin/generate-link', (req, res) => {
    const { shopDomain, orderId, email } = req.query;
    if(!shopDomain || !orderId || !email) return res.status(400).send("Need shopDomain, orderId and email");
    const token = generateMagicToken(shopDomain, orderId, email);
    res.send(`?shopDomain=${shopDomain}&orderId=${orderId}&email=${email}&token=${token}`);
});

// ==========================================
// ADMIN DASHBOARD ROUTES
// ==========================================
app.get('/api/admin/reviews', async (req, res) => {
    const { shopDomain } = req.query;
    if (!shopDomain) return res.status(400).json({ error: "Missing shopDomain" });
    try { res.status(200).json(await Review.find({ shopDomain: shopDomain }).sort({ createdAt: -1 })); } 
    catch (error) { res.status(500).json({ error: "Admin fetch error" }); }
});

app.patch('/api/reviews/:id', async (req, res) => {
    // Note: In a full SaaS app, you'd also verify shopDomain via session token here to ensure
    // a malicious admin can't patch a review from another store.
    try {
        const updateData = {};
        if (req.body.status !== undefined) updateData.status = req.body.status;
        if (req.body.reply !== undefined) updateData.reply = req.body.reply;
        if (req.body.verifiedPurchase !== undefined) updateData.verifiedPurchase = req.body.verifiedPurchase;
        if (req.body.verificationNote !== undefined) updateData.verificationNote = req.body.verificationNote;
        if (req.body.isDeleted !== undefined) {
            updateData.isDeleted = req.body.isDeleted;
            updateData.deletedAt = req.body.isDeleted ? new Date() : null; 
            if (req.body.isDeleted === false) updateData.isSpam = false; 
        }

        if (req.body.rating !== undefined) updateData.rating = req.body.rating;
        if (req.body.headline !== undefined) updateData.headline = req.body.headline;
        if (req.body.comment !== undefined) updateData.comment = req.body.comment;
        if (req.body.attributes !== undefined) updateData.attributes = req.body.attributes;

        res.json(await Review.findByIdAndUpdate(req.params.id, updateData, { new: true }));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/settings', async (req, res) => {
    const { shopDomain } = req.query;
    if (!shopDomain) return res.status(400).json({ error: "Missing shopDomain" });
    try { res.status(200).json(await Settings.findOne({ shopDomain: shopDomain })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/admin/settings', async (req, res) => {
    const { shopDomain } = req.body;
    if (!shopDomain) return res.status(400).json({ error: "Missing shopDomain" });
    try { res.status(200).json(await Settings.findOneAndUpdate({ shopDomain: shopDomain }, req.body, { new: true, upsert: true })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Port ${PORT}`));
