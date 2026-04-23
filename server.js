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

const reviewSchema = new mongoose.Schema({
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
const Review = mongoose.model('Review', reviewSchema, 'reviews'); 

const settingsSchema = new mongoose.Schema({
    widgetId: { type: String, default: 'default' }, 
    autoApproveVerified: { type: Boolean, default: false },
    autoApproveMinStars: { type: Number, default: 4 },
    filters: { type: Array, default: [] },
    widgetStyles: {
        primaryColor: { type: String, default: '#000000' },
        starColor: { type: String, default: '#fbbf24' },
        titleSize: { type: Number, default: 26 },
        textSize: { type: Number, default: 15 },
        borderRadius: { type: Number, default: 12 }
    }
});
const Settings = mongoose.model('Settings', settingsSchema, 'settings');

async function initSettings() {
    try {
        const exists = await Settings.findOne({ widgetId: 'default' });
        if (!exists) await new Settings({ widgetId: 'default' }).save();
    } catch (e) { console.log("Settings init bypassed"); }
}
initSettings();

function generateMagicToken(orderId, email) {
    const secret = process.env.SHOPIFY_API_SECRET || 'fallback-nectar-secret';
    const data = `${String(orderId).trim().toLowerCase()}:${String(email).trim().toLowerCase()}`;
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

async function verifyShopifyOrder(orderId, email, productId) {
    const STORE_URL = process.env.SHOPIFY_STORE_URL; 
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
// PUBLIC ROUTES
// ==========================================
app.get('/', (req, res) => res.send('🚀 Nectar API Live'));

app.get('/api/widget/styles', async (req, res) => {
    try {
        const config = await Settings.findOne({ widgetId: 'default' });
        res.status(200).json(config ? config.widgetStyles : {});
    } catch (e) { res.status(500).json({}); }
});

app.get('/api/reviews/:itemId', async (req, res) => {
    try { 
        const reviews = await Review.find({ 
            itemId: String(req.params.itemId), 
            status: 'accepted', 
            isDeleted: { $ne: true }, 
            isSpam: { $ne: true } 
        }).sort({ createdAt: -1 });
        res.status(200).json(reviews); 
    } catch (error) { res.status(500).json({ error: "Fetch error" }); }
});

// NEW: Fetch a single specific review (used to check status of a user's pending review)
app.get('/api/reviews/single/:id', async (req, res) => {
    try {
        const review = await Review.findById(req.params.id);
        if (!review) return res.status(404).json({ error: "Not found" });
        res.status(200).json(review);
    } catch (error) { res.status(500).json({ error: "Fetch error" }); }
});

app.post('/api/reviews', async (req, res) => {
    try {
        let isVerified = req.body.verifiedPurchase; 
        let vNote = "Verified automatically by Shopify.";
        let finalStatus = 'pending';
        let flaggedSpam = false;

        if (!isVerified && req.body.orderId && req.body.email) {
            const checkResult = await verifyShopifyOrder(req.body.orderId, req.body.email, req.body.itemId);
            isVerified = checkResult.verified;
            vNote = checkResult.note;
        } else if (!isVerified && !req.body.orderId) vNote = "No Order ID provided.";

        if (!isVerified && req.body.email) {
            const recentUnverified = await Review.countDocuments({ email: req.body.email, verifiedPurchase: false, createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) }});
            if (recentUnverified >= 2) { flaggedSpam = true; finalStatus = 'rejected'; vNote = "SPAM FLAG: Too many unverified reviews."; }
        }

        const config = await Settings.findOne({ widgetId: 'default' });
        if (!flaggedSpam && config && config.autoApproveVerified && isVerified) {
            if (req.body.rating >= config.autoApproveMinStars) finalStatus = 'accepted';
        }

        const newReview = new Review({
            itemId: String(req.body.itemId), userId: req.body.userId, email: req.body.email,
            isAnonymous: req.body.isAnonymous, rating: req.body.rating, headline: req.body.headline,
            comment: req.body.comment, attributes: req.body.attributes, productTags: req.body.productTags,
            verifiedPurchase: isVerified, verificationNote: vNote, orderId: req.body.orderId, 
            status: finalStatus, isSpam: flaggedSpam, isDeleted: flaggedSpam, deletedAt: flaggedSpam ? new Date() : null
        });

        res.status(201).json(await newReview.save());
    } catch (error) { res.status(400).json({ error: "Failed to submit" }); }
});

// MAGIC LINK ROUTES
app.get('/api/magic-link/order', async (req, res) => {
    const { orderId, email, token } = req.query;
    if (!orderId || !email || !token) return res.status(400).json({ error: "Missing parameters" });
    const expectedToken = generateMagicToken(orderId, email);
    if (token !== expectedToken) return res.status(403).json({ error: "Invalid or expired secure link." });

    const STORE_URL = process.env.SHOPIFY_STORE_URL; 
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
    const { orderId, email, token, reviews } = req.body; 
    if (token !== generateMagicToken(orderId, email)) return res.status(403).json({ error: "Invalid secure link." });

    try {
        const config = await Settings.findOne({ widgetId: 'default' });
        const savedReviews = [];

        for (const rev of reviews) {
            let finalStatus = 'pending';
            if (config && config.autoApproveVerified && rev.rating >= config.autoApproveMinStars) finalStatus = 'accepted';
            const newReview = new Review({
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
    const { orderId, email } = req.query;
    if(!orderId || !email) return res.status(400).send("Need orderId and email");
    const token = generateMagicToken(orderId, email);
    res.send(`?orderId=${orderId}&email=${email}&token=${token}`);
});

// ==========================================
// ADMIN ROUTES & PATCH UPDATER
// ==========================================
app.get('/api/admin/reviews', async (req, res) => {
    try { res.status(200).json(await Review.find().sort({ createdAt: -1 })); } 
    catch (error) { res.status(500).json({ error: "Admin fetch error" }); }
});

app.patch('/api/reviews/:id', async (req, res) => {
    try {
        const updateData = {};
        
        // Admin updates
        if (req.body.status !== undefined) updateData.status = req.body.status;
        if (req.body.reply !== undefined) updateData.reply = req.body.reply;
        if (req.body.verifiedPurchase !== undefined) updateData.verifiedPurchase = req.body.verifiedPurchase;
        if (req.body.verificationNote !== undefined) updateData.verificationNote = req.body.verificationNote;
        if (req.body.isDeleted !== undefined) {
            updateData.isDeleted = req.body.isDeleted;
            updateData.deletedAt = req.body.isDeleted ? new Date() : null; 
            if (req.body.isDeleted === false) updateData.isSpam = false; 
        }

        // UPDATED: Allow users to edit their pending reviews
        if (req.body.rating !== undefined) updateData.rating = req.body.rating;
        if (req.body.headline !== undefined) updateData.headline = req.body.headline;
        if (req.body.comment !== undefined) updateData.comment = req.body.comment;
        if (req.body.attributes !== undefined) updateData.attributes = req.body.attributes;

        res.json(await Review.findByIdAndUpdate(req.params.id, updateData, { new: true }));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/settings', async (req, res) => {
    try { res.status(200).json(await Settings.findOne({ widgetId: 'default' })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/admin/settings', async (req, res) => {
    try { res.status(200).json(await Settings.findOneAndUpdate({ widgetId: 'default' }, req.body, { new: true, upsert: true })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Port ${PORT}`));
