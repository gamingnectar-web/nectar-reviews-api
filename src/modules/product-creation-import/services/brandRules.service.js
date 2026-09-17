const { cleanText, normaliseMetafields } = require('../utils/safe');
const { locked } = require('./fieldAuthority.service');

const t=v=>cleanText(v,5000).toLowerCase();
function getField(draft={},field=''){
  if(field==='title')return draft.title||'';
  if(field==='description')return draft.descriptionHtml||draft.description||'';
  if(field==='vendor')return draft.vendor||'';
  if(field==='productType')return draft.productType||'';
  if(field==='tags')return (draft.tags||[]).join(' ');
  if(field==='sourceUrl')return draft.sourceUrl||'';
  if(field.startsWith('metafield:')){
    const target=field.slice(10);
    return (draft.metafields||[]).find(x=>`${x.namespace}.${x.key}`===target)?.value??'';
  }
  return '';
}
function matches(draft,when={}){
  const a=t(getField(draft,when.field||'title')),e=t(when.value||'');
  switch(when.operator||'contains'){
    case 'equals':return a===e;
    case 'starts_with':return a.startsWith(e);
    case 'ends_with':return a.endsWith(e);
    case 'exists':return Boolean(a.trim());
    default:return a.includes(e);
  }
}
function setField(draft,path,value,overwrite){
  if(locked(draft,path))return draft;
  const current=path.split('.').reduce((o,k)=>o?.[k],draft);
  if(!overwrite&&current!==undefined&&current!==null&&String(current).trim()!=='')return draft;
  if(path==='productType')return {...draft,productType:value};
  if(path==='vendor')return {...draft,vendor:value};
  if(path==='themeTemplate')return {...draft,themeTemplate:value};
  if(path==='seo.title')return {...draft,seo:{...(draft.seo||{}),title:value}};
  if(path==='seo.description')return {...draft,seo:{...(draft.seo||{}),description:value}};
  return draft;
}
function applyAction(draft={},a={}){
  if(a.type==='set_field')return setField(draft,a.target||'',a.value,Boolean(a.overwrite));
  if(a.type==='add_tag'){
    if(locked(draft,'tags'))return draft;
    return {...draft,tags:Array.from(new Set([...(draft.tags||[]),cleanText(a.value,120)].filter(Boolean)))};
  }
  if(a.type==='add_collection'){
    if(locked(draft,'collections'))return draft;
    return {...draft,collections:Array.from(new Set([...(draft.collections||[]),cleanText(a.value,160)].filter(Boolean)))};
  }
  if(a.type==='set_metafield'){
    const target=String(a.target||''),dot=target.indexOf('.');
    if(dot<=0)return draft;
    const ns=target.slice(0,dot),key=target.slice(dot+1),path=`metafields.${ns}.${key}`;
    if(locked(draft,path))return draft;
    const map=new Map((normaliseMetafields(draft.metafields||[])||[]).map(m=>[`${m.namespace}.${m.key}`,m]));
    const cur=map.get(target);
    if(cur&&!a.overwrite&&String(cur.value??'').trim())return draft;
    map.set(target,{...(cur||{}),namespace:ns,key,type:a.metafieldType||cur?.type||'single_line_text_field',value:String(a.value??''),source:'brand-rule',confidence:1});
    return {...draft,metafields:[...map.values()]};
  }
  return draft;
}
function inferredMatcher(line={}){
  if(line.matcher?.field)return line.matcher;
  const name=String(line.name||'').trim();
  return name?{field:'title',operator:'contains',value:name}:{field:'title',operator:'exists',value:''};
}
function applyRuleset(next,rules=[],applied=[],prefix=''){
  for(const rule of rules){
    if(rule?.enabled===false)continue;
    for(const action of rule.actions||[])next=applyAction(next,action);
    applied.push(`${prefix}${rule.name||'Rule'}`);
  }
  return next;
}
function applyBrandRules(draft={},profile={}){
  let next={...draft};const applied=[];
  next=applyRuleset(next,profile.alwaysApply||[],applied,'Brand: ');

  for(const rule of profile.conditionalRules||[]){
    if(rule?.enabled===false||!matches(next,rule.when||{}))continue;
    next=applyRuleset(next,[rule],applied,'Brand condition: ');
  }

  for(const line of profile.coreProductLines||[]){
    const matcher=inferredMatcher(line);
    if(!matches(next,matcher))continue;
    const lineRules=Array.isArray(line.rules)?line.rules:[];
    next=applyRuleset(next,lineRules,applied,`${line.name||'Product line'}: `);
    next={...next,enrichment:{...(next.enrichment||{}),brandProductLine:{
      name:line.name||'',matcher,description:line.description||'',defaultClaims:line.defaultClaims||[]
    }}};
    break;
  }

  return {...next,enrichment:{...(next.enrichment||{}),brandRules:{profileId:String(profile._id||''),applied}}};
}
module.exports={applyBrandRules,matches,applyAction,inferredMatcher};
