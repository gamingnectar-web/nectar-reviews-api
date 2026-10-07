'use strict';
const assert = require('assert');
const { diffTags, diffLineItems, diffAttributes, triggerMatch } = require('../src/modules/workflows/workflows.service');
const { evaluateCondition, deepTemplate } = require('../src/modules/workflows/workflows.engine');

assert.deepStrictEqual(diffTags(['a','b'],['b','c']), { added:['c'], removed:['a'] });
assert.strictEqual(diffLineItems([{id:1,quantity:1,price:10}],[{id:1,quantity:2,price:10}]).changedCount,1);
assert.strictEqual(diffAttributes([{name:'gift',value:'no'}],[{name:'gift',value:'yes'}])[0].current,'yes');
assert.strictEqual(evaluateCondition({path:'resource.total',operator:'gt',value:5},{resource:{total:10}}),true);
assert.strictEqual(deepTemplate('Hi {{resource.name}}',{resource:{name:'Dan'}}),'Hi Dan');
const match = triggerMatch(
  {trigger:{kind:'field_changed',resourceType:'product',fieldPath:'title'}},
  {resourceType:'product',before:{title:'A'},resource:{title:'B'}}
);
assert.strictEqual(match.current,'B');
console.log('ELEV8 Workflows smoke test passed.');
