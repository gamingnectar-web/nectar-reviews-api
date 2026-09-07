const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const ago = (days) => new Date(Date.now() - days * 86400 * 1000);
async function count(name, query = {}) { try { return await mongoose.connection.db.collection(name).countDocuments(query); } catch (_) { return 0; } }
async function aggregate(name, pipeline = []) { try { return await mongoose.connection.db.collection(name).aggregate(pipeline).toArray(); } catch (_) { return []; } }

router.get('/summary', async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;
    const weekAgo = ago(7), monthAgo = ago(30);
    const reviewMatch = { shopDomain, isDeleted: { $ne: true }, isTestReview: { $ne: true }, testMode: { $ne: true } };
    const [reviewsWeek,reviewsMonth,approvedMonth,sources,productImportsWeek,productImportsMonth,reviewImportsMonth,claimsWeek,claimsMonth,activeCampaigns,eventsWeek] = await Promise.all([
      count('reviews',{...reviewMatch,createdAt:{$gte:weekAgo}}),
      count('reviews',{...reviewMatch,createdAt:{$gte:monthAgo}}),
      count('reviews',{...reviewMatch,status:'accepted',createdAt:{$gte:monthAgo}}),
      aggregate('reviews',[{$match:{...reviewMatch,createdAt:{$gte:monthAgo}}},{$group:{_id:{source:'$source',sourcePlatform:'$sourcePlatform'},count:{$sum:1}}},{$sort:{count:-1}}]),
      count('product_creation_imports',{shopDomain,createdAt:{$gte:weekAgo}}),
      count('product_creation_imports',{shopDomain,createdAt:{$gte:monthAgo}}),
      count('review_migration_batches',{shopDomain,createdAt:{$gte:monthAgo}}),
      count('cartrewardclaims',{shopDomain,createdAt:{$gte:weekAgo}}),
      count('cartrewardclaims',{shopDomain,createdAt:{$gte:monthAgo}}),
      count('cartrewardcampaigns',{shopDomain,status:'active'}),
      aggregate('cartrewardevents',[{$match:{shopDomain,occurredAt:{$gte:weekAgo}}},{$group:{_id:'$eventType',count:{$sum:1}}}])
    ]);
    const eventMap={}; eventsWeek.forEach(r=>eventMap[r._id||'unknown']=r.count||0);
    res.setHeader('Cache-Control','no-store');
    res.json({brand:'ELEV8',generatedAt:new Date().toISOString(),periods:{week:{reviews:reviewsWeek,productImports:productImportsWeek,cartRewardClaims:claimsWeek},month:{reviews:reviewsMonth,approvedReviews:approvedMonth,reviewImports:reviewImportsMonth,productImports:productImportsMonth,cartRewardClaims:claimsMonth}},reviews:{sourceBreakdown:sources.map(r=>({source:r._id?.source||'unknown',platform:r._id?.sourcePlatform||'',count:r.count||0}))},cartRewards:{activeCampaigns,eventsWeek:eventMap}});
  } catch (error) { next(error); }
});
module.exports = router;
