const crypto = require("crypto");

const DEFAULT_TTL_SECONDS = 60 * 30;

function getSecret() {
  const secret = process.env.NECTAR_REWARD_TOKEN_SECRET;
  if (!secret) {
    throw new Error("NECTAR_REWARD_TOKEN_SECRET is required for reward claim tokens.");
  }
  return secret;
}

function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signPayload(payload) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", getSecret())
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { valid: false, reason: "missing_or_malformed" };
  }

  const [body, signature] = token.split(".");
  const expectedSignature = crypto
    .createHmac("sha256", getSecret())
    .update(body)
    .digest("base64url");

  const provided = Buffer.from(signature || "");
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { valid: false, reason: "bad_signature" };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(body));
  } catch (_error) {
    return { valid: false, reason: "bad_payload" };
  }

  if (payload.expiresAt && Date.now() > Number(payload.expiresAt)) {
    return { valid: false, reason: "expired", payload };
  }

  return { valid: true, payload };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function createClaimToken({
  shopDomain,
  campaignId,
  tierId,
  rewardId,
  rewardVariantId,
  cartToken,
  cartSubtotal,
  currencyCode,
  quantity = 1,
  ttlSeconds = DEFAULT_TTL_SECONDS
}) {
  const payload = {
    v: 2,
    type: "nectar_cart_reward",
    shopDomain,
    campaignId: String(campaignId),
    tierId: String(tierId),
    rewardId: String(rewardId || ""),
    rewardVariantId: String(rewardVariantId),
    cartToken: String(cartToken || ""),
    cartSubtotal: Number(cartSubtotal || 0),
    currencyCode: currencyCode || "GBP",
    quantity: Number(quantity || 1),
    issuedAt: Date.now(),
    expiresAt: Date.now() + ttlSeconds * 1000
  };

  return {
    token: signPayload(payload),
    payload
  };
}

module.exports = {
  createClaimToken,
  verifyToken,
  hashToken,
  signPayload
};
