const fs=require('fs'),path=require('path');

const file=path.join(process.cwd(),'public','manual-review-import.js');
if(!fs.existsSync(file))throw new Error(`Missing ${file}`);
let src=fs.readFileSync(file,'utf8');

// 1) Previous installer accidentally wrote the two characters "\\n" into JS source.
src=src.replace(
  "$('mr-save').onclick=()=>saveBatch({continueAdding:false});\\n    $('mr-save-add').onclick=()=>saveBatch({continueAdding:true});",
  "$('mr-save').onclick=()=>saveBatch({continueAdding:false});\n    $('mr-save-add').onclick=()=>saveBatch({continueAdding:true});"
);

// 2) Fast-entry continuation state is referenced later but was not declared in the live file.
if(!src.includes("let activeManualBatchId=''")){
  const marker="  const esc=v=>String(v??'').replace(/[&<>\\\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\\"':'&quot;',\"'\":'&#39;'}[m]));";
  if(!src.includes(marker))throw new Error('Could not locate manual-review helper header.');
  src=src.replace(marker,`${marker}\n  let activeManualBatchId='';`);
}

// 3) Both footer save actions belong only on Add Reviews, not Draft Batches.
const switchOld="    $('mr-save').style.display=name==='add'?'inline-flex':'none';";
const switchNew="    $('mr-save').style.display=name==='add'?'inline-flex':'none';\n    $('mr-save-add').style.display=name==='add'?'inline-flex':'none';";
if(src.includes(switchOld)&&!src.includes("$('mr-save-add').style.display"))src=src.replace(switchOld,switchNew);

// 4) Starting a brand-new modal should start a fresh batch. Repeated Save & add another
//    calls within that modal still keep the same batch id.
const modalMarker="  function modal(){\n    $('mr-backdrop')?.remove();";
if(src.includes(modalMarker)&&!src.includes("function modal(){\n    activeManualBatchId=''")){
  src=src.replace(
    modalMarker,
    "  function modal(){\n    activeManualBatchId='';\n    $('mr-backdrop')?.remove();"
  );
}

fs.writeFileSync(file,src);
console.log('✓ Replaced literal \\\\n with a real newline');
console.log('✓ Declared activeManualBatchId');
console.log('✓ Save & add another is hidden on Draft Batches');
console.log('✓ Each new Manual Add modal starts a fresh batch');
