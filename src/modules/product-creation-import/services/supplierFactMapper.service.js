const { cleanText, normaliseMetafields } = require('../utils/safe');

const ORGANISATION_FIELD_ALIASES = {
  flavour: {
    canonical: 'core.product_flavour',
    labels: ['product flavour','product flavor','flavour','flavor','flavour name','flavor name','taste','flavour profile','flavor profile'],
    exclude: ['family','sweet','sour','description']
  },
  formula: {
    canonical: 'core.formula_version',
    labels: ['formula version','formula','product line','product formula','formula code','range'],
    exclude: ['ingredients','nutrition','description']
  }
};

function definitionText(def={}) {
  return nk([def.name,def.label,def.namespace,def.key,def.description].filter(Boolean).join(' '));
}

function organisationFieldDefinitionMatches(field='', definitions=[]) {
  const spec=ORGANISATION_FIELD_ALIASES[field];
  if(!spec)return [];
  const canonical=spec.canonical;
  const aliases=(spec.labels||[]).map(nk);
  const excludes=(spec.exclude||[]).map(nk);

  return (definitions||[])
    .map(def=>{
      const compound=`${def.namespace||''}.${def.key||''}`;
      const text=definitionText(def);
      const key=nk(def.key||'');
      let score=0;
      if(compound===canonical)score=100;
      for(const alias of aliases){
        const aliasKey=alias.replace(/\s+/g,'_');
        if(key===aliasKey)score=Math.max(score,95);
        else if(text===alias)score=Math.max(score,92);
        else if(text.includes(alias))score=Math.max(score,78);
      }
      if(excludes.some(x=>text.includes(x)))score-=40;
      return {def,score};
    })
    .filter(row=>row.score>=70)
    .sort((a,b)=>b.score-a.score)
    .map(row=>({
      namespace:row.def.namespace,
      key:row.def.key,
      name:row.def.name||row.def.label||`${row.def.namespace}.${row.def.key}`,
      type:row.def.type?.name||row.def.type||'single_line_text_field',
      description:row.def.description||'',
      score:row.score,
      canonical:`${row.def.namespace}.${row.def.key}`===canonical
    }));
}

function getOrganisationFieldValue(draft={},field='') {
  const spec=ORGANISATION_FIELD_ALIASES[field];
  if(!spec)return '';
  const [namespace,key]=spec.canonical.split('.');
  return (draft.metafields||[]).find(m=>m.namespace===namespace&&m.key===key)?.value||'';
}


/* ELEV8_INLINE_METAFIELD_MAPPING_V1 */
function metafieldTypeName(def={}) {
  return cleanText(def.type?.name || def.type || 'single_line_text_field', 120);
}

function organisationFieldDefinitionOptions(definitions=[]) {
  return (definitions||[])
    .filter(def=>def?.namespace&&def?.key)
    .map(def=>{
      const type=metafieldTypeName(def);
      const compound=`${def.namespace}.${def.key}`;
      return { namespace:def.namespace, key:def.key, compound, name:def.name||def.label||compound, label:def.name||def.label||compound, type, description:def.description||'', compatible:['single_line_text_field','multi_line_text_field'].includes(type) };
    })
    .sort((a,b)=>a.compatible===b.compatible?String(a.name||a.compound).localeCompare(String(b.name||b.compound)):(a.compatible?-1:1));
}

function savedOrganisationMapping(field='', metadata={}) {
  const row=metadata?.settings?.organisationFieldMappings?.[field];
  if(!row?.target)return null;
  return { target:String(row.target), label:row.label||row.target, type:row.type||'single_line_text_field', updatedAt:row.updatedAt||'' };
}

function applyOrganisationFieldMappings(draft={},metadata={}){
  const options=organisationFieldDefinitionOptions(defs(metadata));
  let metafields=normaliseMetafields(draft.metafields||[])
    .filter(mf=>!['organisation-field-mapper','organisation-field-mapper-explicit'].includes(String(mf.source||'')));
  for(const field of Object.keys(ORGANISATION_FIELD_ALIASES)){
    const value=getOrganisationFieldValue({...draft,metafields},field);
    if(value===undefined||value===null||String(value).trim()==='')continue;
    const saved=savedOrganisationMapping(field,metadata);
    if(!saved?.target)continue;
    const target=options.find(option=>option.compound===saved.target);
    if(!target?.compatible)continue;
    metafields=normaliseMetafields([...metafields,{namespace:target.namespace,key:target.key,type:target.type,label:target.name,value:String(value).trim(),source:'organisation-field-mapper-explicit',confidence:1,mappingField:field}]);
  }
  return {...draft,metafields};
}

function organisationFieldMappingSummary({field='',draft={},metadata={}}){
  const value=getOrganisationFieldValue(draft,field);
  const definitions=defs(metadata);
  const options=organisationFieldDefinitionOptions(definitions);
  const suggestions=organisationFieldDefinitionMatches(field,definitions).map(match=>({...match,compound:`${match.namespace}.${match.key}`,target:`${match.namespace}.${match.key}`,label:match.name,compatible:options.find(option=>option.compound===`${match.namespace}.${match.key}`)?.compatible===true,value}));
  const saved=savedOrganisationMapping(field,metadata);
  const selected=saved ? options.find(option=>option.compound===saved.target) : null;
  const mapped=Boolean(selected?.compatible);
  return { field,value,mapped,savedMapping:mapped?{target:selected.compound,label:selected.name,type:selected.type,updatedAt:saved?.updatedAt||''}:null,matches:mapped?[{namespace:selected.namespace,key:selected.key,name:selected.name,label:selected.name,type:selected.type,compound:selected.compound,target:selected.compound,value,saved:true}]:[],suggestions,options };
}

const FACT_ALIASES={about_brand:['about brand','about the brand','brand description','about_brand','brand_about'],preparation:['how to use','how to prepare','preparation','mixing instructions','directions'],storage:['storage','storage instructions','how to store'],product_family:['product family','range','product range','formula family'],capacity:['capacity','volume','bottle capacity','shaker capacity'],dimensions:['dimensions','size','product dimensions'],bundle_contents:['bundle contents','pack contents','what is included','included'],zero_sugar:['zero sugar','sugar free','sugar-free'],zero_calories:['zero calories','calorie free','calorie-free'],zero_caffeine:['caffeine free','caffeine-free','zero caffeine'],zero_taurine:['taurine free','taurine-free','zero taurine'],vegan:['vegan'],keto_friendly:['keto','keto friendly','keto-friendly'],nicotine_free:['nicotine free','nicotine-free'],tobacco_free:['tobacco free','tobacco-free'],net_weight_g:['net weight','product weight','weight'],taurine_mg_per_serving:['taurine per serving','taurine mg per serving']};
function nk(v=''){return cleanText(v,180).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function defs(metadata={}){return metadata.metafieldDefinitions||metadata.metafields||metadata.productMetafieldDefinitions||[];}
function findDefinition(factKey,definitions=[]){const aliases=(FACT_ALIASES[factKey]||[factKey.replace(/_/g,' ')]).map(nk);return definitions.find(def=>{const text=nk([def.name,def.label,def.key,def.namespace].filter(Boolean).join(' '));const key=nk(def.key||'');return aliases.some(a=>key===a.replace(/\s+/g,'_')||text.includes(a));})||null;}
function stringify(v){if(typeof v==='boolean')return v?'true':'false';if(Array.isArray(v))return v.join(', ');return String(v??'');}
function mapSupplierFactsToExistingMetafields(draft={},metadata={}){const facts=draft.enrichment?.supplierFacts||{};const definitions=defs(metadata);const mapped=[];for(const [factKey,value] of Object.entries(facts)){if(value===''||value===null||value===undefined)continue;const def=findDefinition(factKey,definitions);if(!def?.namespace||!def?.key)continue;mapped.push({namespace:def.namespace,key:def.key,type:def.type?.name||def.type||'single_line_text_field',label:def.name||def.label||factKey,value:stringify(value),source:'supplier-fact-mapper',confidence:0.97});}return {...draft,metafields:normaliseMetafields([...(draft.metafields||[]),...mapped]),enrichment:{...(draft.enrichment||{}),supplierFactsMapped:mapped.map(mf=>`${mf.namespace}.${mf.key}`)}};}
module.exports={mapSupplierFactsToExistingMetafields,findDefinition,applyOrganisationFieldMappings,organisationFieldMappingSummary,organisationFieldDefinitionMatches,organisationFieldDefinitionOptions};
