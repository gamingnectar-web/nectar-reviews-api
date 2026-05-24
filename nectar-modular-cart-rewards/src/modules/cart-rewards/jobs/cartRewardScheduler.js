const cron = require("node-cron");
const {
  activateDueCampaigns,
  expireDueCampaigns
} = require("../services/cartRewardPlanner");
const { expireOldClaims } = require("../services/cartRewardClaims");

let scheduledTask = null;

async function runCartRewardSchedulerTick() {
  const now = new Date();

  const [activated, expired, expiredClaims] = await Promise.all([
    activateDueCampaigns(now),
    expireDueCampaigns(now),
    expireOldClaims(now)
  ]);

  return {
    now,
    activatedCount: activated.length,
    expiredCount: expired.length,
    expiredClaimsModified: expiredClaims.modifiedCount || 0
  };
}

function startCartRewardScheduler() {
  if (scheduledTask) return scheduledTask;

  scheduledTask = cron.schedule("*/5 * * * *", async () => {
    try {
      const result = await runCartRewardSchedulerTick();
      if (result.activatedCount || result.expiredCount || result.expiredClaimsModified) {
        console.log("[cart-rewards:scheduler]", result);
      }
    } catch (error) {
      console.error("[cart-rewards:scheduler] failed", error);
    }
  });

  return scheduledTask;
}

function stopCartRewardScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

if (require.main === module) {
  runCartRewardSchedulerTick()
    .then((result) => {
      console.log(result);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  startCartRewardScheduler,
  stopCartRewardScheduler,
  runCartRewardSchedulerTick
};
