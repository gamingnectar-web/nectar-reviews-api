require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto'); 

const app = express();
app.use(cors()); 
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI).then(() => console.log('✅ DB Connected'));

// SCHEMAS
const reviewSchema = new mongoose.Schema({
    shopDomain: { type: String, required: true },
    itemId: { type: String, required: true },
    userId: { type: String, required: true }, 
    rating: { type: Number, required: true },
    headline: { type: String }, 
    comment: { type: String },
    reply: { type: String, default: '' },
    source: { type: String, enum: ['website', 'email', 'import'], default: 'website' }, // NEW
    verifiedPurchase: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    isDeleted: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Review = mongoose.model('Review', reviewSchema);

const settingsSchema = new mongoose.Schema({
    shopDomain: { type: String, required: true, unique: true },
    emailsSentTotal: { type: Number, default: 0 }, // Analytics
    autoApproveVerified: { type: Boolean, default: false },
    autoApproveMinStars: { type: Number, default: 4 },
    attributeProfiles: { type: Array, default: [] },
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
const Settings = mongoose.model('Settings', settingsSchema);

// ANALYTICS ROUTE
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

// STANDARDIZED API ROUTES (Multi-Tenant)
app.get('/api/reviews/:itemId', async (req, res) => {
    const reviews = await Review.find({ itemId: req.params.itemId, shopDomain: req.query.shopDomain, status: 'accepted', isDeleted: false }).sort({createdAt: -1});
    res.json(reviews);
});

app.post('/api/reviews', async (req, res) => {
    const newReview = new Review(req.body);
    res.status(201).json(await newReview.save());
});

app.get('/api/admin/reviews', async (req, res) => {
    res.json(await Review.find({ shopDomain: req.query.shopDomain }).sort({createdAt: -1}));
});

app.patch('/api/reviews/:id', async (req, res) => {
    res.json(await Review.findByIdAndUpdate(req.params.id, req.body, {new: true}));
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

app.listen(process.env.PORT || 3000);
