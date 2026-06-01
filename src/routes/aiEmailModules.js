const express = require('express');
const https = require('https');
const { cleanText, clampNumber } = require('../utils/validation');

const router = express.Router();

const ALLOWED_POSITIONS = new Set(['before', 'after']);
const ALLOWED_LINK_TYPES = new Set(['external', 'internal']);
const NAMED_COLOURS = {
  gold: '#f5b301',
  yellow: '#f5b301',
  black: '#111827',
  white: '#ffffff',
  cream: '#fff7ed',
  blue: '#005bd3',
  green: '#027a48',
  red: '#d72c0d',
  pink: '#fdf2f8',
  grey: '#f8fafc',
  gray: '#f8fafc',
  orange: '#fb923c',
  purple: '#7c3aed',
};

function text(value, max = 160, fallback = '') {
  const cleaned = cleanText(value || '', max);
  return cleaned || fallback;
}

function hexOrNone(value, fallback = '#ffffff') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'none' || raw === 'transparent') return 'none';
  if (NAMED_COLOURS[raw]) return NAMED_COLOURS[raw];
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw.slice(1).split('').map((c) => c + c).join('')}`.toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  return fallback;
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

function moduleSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      variants: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            variantLabel: { type: 'string', description: 'Short label such as A, B, C, Premium, Friendly.' },
            name: { type: 'string', description: 'Internal reusable module name.' },
            title: { type: 'string', description: 'Customer-facing module title.' },
            text: { type: 'string', description: 'Customer-facing description/body copy.' },
            position: { type: 'string', enum: ['before', 'after'] },
            bgColor: { type: 'string', description: 'Hex colour or none.' },
            borderColor: { type: 'string', description: 'Hex colour or none.' },
            borderWidth: { type: 'number' },
            radius: { type: 'number' },
            padding: { type: 'number' },
            buttonText: { type: 'string' },
            buttonUrl: { type: 'string' },
            linkType: { type: 'string', enum: ['external', 'internal'] },
            rationale: { type: 'string', description: 'One short sentence explaining the design choice.' },
          },
          required: [
            'variantLabel',
            'name',
            'title',
            'text',
            'position',
            'bgColor',
            'borderColor',
            'borderWidth',
            'radius',
            'padding',
            'buttonText',
            'buttonUrl',
            'linkType',
            'rationale',
          ],
        },
      },
    },
    required: ['variants'],
  };
}

function normaliseModule(input = {}, index = 0) {
  const linkType = ALLOWED_LINK_TYPES.has(input.linkType) ? input.linkType : 'external';
  const position = ALLOWED_POSITIONS.has(input.position) ? input.position : 'before';
  const label = text(input.variantLabel, 32, String.fromCharCode(65 + index));
  const title = text(input.title, 120, 'Review reminder');
  const fallbackName = `${title} ${label}`.replace(/\s+/g, ' ').trim();

  return {
    variantLabel: label,
    name: text(input.name, 80, fallbackName),
    title,
    text: text(input.text, 420, 'Add a short customer-friendly message here.'),
    position,
    bgColor: hexOrNone(input.bgColor, '#ffffff'),
    borderColor: hexOrNone(input.borderColor, '#e5e7eb'),
    borderWidth: clampNumber(input.borderWidth, 0, 8, 1),
    radius: clampNumber(input.radius, 0, 32, 14),
    padding: clampNumber(input.padding, 8, 36, 16),
    buttonText: text(input.buttonText, 80, ''),
    buttonUrl: normaliseUrl(input.buttonUrl, linkType),
    linkType,
    rationale: text(input.rationale, 180, 'Generated from the merchant prompt using approved module settings.'),
  };
}

function inferFallback(prompt, count = 1, brand = {}) {
  const p = String(prompt || '').toLowerCase();
  const wantsSupport = /(support|help|contact|problem|issue|before review)/i.test(p);
  const wantsReward = /(point|reward|loyal|discount|offer|gift|voucher)/i.test(p);
  const wantsReview = /(review|feedback|rating|testimonial)/i.test(p) || !wantsSupport;
  const wantsAfter = /(after product|after products|below product|below products|after the products)/i.test(p);
  const premium = /(premium|luxury|elegant|clean|minimal|high end)/i.test(p);
  const bg = p.includes('cream') ? '#fff7ed' : hexOrNone(brand.cardColor || brand.bgColor || '#ffffff', '#ffffff');
  const border = p.includes('gold') ? '#f5b301' : hexOrNone(brand.accentColor || '#e5e7eb', '#e5e7eb');
  const baseTitle = wantsSupport ? 'Need help first?' : wantsReward ? 'Earn a reward for your review' : wantsReview ? 'How did we do?' : 'A quick note';
  const baseText = wantsSupport
    ? 'Something not right? Contact us before reviewing and our team will help put it right.'
    : wantsReward
      ? 'Leave a verified review and you may earn rewards once your feedback has been approved.'
      : 'Your feedback helps other customers shop with confidence. It only takes a minute.';
  const baseButton = wantsSupport ? 'Contact customer service' : wantsReview ? 'Leave a review' : '';
  const baseUrl = wantsSupport ? '{{support_link}}' : wantsReview ? '{{review_link}}' : '';

  return Array.from({ length: Math.max(1, Math.min(3, Number(count) || 1)) }, (_, index) => {
    const label = String.fromCharCode(65 + index);
    const variantTone = index === 1 ? 'Friendly' : index === 2 ? 'Direct' : (premium ? 'Premium' : 'Balanced');
    return normaliseModule({
      variantLabel: label,
      name: `${baseTitle} · ${variantTone}`,
      title: index === 1 && wantsReward ? 'Your review could unlock rewards' : baseTitle,
      text: index === 2 ? baseText.replace('It only takes a minute.', 'Share a quick review when you are ready.') : baseText,
      position: wantsAfter ? 'after' : 'before',
      bgColor: bg,
      borderColor: border,
      borderWidth: p.includes('no border') ? 0 : 1,
      radius: premium ? 18 : 14,
      padding: premium ? 22 : 16,
      buttonText: baseButton,
      buttonUrl: baseUrl,
      linkType: 'external',
      rationale: 'Fallback module generated safely from the prompt because OpenAI is not configured or did not return valid JSON.',
    }, index);
  });
}

function postJson(hostname, path, apiKey, body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data || '{}'); } catch (error) { return reject(new Error(`OpenAI returned non-JSON (${res.statusCode})`)); }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const message = json.error?.message || `OpenAI request failed (${res.statusCode})`;
          return reject(new Error(message));
        }
        resolve(json);
      });
    });
    req.on('timeout', () => req.destroy(new Error('OpenAI request timed out')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function extractOutputText(response = {}) {
  if (typeof response.output_text === 'string') return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (typeof part.text === 'string') return part.text;
    }
  }
  return '';
}

async function generateWithOpenAI({ prompt, variants, brand, shopDomain }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODULE_MODEL || 'gpt-4.1-mini';
  const schema = moduleSchema();
  const response = await postJson('api.openai.com', '/v1/responses', apiKey, {
    model,
    input: [
      {
        role: 'system',
        content: [
          'You generate safe reusable email module configurations for a Shopify review/loyalty app.',
          'Never output HTML, CSS, JavaScript, Liquid, tracking pixels, or scripts.',
          'Only choose values supported by the schema. Keep copy concise, commercial, and customer-friendly.',
          'Use {{review_link}} for review CTAs and {{support_link}} for support CTAs when appropriate.',
          'Prefer accessible contrast and email-safe visual choices.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({ prompt, variants, brand, shopDomain }),
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'nectar_email_module_variants',
        strict: true,
        schema,
      },
    },
    max_output_tokens: 1400,
  });

  const raw = extractOutputText(response);
  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed.variants) ? parsed.variants : [];
  return items.slice(0, variants).map((item, index) => normaliseModule(item, index));
}

router.post('/email-module', async (req, res) => {
  const prompt = text(req.body?.prompt, 1500, 'Create a helpful review request module.');
  const variants = clampNumber(req.body?.variants, 1, 3, 1);
  const brand = req.body?.brand && typeof req.body.brand === 'object' ? req.body.brand : {};
  const shopDomain = req.shopDomain || req.headers['x-shop-domain'] || '';

  let generated = null;
  let provider = 'openai';
  let warning = '';

  try {
    generated = await generateWithOpenAI({ prompt, variants, brand, shopDomain });
  } catch (error) {
    warning = error.message || 'OpenAI generation failed; used local safe fallback.';
    provider = 'fallback';
  }

  if (!generated || !generated.length) {
    provider = 'fallback';
    if (!warning && !process.env.OPENAI_API_KEY) warning = 'OPENAI_API_KEY is not configured; used local safe fallback.';
    generated = inferFallback(prompt, variants, brand);
  }

  return res.json({
    ok: true,
    provider,
    warning,
    variants: generated,
    module: generated[0],
  });
});

module.exports = router;
