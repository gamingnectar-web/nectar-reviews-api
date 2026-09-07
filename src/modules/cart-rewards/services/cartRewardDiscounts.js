const crypto = require('crypto');
function gid(type,value){const raw=String(value||'');if(!raw)return'';if(raw.startsWith('gid://shopify/'))return raw;const n=(raw.match(/\d+/g)||[]).pop();return n?`gid://shopify/${type}/${n}`:''}
function makeCode(){return `ELEV8-${crypto.randomBytes(8).toString('hex').toUpperCase()}`}
async function createRewardDiscount({adminGraphql,reward,claimId}){
  if(typeof adminGraphql!=='function')throw new Error('Shopify Admin discount access is unavailable.');
  const productId=gid('Product',reward.productId),variantId=gid('ProductVariant',reward.variantId);
  if(!productId&&!variantId)throw new Error('Reward product cannot be targeted by Shopify discount.');
  const type=reward.discountType||'free';
  if(type==='fixed_price')throw new Error('Fixed-price rewards are not enabled yet.');
  const raw=Number(reward.discountValue??(type==='free'?100:0));
  const percentage=type==='free'?1:Math.max(0,Math.min(1,raw/100));
  if(!percentage)throw new Error('Reward discount percentage must be greater than zero.');
  const code=makeCode(),startsAt=new Date(Date.now()-60000).toISOString(),endsAt=new Date(Date.now()+20*60000).toISOString();
  const query=`mutation Elev8RewardDiscount($input: DiscountCodeBasicInput!){discountCodeBasicCreate(basicCodeDiscount:$input){codeDiscountNode{id} userErrors{field code message}}}`;
  const items=variantId?{productVariants:{productVariantsToAdd:[variantId]}}:{products:{productsToAdd:[productId]}};
  const data=await adminGraphql(query,{input:{title:`ELEV8 cart reward ${String(claimId||'').slice(-8)}`,code,startsAt,endsAt,context:{all:true},customerGets:{value:{percentage},items},combinesWith:{orderDiscounts:true,productDiscounts:true,shippingDiscounts:true},usageLimit:1}});
  const payload=data?.discountCodeBasicCreate,errors=Array.isArray(payload?.userErrors)?payload.userErrors:[];
  if(errors.length)throw new Error(errors.map(e=>e.message).join('; '));
  return{code,discountNodeId:payload?.codeDiscountNode?.id||'',endsAt,percentage};
}
module.exports={createRewardDiscount};
