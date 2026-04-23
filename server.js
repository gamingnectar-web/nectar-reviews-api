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
    reply: { type: String, default: '' },
    attributes: { type: Map, of: Number }, 
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'hold'], default: 'pending' },
    verifiedPurchase: { type: Boolean, default: false },
    verificationNote: { type: String, default: '' }, 
    orderId: { type: String }, 
    // NEW: Soft Delete Fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

// NEW: 28-Day Auto-Delete (TTL Index)
// 2419200 seconds = exactly 28 days. MongoDB will automatically delete records once this time passes.
reviewSchema.index({ deletedAt: 1 }, { expireAfterSeconds: 2419200 });

const Review = mongoose.model('Review', reviewSchema, 'reviews'); 

const settingsSchema = new mongoose.Schema({
    widgetId: { type: String, default: 'default' }, 
    autoApproveVerified: { type: Boolean, default: false },
    autoApproveMinStars: { type: Number, default: 4 }
});
const Settings = mongoose.model('Settings', settingsSchema, 'settings');

async function initSettings() {
    try {
        const exists = await Settings.findOne({ widgetId: 'default' });
        if (!exists) await new Settings({ widgetId: 'default' }).save();
    } catch (e) { console.log("Settings init bypassed"); }
}
initSettings();

// ==========================================
// REFINED DIAGNOSTIC VERIFICATION LOGIC
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
                // Find the exact order by ID to prevent partial matches
                const order = data.orders.find(o => String(o.order_number) === rawNumber || o.name === `#${rawNumber}` || o.name === rawNumber);
                
                if (order) {
                    // Check 1: Does the email match?
                    if (!order.email || order.email.toLowerCase() !== email.toLowerCase()) {
                        return { verified: false, note: `Order exists, but placed under a different email.` };
                    }
                    
                    // Check 2: Is the product in the order?
                    const boughtProduct = order.line_items.some(item => 
                        String(item.product_id) === String(productId) || String(item.variant_id) === String(productId)
                    );
                    
                    if (!boughtProduct) {
                        return { verified: false, note: "Email & Order ID match, but this product wasn't in the order." };
                    }

                    // Success!
                    return { verified: true, note: "Successfully verified against Shopify order." };
                }
            }
        } catch (error) { console.error("Shopify API Error:", error); }
    }
    return { verified: false, note: "This Order ID does not exist in your Shopify." };
}

// ==========================================
// PUBLIC ROUTES
// ==========================================
app.get('/', (req, res) => res.send('🚀 Nectar API Live'));

app.get('/api/reviews/:itemId', async (req, res) => {
    try { res.status(200).json(await Review.find({ itemId: String(req.params.itemId), status: 'accepted', isDeleted: false }).sort({ createdAt: -1 })); } 
    catch (error) { res.status(500).json({ error: "Fetch error" }); }
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

        const config = await Settings.findOne({ widgetId: 'default' });
        let finalStatus = 'pending';
        
        if (config && config.autoApproveVerified && isVerified) {
            if (req.body.rating >= config.autoApproveMinStars) finalStatus = 'accepted';
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
            verificationNote: vNote,
            orderId: req.body.orderId, 
            status: finalStatus 
        });

        res.status(201).json(await newReview.save());
    } catch (error) { res.status(400).json({ error: "Failed to submit" }); }
});

// ==========================================
// ADMIN ROUTES
// ==========================================
app.get('/api/admin/reviews', async (req, res) => {
    try { res.status(200).json(await Review.find().sort({ createdAt: -1 })); } 
    catch (error) { res.status(500).json({ error: "Admin fetch error" }); }
});

app.patch('/api/reviews/:id', async (req, res) => {
    try {
        const updateData = {};
        if (req.body.status !== undefined) updateData.status = req.body.status;
        if (req.body.reply !== undefined) updateData.reply = req.body.reply;
        if (req.body.verifiedPurchase !== undefined) updateData.verifiedPurchase = req.body.verifiedPurchase;
        
        // Handle Soft Delete
        if (req.body.isDeleted !== undefined) {
            updateData.isDeleted = req.body.isDeleted;
            updateData.deletedAt = req.body.isDeleted ? new Date() : null; // Start or clear the 28-day timer
        }

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
