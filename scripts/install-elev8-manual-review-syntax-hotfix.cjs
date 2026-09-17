const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'public', 'manual-review-import.js');
if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);

let src = fs.readFileSync(file, 'utf8');

const broken = "row.querySelectorAll('input[type=range]').forEach(input=>input.oninput=()=>{input.closest('.mr-score-control')?.querySelector('.mr-val').textContent=input.value});";
const fixed = `row.querySelectorAll('input[type=range]').forEach(input=>input.oninput=()=>{
      const valueNode=input.closest('.mr-score-control')?.querySelector('.mr-val');
      if(valueNode)valueNode.textContent=input.value;
    });`;

if (!src.includes(broken)) {
  throw new Error('Expected broken optional-chaining assignment was not found. Refusing to patch a different file shape.');
}

src = src.replace(broken, fixed);
fs.writeFileSync(file, src);

console.log('✓ Fixed invalid optional-chaining assignment in manual-review-import.js');
