const express=require('express');
const {listModules}=require('../moduleRegistry');

const router=express.Router();

const bool=v=>Boolean(String(v||'').trim());
const scopes=()=>new Set(String(process.env.SHOPIFY_SCOPES||'').split(',').map(x=>x.trim()).filter(Boolean));
const hasScope=(...values)=>values.some(v=>scopes().has(v));

function integrationStatus(){
  return[
    {
      id:'shopify',
      label:'Shopify',
      ok:bool(process.env.SHOPIFY_API_KEY)&&bool(process.env.SHOPIFY_API_SECRET)&&bool(process.env.SHOPIFY_STORE_URL),
      configured:[
        bool(process.env.SHOPIFY_API_KEY)?'API key':'API key missing',
        bool(process.env.SHOPIFY_API_SECRET)?'API secret':'API secret missing',
        bool(process.env.SHOPIFY_STORE_URL)?'Store URL':'Store URL missing'
      ],
      limitations:[
        !hasScope('read_products')?'read_products scope not detected':'',
        !hasScope('write_products')?'write_products scope not detected':'',
        !hasScope('read_orders')?'read_orders scope not detected':'',
        !hasScope('write_discounts')?'write_discounts scope not detected':''
      ].filter(Boolean)
    },
    {
      id:'mongodb',
      label:'MongoDB',
      ok:bool(process.env.MONGODB_URI),
      configured:[bool(process.env.MONGODB_URI)?'Primary database configured':'MONGODB_URI missing'],
      limitations:[]
    },
    {
      id:'openai',
      label:'OpenAI',
      ok:bool(process.env.OPENAI_API_KEY),
      configured:[
        bool(process.env.OPENAI_API_KEY)?'API key configured':'OPENAI_API_KEY missing',
        process.env.OPENAI_MODULE_MODEL?`Module model: ${process.env.OPENAI_MODULE_MODEL}`:'Using module default model',
        process.env.OPENAI_IMAGE_MODEL?`Image model: ${process.env.OPENAI_IMAGE_MODEL}`:'Using image default model'
      ],
      limitations:[!bool(process.env.OPENAI_API_KEY)?'AI extraction, generated copy and Creative Studio backgrounds are unavailable':''].filter(Boolean)
    },
    {
      id:'email',
      label:'Email',
      ok:bool(process.env.EMAIL_CREDENTIAL_SECRET),
      configured:[bool(process.env.EMAIL_CREDENTIAL_SECRET)?'Email credential secret configured':'EMAIL_CREDENTIAL_SECRET missing'],
      limitations:[!bool(process.env.EMAIL_CREDENTIAL_SECRET)?'Automated review/customer email journeys may be unavailable':''].filter(Boolean)
    },
    {
      id:'loyalty-db',
      label:'Loyalty database',
      ok:bool(process.env.LOYALTY_DB_URI),
      configured:[bool(process.env.LOYALTY_DB_URI)?'Loyalty database configured':'LOYALTY_DB_URI missing'],
      limitations:[!bool(process.env.LOYALTY_DB_URI)?'Loyalty cannot persist its own ledger/database state':''].filter(Boolean)
    }
  ];
}

function productStatuses(){
  const integrations=Object.fromEntries(integrationStatus().map(x=>[x.id,x]));
  const shopifyScopes=scopes();
  const products=[
    {
      id:'reviews',
      label:'Reviews',
      status:'active',
      view:'v-mgr',
      settingsView:'v-settings',
      limitations:[
        !integrations.shopify.ok?'Shopify connection is incomplete':'',
        !integrations.email.ok?'Email sending is not fully configured':''
      ].filter(Boolean)
    },
    {
      id:'product-creation-import',
      label:'Product Creation & Import',
      status:'beta',
      view:'v-product-creation-import',
      settingsView:'v-product-creation-import',
      limitations:[
        !integrations.shopify.ok?'Shopify connection is incomplete':'',
        !integrations.mongodb.ok?'MongoDB is not configured':'',
        !integrations.openai.ok?'AI extraction/enrichment is unavailable':'',
        !shopifyScopes.has('write_products')?'write_products scope not detected':''
      ].filter(Boolean)
    },
    {
      id:'discounts',
      label:'Discounts',
      status:'beta',
      view:'v-discounts',
      settingsView:'v-discounts',
      limitations:[
        !integrations.shopify.ok?'Shopify connection is incomplete':'',
        !shopifyScopes.has('write_discounts')?'write_discounts scope not detected':''
      ].filter(Boolean)
    },
    {
      id:'loyalty',
      label:'Loyalty',
      status:'beta',
      view:'v-loyalty',
      settingsView:'v-loyalty',
      limitations:[
        !integrations.shopify.ok?'Shopify connection is incomplete':'',
        !integrations['loyalty-db'].ok?'Loyalty database is not configured':''
      ].filter(Boolean)
    },
    {
      id:'cart-rewards',
      label:'Cart Rewards',
      status:'beta',
      view:'v-cart-rewards',
      settingsView:'v-cart-rewards',
      limitations:[
        !integrations.shopify.ok?'Shopify connection is incomplete':'',
        !shopifyScopes.has('write_discounts')?'write_discounts scope not detected for checkout rewards':''
      ].filter(Boolean)
    },
    {
      id:'marketing-intelligence',
      label:'Marketing Intelligence',
      status:'beta',
      view:'v-marketing-intelligence',
      settingsView:'v-marketing-intelligence',
      limitations:[
        !integrations.shopify.ok?'Shopify connection is incomplete':'',
        !integrations.mongodb.ok?'MongoDB/PO history is unavailable':'',
        !integrations.openai.ok?'Creative Studio AI generation is unavailable':'',
        !shopifyScopes.has('read_orders')?'read_orders scope not detected for sales analysis':''
      ].filter(Boolean)
    },
    {
      id:'notifications',
      label:'Notifications & Tracking',
      status:'beta',
      view:'v-settings',
      settingsView:'v-settings',
      limitations:[
        !integrations.shopify.ok?'Shopify connection is incomplete':''
      ].filter(Boolean)
    },
    {
      id:'referrals',
      label:'Referrals',
      status:'soon',
      view:'v-referrals',
      settingsView:'v-referrals',
      limitations:['Product line is marked as coming soon']
    }
  ];
  return products.map(p=>({...p,health:p.limitations.length?'warning':p.status==='soon'?'soon':'ok'}));
}

router.get('/status',(req,res)=>{
  const integrations=integrationStatus();
  const products=productStatuses();
  const limitationCount=products.reduce((s,p)=>s+p.limitations.length,0)+integrations.reduce((s,i)=>s+i.limitations.length,0);
  res.setHeader('Cache-Control','no-store');
  res.json({
    generatedAt:new Date().toISOString(),
    integrations,
    products,
    summary:{
      integrationsConfigured:integrations.filter(x=>x.ok).length,
      integrationsTotal:integrations.length,
      productsHealthy:products.filter(x=>x.health==='ok').length,
      productsTotal:products.length,
      limitationCount
    },
    modules:listModules()
  });
});

module.exports=router;
