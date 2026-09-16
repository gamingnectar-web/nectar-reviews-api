(function Elev8CommerceRail(){
  const fmtMoney=(n)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(Number(n||0));
  const fmtPct=(n)=>`${(Number(n||0)*100).toFixed(0)}%`;
  const fmtNum=(n)=>new Intl.NumberFormat('en-GB',{maximumFractionDigits:0}).format(Number(n||0));
  const shop=()=>new URLSearchParams(location.search).get('shop')||new URLSearchParams(location.search).get('shopDomain')||window.Shopify?.shop||'';

  async function api(){
    const fn=window.adminFetch||window.fetch.bind(window);
    const q=shop()?`?shopDomain=${encodeURIComponent(shop())}`:'';
    const res=await fn(`/api/admin/elev8-commerce/commerce-pulse${q}`);
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error||data.message||`HTTP ${res.status}`);
    return data;
  }

  function ensureRail(){
    const sidebar=document.querySelector('.sidebar');
    if(!sidebar)return null;
    let rail=document.getElementById('e8-commerce-rail');
    if(rail)return rail;
    rail=document.createElement('div');
    rail.id='e8-commerce-rail';
    rail.innerHTML=`<div class="e8-pulse-loading">Loading commerce pulse…</div>`;
    const brand=sidebar.querySelector('.brand');
    (brand?.parentNode||sidebar).insertBefore(rail,brand?.nextSibling||sidebar.firstChild);
    return rail;
  }

  function render(data){
    const rail=ensureRail();if(!rail)return;
    const p=data?.periods||{};
    const today=p.today||{},week=p.week||{},month=p.month||{},six=p.sixMonths||{};
    rail.innerHTML=`
      <div class="e8-pulse-block">
        <span class="e8-pulse-kicker">Today</span>
        <strong>${fmtMoney(today.sales)}</strong>
        <small>${fmtNum(today.orders)} orders · ${fmtMoney(today.aov)} AOV</small>
      </div>
      <div class="e8-pulse-grid">
        <div><span>7 days</span><strong>${fmtMoney(week.sales)}</strong></div>
        <div><span>30 days</span><strong>${fmtMoney(month.sales)}</strong></div>
      </div>
      <div class="e8-pulse-section">
        <span class="e8-pulse-kicker">Customers · 30d</span>
        <div class="e8-pulse-row"><span>Customers</span><b>${fmtNum(month.customers)}</b></div>
        <div class="e8-pulse-row"><span>Returning</span><b>${fmtPct(month.returningCustomerRate)}</b></div>
        <div class="e8-pulse-row"><span>Return revenue</span><b>${fmtPct(month.returningRevenueRate)}</b></div>
      </div>
      <div class="e8-pulse-section">
        <span class="e8-pulse-kicker">Profitability · 30d</span>
        <div class="e8-pulse-row"><span>Gross profit</span><b>${fmtMoney(month.grossProfit)}</b></div>
        <div class="e8-pulse-row"><span>Margin</span><b>${fmtPct(month.grossMargin)}</b></div>
        <div class="e8-pulse-row"><span>Profit / order</span><b>${fmtMoney(month.grossProfitPerOrder)}</b></div>
        <div class="e8-pulse-row"><span>Cost coverage</span><b>${fmtPct(month.costCoverage)}</b></div>
      </div>
      <div class="e8-pulse-section e8-pulse-muted">
        <span>6m sales</span><b>${fmtMoney(six.sales)}</b>
      </div>`;
  }

  function style(){
    if(document.getElementById('e8-commerce-rail-style'))return;
    const s=document.createElement('style');s.id='e8-commerce-rail-style';
    s.textContent=`
      body.e8-context-home .app-shell{grid-template-columns:220px minmax(0,1fr)!important}
      body.e8-context-home .sidebar{padding:22px 16px!important;overflow-y:auto!important}
      body.e8-context-home .sidebar .brand{justify-content:flex-start!important;margin:0 0 18px!important}
      body.e8-context-home .sidebar .brand img{width:42px!important;height:42px!important}
      #e8-commerce-rail{display:none}
      body.e8-context-home #e8-commerce-rail{display:block}
      .e8-pulse-loading{font-size:12px;color:#7b8493;padding:10px 2px}
      .e8-pulse-block,.e8-pulse-section{padding:13px 0;border-top:1px solid #e6eaf0}
      .e8-pulse-block{border-top:0;padding-top:0}.e8-pulse-block>strong{display:block;font-size:25px;letter-spacing:-.04em;margin:3px 0}.e8-pulse-block small{color:#6b7280;line-height:1.4}
      .e8-pulse-kicker{display:block;color:#7b8493;text-transform:uppercase;font-size:10px;font-weight:900;letter-spacing:.06em}
      .e8-pulse-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0 4px}.e8-pulse-grid div{background:#fff;border:1px solid #e6eaf0;border-radius:10px;padding:9px}.e8-pulse-grid span{display:block;color:#7b8493;font-size:10px}.e8-pulse-grid strong{display:block;font-size:13px;margin-top:3px}
      .e8-pulse-row{display:flex;justify-content:space-between;gap:8px;margin-top:8px;font-size:12px}.e8-pulse-row span{color:#667085}.e8-pulse-row b{font-weight:900}
      .e8-pulse-muted{display:flex;justify-content:space-between;font-size:11px;color:#667085}
      @media(max-width:760px){body.e8-context-home .app-shell{grid-template-columns:1fr!important}body.e8-context-home #e8-commerce-rail{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.e8-pulse-section,.e8-pulse-block{border:1px solid #e6eaf0;border-radius:12px;padding:12px}}
    `;
    document.head.appendChild(s);
  }

  async function load(){
    style();ensureRail();
    try{render(await api())}
    catch(error){
      const rail=ensureRail();
      if(rail)rail.innerHTML=`<div class="e8-pulse-loading">Commerce pulse unavailable<br>${String(error.message||'')}</div>`;
    }
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(load,400));
  window.addEventListener('load',()=>setTimeout(load,600));
  setInterval(()=>{if(document.body.classList.contains('elev8-home-open'))load()},5*60*1000);
})();