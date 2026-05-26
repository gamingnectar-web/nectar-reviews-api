const express = require('express');

module.exports = function helpRoutes() {
  const router = express.Router();

  router.get('/checklist', (req, res) => {
    res.json({
      checklist: [
        { key: 'install', label: 'Install the Shopify app and complete OAuth', done: true },
        { key: 'modules', label: 'Enable only the modules this merchant needs', done: true },
        { key: 'widget', label: 'Add the storefront review widget script to the theme', done: false },
        { key: 'tokens', label: 'Use signed one-use links for verified review requests', done: false },
        { key: 'campaigns', label: 'Create calendar campaigns for rewards or review collection', done: false }
      ]
    });
  });

  router.get('/articles', (req, res) => {
    res.json({
      articles: [
        { title: 'How modules work', body: 'Each product area lives inside src/modules/<module-key> and can be replaced as a whole folder.' },
        { title: 'How merchant toggles work', body: 'Per-shop module toggles are stored in core settings and filter both admin navigation and API access.' },
        { title: 'How verified reviews work', body: 'Storefront reviews are unverified. Only signed one-use links, merchant imports or manual admin actions can mark reviews as verified.' }
      ]
    });
  });

  return router;
};
