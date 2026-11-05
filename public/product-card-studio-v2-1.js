(function(){
  'use strict';

  function byId(id){ return document.getElementById(id); }
  function currentLayout(){ return typeof e8pcbLayout === 'function' ? e8pcbLayout() : null; }

  window.e8pcToggleBuilder = function(enabled){
    if(!e8pcbState) e8pcbState=e8pcbSeed();
    e8pcbState.enabled=Boolean(enabled);
    const source=byId('e8pcb-enabled');
    if(source) source.checked=Boolean(enabled);
  };

  window.e8pcPromoteStudio = function(){
    const styleCard=byId('style-card');
    if(!styleCard) return;

    const top=styleCard.querySelector('.e8pcb-top');
    const enabled=byId('e8pcb-enabled');
    const enabledRow=enabled?.closest('div');
    const builder=byId('e8pcb-view-builder');
    const assignments=byId('e8pcb-view-assignments');
    const rating=byId('e8pcb-view-rating');
    const buttons=byId('e8pcb-view-buttons');
    const info=byId('e8pcb-view-info');

    const layoutMount=byId('e8pc-layout-controls');
    if(layoutMount){
      if(top&&top.parentElement!==layoutMount) layoutMount.appendChild(top);
      if(enabledRow&&enabledRow.parentElement!==layoutMount) layoutMount.appendChild(enabledRow);
      if(builder&&builder.parentElement!==layoutMount) layoutMount.appendChild(builder);
    }
    const assignmentMount=byId('e8pc-assignments-mount');
    if(assignmentMount&&assignments&&assignments.parentElement!==assignmentMount) assignmentMount.appendChild(assignments);
    const ratingMount=byId('e8pc-rating-mount');
    if(ratingMount&&rating&&rating.parentElement!==ratingMount) ratingMount.appendChild(rating);
    const buttonsMount=byId('e8pc-buttons-mount');
    if(buttonsMount&&buttons&&buttons.parentElement!==buttonsMount) buttonsMount.appendChild(buttons);
    const infoMount=byId('e8pc-info-mount');
    if(infoMount&&info&&info.parentElement!==infoMount) infoMount.appendChild(info);

    const preview=byId('preview-card');
    const previewMount=byId('e8pc-preview-mount');
    if(preview&&previewMount&&preview.parentElement!==previewMount){
      preview.classList.remove('sub-preview');
      preview.classList.add('active');
      previewMount.appendChild(preview);
    }

    styleCard.querySelector('.e8pcb-tabs')?.setAttribute('hidden','hidden');
    styleCard.querySelector('.style-actions')?.setAttribute('hidden','hidden');
    const proxy=byId('e8pc-builder-toggle-proxy');
    if(proxy) proxy.checked=Boolean(e8pcbState?.enabled);
    window.e8pcbRefreshControls?.();
  };

  window.e8pcViewport=function(mode){
    byId('e8pc-desktop')?.classList.toggle('active',mode==='desktop');
    byId('e8pc-mobile')?.classList.toggle('active',mode==='mobile');
    byId('e8pc-preview-stage')?.classList.toggle('mobile',mode==='mobile');
  };

  window.e8pcStudioTab=function(name){
    ['layout','buttons','conditions'].forEach((key)=>{
      byId('e8pc-'+key+'-context')?.classList.toggle('active',key===name);
      byId('e8pc-tab-'+key)?.classList.toggle('active',key===name);
    });
    const title=byId('e8pc-editor-title');
    const subtitle=byId('e8pc-editor-subtitle');
    if(name==='layout'){
      if(title) title.textContent='Card Product Layout';
      if(subtitle) subtitle.textContent='Drag the real card elements into a new position. Double-click an element to style it.';
      window.e8pcRenderRealCardPreview?.();
    } else if(name==='buttons'){
      if(title) title.textContent='Card Product Buttons';
      if(subtitle) subtitle.textContent='Edit the same Wishlist, Cart, Notify, Nutrition and status controls used by the live card.';
      window.e8pcbSelectButtonDesign?.(e8pcbActiveButtonRole||'wishlist');
    } else {
      if(title) title.textContent='Conditions';
      if(subtitle) subtitle.textContent='Control when Nutrition, caffeine artwork, servings and product specifications appear.';
      window.e8pcbRenderInfoRules?.();
      window.e8pcbRenderInfoPreview?.(0);
    }
  };

  const oldTab=window.e8pcbTab;
  window.e8pcbTab=function(name){
    if(byId('v-product-cards')?.classList.contains('active')){
      const mapped=name==='buttons'?'buttons':name==='info'?'conditions':'layout';
      window.e8pcStudioTab(mapped);
      return;
    }
    return oldTab?.(name);
  };

  function leafSvg(){
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"></path><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path></svg>';
  }
  function heartSvg(){
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>';
  }
  function cartSvg(){
    return '<svg viewBox="0 0 18 17" aria-hidden="true"><path d="M16.1455 9.78511L17.5744 3.46977C17.6776 3.01379 17.3326 2.57958 16.867 2.57958H4.99431L4.71725 1.21905C4.64821.879934 4.35113.636398 4.00651.636398H.907339C.506677.636398.181885.96264.181885 1.36509V1.85089C.181885 2.25334.506677 2.57958.907339 2.57958H3.01971L5.14312 13.007C4.63512 13.3005 4.29279 13.8507 4.29279 14.4816C4.29279 15.4206 5.05065 16.1819 5.98552 16.1819C6.92039 16.1819 7.67825 15.4206 7.67825 14.4816C7.67825 14.0057 7.48337 13.5757 7.1697 13.2671H13.5068C13.1931 13.5757 12.9982 14.0057 12.9982 15.4206 13.7561 16.1819 14.691 16.1819C15.6258 16.1819 16.3837 15.4206 16.3837 14.4816C16.3837 13.8084 15.9941 13.2266 15.4292 12.9512L15.5959 12.2141C15.6991 11.7581 15.354 11.3239 14.8885 11.3239H6.77497L6.57713 10.3523H15.4381C15.7768 10.3523 16.0705 10.1169 16.1455 9.78511Z"></path></svg>';
  }

  function realComponent(component){
    const style=typeof e8pcbPreviewStyle==='function'?e8pcbPreviewStyle(component):'';
    const edit='<button type="button" class="e8pc-edit-dot" data-e8pcb-edit="'+component+'" title="Edit '+escapeHtml(E8PCB_COMPONENTS[component]||component)+'">✎</button>';
    let inner='';
    if(component==='status') inner='<span class="e8pc-live-badge">NEW</span>';
    else if(component==='wishlist') inner='<span class="e8pc-circle-btn e8pc-heart">'+heartSvg()+'</span>';
    else if(component==='nutrition') inner='<span class="e8pc-nutrition-pill"><span class="e8pc-leaf">'+leafSvg()+'</span><span class="e8pc-nutri-chip">140mg</span><span class="e8pc-nutri-chip">0g</span><span class="e8pc-nutri-chip">40 SERV</span><span class="e8pc-plus">+</span></span>';
    else if(component==='quick_add') inner='<span class="e8pc-circle-btn e8pc-cart">'+cartSvg()+'</span>';
    else if(component==='brand') inner='<span class="e8pc-brand">GFUEL</span>';
    else if(component==='flavour') inner='<span class="e8pc-flavour">Tropical Citrus</span>';
    else if(component==='title') inner='<span class="e8pc-title">Sample Energy Tub</span>';
    else if(component==='rating') inner='<span class="e8pc-rating">★ <strong>5.0</strong> <small>(12)</small></span>';
    else if(component==='price') inner='<span class="e8pc-price">£32.99 <s>£36.99</s></span>';
    else if(component==='promo') inner='<span class="e8pc-promo">Add multiple tubs and save today!</span>';
    return '<div class="e8pc-real-component e8pc-real-component--'+component+'" draggable="true" data-e8pcb-component="'+component+'" style="'+style+'">'+inner+edit+'</div>';
  }

  function zoneHtml(name,layout,overlay){
    const comps=(layout?.zones?.[name]||[]).map(realComponent).join('');
    return '<div class="e8pc-real-zone e8pc-real-zone--'+name+(overlay?' is-overlay':'')+'" data-e8pcb-zone="'+name+'">'+comps+'</div>';
  }

  window.e8pcRenderRealCardPreview=function(){
    const host=byId('preview-card');
    const layout=currentLayout();
    if(!host||!layout) return;
    const effective=layout.mode==='theme'?{...layout,zones:e8pcbBaseZones()}:layout;
    host.innerHTML='\
      <div class="e8pc-preview-card">\
        <div class="e8pc-preview-media">\
          <div class="e8pc-preview-product"><div class="e8pc-preview-tub">GN</div></div>\
          '+zoneHtml('image_top_left',effective,true)+zoneHtml('image_top_right',effective,true)+zoneHtml('image_bottom_left',effective,true)+zoneHtml('image_bottom_right',effective,true)+'\
        </div>\
        <div class="e8pc-preview-body">'+zoneHtml('body_top',effective,false)+zoneHtml('body_main',effective,false)+zoneHtml('body_bottom',effective,false)+'</div>\
      </div>\
      <div class="e8pc-hidden-zone" data-e8pcb-zone="hidden">Hidden: '+((effective.zones.hidden||[]).map((c)=>escapeHtml(E8PCB_COMPONENTS[c]||c)).join(', ')||'nothing')+'</div>';

    host.querySelectorAll('[data-e8pcb-component]').forEach((el)=>{
      el.addEventListener('dragstart',(event)=>event.dataTransfer.setData('text/plain',el.dataset.e8pcbComponent));
      el.addEventListener('dblclick',(event)=>{event.preventDefault();window.e8pcbOpenComponentEditor?.(el.dataset.e8pcbComponent);});
    });
    host.querySelectorAll('[data-e8pcb-edit]').forEach((btn)=>btn.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();window.e8pcbOpenComponentEditor?.(btn.dataset.e8pcbEdit);}));
    host.querySelectorAll('[data-e8pcb-zone]').forEach((zone)=>{
      zone.addEventListener('dragover',(event)=>{event.preventDefault();zone.classList.add('drag-over');});
      zone.addEventListener('dragleave',()=>zone.classList.remove('drag-over'));
      zone.addEventListener('drop',(event)=>{event.preventDefault();zone.classList.remove('drag-over');const component=event.dataTransfer.getData('text/plain');if(component)e8pcbMove(component,zone.dataset.e8pcbZone);});
    });
  };
  window.e8pcbRenderPreview=window.e8pcRenderRealCardPreview;

  function buttonPreviewMarkup(role,design){
    const css=e8pcbButtonCss(design);
    if(role==='wishlist') return '<span class="e8pc-demo-circle" style="'+css+'">'+heartSvg()+'</span>';
    if(role==='quick_add') return '<span class="e8pc-demo-circle" style="'+css+'">'+cartSvg()+'</span>';
    if(role==='notify') return '<span class="e8pc-demo-circle" style="'+css+'"><svg viewBox="0 0 24 24"><path d="M6 16h12V11c0-3.1-2.1-5.5-6-5.5S6 7.9 6 11v5Z"></path><circle cx="12" cy="19" r="1.6"></circle></svg></span>';
    if(role==='nutrition') return '<span class="e8pc-demo-pill" style="'+css+'"><span>'+leafSvg()+'</span><b>140mg</b><b>0g</b><b>40 SERV</b><strong>+</strong></span>';
    const labels={status_new:'NEW',status_restocked:'RESTOCKED',status_soldout:'SOLD OUT',status_clearance:'CLEARANCE'};
    return '<span class="e8pc-demo-status" style="'+css+'">'+escapeHtml(labels[role]||role)+'</span>';
  }

  window.e8pcbRenderButtonPreview=function(){
    const host=byId('preview-card'); if(!host) return;
    const role=e8pcbActiveButtonRole||'wishlist';
    const d=e8pcbButtonDesign(role);
    const label={wishlist:'Wishlist',quick_add:'Add to Cart',notify:'Notify Me',nutrition:'Nutrition / Product Info',status_new:'NEW',status_restocked:'Restocked',status_soldout:'Sold Out',status_clearance:'Clearance'}[role]||role;
    host.innerHTML='<div class="e8pc-button-demo"><div class="e8pc-button-demo-inner"><h3>'+escapeHtml(label)+'</h3><p>Same control shape as the live modern card-product.</p><div>'+buttonPreviewMarkup(role,d)+'</div></div></div>';
  };

  window.e8pcImportCurrentNutritionLogic=function(){
    if(!e8pcbState) e8pcbState=e8pcbSeed();
    const image=(field,label,matchValue,asset)=>({field,label,display:'image',matchMode:'equals',matchValue,imageUrl:'asset:'+asset,suffix:''});
    const contains=(field,label,matchValue,asset)=>({field,label,display:'image',matchMode:'contains',matchValue,imageUrl:'asset:'+asset,suffix:''});
    const numeric=(field,label,value,asset)=>({field,label,display:'image',matchMode:'numeric_gt',matchValue:String(value),imageUrl:'asset:'+asset,suffix:''});
    const fallback=(field,label,suffix='')=>({field,label,display:'text',matchMode:'always',matchValue:'',imageUrl:'',suffix});
    const imported={id:'current-nutrition-pill',name:'Current Nutrition Pill',enabled:true,priority:10,mode:'nutrition',conditions:[{field:'product_type',operator:'contains',value:'Energy'}],items:[
      image('caffeine','Caffeine','100mg caffeine','100mg.png'),image('caffeine','Caffeine','140mg caffeine','140mg.png'),image('caffeine','Caffeine','175mg caffeine','175mg.png'),image('caffeine','Caffeine','200mg caffeine','200mg.png'),image('caffeine','Caffeine','zero caffeine','0mg.png'),fallback('caffeine','Caffeine'),
      contains('sugar_content','Sugar','Zero','0g.png'),contains('sugar_content','Sugar','Free','0g.png'),contains('sugar_content','Sugar','0 Sugar','0g.png'),numeric('sugar_content','Sugar',1,'sugar.png'),fallback('sugar_content','Sugar'),
      image('servings','Servings','1 Serving','1serv.png'),image('servings','Servings','Single Serving','1serv.png'),image('servings','Servings','Single Servings','1serv.png'),image('servings','Servings','15 Servings','15serv.png'),image('servings','Servings','20 Servings','20serv.png'),image('servings','Servings','30 Servings','30serv.png'),image('servings','Servings','40 Servings','40serv.png'),image('servings','Servings','60 Servings','60serv.png'),image('servings','Servings','100 Servings','100serv.png'),fallback('servings','Servings')
    ]};
    const existing=(e8pcbState.infoRules||[]).filter((rule)=>rule.id!=='current-nutrition-pill');
    e8pcbState.infoRules=[imported,...existing];
    window.e8pcbRenderInfoRules?.();
    window.e8pcbRenderInfoPreview?.(0);
    window.showToast?.('Current Nutrition Pill logic imported into Conditions.');
  };

  window.e8pcbRenderInfoRules=function(){
    const host=byId('e8pcb-info-rules'); if(!host||!e8pcbState) return;
    const fieldOptions=['product_type','vendor','tag','caffeine','sugar_content','servings','capacity','material','flavour_profile','title'];
    const matchModes=[['equals','Equals'],['contains','Contains'],['numeric_gt','Number >'],['numeric_gte','Number ≥'],['always','Fallback / always']];
    host.innerHTML=(e8pcbState.infoRules||[]).map((rule,ri)=>'\
      <div style="margin-top:12px;border:1px solid #e5e7eb;border-radius:14px;padding:14px;background:#fff;min-width:760px;">\
        <div style="display:grid;grid-template-columns:auto minmax(180px,1fr) 90px 150px auto;gap:8px;align-items:end;">\
          <label><span>On</span><input type="checkbox" '+(rule.enabled!==false?'checked':'')+' onchange="window.e8pcbRuleField('+ri+',\'enabled\',this.checked)"></label>\
          <label>Name<input class="premium-input" value="'+escapeHtml(rule.name||'')+'" oninput="window.e8pcbRuleField('+ri+',\'name\',this.value)"></label>\
          <label>Priority<input class="premium-input" type="number" value="'+Number(rule.priority||0)+'" oninput="window.e8pcbRuleField('+ri+',\'priority\',this.value)"></label>\
          <label>Mode<select class="filter-select" onchange="window.e8pcbRuleField('+ri+',\'mode\',this.value)"><option value="inherit" '+(rule.mode==='inherit'?'selected':'')+'>Keep current</option><option value="nutrition" '+(rule.mode==='nutrition'?'selected':'')+'>Nutrition</option><option value="specs" '+(rule.mode==='specs'?'selected':'')+'>Specifications</option><option value="hidden" '+(rule.mode==='hidden'?'selected':'')+'>Hide</option></select></label>\
          <button type="button" class="secondary-btn" onclick="window.e8pcbRemoveInfoRule('+ri+')">Delete</button>\
        </div>\
        <div style="margin-top:12px;"><strong style="font-size:12px;">WHEN · all conditions match</strong>'+((rule.conditions||[]).map((c,ci)=>'<div style="display:grid;grid-template-columns:160px 140px minmax(160px,1fr) auto;gap:8px;margin-top:7px;"><select class="filter-select" onchange="window.e8pcbConditionField('+ri+','+ci+',\'field\',this.value)">'+fieldOptions.map((f)=>'<option value="'+f+'" '+(c.field===f?'selected':'')+'>'+f+'</option>').join('')+'</select><select class="filter-select" onchange="window.e8pcbConditionField('+ri+','+ci+',\'operator\',this.value)"><option value="equals" '+(c.operator==='equals'?'selected':'')+'>Equals</option><option value="not_equals" '+(c.operator==='not_equals'?'selected':'')+'>Does not equal</option><option value="contains" '+(c.operator==='contains'?'selected':'')+'>Contains</option><option value="exists" '+(c.operator==='exists'?'selected':'')+'>Exists</option><option value="not_exists" '+(c.operator==='not_exists'?'selected':'')+'>Does not exist</option></select><input class="premium-input" value="'+escapeHtml(c.value||'')+'" placeholder="Value" oninput="window.e8pcbConditionField('+ri+','+ci+',\'value\',this.value)"><button class="secondary-btn" type="button" onclick="window.e8pcbRemoveCondition('+ri+','+ci+')">×</button></div>').join(''))+'<button type="button" class="secondary-btn" style="margin-top:7px;" onclick="window.e8pcbAddCondition('+ri+')">+ Condition</button></div>\
        <div style="margin-top:12px;"><strong style="font-size:12px;">SHOW · mappings are checked top-to-bottom per field</strong>'+((rule.items||[]).map((item,ii)=>'<div style="display:grid;grid-template-columns:120px 110px 95px 120px 115px minmax(150px,1fr) 80px auto;gap:6px;margin-top:7px;"><input class="premium-input" value="'+escapeHtml(item.field||'')+'" placeholder="field" oninput="window.e8pcbInfoItemField('+ri+','+ii+',\'field\',this.value)"><input class="premium-input" value="'+escapeHtml(item.label||'')+'" placeholder="Label" oninput="window.e8pcbInfoItemField('+ri+','+ii+',\'label\',this.value)"><select class="filter-select" onchange="window.e8pcbInfoItemField('+ri+','+ii+',\'display\',this.value)"><option value="auto" '+(item.display==='auto'?'selected':'')+'>Auto</option><option value="text" '+(item.display==='text'?'selected':'')+'>Text</option><option value="image" '+(item.display==='image'?'selected':'')+'>Image</option></select><select class="filter-select" onchange="window.e8pcbInfoItemField('+ri+','+ii+',\'matchMode\',this.value)">'+matchModes.map(([v,l])=>'<option value="'+v+'" '+((item.matchMode||'equals')===v?'selected':'')+'>'+l+'</option>').join('')+'</select><input class="premium-input" value="'+escapeHtml(item.matchValue||'')+'" placeholder="Match" oninput="window.e8pcbInfoItemField('+ri+','+ii+',\'matchValue\',this.value)"><input class="premium-input" value="'+escapeHtml(item.imageUrl||'')+'" placeholder="asset:140mg.png or URL" oninput="window.e8pcbInfoItemField('+ri+','+ii+',\'imageUrl\',this.value)"><input class="premium-input" value="'+escapeHtml(item.suffix||'')+'" placeholder="suffix" oninput="window.e8pcbInfoItemField('+ri+','+ii+',\'suffix\',this.value)"><button class="secondary-btn" type="button" onclick="window.e8pcbRemoveInfoItem('+ri+','+ii+')">×</button></div>').join(''))+'<button type="button" class="secondary-btn" style="margin-top:7px;" onclick="window.e8pcbAddInfoItem('+ri+')">+ Display mapping</button></div>\
        <div style="margin-top:10px;"><button type="button" class="secondary-btn" onclick="window.e8pcbRenderInfoPreview('+ri+')">Preview this rule</button></div>\
      </div>').join('') || '<p class="muted">No rules yet.</p>';
  };

  function previewNumeric(value){
    const m=String(value||'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):NaN;
  }
  function previewItemMatches(value,item){
    const actual=String(value||'');const expected=String(item.matchValue||'');const mode=item.matchMode||'equals';
    if(mode==='always')return true;
    if(mode==='contains')return actual.toLowerCase().includes(expected.toLowerCase());
    if(mode==='numeric_gt')return previewNumeric(actual)>Number(expected||0);
    if(mode==='numeric_gte')return previewNumeric(actual)>=Number(expected||0);
    return actual.toLowerCase()===expected.toLowerCase();
  }
  window.e8pcbRenderInfoPreview=function(index=0){
    const host=byId('preview-card');if(!host)return;
    const rule=e8pcbState?.infoRules?.[index];
    if(!rule){host.innerHTML='<div class="muted" style="padding:30px;">Add a condition rule to preview it.</div>';return;}
    const sample={product_type:'Energy',vendor:'GFUEL',tag:'DRINK',caffeine:'140mg caffeine',sugar_content:'Zero Sugar',servings:'40 Servings',capacity:'700',material:'Plastic',flavour_profile:'Tropical Citrus',title:'Sample Product'};
    const groups=new Map();(rule.items||[]).forEach((item)=>{if(!groups.has(item.field))groups.set(item.field,[]);groups.get(item.field).push(item);});
    const tokens=[];
    groups.forEach((items,field)=>{
      const value=sample[field]||'';
      const chosen=items.find((item)=>previewItemMatches(value,item));
      if(!chosen)return;
      if(chosen.display==='image'&&chosen.imageUrl){
        const asset=String(chosen.imageUrl).replace(/^asset:/,'');
        tokens.push('<span class="e8pc-nutri-chip" title="'+escapeHtml(asset)+'">'+escapeHtml(asset.replace(/\.png$/,''))+'</span>');
      }else{
        tokens.push('<span class="e8pc-nutri-chip">'+escapeHtml((chosen.label?chosen.label+': ':'')+value+(chosen.suffix||''))+'</span>');
      }
    });
    host.innerHTML='<div class="e8pc-button-demo"><div class="e8pc-button-demo-inner"><h3>'+escapeHtml(rule.name||'Condition preview')+'</h3><p>Sample product: Energy · 140mg caffeine · Zero Sugar · 40 Servings</p><div class="e8pc-demo-pill"><span>'+leafSvg()+'</span>'+tokens.join('')+'<strong>+</strong></div></div></div>';
  };

  const oldInfoItemField=window.e8pcbInfoItemField;
  window.e8pcbInfoItemField=function(ri,ii,key,value){
    const item=e8pcbState?.infoRules?.[ri]?.items?.[ii];
    if(item) item[key]=value;
    window.e8pcbRenderInfoPreview?.(ri);
  };

  const oldPromote=window.e8pcPromoteStudio;
  setTimeout(()=>{
    window.e8pcPromoteStudio?.();
    if(byId('v-product-cards')?.classList.contains('active')) window.e8pcStudioTab?.('layout');
  },0);
})();
