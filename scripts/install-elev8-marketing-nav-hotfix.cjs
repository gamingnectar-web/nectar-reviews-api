const fs=require('fs'),path=require('path');
const file=path.join(process.cwd(),'public','elev8-context-nav.js');
if(!fs.existsSync(file))throw new Error(`Missing ${file}`);
let src=fs.readFileSync(file,'utf8');

const oldMap=`      loyalty:['Loyalty'],
      settings:['Settings'],`;
const newMap=`      loyalty:['Loyalty'],
      marketing:['Marketing Intelligence'],
      settings:['Settings'],`;

if(src.includes(oldMap)){
  src=src.replace(oldMap,newMap);
}else if(!src.includes("marketing:['Marketing Intelligence']")){
  throw new Error('Could not find ELEV8 context navigation module map.');
}

const oldContext=`        else if(text.startsWith('loyalty'))document.body.dataset.e8Context='loyalty';`;
const newContext=`        else if(text.startsWith('loyalty'))document.body.dataset.e8Context='loyalty';
        else if(text.startsWith('marketing intelligence'))document.body.dataset.e8Context='marketing';`;

if(src.includes(oldContext)){
  src=src.replace(oldContext,newContext);
}else if(!src.includes("e8Context='marketing'")){
  throw new Error('Could not find ELEV8 sidebar context mapping.');
}

fs.writeFileSync(file,src);
console.log('✓ Marketing Intelligence added to ELEV8 home tile routing');
console.log('✓ Marketing Intelligence added to sidebar context routing');
