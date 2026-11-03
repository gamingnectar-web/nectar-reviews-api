const assert=require('node:assert/strict');
const {specRows}=require('../src/modules/product-creation-import/services/packBreakdown.service.js');
const base={options:[{name:'Size'},{name:'Flavour'}],variants:[
  {included:true,sourceVariantId:'1',sku:'A-BOX',options:[{name:'Size',value:'20 Sticks'},{name:'Flavour',value:'Cherry Fizz'}],packBreakdown:{enabled:true,unitsPerPack:20,singlePrice:'1.99'}},
  {included:true,sourceVariantId:'2',sku:'B-BOX',options:[{name:'Size',value:'20 Sticks'},{name:'Flavour',value:'Rainbow Candy'}],packBreakdown:{enabled:true,unitsPerPack:20,singlePrice:'1.99'}}
]};
assert.equal(specRows(base).components.length,2);
assert.equal(specRows(base).rows[0].count,20);
assert.throws(()=>specRows({...base,variants:[{...base.variants[0],packBreakdown:{enabled:true,unitsPerPack:0,singlePrice:'1.99'}}]}),/Invalid pack/);
console.log('Native pack breakdown input checks passed.');
