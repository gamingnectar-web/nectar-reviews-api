'use strict';

const fs = require('fs');

const html = fs.readFileSync('public/admin.html', 'utf8');
const js = fs.readFileSync('public/review-operations.js', 'utf8');
const css = fs.readFileSync('public/review-operations-countdown.css', 'utf8');

function check(ok, msg) {
  if (ok) console.log('✓ ' + msg);
  else {
    console.error('✗ ' + msg);
    process.exitCode = 1;
  }
}

check(html.includes('ELEV8_REVIEW_SEND_QUEUE_MODAL_V1'), 'modal admin marker exists');
check(html.includes('Review Send Queue'), 'Review Manager exposes Review Send Queue button');
check(html.includes('/review-operations.js?v=review-send-queue-modal-1'), 'modal JavaScript is cache-busted');
check(html.includes('/review-operations-countdown.css?v=review-send-queue-modal-1'), 'modal CSS is cache-busted');

check(js.includes('ELEV8_REVIEW_SEND_QUEUE_MODAL_V1'), 'modal JavaScript marker exists');
check(js.includes('window.openReviewSendQueue'), 'in-app Review Send Queue opener exists');
check(js.includes('reviewJourneyStages'), 'delivery journey renderer exists');
check(js.includes("label:'Order'"), 'journey includes Order stage');
check(js.includes("label:'Dispatched'"), 'journey includes Dispatched stage');
check(js.includes("label:'Delivered'"), 'journey includes Delivered stage');
check(js.includes('Products being requested'), 'modal shows products being requested');
check(js.includes('Eligibility'), 'modal shows eligibility');
check(js.includes('review-send-email-frame'), 'modal contains exact email iframe');
check(js.includes('/admin/review-automation/jobs/'), 'modal uses per-job review API');
check(js.includes('/preview'), 'modal uses exact preview endpoint');
check(js.includes('window.skipReviewRequestJob'), 'modal supports manual skip control');

check(css.includes('ELEV8_REVIEW_SEND_QUEUE_MODAL_V1'), 'modal CSS marker exists');
check(css.includes('.review-send-queue-modal'), 'modal shell CSS exists');
check(css.includes('.review-send-journey'), 'delivery journey CSS exists');
check(css.includes('.review-send-email-frame'), 'email preview CSS exists');

if (process.exitCode) process.exit(process.exitCode);
console.log('ELEV8 Review Send Queue modal smoke test passed.');
