const express = require('express');
const mongoose = require('mongoose');
const { cleanText, clampNumber } = require('../utils/validation');

const router = express.Router();

const MAX_MODULES = 80;
const MAX_HIDDEN_PRESETS = 80;
const ALLOWED_POSITIONS = new Set(['before', 'after']);
const ALLOWED_LINK_TYPES = new Set(['external', 'internal']);

const emailModuleLibrarySchema = new mongoose.Schema({
  shopDomain: { type: String, required: true, unique: true, index: true },
  messageModules: { type: [mongoose.Schema.Types.Mixed], default: [] },
  hiddenModuleIds: { type: [String], default: [] },
  lastSyncedFrom: { type: String, default: 'admin' },
}, { timestamps: true });

emailModuleLibrarySchema.index({ shopDomain: 1, updatedAt: -1 });

const EmailModuleLibrary = mongoose.models.EmailModuleLibrary
  || mongoose.model('EmailModuleLibrary', emailModuleLibrarySchema, 'email_module_libraries');

function nowIso() {
  return new Date().toISOString();
}

function safeId(value, fallbackPrefix = 'custom') {
  const raw = cleanText(value || '', 120).trim();
  if (raw) return raw;
  return `${fallbackPrefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function normaliseUrl(value, linkType = 'external') {
  const raw = cleanText(value || '', 300).trim();
  if (!raw) return '';
  if (/^\{\{[a-z0-9_\s.-]+\}\}$/i.test(raw)) return raw;
  if (/^mailto:/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (linkType === 'internal' || raw.startsWith('/')) return raw.startsWith('/') ? raw : `/${raw}`;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function normaliseColour(value, fallback = 'none') {
  const raw = cleanText(value || '', 40).trim().toLowerCase();
  if (!raw || raw === 'none' || raw === 'transparent') return 'none';
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw.slice(1).split('').map((c) => c + c).join('')}`.toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  return fallback;
}

function normaliseModule(module = {}, index = 0) {
  const linkType = ALLOWED_LINK_TYPES.has(module.linkType) ? module.linkType : 'external';
  const id = safeId(module.id, 'custom');
  const name = cleanText(module.name || module.title || `Custom module ${index + 1}`, 90) || `Custom module ${index + 1}`;
  const title = cleanText(module.title || name, 140) || name;
  const text = cleanText(module.text || module.description || '', 600);

  return {
    id: String(id).startsWith('custom:') ? String(id) : `custom:${id}`,
    name,
    title,
    text,
    position: ALLOWED_POSITIONS.has(module.position) ? module.position : 'before',
    bgColor: normaliseColour(module.bgColor, 'none'),
    borderColor: normaliseColour(module.borderColor, '#e5e7eb'),
    borderWidth: clampNumber(module.borderWidth, 0, 8, 1),
    radius: clampNumber(module.radius, 0, 32, 14),
    padding: clampNumber(module.padding, 8, 36, 16),
    buttonText: cleanText(module.buttonText || '', 90),
    buttonUrl: normaliseUrl(module.buttonUrl || '', linkType),
    linkType,
    source: cleanText(module.source || 'merchant', 40) || 'merchant',
    variantLabel: cleanText(module.variantLabel || '', 32),
    createdAt: module.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
}

function normaliseHiddenIds(ids = []) {
  return Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map((id) => cleanText(id, 120))
    .filter(Boolean)))
    .slice(0, MAX_HIDDEN_PRESETS);
}

async function findOrCreate(shopDomain) {
  return EmailModuleLibrary.findOneAndUpdate(
    { shopDomain },
    { $setOnInsert: { shopDomain, messageModules: [], hiddenModuleIds: [] } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

router.get('/', async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;
    const library = await findOrCreate(shopDomain);
    return res.json({
      ok: true,
      shopDomain,
      messageModules: Array.isArray(library.messageModules) ? library.messageModules : [],
      hiddenModuleIds: Array.isArray(library.hiddenModuleIds) ? library.hiddenModuleIds : [],
      updatedAt: library.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;
    const body = req.body || {};
    const messageModules = (Array.isArray(body.messageModules) ? body.messageModules : [])
      .slice(0, MAX_MODULES)
      .map((module, index) => normaliseModule(module, index))
      .filter((module) => module.name && module.text);
    const hiddenModuleIds = normaliseHiddenIds(body.hiddenModuleIds);

    const saved = await EmailModuleLibrary.findOneAndUpdate(
      { shopDomain },
      {
        $set: {
          shopDomain,
          messageModules,
          hiddenModuleIds,
          lastSyncedFrom: cleanText(body.source || 'admin', 40) || 'admin',
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.json({
      ok: true,
      shopDomain,
      messageModules: saved.messageModules || [],
      hiddenModuleIds: saved.hiddenModuleIds || [],
      updatedAt: saved.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/modules', async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;
    const incoming = normaliseModule(req.body || {}, 0);
    if (!incoming.name || !incoming.text) return res.status(400).json({ error: 'Module name and description are required.' });

    const library = await findOrCreate(shopDomain);
    const existing = Array.isArray(library.messageModules) ? library.messageModules : [];
    const withoutDuplicate = existing.filter((module) => String(module.id) !== String(incoming.id));
    const messageModules = [incoming, ...withoutDuplicate].slice(0, MAX_MODULES);

    library.messageModules = messageModules;
    library.lastSyncedFrom = 'admin-single-module';
    await library.save();

    return res.status(201).json({
      ok: true,
      module: incoming,
      messageModules: library.messageModules || [],
      hiddenModuleIds: library.hiddenModuleIds || [],
      updatedAt: library.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/modules/:id', async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;
    const id = cleanText(req.params.id, 140);
    const library = await findOrCreate(shopDomain);
    library.messageModules = (Array.isArray(library.messageModules) ? library.messageModules : [])
      .filter((module) => String(module.id) !== String(id));
    library.lastSyncedFrom = 'admin-delete-module';
    await library.save();
    return res.json({
      ok: true,
      messageModules: library.messageModules || [],
      hiddenModuleIds: library.hiddenModuleIds || [],
      updatedAt: library.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
