require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path'); // <-- Added this so it can find your HTML file!

const app = express();

// MIDDLEWARE
app.use(cors()); 
app.use(express.json());

// DATABASE CONNECTION
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// SCHEMA
const reviewSchema = new mongoose.Schema({
    itemId: { type: String, required: true },
    userId: { type: String, required: true }, 
    isAnonymous: { type: Boolean, default: false }, 
    rating: { type: Number, required: true, min: 1, max: 5 },
    headline: { type: String }, 
    comment: { type: String },
    attributes: { type: Map, of: Number }, 
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'hold'], default: 'pending' },
    verifiedPurchase: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Review = mongoose.model('Review', reviewSchema);

// ==========================================
// 1. PUBLIC ROUTES (For the Shopify Store)
// ==========================================

app.get('/', (req, res) => {
    res.send('🚀 Nectar API is Live and Running!');
});

app.get('/api/reviews/:itemId', async (req, res) => {
    try { 
        const reviews = await Review.find({ 
            itemId: String(req.params.itemId), 
            status: 'accepted' 
        }).sort({ createdAt: -1 });
        res.status(200).json(reviews); 
    } 
    catch (error) { res.status(500).json({ error: "Fetch error" }); }
});

app.post('/api/reviews', async (req, res) => {
    try {
        const newReview = new Review({
            itemId: String(req.body.itemId),
            userId: req.body.userId,
            rating: req.body.rating,
            headline: req.body.headline,
            comment: req.body.comment,
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
// 2. ADMIN ROUTES (For managing reviews)
// ==========================================

app.get('/api/admin/reviews', async (req, res) => {
    try { res.status(200).json(await Review.find().sort({ createdAt: -1 })); } 
    catch (error) { res.status(500).json({ error: "Admin fetch error" }); }
});

app.patch('/api/reviews/:id', async (req, res) => {
    try {
        const updated = await Review.findByIdAndUpdate(
            req.params.id, 
            { status: req.body.status }, 
            { new: true }
        );
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

// ==========================================
// 3. ADMIN DASHBOARD UI
// ==========================================

app.get('/admin', (req, res) => {
    // This tells the server to look right next to server.js for admin.html
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
