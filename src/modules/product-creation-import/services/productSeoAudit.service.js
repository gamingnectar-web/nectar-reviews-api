const { cleanText } = require('../utils/safe');
const { listShopifyProductsForMatching } = require('./shopifyProduct.service');

function words(value=''){ return cleanText(value,1000).toLowerCase().split(/\s+/).filter(Boolean); }
function norm(value=''){ return cleanText(value,500).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
function slugOkay(handle=''){ return Boolean(handle) && handle.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle); }
function titleLooksUseful(title=''){ const n=cleanText(title,220); return n.length >= 4 && n.length <= 90; }

function scoreProduct(product={}, duplicates={}){
  const title=cleanText(product.title||'',220);
  const seoTitle=cleanText(product.seoTitle||'',220);
  const meta=cleanText(product.seoDescription||'',500);
  const handle=cleanText(product.handle||'',180);
  const vendor=cleanText(product.vendor||'',120);
  const issues=[];
  const checks=[];
  const add=(name,points,ok,note='')=>{ checks.push({name,points:ok?points:0,max:points,ok,note}); if(!ok&&note)issues.push(note); };

  add('Product title',15,titleLooksUseful(title),'Product title is missing, unusually short or unusually long.');
  add('SEO title present',10,Boolean(seoTitle),'SEO title is missing.');
  add('SEO title length',10,seoTitle.length>=30&&seoTitle.length<=65,'SEO title is outside the working range of roughly 30–65 characters.');
  add('SEO title relevance',10,Boolean(seoTitle)&&norm(seoTitle).includes(norm(title).split(' ').slice(0,2).join(' ')),'SEO title does not clearly reflect the product title.');
  add('Meta description present',10,Boolean(meta),'Meta description is missing.');
  add('Meta description length',10,meta.length>=110&&meta.length<=165,'Meta description is outside the working range of roughly 110–165 characters.');
  add('Meta description specific',10,Boolean(meta)&&(!vendor||norm(meta).includes(norm(vendor)))&&words(meta).length>=12,'Meta description looks generic or too thin.');
  add('URL handle',10,slugOkay(handle),'URL handle is missing, too long or untidy.');
  add('URL relevance',5,Boolean(handle)&&norm(handle).split(' ').some(token=>norm(title).includes(token)),'URL handle does not appear closely related to the product title.');
  add('Unique SEO title',5,!seoTitle||!duplicates.seoTitle,'SEO title duplicates another product.');
  add('Unique meta description',5,!meta||!duplicates.meta,'Meta description duplicates another product.');
  add('Unique URL',5,!handle||!duplicates.handle,'URL handle duplicates another product.');

  return { score:checks.reduce((sum,c)=>sum+c.points,0), checks, issues };
}

async function auditShopifySeo({shopDomain,maxProducts=2500}){
  const products=await listShopifyProductsForMatching({shopDomain,maxProducts});
  const seoTitleCounts=new Map(), metaCounts=new Map(), handleCounts=new Map();
  for(const p of products){
    const st=norm(p.seoTitle||''), md=norm(p.seoDescription||''), h=norm(p.handle||'');
    if(st)seoTitleCounts.set(st,(seoTitleCounts.get(st)||0)+1);
    if(md)metaCounts.set(md,(metaCounts.get(md)||0)+1);
    if(h)handleCounts.set(h,(handleCounts.get(h)||0)+1);
  }

  const rows=products.map(product=>{
    const audit=scoreProduct(product,{
      seoTitle:(seoTitleCounts.get(norm(product.seoTitle||''))||0)>1,
      meta:(metaCounts.get(norm(product.seoDescription||''))||0)>1,
      handle:(handleCounts.get(norm(product.handle||''))||0)>1,
    });
    return { id:product.id, legacyResourceId:product.legacyResourceId||'', title:product.title||'', vendor:product.vendor||'', handle:product.handle||'', productType:product.productType||'', status:product.status||'', image:product.image||'', seoTitle:product.seoTitle||'', seoDescription:product.seoDescription||'', ...audit };
  }).sort((a,b)=>a.score-b.score||a.title.localeCompare(b.title));

  const divisor=rows.length||1;
  return {
    summary:{
      products:rows.length,
      averageScore:Math.round(rows.reduce((sum,row)=>sum+row.score,0)/divisor),
      needsWork:rows.filter(row=>row.score<80).length,
      weakMeta:rows.filter(row=>row.issues.some(issue=>/meta description/i.test(issue))).length,
      titleIssues:rows.filter(row=>row.issues.some(issue=>/title/i.test(issue))).length,
      urlIssues:rows.filter(row=>row.issues.some(issue=>/URL/i.test(issue))).length,
    },
    products:rows,
  };
}

async function suggestSeoWithAi({product={}}){
  const apiKey=process.env.OPENAI_API_KEY||'';
  if(!apiKey){ const error=new Error('OPENAI_API_KEY is not configured.'); error.status=412; throw error; }
  const model=process.env.OPENAI_PRODUCT_IMPORT_MODEL||process.env.OPENAI_MODULE_MODEL||'gpt-4.1-mini';
  const prompt=`Improve SEO copy for ONE ecommerce product. Return JSON only with keys seoTitle, seoDescription, handle.\n\nRules:\n- Preserve the actual product identity and facts.\n- Do not invent claims, ingredients, benefits or stock status.\n- SEO title should normally be around 30-65 characters where practical.\n- Meta description should normally be around 110-165 characters, specific to this product and natural.\n- Handle must be lowercase hyphenated words only.\n- Avoid generic filler such as \"available from Gaming Nectar\".\n- Do not keyword-stuff.\n\nProduct:\n${JSON.stringify(product).slice(0,6000)}`;
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},body:JSON.stringify({model,temperature:0.2,response_format:{type:'json_object'},messages:[{role:'system',content:'You improve one product SEO record. Output JSON only.'},{role:'user',content:prompt}]})});
  const json=await response.json().catch(()=>({}));
  if(!response.ok){ const error=new Error(json.error?.message||`OpenAI SEO suggestion failed (${response.status})`); error.status=502; throw error; }
  let suggestion={};
  try{ suggestion=JSON.parse(json.choices?.[0]?.message?.content||'{}'); }catch(_){ const error=new Error('AI SEO suggestion returned invalid JSON.'); error.status=502; throw error; }
  return { model, suggestion:{ seoTitle:cleanText(suggestion.seoTitle||'',70), seoDescription:cleanText(suggestion.seoDescription||'',165), handle:cleanText(suggestion.handle||'',180).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') } };
}

module.exports={auditShopifySeo,suggestSeoWithAi};
