const {
  activateDueCampaigns,
  expireDueCampaigns
} = require("../services/cartRewardPlanner");
const { expireOldClaims } = require("../services/cartRewardClaims");

let scheduledTask = null;
let schedulerMode = null;

const FIVE_MINUTES_MS = 5 * 60 * 1000;

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

async function runLoggedSchedulerTick() {
  try {
    const result = await runCartRewardSchedulerTick();
    if (result.activatedCount || result.expiredCount || result.expiredClaimsModified) {
      console.log("[cart-rewards:scheduler]", result);
    }
  } catch (error) {
    console.error("[cart-rewards:scheduler] failed", error);
  }
}

function createNodeCronTask() {
  try {
    // Optional dependency support: if node-cron is installed, use cron semantics.
    // If it is not installed, Render should still boot and use the native timer below.
    // eslint-disable-next-line global-require
    const cron = require("node-cron");
    schedulerMode = "node-cron";
    return cron.schedule("*/5 * * * *", runLoggedSchedulerTick);
  } catch (error) {
    if (error && error.code !== "MODULE_NOT_FOUND") throw error;
    return null;
  }
}

function createNativeIntervalTask() {
  schedulerMode = "native-interval";
  const interval = setInterval(runLoggedSchedulerTick, FIVE_MINUTES_MS);
  if (typeof interval.unref === "function") interval.unref();

  // Run once shortly after boot so due campaigns/claims are not delayed until the first interval.
  const firstRun = setTimeout(runLoggedSchedulerTick, 30 * 1000);
  if (typeof firstRun.unref === "function") firstRun.unref();

  return {
    stop() {
      clearInterval(interval);
      clearTimeout(firstRun);
    }
  };
}

function startCartRewardScheduler() {
  if (scheduledTask) return scheduledTask;

  scheduledTask = createNodeCronTask() || createNativeIntervalTask();
  console.log(`[cart-rewards:scheduler] started using ${schedulerMode}`);
  return scheduledTask;
}

function stopCartRewardScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    schedulerMode = null;
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
