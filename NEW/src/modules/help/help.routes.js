const express = require('express');
const { helpContent } = require('./help-content');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ topics: helpContent });
});

router.get('/:key', (req, res) => {
  const topic = helpContent.find((entry) => entry.key === req.params.key);
  if (!topic) return res.status(404).json({ error: 'Help topic not found.' });
  res.json({ topic });
});

module.exports = router;
