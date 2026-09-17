# Manual Review Syntax Hotfix

Render failed because JavaScript optional chaining cannot appear on the left side of an assignment.

Broken:

```js
input.closest('.mr-score-control')?.querySelector('.mr-val').textContent = input.value
```

Fixed:

```js
const valueNode = input.closest('.mr-score-control')?.querySelector('.mr-val');
if (valueNode) valueNode.textContent = input.value;
```

No feature logic is removed. AI title generation, individual score toggles, import reasons, and historical editing remain intact.
