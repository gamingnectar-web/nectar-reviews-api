const fs=require('fs'),path=require('path');
const file=path.join(process.cwd(),'public','manual-review-import.js');
if(!fs.existsSync(file))throw new Error(`Missing ${file}`);
let src=fs.readFileSync(file,'utf8');

const oldFn=`  function injectButton(){
    const headings=[...document.querySelectorAll('h1,h2,h3')];
    const heading=headings.find(h=>/review manager/i.test(h.textContent||''));
    if(!heading||$('mr-open'))return;
    const btn=document.createElement('button');btn.id='mr-open';btn.type='button';btn.className='mr-open';btn.textContent='+ Manual Add';
    btn.onclick=modal;
    const parent=heading.parentElement;
    if(parent){parent.classList.add('mr-titlebar');parent.appendChild(btn)}
  }`;

const newFn=`  function injectButton(){
    const headings=[...document.querySelectorAll('h1,h2,h3')];
    const heading=headings.find(h=>/review manager/i.test(h.textContent||''));
    if(!heading||$('mr-open'))return;

    const view=heading.closest('.view')||heading.parentElement?.parentElement||document;
    const tabButtons=[...view.querySelectorAll('button')].filter(btn=>{
      const text=String(btn.textContent||'').replace(/\\\\s+/g,' ').trim().toLowerCase();
      return ['reviews','approval rules','trash'].includes(text);
    });

    const btn=document.createElement('button');
    btn.id='mr-open';
    btn.type='button';
    btn.className='mr-open mr-open-inline';
    btn.textContent='+ Manual Add';
    btn.onclick=modal;

    if(tabButtons.length){
      const tabsParent=tabButtons[0].parentElement;
      if(tabsParent){
        tabsParent.classList.add('mr-review-tabs-row');
        tabsParent.appendChild(btn);
        return;
      }
    }

    const parent=heading.parentElement;
    if(parent){
      parent.classList.add('mr-titlebar');
      parent.appendChild(btn);
    }
  }`;

if(!src.includes(oldFn))throw new Error('Could not find existing injectButton() block');
src=src.replace(oldFn,newFn);

src=src.replace(
  `.mr-titlebar{display:flex!important;align-items:center;justify-content:space-between;gap:12px}.mr-open,.mr-primary`,
  `.mr-titlebar{display:flex!important;align-items:center;justify-content:space-between;gap:12px}.mr-review-tabs-row{display:flex!important;align-items:center!important;gap:18px!important;flex-wrap:wrap}.mr-review-tabs-row .mr-open-inline{margin-left:auto!important;white-space:nowrap}.mr-open,.mr-primary`
);

fs.writeFileSync(file,src);
console.log('✓ Moved Manual Add into the Review Manager tab row');
