function normalizeTrackingNumber(v){return String(v||'').replace(/\s+/g,'').toUpperCase();}
function determineStatus(...vals){
  const t=vals.map(v=>String(v||'').toLowerCase()).join(' ');
  if(t.includes('delivered')) return 'DELIVERED';
  if(/exception|failed|returned|issue|lost/.test(t)) return 'ISSUE';
  if(/pending|info|not found|pre-transit/.test(t)) return 'PENDING';
  return 'IN_TRANSIT';
}
function trackingUrl(carrier,number,fallback=''){
  const c=String(carrier||'').toLowerCase(),n=String(number||'').trim();
  if(!n) return fallback||'';
  if(c.includes('royal mail')) return `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(n)}`;
  if(c.includes('evri')||c.includes('hermes')) return `https://www.evri.com/track-a-parcel/tracking-details?trackingId=${encodeURIComponent(n)}`;
  return fallback||'';
}
function events(item={}){
  const list=item.tracking_details||item.trackingDetails||item.tracking_events||item.events||item.checkpoints||item.history||item.destination_info?.trackinfo||[];
  return (Array.isArray(list)?list:[]).map(r=>({
    date:r.event_time||r.eventTime||r.datetime||r.time||r.checkpoint_time||r.created_at||'',
    detail:r.event_detail||r.eventDetail||r.status||r.message||r.description||r.checkpoint_status||'',
    location:r.event_location||r.eventLocation||r.location||r.checkpoint_location||''
  }));
}
async function trackByNumber(trackingNumber,carrier=''){
  const apiKey=process.env.TRACK123_API_KEY||'';
  if(!apiKey) return {found:false,status:'UNAVAILABLE',history:[],trackingNumber,carrier,trackingUrl:trackingUrl(carrier,trackingNumber),provider:'none'};
  const response=await fetch('https://api.track123.com/gateway/open-api/tk/v2/track/query',{
    method:'POST',headers:{'Content-Type':'application/json','Track123-Api-Key':apiKey,Accept:'application/json'},
    body:JSON.stringify({trackings:[{tracking_number:String(trackingNumber||'').trim(),carrier_code:carrier||undefined}]})
  });
  const text=await response.text();let data={};try{data=JSON.parse(text)}catch(_){}
  if(!response.ok) throw new Error(`Track123 tracking request failed (${response.status})`);
  const item=data?.data?.trackings?.[0]||data?.data?.items?.[0]||data?.trackings?.[0]||data?.items?.[0]||null;
  if(!item) return {found:false,status:'PENDING',history:[],trackingNumber,carrier,trackingUrl:trackingUrl(carrier,trackingNumber),provider:'track123'};
  const number=item.tracking_number||item.trackingNumber||trackingNumber;
  const company=item.courier_name||item.courierName||item.tracking_company||carrier||'';
  return {found:true,status:determineStatus(item.transit_status,item.status,item.transit_sub_status,item.last_event),history:events(item),trackingNumber:number,carrier:company,lastEvent:item.last_event||item.lastEvent||'',lastEventTime:item.last_event_time||item.lastEventTime||'',trackingUrl:trackingUrl(company,number,item.query_link||item.queryLink||''),provider:'track123'};
}
module.exports={trackByNumber,normalizeTrackingNumber,determineStatus,trackingUrl};
