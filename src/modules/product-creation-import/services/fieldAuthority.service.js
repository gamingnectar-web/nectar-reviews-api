const { normaliseMetafields } = require('../utils/safe');

function key(mf = {}) { return `${mf.namespace || ''}.${mf.key || ''}`; }
function locked(draft = {}, path = '') { return Boolean(draft?.fieldLocks?.[path]?.locked); }

function markMerchantEdits(previous = {}, patch = {}) {
  const next = { ...patch };
  const fieldLocks = { ...(previous.fieldLocks || {}), ...(patch.fieldLocks || {}) };
  const lock = (path) => fieldLocks[path] = {
    locked: true, source: 'merchant', updatedAt: new Date().toISOString()
  };

  [
    'title','handle','descriptionHtml','vendor','productType','productCategory',
    'themeTemplate','collections','tags','price','compareAtPrice','sku','barcode'
  ].forEach((name) => {
    if (Object.prototype.hasOwnProperty.call(patch, name) &&
        JSON.stringify(previous?.[name]) !== JSON.stringify(patch[name])) lock(name);
  });

  if (patch.seo?.title !== undefined && previous?.seo?.title !== patch.seo.title) lock('seo.title');
  if (patch.seo?.description !== undefined && previous?.seo?.description !== patch.seo.description) lock('seo.description');

  if (Array.isArray(patch.metafields)) {
    const old = new Map((previous.metafields || []).map(mf => [key(mf), mf]));
    next.metafields = normaliseMetafields(patch.metafields).map((mf) => {
      const prior = old.get(key(mf));
      if (!prior || String(prior.value ?? '') !== String(mf.value ?? '')) {
        lock(`metafields.${key(mf)}`);
        return { ...mf, source: 'merchant', confidence: 1, merchantLocked: true };
      }
      return mf;
    });
  }

  next.fieldLocks = fieldLocks;
  next.lastMerchantEditAt = new Date().toISOString();
  return next;
}

function mergeMetafieldsWithAuthority(existing = [], incoming = [], draft = {}) {
  const out = new Map((normaliseMetafields(existing) || []).map(mf => [key(mf), mf]));
  for (const mf of normaliseMetafields(incoming) || []) {
    const k = key(mf);
    const current = out.get(k);
    const merchantOwns = locked(draft, `metafields.${k}`) ||
      current?.merchantLocked ||
      ['merchant','manual','user'].includes(String(current?.source || '').toLowerCase());
    if (merchantOwns && String(current?.value ?? '') !== '') continue;
    if (!current || !String(current.value ?? '').trim() ||
        Number(mf.confidence || 0) > Number(current.confidence || 0)) out.set(k, mf);
  }
  return [...out.values()];
}

function preserveLockedFields(before = {}, after = {}) {
  const next = { ...after, fieldLocks: { ...(before.fieldLocks || {}), ...(after.fieldLocks || {}) } };
  const locks = before.fieldLocks || {};
  const copy = (name) => { if (locks[name]?.locked) next[name] = before[name]; };
  ['title','handle','descriptionHtml','vendor','productType','productCategory','themeTemplate','collections','tags'].forEach(copy);
  next.seo = { ...(after.seo || {}) };
  if (locks['seo.title']?.locked) next.seo.title = before.seo?.title || '';
  if (locks['seo.description']?.locked) next.seo.description = before.seo?.description || '';

  const merged = new Map((after.metafields || []).map(mf => [key(mf), mf]));
  for (const mf of before.metafields || []) {
    if (locks[`metafields.${key(mf)}`]?.locked) merged.set(key(mf), { ...mf, source:'merchant', merchantLocked:true });
  }
  next.metafields = [...merged.values()];
  next.lastMerchantEditAt = before.lastMerchantEditAt || after.lastMerchantEditAt || null;
  return next;
}

module.exports = { markMerchantEdits, mergeMetafieldsWithAuthority, preserveLockedFields, locked };
