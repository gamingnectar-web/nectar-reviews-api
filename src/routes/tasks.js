const express = require('express');
const { env } = require('../config/env');
const { sendDueReviewRequests } = require('../modules/reviews/reviewRequestAutomation');

const router = express.Router();

function authorised(req) {
  const configured = Boolean(env.taskRunnerSecret);
  const supplied = String(req.headers['x-nectar-task-secret'] || req.query.secret || '').trim();
  if (!configured && env.nodeEnv !== 'production') return true;
  return configured && supplied && supplied === env.taskRunnerSecret;
}

async function runReviewRequests(req, res, next) {
  try {
    if (!authorised(req)) return res.status(401).json({ ok: false, error: 'Unauthorised task runner.' });
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || req.body?.limit || 25)));
    const result = await sendDueReviewRequests({ limit });
    return res.json({ ok: true, task: 'review_requests_due', ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}

router.get('/review-requests/run', runReviewRequests);
router.post('/review-requests/run', express.json({ limit: '50kb' }), runReviewRequests);

module.exports = router;
