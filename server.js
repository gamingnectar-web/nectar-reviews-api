require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

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

// Health Check
app.get('/', (req, res) => {
    res.send('🚀 Nectar API is Live and Running!');
});

// Fetch approved reviews for a specific product
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

// Submit a new review (Defaults to 'pending')
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

// Get ALL reviews (pending and accepted)
app.get('/api/admin/reviews', async (req, res) => {
    try { res.status(200).json(await Review.find().sort({ createdAt: -1 })); } 
    catch (error) { res.status(500).json({ error: "Admin fetch error" }); }
});

// Update a review's status (Approve it)
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

// Delete a review
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
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Nectar Admin</title>
            <style>
                body { font-family: sans-serif; padding: 40px; background: #f4f6f8; }
                .review-card { background: white; padding: 20px; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center; }
                .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; display: inline-block; margin-top: 5px; }
                .pending { background: #ffe8c3; color: #8a6d3b; }
                .accepted { background: #d3f9d8; color: #1e4620; }
                button { cursor: pointer; padding: 8px 16px; margin-left: 10px; border: none; border-radius: 4px; font-weight: bold; }
                .approve-btn { background: #008060; color: white; }
                .delete-btn { background: #e53935; color: white; }
            </style>
        </head>
        <body>
            <h1>Nectar Review Management</h1>
            <div id="admin-feed">Loading reviews...</div>

            <script>
                async function loadAdminReviews() {
                    const res = await fetch('/api/admin/reviews');
                    const reviews = await res.json();
                    const container = document.getElementById('admin-feed');
                    
                    if (reviews.length === 0) {
                        container.innerHTML = '<p>No reviews found.</p>';
                        return;
                    }

                    container.innerHTML = reviews.map(r => \`
                        <div class="review-card">
                            <div>
                                <strong>\${r.headline || 'No Headline'}</strong> (\${r.rating} Stars)<br>
                                <small>\${r.comment}</small><br>
                                <span class="badge \${r.status}">\${r.status.toUpperCase()}</span>
                            </div>
                            <div>
                                \${r.status === 'pending' ? \`<button class="approve-btn" onclick="updateStatus('\${r._id}', 'accepted')">Approve</button>\` : ''}
                                <button class="delete-btn" onclick="deleteReview('\${r._id}')">Delete</button>
                            </div>
                        </div>
                    \`).join('');
                }

                async function updateStatus(id, status) {
                    await fetch('/api/reviews/' + id, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status })
                    });
                    loadAdminReviews();
                }

                async function deleteReview(id) {
                    if(confirm('Are you sure you want to delete this?')) {
                        await fetch('/api/reviews/' + id, { method: 'DELETE' });
                        loadAdminReviews();
                    }
                }

                loadAdminReviews();
            </script>
        </body>
        </html>
    `);
});

// ==========================================
// START SERVER (Always at the very bottom!)
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
