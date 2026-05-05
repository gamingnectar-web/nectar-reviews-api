require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors()); 
app.use(express.json());

app.use(express.static('public'));

app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "frame-ancestors https://*.myshopify.com https://admin.shopify.com;");
    next();
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ DB Connected'))
  .catch((err) => console.error('❌ DB Connection Error:', err));

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
    betaMode: { 
        enabled: { type: Boolean, default: false },
        email: { type: String, default: '' }
    },
    emailsSentTotal: { type: Number, default: 0 }, 
    autoApproveEnabled: { type: Boolean, default: false },
    autoApproveType: { type: String, enum: ['verified', 'all'], default: 'verified' },
    autoApproveMinStars: { type: Number, default: 4 },
    attributeProfiles: { type: Array, default: [] }, 
    seo: { richSnippets: { type: Boolean, default: true } },
    widgetStyles: {
        widgetTitle: { type: String, default: 'Customer Reviews' },
        primaryColor: { type: String, default: '#000000' },
        starColor: { type: String, default: '#ffc700' },
        textSize: { type: Number, default: 15 },
        emptyMode: { type: String, default: 'stars_text' },
        emptyText: { type: String, default: 'No reviews yet.' }
    },
    cardStyles: {
        starSize: { type: Number, default: 14 },
        showCount: { type: Boolean, default: true }
    },
    carouselStyles: {
        layout: { type: String, enum: ['grid', 'infinite', 'masonry'], default: 'infinite' },
        autoplay: { type: Boolean, default: true },
        delay: { type: Number, default: 4000 },
        showArrows: { type: Boolean, default: false },
        limit: { type: Number, default: 10 } // <-- Added Limit Control
    }
});
const Settings = mongoose.model('Settings', settingsSchema, 'settings');

async function syncShopifyMetafields(shopDomain, productId) {
    const config = await Settings.findOne({ shopDomain });
    if (!config || !config.seo?.richSnippets) return; 

    const STORE_URL = process.env.SHOPIFY_STORE_URL;
    const CLIENT_ID = process.env.SHOPIFY_API_KEY;
    const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET;
    if (!STORE_URL || !CLIENT_ID || !CLIENT_SECRET) return;

    try {
        const reviews = await Review.find({ itemId: productId, shopDomain, status: 'accepted', isDeleted: false });
        const count = reviews.length;
        const avg = count > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / count).toFixed(2) : "0.0";

        const authString = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
        const productGid = `gid://shopify/Product/${productId}`;

        const query = `
        mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
                metafields { key value }
                userErrors { field message }
            }
        }`;

        const variables = {
            metafields: [
                { ownerId: productGid, namespace: "reviews", key: "rating", type: "number_decimal", value: String(avg) },
                { ownerId: productGid, namespace: "reviews", key: "rating_count", type: "number_integer", value: String(count) }
            ]
        };

        const response = await fetch(`https://${STORE_URL}/admin/api/2024-01/graphql.json`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${authString}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables })
        });
        
        const json = await response.json();
        if (json.data?.metafieldsSet?.userErrors?.length > 0) {
            console.error("Metafield Sync Error:", json.data.metafieldsSet.userErrors);
        } else {
            console.log(`✅ Synced Product ${productId} -> Avg: ${avg}, Count: ${count}`);
        }
    } catch (e) {
        console.error("Failed to sync metafields:", e);
    }
}

let metafieldCache = { data: null, timestamp: 0 };
app.get('/api/admin/metafields', async (req, res) => {
    if (metafieldCache.data && (Date.now() - metafieldCache.timestamp < 300000)) return res.json(metafieldCache.data);
    const STORE_URL = process.env.SHOPIFY_STORE_URL; const CLIENT_ID = process.env.SHOPIFY_API_KEY; const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET;
    if (!STORE_URL || !CLIENT_ID || !CLIENT_SECRET) return res.status(500).json({ error: 'Missing credentials' });
    const authString = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const query = `{ metafieldDefinitions(first: 100, ownerType: PRODUCT) { edges { node { namespace key name } } } }`;
    try {
        const response = await fetch(`https://${STORE_URL}/admin/api/2024-01/graphql.json`, { method: 'POST', headers: { 'Authorization': `Basic ${authString}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
        const json = await response.json();
        if (json.data && json.data.metafieldDefinitions) {
            const mapped = json.data.metafieldDefinitions.edges.map(e => ({ key: `${e.node.namespace}.${e.node.key}`, name: e.node.name }));
            metafieldCache = { data: mapped, timestamp: Date.now() };
            return res.json(mapped);
        }
        res.json([]);
    } catch (error) { res.status(500).json({ error: "Failed to fetch metafields" }); }
});

async function verifyShopifyOrder(orderId, email, productId) {
    const STORE_URL = process.env.SHOPIFY_STORE_URL; const CLIENT_ID = process.env.SHOPIFY_API_KEY; const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET; 
    if (!STORE_URL || !CLIENT_ID || !CLIENT_SECRET || !email || !orderId) return { verified: false, note: "Missing details." };
    const rawNumber = orderId.replace(/\D/g, ""); const searchTerms = [`#${rawNumber}`, rawNumber]; const authString = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    for (const term of searchTerms) {
        try {
            const response = await fetch(`https://${STORE_URL}/admin/api/2024-01/orders.json?name=${encodeURIComponent(term)}&status=any`, { headers: { 'Authorization': `Basic ${authString}`, 'Content-Type': 'application/json' }});
            const data = await response.json();
            if (data.orders && data.orders.length > 0) {
                const order = data.orders.find(o => String(o.order_number) === rawNumber || o.name === `#${rawNumber}` || o.name === rawNumber);
                if (order) {
                    if (!order.email || order.email.toLowerCase() !== email.toLowerCase()) return { verified: false, note: `Placed under a different email.` };
                    const boughtProduct = order.line_items.some(item => String(item.product_id) === String(productId) || String(item.variant_id) === String(productId));
                    if (!boughtProduct) return { verified: false, note: "Product wasn't in the order." };
                    return { verified: true, note: "Verified." };
                }
            }
        } catch (error) { console.error(error); }
    }
    return { verified: false, note: "Order ID not found." };
}

app.get('/api/admin/stats', async (req, res) => {
    const { shopDomain } = req.query;
    try {
        const reviews = await Review.find({ shopDomain, isDeleted: false });
        const config = await Settings.findOne({ shopDomain });
        const sources = { website: 0, email: 0, import: 0 };
        const products = {};
        
        reviews.forEach(r => { 
            sources[r.source || 'website']++; 
            if (!products[r.itemId]) products[r.itemId] = { count: 0, sum: 0 };
            products[r.itemId].count++;
            products[r.itemId].sum += r.rating;
        });
        
        let topProduct = { id: "N/A", count: 0, averageRating: "0.0", title: null, image: null };
        const sortedProducts = Object.entries(products).sort((a,b) => b[1].count - a[1].count);
        
        if (sortedProducts.length > 0) {
            const top = sortedProducts[0];
            topProduct.id = top[0];
            topProduct.count = top[1].count;
            topProduct.averageRating = (top[1].sum / top[1].count).toFixed(1);
            
            const STORE_URL = process.env.SHOPIFY_STORE_URL; 
            const CLIENT_ID = process.env.SHOPIFY_API_KEY; 
            const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET;
            if (STORE_URL && CLIENT_ID && CLIENT_SECRET) {
                const authString = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
                try {
                    const prodRes = await fetch(`https://${STORE_URL}/admin/api/2024-01/products/${topProduct.id}.json?fields=id,title,image`, { 
                        headers: { 'Authorization': `Basic ${authString}`, 'Content-Type': 'application/json' } 
                    });
                    const prodData = await prodRes.json();
                    if (prodData.product) {
                        topProduct.title = prodData.product.title;
                        topProduct.image = prodData.product.image ? prodData.product.image.src : null;
                    }
                } catch(e) { console.error("Could not fetch top product details", e); }
            }
        }
        
        const sent = config?.emailsSentTotal || 0;
        const rate = sent > 0 ? ((sources.email / sent) * 100).toFixed(1) : 0;
        res.json({ sources, topProduct, emailStats: { sent, completed: sources.email, rate } });
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/api/global-reviews', async (req, res) => {
    try {
        const reviews = await Review.find({ shopDomain: req.query.shopDomain, status: 'accepted', isDeleted: false }).sort({ rating: -1, createdAt: -1 }).limit(100);
        res.json(reviews);
    } catch (error) { res.status(500).json({ error: "Fetch error" }); }
});

app.get('/api/reviews/:itemId', async (req, res) => {
    res.json(await Review.find({ itemId: req.params.itemId, shopDomain: req.query.shopDomain, status: 'accepted', isDeleted: false }).sort({createdAt: -1}));
});

app.post('/api/reviews', async (req, res) => {
    try {
        let isVerified = req.body.verifiedPurchase; 
        let vNote = "Verified automatically by Shopify.";
        if (!isVerified && req.body.orderId && req.body.email) {
            const checkResult = await verifyShopifyOrder(req.body.orderId, req.body.email, req.body.itemId);
            isVerified = checkResult.verified; vNote = checkResult.note;
        } else if (!isVerified && !req.body.orderId) vNote = "No Order ID provided by customer.";

        const config = await Settings.findOne({ shopDomain: req.body.shopDomain });
        let finalStatus = 'pending';
        if (config && config.autoApproveEnabled) {
            const meetsVerificationReq = (config.autoApproveType === 'all') || (config.autoApproveType === 'verified' && isVerified);
            if (meetsVerificationReq && req.body.rating >= config.autoApproveMinStars) finalStatus = 'accepted';
        }
        
        const newReview = new Review({ ...req.body, verifiedPurchase: isVerified, verificationNote: vNote, status: finalStatus });
        const saved = await newReview.save();
        res.status(201).json(saved);

        if (finalStatus === 'accepted') syncShopifyMetafields(req.body.shopDomain, req.body.itemId);
    } catch (error) { res.status(400).json({ error: "Failed to submit" }); }
});

app.post('/api/reviews/import', async (req, res) => {
    try {
        const { shopDomain, reviews } = req.body;
        if (!shopDomain || !reviews || !Array.isArray(reviews)) return res.status(400).json({ error: "Invalid payload." });
        const importData = reviews.map(r => ({
            shopDomain: shopDomain, itemId: String(r.itemId).trim(), userId: r.userId || "Verified Customer",
            email: r.email || "", rating: parseInt(r.rating) || 5, headline: r.headline || "", comment: r.comment || "",
            source: 'import', status: 'accepted', verifiedPurchase: true, isDeleted: false, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() 
        }));
        await Review.insertMany(importData);
        res.status(201).json({ message: `Imported ${importData.length} reviews.` });

        const uniqueProducts = [...new Set(importData.map(r => r.itemId))];
        uniqueProducts.forEach(id => syncShopifyMetafields(shopDomain, id));
    } catch (error) { res.status(500).json({ error: "Failed to import reviews." }); }
});

app.get('/api/admin/reviews', async (req, res) => { res.json(await Review.find({ shopDomain: req.query.shopDomain }).sort({createdAt: -1})); });

app.patch('/api/reviews/:id', async (req, res) => {
    try {
        const updateData = { ...req.body };
        if (req.body.isDeleted !== undefined) updateData.deletedAt = req.body.isDeleted ? new Date() : null; 
        
        const updated = await Review.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json(updated);

        if (req.body.status !== undefined || req.body.isDeleted !== undefined) {
            syncShopifyMetafields(updated.shopDomain, updated.itemId);
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/settings', async (req, res) => { res.json(await Settings.findOne({ shopDomain: req.query.shopDomain })); });

app.patch('/api/admin/settings', async (req, res) => { 
    const saved = await Settings.findOneAndUpdate({ shopDomain: req.body.shopDomain }, req.body, { upsert: true, new: true });
    res.json(saved);
});

app.get('/api/widget/config', async (req, res) => {
    const config = await Settings.findOne({ shopDomain: req.query.shopDomain });
    res.json({ 
        styles: config?.widgetStyles, 
        cardStyles: config?.cardStyles, 
        carouselStyles: config?.carouselStyles, 
        profiles: config?.attributeProfiles,
        betaMode: config?.betaMode 
    });
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/admin.js', (req, res) => res.sendFile(path.join(__dirname, 'admin.js')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Port ${PORT}`));
