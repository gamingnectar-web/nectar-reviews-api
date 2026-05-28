const CartRewardTemplate = require("../models/CartRewardTemplate");

const SYSTEM_TEMPLATES = [
  {
    name: "AOV Booster: 3 tier stack",
    category: "aov_boost",
    description: "Classic spend-more-get-more campaign with three stackable rewards.",
    tags: ["aov", "stacked", "free-gift"],
    campaignSnapshot: {
      name: "AOV Booster",
      publicTitle: "Unlock free gifts",
      triggerType: "subtotal",
      rewardMode: "stack_all",
      status: "draft",
      priority: 100,
      rules: {
        allowWithDiscountCodes: true
      },
      inventory: {
        soldOutBehaviour: "hide",
        hideEmptyTiers: true,
        hideEmptyCampaigns: true,
        preferBackupRewards: true
      }
    },
    tierSnapshots: [
      {
        title: "Starter gift",
        thresholdType: "subtotal",
        thresholdValue: 2500,
        currencyCode: "GBP",
        sortOrder: 1,
        rewards: []
      },
      {
        title: "Mid-tier gift",
        thresholdType: "subtotal",
        thresholdValue: 5000,
        currencyCode: "GBP",
        sortOrder: 2,
        rewards: []
      },
      {
        title: "Premium gift",
        thresholdType: "subtotal",
        thresholdValue: 7500,
        currencyCode: "GBP",
        sortOrder: 3,
        rewards: []
      }
    ],
    designSnapshot: {
      widgetTitle: "Your rewards",
      widgetSubtitle: "Spend more to unlock free gifts.",
      layout: "cards"
    }
  },
  {
    name: "Choose one unlocked gift",
    category: "launch",
    description: "Let shoppers choose one reward from the unlocked milestone options.",
    tags: ["choice", "launch", "free-gift"],
    campaignSnapshot: {
      name: "Choose your free gift",
      publicTitle: "Choose your free gift",
      triggerType: "subtotal",
      rewardMode: "choose_one",
      status: "draft",
      priority: 100,
      inventory: {
        soldOutBehaviour: "hide",
        hideEmptyTiers: true,
        hideEmptyCampaigns: true,
        preferBackupRewards: true
      }
    },
    tierSnapshots: [
      {
        title: "Free gift unlocked",
        thresholdType: "subtotal",
        thresholdValue: 5000,
        currencyCode: "GBP",
        sortOrder: 1,
        rewards: []
      }
    ],
    designSnapshot: {
      widgetTitle: "Choose your gift",
      widgetSubtitle: "Pick your favourite reward.",
      layout: "cards"
    }
  },
  {
    name: "Seasonal promotion swap",
    category: "seasonal",
    description: "A planned-promotion template designed for calendar swaps and short campaign windows.",
    tags: ["seasonal", "scheduled", "swap"],
    campaignSnapshot: {
      name: "Seasonal cart rewards",
      publicTitle: "Limited-time rewards",
      triggerType: "subtotal",
      rewardMode: "stack_all",
      status: "draft",
      priority: 80,
      autoActivate: true,
      autoExpire: true,
      inventory: {
        soldOutBehaviour: "hide",
        hideEmptyTiers: true,
        hideEmptyCampaigns: true,
        preferBackupRewards: true
      }
    },
    tierSnapshots: [
      {
        title: "Seasonal gift",
        thresholdType: "subtotal",
        thresholdValue: 6000,
        currencyCode: "GBP",
        sortOrder: 1,
        rewards: []
      }
    ],
    designSnapshot: {
      widgetTitle: "Limited-time rewards",
      widgetSubtitle: "Seasonal gifts are available while stock lasts.",
      layout: "cards"
    }
  }
];

async function seedDefaultCartRewardTemplates(shopDomain = "system") {
  for (const template of SYSTEM_TEMPLATES) {
    await CartRewardTemplate.updateOne(
      {
        shopDomain,
        name: template.name,
        isSystemTemplate: true
      },
      {
        $setOnInsert: {
          ...template,
          shopDomain,
          isSystemTemplate: true
        }
      },
      { upsert: true }
    );
  }
}

module.exports = {
  SYSTEM_TEMPLATES,
  seedDefaultCartRewardTemplates
};
