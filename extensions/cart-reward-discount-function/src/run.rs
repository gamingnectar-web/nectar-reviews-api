use shopify_function::prelude::*;
use shopify_function::Result;

#[shopify_function]
fn run(_input: serde_json::Value) -> Result<serde_json::Value> {
    // Starter scaffold: keep checkout-safe reward enforcement here.
    // In production, parse cart lines with _nectar_reward=true, verify the signed
    // _nectar_claim_token against the function metafield config, then return a
    // 100% product discount only for valid reward cart lines.
    Ok(serde_json::json!({
        "discounts": [],
        "discountApplicationStrategy": "FIRST"
    }))
}
