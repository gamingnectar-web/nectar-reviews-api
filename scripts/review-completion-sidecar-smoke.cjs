'use strict';

const fs = require('fs');

const model = fs.readFileSync('src/modules/reviews/reviewCompletion.model.js', 'utf8');
const service = fs.readFileSync('src/modules/reviews/reviewCompletion.service.js', 'utf8');
const publicRoute = fs.readFileSync('src/routes/public.js', 'utf8');
const adminRoute = fs.readFileSync('src/routes/admin.js', 'utf8');
const queueUi = fs.readFileSync('public/review-operations.js', 'utf8');
const automation = fs.readFileSync('src/modules/reviews/reviewRequestAutomation.js', 'utf8');

function check(ok, msg) {
  if (ok) console.log('✓ ' + msg);
  else {
    console.error('✗ ' + msg);
    process.exitCode = 1;
  }
}

check(model.includes("'review_completion_states'"), 'completion state uses its own collection');
check(model.includes("enum: ['none', 'partial', 'complete']"), 'completion state has none/partial/complete statuses');
check(model.includes("default: 'not_configured'"), 'post-review actions are disabled/not configured in V1');

check(service.includes('ELEV8_REVIEW_COMPLETION_SIDECAR_V1'), 'sidecar service marker exists');
check(service.includes('setImmediate'), 'completion tracking is detached from customer response');
check(service.includes('Promise.allSettled'), 'sidecar failures are contained');
check(service.includes('ReviewRequestJob.findOne'), 'sidecar reads the existing request job');
check(!service.includes('ReviewRequestJob.update'), 'sidecar never updates review-request jobs');
check(!service.includes('job.status ='), 'sidecar never changes review-request status');
check(!service.includes('nodemailer'), 'sidecar cannot send email');
check(!service.includes('loyalty.service'), 'sidecar does not change loyalty behaviour');

check(publicRoute.includes('queueReviewCompletionTracking(saved);'), 'single and bulk review saves enqueue completion tracking');
check(adminRoute.includes('getCompletionStateMap'), 'Review Operations reads completion sidecar state');
check(adminRoute.includes('completion:'), 'Review Operations exposes completion data');
check(queueUi.includes("label:'Review complete'"), 'Review Send Queue shows completion stage');
check(queueUi.includes('reviewedCount'), 'Review Send Queue shows reviewed product count');

check(!automation.includes('ELEV8_REVIEW_COMPLETION_SIDECAR_V1'), 'live review send automation was not modified by this feature');

if (process.exitCode) process.exit(process.exitCode);
console.log('ELEV8 Review Completion Sidecar smoke test passed.');
