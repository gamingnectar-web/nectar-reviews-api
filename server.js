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
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// ==========================================
// DATABASE SCHEMAS
// ==========================================
const reviewSchema = new mongoose.Schema({
    itemId: { type: String, required: true },
    userId: { type: String, required: true }, 
    email: { type: String }, 
    isAnonymous: { type: Boolean, default: false }, 
    rating: { type: Number, required: true, min: 1, max: 5 },
    headline: { type: String }, 
    comment: { type: String },
    attributes: { type: Map, of: Number }, 
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'hold'], default: 'pending' },
    verifiedPurchase: { type: Boolean, default: false },
    orderId: { type: String }, 
    createdAt: { type: Date, default: Date.now }
});
const Review = mongoose.model('Review', reviewSchema);

// NEW: Settings Schema to save your Admin controls
const settingsSchema = new mongoose.Schema({
    shopId: { type: String, default: 'default' },
    autoApproveVerified: { type: Boolean, default: false },
    autoApproveMinStars: { type: Number, default: 4 }
});
const Settings = mongoose.model('Settings', settingsSchema);

// Ensure default settings exist on server start
async function initSettings() {
    const exists = await Settings.findOne({ shopId: 'default' });
    if (!exists) await new Settings({ shopId: 'default' }).save();
}
initSettings();

// ==========================================
// VERIFICATION LOGIC
// ==========================================
async function verifyShopifyOrder(orderId, email, productId) {
    const STORE_URL = process.env.SHOPIFY_STORE_URL; 
    const CLIENT_ID = process.env.SHOPIFY_API_KEY; 
    const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET; 

    if (!STORE_URL || !CLIENT_ID || !CLIENT_SECRET || !email || !orderId) return false;

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
                const order = data.orders.find(o => o.email && o.email.toLowerCase() === email.toLowerCase());
                if (order) {
                    const boughtProduct = order.line_items.some(item => 
                        String(item.product_id) === String(productId) || String(item.variant_id) === String(productId)
                    );
                    if (boughtProduct) return true;
                }
            }
        } catch (error) { console.error("Shopify API Error:", error); }
    }
    return false;
}

// ==========================================
// PUBLIC ROUTES
// ==========================================
app.get('/', (req, res) => res.send('🚀 Nectar API Live'));

app.get('/api/reviews/:itemId', async (req, res) => {
    try { res.status(200).json(await Review.find({ itemId: String(req.params.itemId), status: 'accepted' }).sort({ createdAt: -1 })); } 
    catch (error) { res.status(500).json({ error: "Fetch error" }); }
});

app.post('/api/reviews', async (req, res) => {
    try {
        let isVerified = req.body.verifiedPurchase; 
        if (!isVerified && req.body.orderId && req.body.email) {
            isVerified = await verifyShopifyOrder(req.body.orderId, req.body.email, req.body.itemId);
        }

        // NEW: Check your Admin Settings for Auto-Approval rules
        const config = await Settings.findOne({ shopId: 'default' });
        let finalStatus = 'pending';
        
        if (config.autoApproveVerified && isVerified) {
            if (req.body.rating >= config.autoApproveMinStars) {
                finalStatus = 'accepted';
            }
        }

        const newReview = new Review({
            itemId: String(req.body.itemId),
            userId: req.body.userId,
            email: req.body.email,
            isAnonymous: req.body.isAnonymous,
            rating: req.body.rating,
            headline: req.body.headline,
            comment: req.body.comment,
            attributes: req.body.attributes,
            verifiedPurchase: isVerified, 
            orderId: req.body.orderId, 
            status: finalStatus // Applied here!
        });

        const savedReview = await newReview.save();
        res.status(201).json(savedReview);
    } catch (error) { res.status(400).json({ error: "Failed to submit" }); }
});

// ==========================================
// ADMIN & SETTINGS ROUTES
// ==========================================
app.get('/api/admin/reviews', async (req, res) => {
    try { res.status(200).json(await Review.find().sort({ createdAt: -1 })); } 
    catch (error) { res.status(500).json({ error: "Admin fetch error" }); }
});

app.patch('/api/reviews/:id', async (req, res) => {
    try {
        const updateData = {};
        if (req.body.status !== undefined) updateData.status = req.body.status;
        if (req.body.verifiedPurchase !== undefined) updateData.verifiedPurchase = req.body.verifiedPurchase;
        res.json(await Review.findByIdAndUpdate(req.params.id, updateData, { new: true }));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/reviews/:id', async (req, res) => {
    try {
        await Review.findByIdAndDelete(req.params.id);
        res.json({ message: "Deleted" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// NEW: Get Settings
app.get('/api/admin/settings', async (req, res) => {
    try { res.status(200).json(await Settings.findOne({ shopId: 'default' })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

// NEW: Update Settings
app.patch('/api/admin/settings', async (req, res) => {
    try { res.status(200).json(await Settings.findOneAndUpdate({ shopId: 'default' }, req.body, { new: true })); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Port ${PORT}`));
