(function () {
  var apiBase = window.NECTAR_API_BASE || 'https://nectar-reviews-api.onrender.com/api';
  window.NECTAR_API_BASE = apiBase.replace(/\/$/, '');
  if (!document.querySelector('[data-nectar-reviews], .rev-widget, .nectar-reviews-widget')) return;
  var script = document.createElement('script');
  script.src = window.NECTAR_API_BASE.replace(/\/api$/, '') + '/review-widget.js';
  script.defer = true;
  script.setAttribute('data-api-base', window.NECTAR_API_BASE);
  document.head.appendChild(script);
})();
