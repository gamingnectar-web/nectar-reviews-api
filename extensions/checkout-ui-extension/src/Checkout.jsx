import {
  reactExtension,
  Banner,
  BlockStack,
  Button,
  Image,
  InlineLayout,
  Text,
  useApi,
  useApplyCartLinesChange,
  useCartLines,
  useSettings
} from "@shopify/ui-extensions-react/checkout";
import { useEffect, useMemo, useState } from "react";

export default reactExtension("purchase.checkout.cart-line-list.render-after", () => <NectarCheckoutRewards />);

function lineToAjaxShape(line) {
  const attributes = Object.fromEntries((line.attributes || []).map((attribute) => [attribute.key, attribute.value]));
  return {
    id: line.id,
    variantId: line.merchandise?.id,
    quantity: line.quantity,
    properties: attributes,
    merchandise: line.merchandise
  };
}

function isRewardLine(line) {
  return (line.attributes || []).some((attribute) => attribute.key === "_nectar_reward" && attribute.value === "true");
}

function variantMatches(lineVariantId, rewardVariantId) {
  const lineId = String(lineVariantId || "");
  const rewardId = String(rewardVariantId || "");
  return rewardId === lineId || rewardId.endsWith(`/${lineId}`) || lineId.endsWith(`/${rewardId}`);
}

function findClaimedReward(lines, reward) {
  return lines.find((line) => {
    if (!isRewardLine(line)) return false;
    return variantMatches(line.merchandise?.id, reward.variantId) || variantMatches(line.merchandise?.id, reward.numericVariantId);
  });
}

function NectarCheckoutRewards() {
  const { shop, instructions } = useApi();
  const settings = useSettings();
  const lines = useCartLines();
  const applyCartLinesChange = useApplyCartLinesChange();
  const [config, setConfig] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [error, setError] = useState("");
  const [busyRewardId, setBusyRewardId] = useState("");

  const appUrl = String(settings.app_url || settings.appUrl || "").replace(/\/$/, "");
  const shopDomain = settings.shop_domain || shop?.myshopifyDomain || "";
  const canAddLines = instructions?.lines?.canAddCartLine !== false;

  const cartPayload = useMemo(() => ({
    token: "checkout",
    lines: lines.map(lineToAjaxShape),
    currency: shop?.currencyCode
  }), [lines, shop?.currencyCode]);

  useEffect(() => {
    let mounted = true;
    async function loadRewards() {
      if (!appUrl || !shopDomain) return;
      const configResponse = await fetch(`${appUrl}/api/cart-rewards/storefront/config?shop=${shopDomain}`);
      const nextConfig = await configResponse.json();
      if (!nextConfig.enabled) return;

      const evaluationResponse = await fetch(`${appUrl}/api/cart-rewards/storefront/evaluate?shop=${shopDomain}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ cart: cartPayload, market: { currencyCode: shop?.currencyCode } })
      });
      const nextEvaluation = await evaluationResponse.json();

      if (mounted) {
        setConfig(nextConfig);
        setEvaluation(nextEvaluation);
      }
    }

    loadRewards().catch((loadError) => {
      console.error("[Nectar checkout rewards]", loadError);
      if (mounted) setError("Rewards could not be loaded in checkout.");
    });

    return () => { mounted = false; };
  }, [appUrl, shopDomain, cartPayload, shop?.currencyCode]);

  const campaign = (evaluation?.campaigns || []).find((item) => item.status === "eligible");
  if (!appUrl || !shopDomain || !config?.enabled || !campaign) return null;

  const rewards = (campaign.tiers || [])
    .filter((tier) => tier.status === "unlocked" && tier.claimable)
    .flatMap((tier) => (tier.rewards || []).map((reward) => ({ tier, reward })));

  if (!rewards.length) return null;

  async function addReward(tier, reward) {
    if (!canAddLines) {
      setError("Rewards can be selected from the cart before checkout for this payment flow.");
      return;
    }

    setBusyRewardId(reward.id);
    setError("");

    try {
      const claimResponse = await fetch(`${appUrl}/api/cart-rewards/storefront/claim?shop=${shopDomain}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          cart: cartPayload,
          tierId: tier.id,
          rewardId: reward.id,
          rewardVariantId: reward.variantId,
          market: { currencyCode: shop?.currencyCode }
        })
      });
      const claim = await claimResponse.json();
      if (!claimResponse.ok) throw new Error(claim.error || "Claim failed");

      const result = await applyCartLinesChange({
        type: "addCartLine",
        merchandiseId: claim.cartLine.merchandiseId,
        quantity: claim.cartLine.quantity,
        attributes: claim.cartLine.attributes
      });

      if (result.type === "error") throw new Error(result.message || "Cart line could not be added");
    } catch (addError) {
      console.error("[Nectar checkout rewards] add failed", addError);
      setError("This reward could not be added in checkout. Please return to the cart and try again.");
    } finally {
      setBusyRewardId("");
    }
  }

  return (
    <BlockStack spacing="base">
      <Text size="medium" emphasis="bold">{campaign.publicTitle || "Your rewards"}</Text>
      {error ? <Banner status="critical">{error}</Banner> : null}
      {rewards.map(({ tier, reward }) => {
        const claimed = Boolean(findClaimedReward(lines, reward));
        return (
          <InlineLayout key={`${tier.id}-${reward.id}`} columns={[64, "fill", "auto"]} spacing="base" blockAlignment="center">
            {reward.imageUrl ? <Image source={reward.imageUrl} accessibilityDescription={reward.title || "Reward"} /> : <BlockStack />}
            <BlockStack spacing="extraTight">
              <Text emphasis="bold">{reward.title || tier.title}</Text>
              <Text appearance="subdued">{reward.continuation ? "Available as back-order" : "Unlocked"}</Text>
            </BlockStack>
            <Button
              disabled={claimed || reward.disabled || busyRewardId === reward.id}
              loading={busyRewardId === reward.id}
              onPress={() => addReward(tier, reward)}
            >
              {claimed ? "Added" : "Add reward"}
            </Button>
          </InlineLayout>
        );
      })}
    </BlockStack>
  );
}
