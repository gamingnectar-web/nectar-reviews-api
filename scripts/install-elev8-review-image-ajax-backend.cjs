const fs=require('fs'),path=require('path');
const file=path.join(process.cwd(),'src','routes','manualReviewImageImports.js');
if(!fs.existsSync(file))throw new Error(`Missing ${file}`);
let src=fs.readFileSync(file,'utf8');

const old=`    if(body.matchedProduct!==undefined)item.matchedProduct=body.matchedProduct||null;
    if(body.draft)item.draft={...item.draft,...normaliseDraft({...item.draft,...body.draft})};
    item.status=item.matchedProduct?(item.matchedProduct.isVault?'vault_ready':'ready'):'needs_mapping';`;

const neu=`    if(body.matchedProduct!==undefined)item.matchedProduct=body.matchedProduct||null;
    if(body.draft)item.draft={...item.draft,...normaliseDraft({...item.draft,...body.draft})};
    if(body.addedToManualDraft!==undefined)item.addedToManualDraft=Boolean(body.addedToManualDraft);
    if(body.manualReviewBatchId!==undefined)item.manualReviewBatchId=cleanText(body.manualReviewBatchId||'',120);
    if(body.manualReviewSavedAt!==undefined){
      const savedAt=new Date(body.manualReviewSavedAt);
      item.manualReviewSavedAt=Number.isNaN(savedAt.getTime())?new Date():savedAt;
    }
    item.status=item.addedToManualDraft?'drafted':(item.matchedProduct?(item.matchedProduct.isVault?'vault_ready':'ready'):'needs_mapping');`;

if(!src.includes(old))throw new Error('Expected image item PATCH block not found');
src=src.replace(old,neu);
fs.writeFileSync(file,src);
console.log('✓ Image batch now remembers which reviews were added to Manual Drafts');
