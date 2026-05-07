require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', 'frame-ancestors https://*.myshopify.com https://admin.shopify.com;');
  next();
});

mongoose
  .connect(process.env.MONGODB_URI)
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
  productTags: { type: Array, default: [] },
  source: { type: String, enum: ['website', 'email', 'import'], default: 'website' },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'hold', 'spam'], default: 'pending' },
  verifiedPurchase: { type: Boolean, default: false },
  verificationNote: { type: String, default: '' },
  orderId: { type: String },
  isTestReview: { type: Boolean, default: false },
  testMode: { type: Boolean, default: false },
  testLabel: { type: String, default: '' },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

reviewSchema.index({ deletedAt: 1 }, { expireAfterSeconds: 2419200 });
reviewSchema.index({ shopDomain: 1, createdAt: -1 });
reviewSchema.index({ shopDomain: 1, itemId: 1, status: 1 });

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
    limit: { type: Number, default: 10 }
  }
});

const Settings = mongoose.model('Settings', settingsSchema, 'settings');

const campaignEventSchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, index: true },
  campaign: { type: String, default: 'review_request' },
  eventType: { type: String, enum: ['sent', 'open', 'click'], required: true, index: true },
  orderId: { type: String, default: '' },
  email: { type: String, default: '' },
  itemId: { type: String, default: '' },
  url: { type: String, default: '' },
  token: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  ipHash: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true }
});

campaignEventSchema.index({ shopDomain: 1, eventType: 1, createdAt: -1 });
campaignEventSchema.index({ shopDomain: 1, token: 1, eventType: 1 });

const CampaignEvent = mongoose.model('CampaignEvent', campaignEventSchema, 'campaign_events');

function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip || '')).digest('hex').slice(0, 24);
}

function cleanShopDomain(value) {
  return String(value || '').trim().toLowerCase();
}

async function shopifyFetch(pathname, options = {}) {
  const STORE_URL = process.env.SHOPIFY_STORE_URL;
  const CLIENT_ID = process.env.SHOPIFY_API_KEY;
  const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET;

  if (!STORE_URL || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Missing Shopify credentials');
  }

  const authString = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`https://${STORE_URL}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Basic ${authString}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  return response.json();
}

async function syncShopifyMetafields(shopDomain, productId) {
  const config = await Settings.findOne({ shopDomain });
  if (!config || !config.seo?.richSnippets) return;
  if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) return;

  try {
    const reviews = await Review.find({
      itemId: productId,
      shopDomain,
      status: 'accepted',
      isDeleted: false,
      isTestReview: { $ne: true }
    });

    const count = reviews.length;
    const avg = count > 0 ? (reviews.reduce((acc, r) => acc + r.rating, 0) / count).toFixed(2) : '0.0';
    const productGid = `gid://shopify/Product/${productId}`;

    const query = `
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { key value }
          userErrors { field message }
        }
      }
    `;

    const variables = {
      metafields: [
        { ownerId: productGid, namespace: 'reviews', key: 'rating', type: 'number_decimal', value: String(avg) },
        { ownerId: productGid, namespace: 'reviews', key: 'rating_count', type: 'number_integer', value: String(count) }
      ]
    };

    const json = await shopifyFetch('/admin/api/2024-01/graphql.json', {
      method: 'POST',
      body: JSON.stringify({ query, variables })
    });

    if (json.data?.metafieldsSet?.userErrors?.length) {
      console.error('Metafield Sync Error:', json.data.metafieldsSet.userErrors);
    } else {
      console.log(`✅ Synced Product ${productId} -> Avg: ${avg}, Count: ${count}`);
    }
  } catch (e) {
    console.error('Failed to sync metafields:', e);
  }
}

let metafieldCache = { data: null, timestamp: 0 };

app.get('/api/admin/metafields', async (req, res) => {
  if (metafieldCache.data && Date.now() - metafieldCache.timestamp < 300000) {
    return res.json(metafieldCache.data);
  }

  try {
    const query = `{ metafieldDefinitions(first: 100, ownerType: PRODUCT) { edges { node { namespace key name } } } }`;
    const json = await shopifyFetch('/admin/api/2024-01/graphql.json', {
      method: 'POST',
      body: JSON.stringify({ query })
    });

    const mapped = json.data?.metafieldDefinitions?.edges?.map((e) => ({
      key: `${e.node.namespace}.${e.node.key}`,
      name: e.node.name
    })) || [];

    metafieldCache = { data: mapped, timestamp: Date.now() };
    res.json(mapped);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch metafields' });
  }
});

async function fetchProductContext(productId) {
  if (!productId) return { tags: [], image: '', title: '' };
  try {
    const productData = await shopifyFetch(`/admin/api/2024-01/products/${encodeURIComponent(productId)}.json?fields=id,title,image,tags`);
    const product = productData.product;
    if (!product) return { tags: [], image: '', title: '' };
    return {
      title: product.title || '',
      image: product.image && product.image.src ? product.image.src : '',
      tags: typeof product.tags === 'string' ? product.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : []
    };
  } catch (error) {
    console.error('Could not fetch product context:', error.message);
    return { tags: [], image: '', title: '' };
  }
}

function orderMatchesNumber(order, rawNumber) {
  return String(order.order_number) === String(rawNumber) || order.name === `#${rawNumber}` || order.name === String(rawNumber);
}

function orderEmailMatches(order, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return false;
  const candidates = [order.email, order.contact_email, order.customer && order.customer.email]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());
  return candidates.includes(target);
}

function orderContainsProduct(order, productId) {
  if (!productId) return true;
  return (order.line_items || []).some((item) => (
    String(item.product_id) === String(productId) || String(item.variant_id) === String(productId)
  ));
}

async function findShopifyOrderByNumber(orderId) {
  const rawNumber = String(orderId || '').replace(/\D/g, '');
  if (!rawNumber) return null;

  const searchTerms = [`#${rawNumber}`, rawNumber];
  for (const term of searchTerms) {
    const data = await shopifyFetch(`/admin/api/2024-01/orders.json?name=${encodeURIComponent(term)}&status=any&limit=10`);
    const order = data.orders?.find((candidate) => orderMatchesNumber(candidate, rawNumber));
    if (order) return order;
  }
  return null;
}

async function verifyShopifyOrder(orderId, email, productId) {
  if (!email || !orderId) return { verified: false, note: 'Missing email or order number.' };
  try {
    const order = await findShopifyOrderByNumber(orderId);
    if (!order) return { verified: false, note: 'Order number not found.' };
    if (!orderEmailMatches(order, email)) return { verified: false, note: 'Order was placed under a different email.' };
    if (!orderContainsProduct(order, productId)) return { verified: false, note: 'Product was not found in this order.' };
    return { verified: true, note: 'Verified by Shopify order and email.' };
  } catch (error) {
    console.error('Order verification failed:', error);
    return { verified: false, note: 'Could not verify order with Shopify.' };
  }
}

async function verifyCustomerBoughtProduct(email, productId) {
  if (!email || !productId) return { verified: false, note: 'Missing email or product.' };
  try {
    const data = await shopifyFetch(`/admin/api/2024-01/orders.json?email=${encodeURIComponent(email)}&status=any&limit=250`);
    const order = data.orders?.find((candidate) => orderEmailMatches(candidate, email) && orderContainsProduct(candidate, productId));
    if (!order) return { verified: false, note: 'No matching Shopify order found for this customer and product.' };
    return { verified: true, note: `Verified by customer purchase history (${order.name || 'order'}).` };
  } catch (error) {
    console.error('Customer purchase verification failed:', error);
    return { verified: false, note: 'Could not verify customer purchase history.' };
  }
}

async function resolveReviewVerification({ orderId, email, itemId }) {
  if (!email) return { verified: false, note: 'Email is required for review verification.' };
  if (orderId) return verifyShopifyOrder(orderId, email, itemId);
  return verifyCustomerBoughtProduct(email, itemId);
}

function getAutoStatus(config, isVerified, rating) {
  if (!config || !config.autoApproveEnabled) return 'pending';
  const meetsVerificationReq = config.autoApproveType === 'all' || (config.autoApproveType === 'verified' && isVerified);
  return meetsVerificationReq && Number(rating) >= Number(config.autoApproveMinStars || 4) ? 'accepted' : 'pending';
}

function periodStart(days) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function buildDailySeries(items, days, getDate = (x) => x.createdAt) {
  const start = periodStart(days);
  const map = new Map();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    map.set(dayKey(d), 0);
  }
  items.forEach((item) => {
    const key = dayKey(getDate(item));
    if (map.has(key)) map.set(key, map.get(key) + 1);
  });
  return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
}

function monthKey(date) {
  return new Date(date).toISOString().slice(0, 7);
}

function buildMonthlySeries(items, months, getDate = (x) => x.createdAt) {
  const now = new Date();
  const map = new Map();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    map.set(monthKey(d), 0);
  }
  items.forEach((item) => {
    const key = monthKey(getDate(item));
    if (map.has(key)) map.set(key, map.get(key) + 1);
  });
  return Array.from(map.entries()).map(([month, count]) => ({ month, count }));
}

function averageRating(reviews) {
  if (!reviews.length) return 0;
  return Number((reviews.reduce((acc, r) => acc + Number(r.rating || 0), 0) / reviews.length).toFixed(2));
}

function uniqueEventCount(events, eventType) {
  const set = new Set();
  events.filter((event) => event.eventType === eventType).forEach((event) => {
    set.add(event.token || `${event.email}|${event.orderId}|${event.itemId}|${event.createdAt.toISOString()}`);
  });
  return set.size;
}

async function buildCampaignAnalytics(shopDomain) {
  const safeShop = cleanShopDomain(shopDomain);
  const since90 = periodStart(90);
  const since30 = periodStart(30);
  const since7 = periodStart(7);

  const [reviews, settings, events] = await Promise.all([
    Review.find({ shopDomain: safeShop, isDeleted: false, isTestReview: { $ne: true } }).sort({ createdAt: -1 }).lean(),
    Settings.findOne({ shopDomain: safeShop }).lean(),
    CampaignEvent.find({ shopDomain: safeShop, createdAt: { $gte: since90 } }).sort({ createdAt: -1 }).lean()
  ]);

  const visibleReviews = reviews.filter((review) => review.status === 'accepted');
  const emailReviews = reviews.filter((review) => review.source === 'email');
  const visibleEmailReviews = visibleReviews.filter((review) => review.source === 'email');
  const reviews30 = reviews.filter((review) => new Date(review.createdAt) >= since30);
  const reviews7 = reviews.filter((review) => new Date(review.createdAt) >= since7);

  const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  visibleReviews.forEach((review) => {
    const rating = Math.max(1, Math.min(5, parseInt(review.rating, 10) || 0));
    if (ratingDistribution[rating] !== undefined) ratingDistribution[rating] += 1;
  });

  const sentFromEvents = events.filter((event) => event.eventType === 'sent').length;
  const sent = sentFromEvents || settings?.emailsSentTotal || 0;
  const opens = uniqueEventCount(events, 'open');
  const clicks = uniqueEventCount(events, 'click');

  return {
    summary: {
      totalReviews: reviews.length,
      liveReviews: visibleReviews.length,
      pendingReviews: reviews.filter((review) => review.status === 'pending').length,
      heldReviews: reviews.filter((review) => review.status === 'hold').length,
      spamReviews: reviews.filter((review) => review.status === 'spam').length,
      averageRating: averageRating(visibleReviews),
      reviewsThisWeek: reviews7.length,
      reviewsThisMonth: reviews30.length
    },
    email: {
      sent,
      opened: opens,
      clicked: clicks,
      reviews: emailReviews.length,
      liveReviews: visibleEmailReviews.length,
      openRate: sent ? Number(((opens / sent) * 100).toFixed(1)) : 0,
      clickRate: sent ? Number(((clicks / sent) * 100).toFixed(1)) : 0,
      reviewRate: sent ? Number(((emailReviews.length / sent) * 100).toFixed(1)) : 0,
      note: sentFromEvents ? 'Sent count is tracked from Shopify Flow HTTP events.' : 'Sent count is using settings.emailsSentTotal until Flow sent tracking is enabled.'
    },
    ratings: {
      average: averageRating(visibleReviews),
      distribution: ratingDistribution
    },
    time: {
      dailyReviews: buildDailySeries(reviews, 30),
      dailyEmailReviews: buildDailySeries(emailReviews, 30),
      monthlyReviews: buildMonthlySeries(reviews, 12),
      monthlyEmailReviews: buildMonthlySeries(emailReviews, 12),
      dailyOpens: buildDailySeries(events.filter((event) => event.eventType === 'open'), 30),
      dailyClicks: buildDailySeries(events.filter((event) => event.eventType === 'click'), 30)
    }
  };
}

app.get('/api/magic-link/order', async (req, res) => {
  const { shopDomain, orderId, email } = req.query;
  if (!shopDomain || !orderId || !email) return res.status(400).json({ error: 'Missing order details' });

  try {
    const order = await findShopifyOrderByNumber(orderId);
    if (!order || !orderEmailMatches(order, email)) return res.status(404).json({ error: 'Order not found' });

    const products = await Promise.all((order.line_items || []).map(async (item) => {
      const productId = String(item.product_id || '');
      const productContext = await fetchProductContext(productId);
      return {
        productId,
        variantId: String(item.variant_id || ''),
        name: item.title || item.name || productContext.title || 'Product',
        quantity: item.quantity || 1,
        image: productContext.image,
        tags: productContext.tags,
        metafields: {}
      };
    }));

    res.json({
      orderId: order.name || `#${String(orderId).replace(/\D/g, '')}`,
      orderNumber: String(order.order_number || orderId).replace(/\D/g, ''),
      customerName: order.customer?.first_name || order.billing_address?.first_name || 'Verified Customer',
      email: order.email || email,
      products
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

app.get('/api/admin/stats', async (req, res) => {
  const { shopDomain } = req.query;
  try {
    const reviews = await Review.find({ shopDomain, isDeleted: false, isTestReview: { $ne: true } });
    const config = await Settings.findOne({ shopDomain });
    const sources = { website: 0, email: 0, import: 0 };
    const products = {};

    reviews.forEach((r) => {
      if (sources[r.source] !== undefined) sources[r.source]++;
      if (!products[r.itemId]) products[r.itemId] = { count: 0, sum: 0 };
      products[r.itemId].count++;
      products[r.itemId].sum += r.rating;
    });

    let topProduct = { id: 'N/A', count: 0, averageRating: '0.0', title: null, image: null };
    const sortedProducts = Object.entries(products).sort((a, b) => b[1].count - a[1].count);

    if (sortedProducts.length) {
      const top = sortedProducts[0];
      topProduct.id = top[0];
      topProduct.count = top[1].count;
      topProduct.averageRating = (top[1].sum / top[1].count).toFixed(1);
      try {
        const prodData = await shopifyFetch(`/admin/api/2024-01/products/${topProduct.id}.json?fields=id,title,image`);
        if (prodData.product) {
          topProduct.title = prodData.product.title;
          topProduct.image = prodData.product.image ? prodData.product.image.src : null;
        }
      } catch (e) {
        console.error('Could not fetch top product details', e.message);
      }
    }

    const sent = config?.emailsSentTotal || 0;
    const rate = sent > 0 ? ((sources.email / sent) * 100).toFixed(1) : 0;
    res.json({ sources, topProduct, emailStats: { sent, completed: sources.email, rate } });
  } catch (e) {
    res.status(500).send(e.message);
  }
});

app.get('/api/admin/campaign-analytics', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain);
    if (!shopDomain) return res.status(400).json({ error: 'Missing shopDomain.' });
    const analytics = await buildCampaignAnalytics(shopDomain);
    res.json(analytics);
  } catch (error) {
    console.error('Campaign analytics error:', error);
    res.status(500).json({ error: 'Failed to load campaign analytics.' });
  }
});

app.post('/api/campaign-events/sent', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.body.shopDomain || req.query.shopDomain);
    if (!shopDomain) return res.status(400).json({ error: 'Missing shopDomain.' });

    const token = String(req.body.token || req.query.token || `${Date.now()}-${Math.random()}`);
    await CampaignEvent.create({
      shopDomain,
      campaign: req.body.campaign || 'review_request',
      eventType: 'sent',
      orderId: String(req.body.orderId || ''),
      email: String(req.body.email || '').toLowerCase(),
      token,
      userAgent: req.get('user-agent') || '',
      ipHash: hashIp(req.ip)
    });

    await Settings.findOneAndUpdate({ shopDomain }, { $inc: { emailsSentTotal: 1 } }, { upsert: true, new: true });
    res.json({ ok: true });
  } catch (error) {
    console.error('Campaign sent event error:', error);
    res.status(500).json({ error: 'Failed to record sent event.' });
  }
});

app.get('/api/campaign-events/open.gif', async (req, res) => {
  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain);
    if (shopDomain) {
      await CampaignEvent.create({
        shopDomain,
        campaign: req.query.campaign || 'review_request',
        eventType: 'open',
        orderId: String(req.query.orderId || ''),
        email: String(req.query.email || '').toLowerCase(),
        itemId: String(req.query.itemId || ''),
        token: String(req.query.token || ''),
        userAgent: req.get('user-agent') || '',
        ipHash: hashIp(req.ip)
      });
    }
  } catch (error) {
    console.error('Campaign open event error:', error);
  }

  const pixel = Buffer.from('R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.end(pixel);
});

app.get('/api/campaign-events/click', async (req, res) => {
  const fallbackUrl = `https://${req.query.shopDomain || ''}`;
  const targetUrl = String(req.query.url || fallbackUrl);

  try {
    const shopDomain = cleanShopDomain(req.query.shopDomain);
    if (shopDomain) {
      await CampaignEvent.create({
        shopDomain,
        campaign: req.query.campaign || 'review_request',
        eventType: 'click',
        orderId: String(req.query.orderId || ''),
        email: String(req.query.email || '').toLowerCase(),
        itemId: String(req.query.itemId || ''),
        token: String(req.query.token || ''),
        url: targetUrl,
        userAgent: req.get('user-agent') || '',
        ipHash: hashIp(req.ip)
      });
    }
  } catch (error) {
    console.error('Campaign click event error:', error);
  }

  res.redirect(targetUrl);
});

app.get('/api/global-reviews', async (req, res) => {
  try {
    const reviews = await Review.find({
      shopDomain: req.query.shopDomain,
      status: 'accepted',
      isDeleted: false,
      isTestReview: { $ne: true }
    }).sort({ rating: -1, createdAt: -1 }).limit(100);
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: 'Fetch error' });
  }
});

app.get('/api/reviews/:itemId', async (req, res) => {
  const reviews = await Review.find({
    itemId: req.params.itemId,
    shopDomain: req.query.shopDomain,
    status: 'accepted',
    isDeleted: false,
    isTestReview: { $ne: true }
  }).sort({ createdAt: -1 });
  res.json(reviews);
});

app.post('/api/reviews', async (req, res) => {
  try {
    const isTestReview = req.body.testMode === true || req.body.isTestReview === true;
    const email = String(req.body.email || '').trim();

    if (!isTestReview && !email) return res.status(400).json({ error: 'Email is required to submit a review.' });

    let isVerified = false;
    let vNote = 'Unverified review.';
    let finalStatus = 'pending';

    if (isTestReview) {
      vNote = 'Test review submitted from review page preview.';
      finalStatus = 'spam';
    } else {
      const checkResult = await resolveReviewVerification({ orderId: req.body.orderId, email, itemId: req.body.itemId });
      isVerified = checkResult.verified;
      vNote = checkResult.note;
      const config = await Settings.findOne({ shopDomain: req.body.shopDomain });
      finalStatus = getAutoStatus(config, isVerified, req.body.rating);
    }

    const newReview = new Review({
      ...req.body,
      email,
      source: req.body.source || 'email',
      isTestReview,
      testMode: isTestReview,
      testLabel: isTestReview ? 'TEST REVIEW' : '',
      verifiedPurchase: isVerified,
      verificationNote: vNote,
      status: finalStatus
    });

    const saved = await newReview.save();
    res.status(201).json(saved);
    if (!isTestReview && finalStatus === 'accepted') syncShopifyMetafields(req.body.shopDomain, req.body.itemId);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: 'Failed to submit' });
  }
});

app.post('/api/reviews/bulk', async (req, res) => {
  try {
    const { shopDomain, orderId, reviews, testMode } = req.body;
    const email = String(req.body.email || '').trim();

    if (!shopDomain || !Array.isArray(reviews) || !reviews.length) return res.status(400).json({ error: 'Invalid payload.' });

    const isTestReview = testMode === true;
    if (!isTestReview && !email) return res.status(400).json({ error: 'Email is required to submit reviews.' });

    const config = await Settings.findOne({ shopDomain });
    const savedReviews = [];

    for (const review of reviews) {
      let isVerified = false;
      let verificationNote = 'Unverified review.';
      let status = 'pending';

      if (isTestReview) {
        verificationNote = 'Test review submitted from review page preview.';
        status = 'spam';
      } else {
        const checkResult = await resolveReviewVerification({ orderId, email, itemId: review.itemId });
        isVerified = checkResult.verified;
        verificationNote = checkResult.note;
        status = getAutoStatus(config, isVerified, review.rating);
      }

      const doc = new Review({
        shopDomain,
        itemId: String(review.itemId),
        userId: review.userId || 'Verified Customer',
        email: email || review.email || '',
        isAnonymous: Boolean(review.isAnonymous),
        rating: parseInt(review.rating, 10) || 5,
        headline: review.headline || '',
        comment: review.comment || '',
        attributes: review.attributes || {},
        productTags: review.productTags || [],
        source: 'email',
        status,
        verifiedPurchase: isVerified,
        verificationNote,
        orderId: orderId || '',
        isTestReview,
        testMode: isTestReview,
        testLabel: isTestReview ? 'TEST REVIEW' : ''
      });

      const saved = await doc.save();
      savedReviews.push(saved);
      if (!isTestReview && status === 'accepted') syncShopifyMetafields(shopDomain, review.itemId);
    }

    res.status(201).json({
      message: isTestReview ? `Saved ${savedReviews.length} test reviews to spam.` : `Submitted ${savedReviews.length} reviews.`,
      reviews: savedReviews
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to submit bulk reviews.' });
  }
});

app.post('/api/reviews/import', async (req, res) => {
  try {
    const { shopDomain, reviews } = req.body;
    if (!shopDomain || !reviews || !Array.isArray(reviews)) return res.status(400).json({ error: 'Invalid payload.' });

    const importData = reviews.map((r) => ({
      shopDomain,
      itemId: String(r.itemId).trim(),
      userId: r.userId || 'Verified Customer',
      email: r.email || '',
      rating: parseInt(r.rating, 10) || 5,
      headline: r.headline || '',
      comment: r.comment || '',
      source: 'import',
      status: 'accepted',
      verifiedPurchase: true,
      isDeleted: false,
      isTestReview: false,
      createdAt: r.createdAt ? new Date(r.createdAt) : new Date()
    }));

    await Review.insertMany(importData);
    res.status(201).json({ message: `Imported ${importData.length} reviews.` });
    [...new Set(importData.map((r) => r.itemId))].forEach((id) => syncShopifyMetafields(shopDomain, id));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to import reviews.' });
  }
});

app.get('/api/admin/reviews', async (req, res) => {
  const reviews = await Review.find({ shopDomain: req.query.shopDomain }).sort({ createdAt: -1 });
  res.json(reviews);
});

app.patch('/api/reviews/:id', async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (req.body.isDeleted !== undefined) updateData.deletedAt = req.body.isDeleted ? new Date() : null;
    const updated = await Review.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(updated);
    if (updated && !updated.isTestReview && (req.body.status !== undefined || req.body.isDeleted !== undefined)) {
      syncShopifyMetafields(updated.shopDomain, updated.itemId);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/reviews/:id/verify', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found.' });

    if (req.body.mode === 'manual') {
      review.verifiedPurchase = true;
      review.verificationNote = 'Manually verified by admin.';
    } else {
      const check = await resolveReviewVerification({ orderId: review.orderId, email: review.email, itemId: review.itemId });
      review.verifiedPurchase = check.verified;
      review.verificationNote = check.note;
    }

    await review.save();
    res.json(review);
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify review.' });
  }
});

app.get('/api/admin/reviews/changes', async (req, res) => {
  try {
    const shopDomain = req.query.shopDomain;
    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 5 * 60 * 1000);
    const count = await Review.countDocuments({ shopDomain, createdAt: { $gt: since }, isDeleted: false });
    res.json({ count, since });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check changes.' });
  }
});

app.get('/api/admin/settings', async (req, res) => {
  res.json(await Settings.findOne({ shopDomain: req.query.shopDomain }));
});

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
const nodemailer = require('nodemailer');
app.listen(PORT, () => console.log(` Port ${PORT}`));
