(function () {
  const SELECTOR = ".nectar-cart-rewards";
  const REWARD_FLAG = "_nectar_reward";

  if (window.NectarCartRewards?.init) {
    window.NectarCartRewards.init();
    return;
  }

  function rootRoute(path) {
    const root = window.Shopify && window.Shopify.routes && window.Shopify.routes.root
      ? window.Shopify.routes.root
      : "/";
    return `${root}${path.replace(/^\//, "")}`;
  }

  async function getCart() {
    const response = await fetch(rootRoute("/cart.js"), {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Cart request failed: ${response.status}`);
    return response.json();
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed: ${response.status}`);
    }

    return response.json();
  }

  async function changeCartLine(lineKeyOrNumber, quantity) {
    const response = await fetch(rootRoute("/cart/change.js"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ id: lineKeyOrNumber, quantity })
    });
    if (!response.ok) throw new Error(`Cart change failed: ${response.status}`);
    return response.json();
  }

  function getAppUrl(container) {
    return (
      container.dataset.appUrl ||
      window.NECTAR_CART_REWARDS_APP_URL ||
      ""
    ).replace(/\/$/, "");
  }

  function getShop(container) {
    return container.dataset.shop || (window.Shopify && window.Shopify.shop) || "";
  }

  function getRewardLines(cart) {
    return (cart.items || []).filter((item) => item.properties && item.properties[REWARD_FLAG] === "true");
  }

  function variantMatches(lineVariantId, rewardVariantId) {
    const lineId = String(lineVariantId || "");
    const rewardId = String(rewardVariantId || "");
    return rewardId === lineId || rewardId.endsWith(`/${lineId}`) || lineId.endsWith(`/${rewardId}`);
  }

  function findMatchingReward(line, evaluation) {
    const props = line.properties || {};
    const campaign = (evaluation.campaigns || []).find(
      (item) => String(item.campaignId) === String(props._nectar_campaign_id) && item.status === "eligible"
    );
    if (!campaign) return null;

    const tier = (campaign.tiers || []).find(
      (item) => String(item.id) === String(props._nectar_tier_id)
    );
    if (!tier || tier.status !== "unlocked" || !tier.claimable) return null;

    const reward = (tier.rewards || []).find((item) => {
      return String(item.id) === String(props._nectar_reward_id) ||
        variantMatches(line.variant_id, item.variantId) ||
        variantMatches(line.variant_id, item.numericVariantId);
    });

    if (!reward || reward.disabled || reward.invalidQuantity) return null;
    return { campaign, tier, reward };
  }

  async function reportRemoval(container, line, reason) {
    const appUrl = getAppUrl(container);
    if (!appUrl || !line.properties?._nectar_claim_token) return;

    await postJson(`${appUrl}/api/cart-rewards/storefront/remove?shop=${getShop(container)}`, {
      claimToken: line.properties._nectar_claim_token,
      lineKey: line.key,
      reason
    }).catch(() => {});
  }

  async function autoFixRewardLines(container, cart, evaluation) {
    let changes = 0;
    for (const line of getRewardLines(cart)) {
      const match = findMatchingReward(line, evaluation);

      if (!match) {
        await changeCartLine(line.key, 0);
        await reportRemoval(container, line, "cart_no_longer_qualifies_or_reward_unavailable");
        changes += 1;
        continue;
      }

      const allowedQuantity = Number(match.reward.quantity || 1);
      if (Number(line.quantity || 0) > allowedQuantity) {
        await changeCartLine(line.key, allowedQuantity);
        changes += 1;
      }
    }

    return changes;
  }

  function applyDesign(container, design) {
    if (!design) return;

    const styles = {
      "--ncr-primary": design.primaryColor,
      "--ncr-accent": design.accentColor,
      "--ncr-bg": design.backgroundColor,
      "--ncr-card-bg": design.cardBackgroundColor,
      "--ncr-border": design.borderColor,
      "--ncr-text": design.textColor,
      "--ncr-muted": design.mutedTextColor,
      "--ncr-radius": design.borderRadius ? `${design.borderRadius}px` : null
    };

    Object.entries(styles).forEach(([property, value]) => {
      if (value) container.style.setProperty(property, value);
    });

    container.dataset.layout = design.layout || container.dataset.layout || "premium_cards";
    container.dataset.density = design.density || container.dataset.density || "comfortable";
    container.dataset.progressStyle = design.progressStyle || "bar";
    container.dataset.drawerBehaviour = design.drawerBehaviour || design.drawer?.behaviour || "embedded";
    container.dataset.imageShape = design.imageShape || "rounded";
  }

  function tierProgress(campaign) {
    const tiers = campaign.tiers || [];
    if (!tiers.length) return 0;
    const max = Math.max(...tiers.map((tier) => Number(tier.thresholdValue || 0)));
    if (!max) return 0;
    return Math.min(100, Math.round((Number(campaign.metric || 0) / max) * 100));
  }

  function createElement(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (typeof text === "string") el.textContent = text;
    return el;
  }

  function renderRewardCard({ container, tier, reward, design }) {
    const status = reward.claimed ? "claimed" : tier.status;
    const locked = tier.status !== "unlocked" || !tier.claimable;
    const buttonText = reward.claimed
      ? (design.claimedText || "Added")
      : locked
        ? (design.lockedText || "Locked")
        : reward.soldOut && reward.continuation
          ? (design.addButtonText || "Add reward")
          : (design.addButtonText || "Add reward");

    const card = createElement("article", `nectar-cart-reward-card nectar-cart-reward-card--${status}`);
    if (reward.soldOut) card.classList.add("nectar-cart-reward-card--sold-out");
    if (design.imageShape) card.dataset.imageShape = design.imageShape;

    const image = createElement("div", "nectar-cart-reward-card__image");
    if (reward.imageUrl && design.showRewardImages !== false) {
      const img = document.createElement("img");
      img.src = reward.imageUrl;
      img.alt = reward.title || "";
      img.loading = "lazy";
      image.appendChild(img);
    }

    const body = createElement("div", "nectar-cart-reward-card__body");
    body.appendChild(createElement("p", "nectar-cart-reward-card__title", reward.title || tier.title || "Reward"));

    const text = locked
      ? `Spend ${tier.amountRemainingFormatted} more`
      : reward.soldOut && reward.continuation
        ? "Available as back-order"
        : tier.unlockedText || design.unlockedText || "Unlocked";
    body.appendChild(createElement("p", "nectar-cart-reward-card__text", text));

    const button = createElement("button", "nectar-cart-rewards__button", buttonText);
    button.type = "button";
    button.disabled = locked || reward.claimed || reward.disabled;
    button.addEventListener("click", () => claimReward(container, tier, reward, button));

    card.appendChild(image);
    card.appendChild(body);
    card.appendChild(button);

    return card;
  }

  function render(container, config, evaluation) {
    const design = config.design || {};
    applyDesign(container, design);

    const campaign = (evaluation.campaigns || []).find((item) => item.status === "eligible");
    if (!campaign) {
      container.replaceChildren();
      container.hidden = true;
      return;
    }

    container.hidden = false;
    container.dataset.ready = "true";
    container.replaceChildren();

    const header = createElement("div", "nectar-cart-rewards__header");
    const headerText = document.createElement("div");
    headerText.appendChild(createElement("h3", "nectar-cart-rewards__title", campaign.publicTitle || design.widgetTitle || "Your rewards"));

    const nextTier = campaign.nextTier;
    const subtitle = nextTier
      ? (design.progressText || "Spend {{amount_remaining}} more to unlock {{reward_title}}")
          .replace("{{amount_remaining}}", nextTier.amountRemainingFormatted)
          .replace("{{reward_title}}", nextTier.title)
      : (design.widgetSubtitle || "All available rewards unlocked.");
    headerText.appendChild(createElement("p", "nectar-cart-rewards__subtitle", subtitle));
    header.appendChild(headerText);
    container.appendChild(header);

    if (design.showProgressBar !== false) {
      const progressStyle = design.progressStyle || "bar";
      const progress = createElement("div", `nectar-cart-rewards__progress nectar-cart-rewards__progress--${progressStyle}`);
      progress.setAttribute("aria-hidden", "true");
      const bar = document.createElement("span");
      bar.style.width = `${tierProgress(campaign)}%`;
      progress.appendChild(bar);
      container.appendChild(progress);
    }

    const tierWrap = createElement("div", `nectar-cart-rewards__tiers nectar-cart-rewards__tiers--${design.layout || "premium_cards"}`);
    (campaign.tiers || [])
      .filter((tier) => design.showLockedRewards !== false || tier.status === "unlocked")
      .forEach((tier) => {
        (tier.rewards || []).forEach((reward) => {
          tierWrap.appendChild(renderRewardCard({ container, tier, reward, design }));
        });
      });
    container.appendChild(tierWrap);
  }

  async function evaluate(container) {
    const appUrl = getAppUrl(container);
    const shop = getShop(container);
    if (!appUrl || !shop) {
      container.hidden = true;
      return;
    }

    const [config, cart] = await Promise.all([
      fetch(`${appUrl}/api/cart-rewards/storefront/config?shop=${shop}`).then((r) => r.json()),
      getCart()
    ]);

    if (!config.enabled) {
      container.hidden = true;
      return;
    }

    const evaluation = await postJson(`${appUrl}/api/cart-rewards/storefront/evaluate?shop=${shop}`, {
      cart,
      market: {
        currencyCode: cart.currency || window.Shopify?.currency?.active
      }
    });

    const changed = await autoFixRewardLines(container, cart, evaluation);
    if (changed) return evaluate(container);

    render(container, config, evaluation);
  }

  async function claimReward(container, tier, reward, button) {
    const appUrl = getAppUrl(container);
    const shop = getShop(container);
    if (!appUrl || !shop) return;

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Adding...";

    try {
      const cart = await getCart();
      const claim = await postJson(`${appUrl}/api/cart-rewards/storefront/claim?shop=${shop}`, {
        cart,
        tierId: tier.id,
        rewardId: reward.id,
        rewardVariantId: reward.variantId,
        market: {
          currencyCode: cart.currency || window.Shopify?.currency?.active
        }
      });

      await postJson(rootRoute("/cart/add.js"), {
        items: [
          {
            id: claim.cartLine.id,
            quantity: claim.cartLine.quantity,
            properties: claim.cartLine.properties
          }
        ]
      });

      const refreshedCart = await getCart();
      const addedLine = (refreshedCart.items || []).find((item) => {
        return item.properties && item.properties._nectar_claim_token === claim.token;
      });

      await postJson(`${appUrl}/api/cart-rewards/storefront/confirm?shop=${shop}`, {
        claimToken: claim.token,
        lineKey: addedLine?.key
      }).catch(() => {});

      document.dispatchEvent(new CustomEvent("nectar:cart-rewards:claimed", {
        detail: { tier, reward }
      }));

      document.dispatchEvent(new CustomEvent("cart:refresh"));
      document.dispatchEvent(new CustomEvent("cart:updated"));
      await evaluate(container);
    } catch (error) {
      console.error("[Nectar Cart Rewards] claim failed", error);
      button.disabled = false;
      button.textContent = originalText;
      const errorBox = createElement("div", "nectar-cart-rewards__error", "This reward could not be added. Please refresh the cart and try again.");
      container.appendChild(errorBox);
    }
  }

  function init() {
    document.querySelectorAll(SELECTOR).forEach((container) => {
      if (container.dataset.nectarInitialised === "true") return;
      container.dataset.nectarInitialised = "true";
      container.dataset.ready = "false";

      evaluate(container).catch((error) => {
        console.error("[Nectar Cart Rewards]", error);
        container.replaceChildren(createElement("div", "nectar-cart-rewards__error", "Rewards could not be loaded."));
      });
    });
  }

  window.NectarCartRewards = { init, evaluate };

  document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("cart:updated", () => document.querySelectorAll(SELECTOR).forEach(evaluate));
  document.addEventListener("cart:refresh", () => document.querySelectorAll(SELECTOR).forEach(evaluate));
  document.addEventListener("shopify:section:load", init);
})();
