/* ELEV8 Basket Rewards — DRAFT-ONLY rule evaluator; never grants checkout discounts. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.Elev8BasketRewardsEngine=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const allowedRewards=['percent','fixed','shipping','gift'];
  const defaultRules=[
    {id:'reward-50',name:'Choose your £50 reward',enabled:true,trigger:'subtotal',threshold:50,eligibleVendors:[],excludeVendors:[],excludeTags:['SALE'],options:[{id:'r50-percent',type:'percent',value:5,label:'5% off eligible items'},{id:'r50-gift',type:'gift',value:0,label:'Choose a free snack'}],selectionMode:'choose',stackGroup:'basket',stackWith:['shipping','gift'],priority:10,startAt:null,endAt:null},
    {id:'reward-75',name:'Free delivery at £75',enabled:true,trigger:'subtotal',threshold:75,eligibleVendors:[],excludeVendors:[],excludeTags:[],options:[{id:'r75-shipping',type:'shipping',value:0,label:'Free eligible UK delivery'}],selectionMode:'auto',stackGroup:'shipping',stackWith:['basket','gift'],priority:20,startAt:null,endAt:null},
    {id:'reward-100',name:'Bonus gift at £100',enabled:true,trigger:'subtotal',threshold:100,eligibleVendors:[],excludeVendors:[],excludeTags:[],options:[{id:'r100-gift',type:'gift',value:0,label:'Free eligible bonus gift'}],selectionMode:'auto',stackGroup:'gift',stackWith:['basket','shipping'],priority:30,startAt:null,endAt:null}
  ];
  const clone=x=>JSON.parse(JSON.stringify(x));
  const numeric=n=>Number.isFinite(Number(n))?Math.max(0,Number(n)):0;
  function eligibleItem(item,rule){
    if(!item||numeric(item.quantity)===0)return false;
    const vendor=String(item.vendor||'').toLowerCase();
    const tags=(Array.isArray(item.tags)?item.tags:[]).map(x=>String(x).toLowerCase());
    const include=(rule.eligibleVendors||[]).map(x=>String(x).toLowerCase());
    const exclude=(rule.excludeVendors||[]).map(x=>String(x).toLowerCase());
    const excludedTags=(rule.excludeTags||[]).map(x=>String(x).toLowerCase());
    return (!include.length||include.includes(vendor))&&!exclude.includes(vendor)&&!excludedTags.some(t=>tags.includes(t));
  }
  function totals(items,rule){
    return (items||[]).filter(item=>eligibleItem(item,rule)).reduce((acc,item)=>{
      acc.quantity+=numeric(item.quantity);
      acc.subtotal+=numeric(item.unitPrice)*numeric(item.quantity);
      return acc;
    },{quantity:0,subtotal:0});
  }
  function inDateRange(rule,now){
    const t=Date.parse(now||new Date().toISOString());
    return (!rule.startAt||t>=Date.parse(rule.startAt))&&(!rule.endAt||t<=Date.parse(rule.endAt));
  }
  function evaluate(rules,items,selected={},now){
    const rows=(rules||[]).filter(r=>r.enabled!==false).map(rule=>{
      const amount=totals(items,rule);
      const metric=rule.trigger==='quantity'?amount.quantity:amount.subtotal;
      const threshold=numeric(rule.threshold);
      const available=inDateRange(rule,now)&&metric>=threshold;
      const options=(rule.options||[]).filter(o=>allowedRewards.includes(o.type));
      const requested=options.find(o=>o.id===selected[rule.id]);
      const chosen=available?(rule.selectionMode==='choose'?(requested||null):(options[0]||null)):null;
      return {id:rule.id,rule,metric,remaining:Math.max(0,threshold-metric),available,options,chosen,needsChoice:available&&rule.selectionMode==='choose'&&!requested,subtotal:amount.subtotal};
    }).sort((a,b)=>numeric(b.rule.priority)-numeric(a.rule.priority));
    const applied=[];const suppressed=[];
    for(const row of rows){
      if(!row.chosen)continue;
      const conflict=applied.find(a=>{
        const aGroup=a.rule.stackGroup||a.chosen.type;
        const bGroup=row.rule.stackGroup||row.chosen.type;
        return !(a.rule.stackWith||[]).includes(bGroup)||!(row.rule.stackWith||[]).includes(aGroup);
      });
      if(conflict){suppressed.push({id:row.id,reason:'Does not stack with '+conflict.rule.name});continue;}
      applied.push(row);
    }
    const discount=applied.reduce((sum,row)=>{
      const o=row.chosen;
      if(o.type==='percent')return sum+row.subtotal*Math.min(100,numeric(o.value))/100;
      if(o.type==='fixed')return sum+Math.min(row.subtotal,numeric(o.value));
      return sum;
    },0);
    return {rows,applied,suppressed,estimatedProductSaving:Math.round(discount*100)/100,
      note:'Preview only. Shipping, gift availability, VAT, combination limits and final savings must be checked by Shopify checkout.'};
  }
  function validate(rules){
    const errors=[];const ids=new Set();
    for(const rule of rules||[]){
      if(!rule.id||ids.has(rule.id))errors.push('Every campaign needs a unique ID');
      ids.add(rule.id);
      if(!rule.name?.trim())errors.push(`${rule.id}: campaign name required`);
      if(!['subtotal','quantity'].includes(rule.trigger))errors.push(`${rule.id}: unsupported trigger`);
      if(!Number.isFinite(Number(rule.threshold))||Number(rule.threshold)<=0)errors.push(`${rule.id}: threshold must be positive`);
      if(!['auto','choose'].includes(rule.selectionMode))errors.push(`${rule.id}: invalid selection mode`);
      if(!Array.isArray(rule.options)||!rule.options.length)errors.push(`${rule.id}: at least one reward is required`);
      (rule.options||[]).forEach(o=>{if(!allowedRewards.includes(o.type))errors.push(`${rule.id}: unsupported reward type`);});
      if(rule.startAt&&rule.endAt&&Date.parse(rule.startAt)>Date.parse(rule.endAt))errors.push(`${rule.id}: end precedes start`);
    }
    return [...new Set(errors)];
  }
  return {defaultRules:clone(defaultRules),evaluate,validate,totals,clone};
});
