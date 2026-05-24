const express = require("express");
const controller = require("../controllers/cartRewards.controller");
const { requireShop } = require("../middleware/shopAuth");

const router = express.Router();

function asyncRoute(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

router.use(requireShop);

/**
 * Merchant/admin routes
 */
router.get("/campaigns", asyncRoute(controller.listCampaigns));
router.post("/campaigns", asyncRoute(controller.createCampaign));
router.get("/campaigns/:id", asyncRoute(controller.getCampaign));
router.put("/campaigns/:id", asyncRoute(controller.updateCampaign));
router.delete("/campaigns/:id", asyncRoute(controller.archiveCampaign));
router.post("/campaigns/:id/pause", asyncRoute(controller.pauseCampaign));
router.post("/campaigns/:id/clone-for-future", asyncRoute(controller.cloneForFuture));

router.post("/tiers", asyncRoute(controller.upsertTier));
router.put("/tiers/:tierId", asyncRoute(controller.upsertTier));
router.delete("/tiers/:tierId", asyncRoute(controller.deleteTier));

router.post("/designs", asyncRoute(controller.upsertDesign));
router.put("/designs/:designId", asyncRoute(controller.upsertDesign));

/**
 * Planning/calendar routes
 */
router.get("/planner/calendar", asyncRoute(controller.calendar));
router.get("/planner/month", asyncRoute(controller.monthlyCalendar));
router.post("/campaigns/:id/schedule", asyncRoute(controller.scheduleCampaign));
router.post("/planner/conflicts", asyncRoute(controller.previewScheduleConflicts));
router.post("/planner/swap", asyncRoute(controller.swapCampaigns));

/**
 * Templates/listing routes
 */
router.get("/templates", asyncRoute(controller.listTemplates));
router.post("/templates", asyncRoute(controller.createTemplate));
router.post("/templates/create-campaign", asyncRoute(controller.createFromTemplate));

/**
 * Product picker and analytics
 */
router.get("/products/search", asyncRoute(controller.productSearch));
router.get("/analytics", asyncRoute(controller.analytics));

/**
 * Storefront routes
 */
router.get("/storefront/config", asyncRoute(controller.storefrontConfig));
router.post("/storefront/evaluate", asyncRoute(controller.evaluateStorefront));
router.post("/storefront/claim", asyncRoute(controller.claimReward));
router.post("/storefront/confirm", asyncRoute(controller.confirmClaim));
router.post("/storefront/remove", asyncRoute(controller.removeClaim));

module.exports = router;
