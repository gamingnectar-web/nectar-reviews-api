const CustomerHubConfig = require('./models/CustomerHubConfig');

const SECTION_TYPES = new Set(['welcome','orders','restock_alerts','updates','reviews','account','custom_links']);

function text(value, max = 240) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}
function hex(value, fallback) {
  const v = String(value || '');
  return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
}
function num(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function bool(value, fallback = true) {
  return value === undefined ? fallback : Boolean(value);
}
function id(value, fallback) {
  const v = String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return v || fallback;
}

function defaultDefinition() {
  return {
    name: 'Customer Hub',
    pageHandle: 'customer-hub',
    loginRequired: true,
    layout: {
      maxWidth: 1240,
      gap: 18,
      cardRadius: 16,
      columns: 2,
      background: '#f7f8fa',
      surface: '#ffffff',
      text: '#111827',
      muted: '#667085',
      accent: '#111827',
    },
    sections: [
      { id:'welcome', type:'welcome', enabled:true, title:'Welcome back', settings:{ subtitle:'Everything about your Gaming Nectar account in one place.' } },
      { id:'orders', type:'orders', enabled:true, title:'Recent orders', settings:{ limit:5, showTracking:true, showStatus:true } },
      { id:'restock-alerts', type:'restock_alerts', enabled:true, title:'Stock alerts', settings:{ limit:8, allowRemove:true, showAvailable:true } },
      { id:'updates', type:'updates', enabled:true, title:'Updates', settings:{ limit:8, showReadState:true } },
      { id:'reviews', type:'reviews', enabled:true, title:'Reviews', settings:{ copy:'Review recent purchases and help other customers.', buttonLabel:'Review a purchase', buttonUrl:'/pages/leave-review' } },
      { id:'account', type:'account', enabled:true, title:'Your account', settings:{ showAccount:true, showAddresses:true } },
    ],
  };
}

function sanitizeSection(raw = {}, index = 0) {
  const type = SECTION_TYPES.has(raw.type) ? raw.type : 'custom_links';
  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const clean = {
    id: id(raw.id, `${type}-${index+1}`),
    type,
    enabled: bool(raw.enabled, true),
    title: text(raw.title || '', 120),
    settings: {},
  };
  if (type === 'welcome') clean.settings = { subtitle:text(settings.subtitle || '', 260), showEmail:bool(settings.showEmail,false) };
  if (type === 'orders') clean.settings = { limit:num(settings.limit,1,12,5), showTracking:bool(settings.showTracking,true), showStatus:bool(settings.showStatus,true) };
  if (type === 'restock_alerts') clean.settings = { limit:num(settings.limit,1,20,8), allowRemove:bool(settings.allowRemove,true), showAvailable:bool(settings.showAvailable,true) };
  if (type === 'updates') clean.settings = { limit:num(settings.limit,1,20,8), showReadState:bool(settings.showReadState,true) };
  if (type === 'reviews') clean.settings = { copy:text(settings.copy || '', 300), buttonLabel:text(settings.buttonLabel || 'Review a purchase', 80), buttonUrl:text(settings.buttonUrl || '/pages/leave-review', 500) };
  if (type === 'account') clean.settings = { showAccount:bool(settings.showAccount,true), showAddresses:bool(settings.showAddresses,true) };
  if (type === 'custom_links') {
    const links = Array.isArray(settings.links) ? settings.links : [];
    clean.settings = { links:links.slice(0,8).map((link)=>({ label:text(link?.label || 'Link',80), url:text(link?.url || '/',500) })) };
  }
  return clean;
}

function sanitizeDefinition(raw = {}) {
  const base = defaultDefinition();
  const layout = raw.layout && typeof raw.layout === 'object' ? raw.layout : {};
  const sections = Array.isArray(raw.sections) ? raw.sections : base.sections;
  return {
    name: text(raw.name || base.name, 120),
    pageHandle: id(String(raw.pageHandle || base.pageHandle).replace(/^pages\//,''), 'customer-hub'),
    loginRequired: bool(raw.loginRequired, true),
    layout: {
      maxWidth:num(layout.maxWidth,720,1800,base.layout.maxWidth),
      gap:num(layout.gap,8,48,base.layout.gap),
      cardRadius:num(layout.cardRadius,0,32,base.layout.cardRadius),
      columns:num(layout.columns,1,3,base.layout.columns),
      background:hex(layout.background,base.layout.background),
      surface:hex(layout.surface,base.layout.surface),
      text:hex(layout.text,base.layout.text),
      muted:hex(layout.muted,base.layout.muted),
      accent:hex(layout.accent,base.layout.accent),
    },
    sections:sections.slice(0,20).map(sanitizeSection),
  };
}

async function getOrCreate(shopDomain) {
  let row = await CustomerHubConfig.findOne({ shopDomain });
  if (!row) {
    const initial = sanitizeDefinition(defaultDefinition());
    row = await CustomerHubConfig.create({ shopDomain, draft:initial, published:{}, publishedVersion:0 });
  }
  if (!row.draft || !Object.keys(row.draft).length) row.draft = sanitizeDefinition(defaultDefinition());
  return row;
}

function publicState(row) {
  const draft = sanitizeDefinition(row.draft || defaultDefinition());
  const published = row.published && Object.keys(row.published).length ? sanitizeDefinition(row.published) : null;
  return {
    draft,
    published,
    publishedVersion:Number(row.publishedVersion || 0),
    publishedAt:row.publishedAt || null,
    hasPublished:Boolean(published),
    hasUnpublishedChanges:JSON.stringify(draft) !== JSON.stringify(published || {}),
    history:(row.history || []).slice(-10).reverse().map(v=>({ version:v.version, publishedAt:v.publishedAt, publishedBy:v.publishedBy || '' })),
  };
}

module.exports = { defaultDefinition, sanitizeDefinition, getOrCreate, publicState };
