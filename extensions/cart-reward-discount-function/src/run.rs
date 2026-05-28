use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use hmac::{Hmac, Mac};
use serde::Deserialize;
use sha2::Sha256;
use shopify_function::prelude::*;
use shopify_function::Result;

type HmacSha256 = Hmac<Sha256>;

#[derive(Deserialize, Default)]
struct FunctionConfig {
    #[serde(rename = "rewardTokenSecret")]
    reward_token_secret: String,
    message: Option<String>,
}

#[derive(Deserialize)]
struct ClaimPayload {
    v: u8,
    #[serde(rename = "type")]
    token_type: String,
    #[serde(rename = "shopDomain")]
    shop_domain: String,
    #[serde(rename = "campaignId")]
    campaign_id: String,
    #[serde(rename = "tierId")]
    tier_id: String,
    #[serde(rename = "rewardId")]
    reward_id: String,
    #[serde(rename = "rewardVariantId")]
    reward_variant_id: String,
    #[serde(rename = "cartToken")]
    cart_token: String,
    #[serde(rename = "cartSubtotal")]
    cart_subtotal: i64,
    #[serde(rename = "currencyCode")]
    currency_code: String,
    quantity: i64,
    #[serde(rename = "issuedAt")]
    issued_at: i64,
    #[serde(rename = "expiresAt")]
    expires_at: i64,
}

fn verify_claim_token(token: &str, secret: &str) -> Option<ClaimPayload> {
    if secret.is_empty() {
        return None;
    }

    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 2 {
        return None;
    }

    let body = parts[0];
    let signature = parts[1];

    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).ok()?;
    mac.update(body.as_bytes());
    let expected = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());

    if expected != signature {
        return None;
    }

    let decoded = URL_SAFE_NO_PAD.decode(body.as_bytes()).ok()?;
    serde_json::from_slice::<ClaimPayload>(&decoded).ok()
}

fn parse_config(value: Option<String>) -> FunctionConfig {
    value
        .and_then(|raw| serde_json::from_str::<FunctionConfig>(&raw).ok())
        .unwrap_or_default()
}

/**
 * This is the logic to port into the generated Shopify Function scaffold.
 *
 * Shopify generated output type names can shift between API versions, so keep the algorithm:
 * 1. Load config metafield
 * 2. Loop cart lines
 * 3. Read Nectar attributes
 * 4. Verify HMAC token
 * 5. Ensure token variant and quantity match line
 * 6. Return a 100% product discount target for each valid line
 */
#[shopify_function]
fn run(input: input::ResponseData) -> Result<output::FunctionRunResult> {
    let config = parse_config(input.discount.metafield.and_then(|metafield| metafield.value));
    let message = config.message.unwrap_or_else(|| "Nectar reward".to_string());

    let mut candidates: Vec<output::ProductDiscountCandidate> = vec![];

    for line in input.cart.lines {
        let nectar_flag = line.attribute.and_then(|attribute| attribute.value).unwrap_or_default();
        if nectar_flag != "true" {
            continue;
        }

        let token = line.claim_token.and_then(|attribute| attribute.value).unwrap_or_default();
        let Some(payload) = verify_claim_token(&token, &config.reward_token_secret) else {
            continue;
        };

        if payload.token_type != "nectar_cart_reward" {
            continue;
        }

        if payload.quantity < 1 || payload.quantity > line.quantity as i64 {
            continue;
        }

        let variant_id = match line.merchandise {
            input::InputCartLinesMerchandise::ProductVariant(variant) => variant.id,
            _ => continue,
        };

        if !payload.reward_variant_id.ends_with(&variant_id.to_string()) &&
           payload.reward_variant_id != variant_id.to_string() {
            continue;
        }

        candidates.push(output::ProductDiscountCandidate {
            message: Some(message.clone()),
            targets: vec![output::ProductDiscountCandidateTarget::CartLine(
                output::CartLineTarget {
                    id: line.id,
                    quantity: Some(payload.quantity as i64),
                }
            )],
            value: output::ProductDiscountCandidateValue::Percentage(
                output::Percentage {
                    value: rust_decimal::Decimal::new(100, 0),
                }
            ),
            associated_discount_code: None,
        });
    }

    if candidates.is_empty() {
        return Ok(output::FunctionRunResult { operations: vec![] });
    }

    Ok(output::FunctionRunResult {
        operations: vec![output::Operation::ProductDiscountsAdd(
            output::ProductDiscountsAddOperation {
                selection_strategy: output::ProductDiscountSelectionStrategy::All,
                candidates,
            }
        )],
    })
}
