const express = require('express');
const { shopifyFetchOptional } = require('../../../utils/shopify');
const { env } = require('../../../config/env');
const { getOrCreate, sanitizeDefinition, publicState } = require('../customerHub.service');

const router = express.Router();
function shop(req){ return req.shopDomain; }

router.get('/', async (req,res,next)=>{ try {
  const row = await getOrCreate(shop(req));
  res.setHeader('Cache-Control','no-store');
  res.json(publicState(row));
} catch(e){ next(e); } });

router.patch('/draft', async (req,res,next)=>{ try {
  const row = await getOrCreate(shop(req));
  row.draft = sanitizeDefinition(req.body?.definition || req.body || {});
  row.markModified('draft');
  await row.save();
  res.json({ ok:true, ...publicState(row) });
} catch(e){ next(e); } });

router.post('/publish', async (req,res,next)=>{ try {
  const row = await getOrCreate(shop(req));
  const snapshot = sanitizeDefinition(row.draft || {});
  const version = Number(row.publishedVersion || 0) + 1;
  row.published = snapshot;
  row.publishedVersion = version;
  row.publishedAt = new Date();
  row.history = [...(row.history || []), { version, publishedAt:row.publishedAt, publishedBy:String(req.admin?.email || req.user?.email || 'admin').slice(0,120), snapshot }].slice(-10);
  row.markModified('published');
  row.markModified('history');
  await row.save();
  res.json({ ok:true, ...publicState(row) });
} catch(e){ next(e); } });

router.post('/discard', async (req,res,next)=>{ try {
  const row = await getOrCreate(shop(req));
  row.draft = row.published && Object.keys(row.published).length ? sanitizeDefinition(row.published) : sanitizeDefinition({});
  row.markModified('draft');
  await row.save();
  res.json({ ok:true, ...publicState(row) });
} catch(e){ next(e); } });

router.post('/restore/:version', async (req,res,next)=>{ try {
  const row = await getOrCreate(shop(req));
  const version = Number(req.params.version || 0);
  const hit = (row.history || []).find(item=>Number(item.version)===version);
  if (!hit?.snapshot) return res.status(404).json({ error:'Version not found.' });
  row.draft = sanitizeDefinition(hit.snapshot);
  row.markModified('draft');
  await row.save();
  res.json({ ok:true, ...publicState(row) });
} catch(e){ next(e); } });

router.get('/shopify-page', async (req,res,next)=>{ try {
  const row = await getOrCreate(shop(req));
  const handle = String(row.draft?.pageHandle || 'customer-hub');
  const data = await shopifyFetchOptional(`/admin/api/${env.shopifyApiVersion}/pages.json?handle=${encodeURIComponent(handle)}&limit=1`, { shopDomain:shop(req) });
  const page = Array.isArray(data?.pages) ? data.pages[0] : null;
  res.setHeader('Cache-Control','no-store');
  res.json({
    handle,
    exists:Boolean(page),
    page:page ? { id:page.id, title:page.title, handle:page.handle, templateSuffix:page.template_suffix || '', updatedAt:page.updated_at || null, adminGraphqlApiId:page.admin_graphql_api_id || '' } : null,
    storefrontUrl:`https://${shop(req).replace(/\.myshopify\.com$/i,'.myshopify.com')}/pages/${handle}`,
  });
} catch(e){ next(e); } });

module.exports = router;
