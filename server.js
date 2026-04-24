require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors()); 
app.use(express.json());

app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "frame-ancestors https://*.myshopify.com https://admin.shopify.com;");
    next();
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ DB Connected'))
  .catch((err) => console.error('❌ DB Connection Error:', err));

// ==========================================
// SCHEMAS 
// ==========================================
const reviewSchema = new mongoose.Schema({
    shopDomain: { type: String, required: true },
    itemId: { type: String, required: true },
    userId: { type: String, required: true }, 
    email: { type: String }, 
    isAnonymous: { type: Boolean, default: false }, 
    rating: { type: Number, required: true, min: 1, max: 5 },
    headline: { type: String }, 
    comment: { type: String },
    reply: { type: String, default: '' },
    attributes: { type: Map, of: Number }, 
    source: { type: String, enum: ['website', 'email', 'import'], default: 'website' }, 
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'hold'], default: 'pending' },
    verifiedPurchase: { type: Boolean, default: false },
    verificationNote: { type: String, default: '' }, 
    orderId: { type: String }, 
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }, 
    createdAt: { type: Date, default: Date.now }
});

reviewSchema.index({ deletedAt: 1 }, { expireAfterSeconds: 2419200 });
const Review = mongoose.model('Review', reviewSchema, 'reviews');

const settingsSchema = new mongoose.Schema({
    shopDomain: { type: String, required: true, unique: true },
    emailsSentTotal: { type: Number, default: 0 }, 
    
    // UPGRADED AUTO-APPROVE RULES
    autoApproveEnabled: { type: Boolean, default: false },
    autoApproveType: { type: String, enum: ['verified', 'all'], default: 'verified' },
    autoApproveMinStars: { type: Number, default: 4 },
    
    attributeProfiles: { type: [String], default: [] }, // Array of Strings (e.g. ["Quality", "Fit"])
    
    widgetStyles: {
        primaryColor: { type: String, default: '#000000' },
        starColor: { type: String, default: '#ffc700' },
        textSize: { type: Number, default: 15 },
        emptyMode: { type: String, default: 'stars_text' },
        emptyText: { type: String, default: 'No reviews yet.' }
    },
    cardStyles: {
        starSize: { type: Number, default: 14 },
        showCount: { type: Boolean, default: true }
    }
});
const Settings = mongoose.model('Settings', settingsSchema, 'settings');

// ==========================================
// SHOPIFY VERIFICATION LOGIC
// ==========================================
async function verifyShopifyOrder(orderId, email, productId) {
    const STORE_URL = process.env.SHOPIFY_STORE_URL; 
    const CLIENT_ID = process.env.SHOPIFY_API_KEY; 
    const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET; 

    if (!STORE_URL || !CLIENT_ID || !CLIENT_SECRET || !email || !orderId) {
        return { verified: false, note: "Missing details (Email or Order ID)." };
    }

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
                    if (!order.email || order.email.toLowerCase() !== email.toLowerCase()) {
                        return { verified: false, note: `Order exists, but placed under a different email.` };
                    }
                    const boughtProduct = order.line_items.some(item => String(item.product_id) === String(productId) || String(item.variant_id) === String(productId));
                    if (!boughtProduct) {
                        return { verified: false, note: "Email & Order ID match, but this product wasn't in the order." };
                    }
                    return { verified: true, note: "Successfully verified against Shopify order." };
                }
            }
        } catch (error) { console.error("Shopify API Error:", error); }
    }
    return { verified: false, note: "This Order ID does not exist in your Shopify." };
}

// ==========================================
// API ROUTES
// ==========================================
app.get('/api/admin/stats', async (req, res) => {
    const { shopDomain } = req.query;
    try {
        const reviews = await Review.find({ shopDomain, isDeleted: false });
        const config = await Settings.findOne({ shopDomain });
        const sources = { website: 0, email: 0, import: 0 };
        const products = {};
        reviews.forEach(r => {
            sources[r.source || 'website']++;
            products[r.itemId] = (products[r.itemId] || 0) + 1;
        });
        const topProduct = Object.entries(products).sort((a,b) => b[1]-a[1])[0] || ["N/A", 0];
        const sent = config?.emailsSentTotal || 0;
        const rate = sent > 0 ? ((sources.email / sent) * 100).toFixed(1) : 0;
        res.json({ sources, topProduct: { id: topProduct[0], count: topProduct[1] }, emailStats: { sent, completed: sources.email, rate } });
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/api/reviews/:itemId', async (req, res) => {
    const reviews = await Review.find({ itemId: req.params.itemId, shopDomain: req.query.shopDomain, status: 'accepted', isDeleted: false }).sort({createdAt: -1});
    res.json(reviews);
});

app.post('/api/reviews', async (req, res) => {
    try {
        let isVerified = req.body.verifiedPurchase; 
        let vNote = "Verified automatically by Shopify.";

        if (!isVerified && req.body.orderId && req.body.email) {
            const checkResult = await verifyShopifyOrder(req.body.orderId, req.body.email, req.body.itemId);
            isVerified = checkResult.verified;
            vNote = checkResult.note;
        } else if (!isVerified && !req.body.orderId) {
            vNote = "No Order ID provided by customer.";
        }

        const config = await Settings.findOne({ shopDomain: req.body.shopDomain });
        let finalStatus = 'pending';
        
        // UPGRADED AUTO-APPROVE LOGIC
        if (config && config.autoApproveEnabled) {
            const meetsVerificationReq = (config.autoApproveType === 'all') || (config.autoApproveType === 'verified' && isVerified);
            if (meetsVerificationReq && req.body.rating >= config.autoApproveMinStars) {
                finalStatus = 'accepted';
            }
        }

        const newReview = new Review({ ...req.body, verifiedPurchase: isVerified, verificationNote: vNote, status: finalStatus });
        res.status(201).json(await newReview.save());
    } catch (error) { res.status(400).json({ error: "Failed to submit" }); }
});

app.post('/api/reviews/import', async (req, res) => {
    try {
        const { shopDomain, reviews } = req.body;
        if (!shopDomain || !reviews || !Array.isArray(reviews)) return res.status(400).json({ error: "Invalid payload." });

        const importData = reviews.map(r => ({
            shopDomain: shopDomain, itemId: String(r.itemId).trim(), userId: r.userId || "Verified Customer",
            email: r.email || "", rating: parseInt(r.rating) || 5, headline: r.headline || "",
            comment: r.comment || "", source: 'import', status: 'accepted', verifiedPurchase: true,
            isDeleted: false, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() 
        }));
        await Review.insertMany(importData);
        res.status(201).json({ message: `Imported ${importData.length} reviews.` });
    } catch (error) { res.status(500).json({ error: "Failed to import reviews." }); }
});

app.get('/api/admin/reviews', async (req, res) => {
    res.json(await Review.find({ shopDomain: req.query.shopDomain }).sort({createdAt: -1}));
});

app.patch('/api/reviews/:id', async (req, res) => {
    try {
        const updateData = { ...req.body };
        if (req.body.isDeleted !== undefined) {
            updateData.deletedAt = req.body.isDeleted ? new Date() : null; 
        }
        res.json(await Review.findByIdAndUpdate(req.params.id, updateData, { new: true }));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/settings', async (req, res) => {
    res.json(await Settings.findOne({ shopDomain: req.query.shopDomain }));
});

app.patch('/api/admin/settings', async (req, res) => {
    res.json(await Settings.findOneAndUpdate({ shopDomain: req.body.shopDomain }, req.body, { upsert: true, new: true }));
});

app.get('/api/widget/config', async (req, res) => {
    const config = await Settings.findOne({ shopDomain: req.query.shopDomain });
    res.json({ styles: config?.widgetStyles, cardStyles: config?.cardStyles, profiles: config?.attributeProfiles });
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Port ${PORT}`));
