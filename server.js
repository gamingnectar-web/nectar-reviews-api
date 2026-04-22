require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// ==========================================
// MIDDLEWARE & DATABASE
// ==========================================
app.use(cors()); 
app.use(express.json());

app.use((req, res, next) => {
    res.setHeader(
        "Content-Security-Policy",
        "frame-ancestors https://*.myshopify.com https://admin.shopify.com;"
    );
    next();
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// ==========================================
// DATABASE SCHEMA
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

// ==========================================
// SHOPIFY VERIFICATION LOGIC
// ==========================================
async function verifyShopifyOrder(orderId, email, productId) {
    const STORE_URL = process.env.SHOPIFY_STORE_URL; 
    const CLIENT_ID = process.env.SHOPIFY_API_KEY; 
    const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET; 

    if (!STORE_URL || !CLIENT_ID || !CLIENT_SECRET || !email || !orderId) {
        return false;
    }

    const authString = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

    try {
        const response = await fetch(`https://${STORE_URL}/admin/api/2024-01/orders.json?name=${encodeURIComponent(orderId)}&status=any`, {
            headers: { 
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        if (!data.orders || data.orders.length === 0) return false; 

        const order = data.orders[0];

        if (!order.email || order.email.toLowerCase() !== email.toLowerCase()) {
            return false;
        }

        const boughtProduct = order.line_items.some(item => String(item.product_id) === String(productId));
        return boughtProduct;
    } catch (error) {
        console.error("Shopify API Error:", error);
        return false;
    }
}

// ==========================================
// PUBLIC ROUTES
// ==========================================
app.get('/', (req, res) => res.send('🚀 Nectar API is Live!'));

app.get('/api/reviews/:itemId', async (req, res) => {
    try { 
        const reviews = await Review.find({ itemId: String(req.params.itemId), status: 'accepted' }).sort({ createdAt: -1 });
        res.status(200).json(reviews); 
    } catch (error) { res.status(500).json({ error: "Fetch error" }); }
});

app.post('/api/reviews', async (req, res) => {
    try {
        let isVerified = req.body.verifiedPurchase; 

        if (!isVerified && req.body.orderId && req.body.email) {
            isVerified = await verifyShopifyOrder(req.body.orderId, req.body.email, req.body.itemId);
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
            status: 'pending' 
        });

        const savedReview = await newReview.save();
        res.status(201).json(savedReview);
    } catch (error) {
        console.error("Submission Error:", error);
        res.status(400).json({ error: "Failed to submit review" });
    }
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
        if (req.body.verifiedPurchase !== undefined) updateData.verifiedPurchase = req.body.verifiedPurchase;

        const updated = await Review.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/reviews/:id', async (req, res) => {
    try {
        await Review.findByIdAndDelete(req.params.id);
        res.json({ message: "Deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
