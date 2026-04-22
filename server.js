require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// MIDDLEWARE - The 'Guest List' for your server
app.use(cors()); 
app.use(express.json());

// DATABASE CONNECTION
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// SCHEMA - Your data structure
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

// --- ROUTES ---

// 1. Health Check (To see if it's working)
app.get('/', (req, res) => {
    res.send('🚀 Nectar API is Live and Running!');
});

// 2. Public Route: Get reviews for a specific item
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

// 3. Admin Route: Get ALL reviews
app.get('/api/admin/reviews', async (req, res) => {
    try { res.status(200).json(await Review.find().sort({ createdAt: -1 })); } 
    catch (error) { res.status(500).json({ error: "Admin fetch error" }); }
});

// 4. Admin Route: Update review status
app.patch('/api/admin/reviews/:id/status', async (req, res) => {
    try { 
        const updated = await Review.findByIdAndUpdate(
            req.params.id, 
            { status: req.body.status }, 
            { new: true }
        );
        res.status(200).json(updated); 
    } 
    catch (error) { res.status(500).json({ error: "Update error" }); }
});

// START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));

// 5. Public Route: Submit a new review
app.post('/api/reviews', async (req, res) => {
    try {
        const newReview = new Review({
            itemId: String(req.body.itemId),
            userId: req.body.userId,
            rating: req.body.rating,
            headline: req.body.headline,
            comment: req.body.comment,
            status: 'pending' // Always default to pending for safety!
        });

        const savedReview = await newReview.save();
        res.status(201).json(savedReview);
    } catch (error) {
        console.error("Submission Error:", error);
        res.status(400).json({ error: "Failed to submit review" });
    }
});
