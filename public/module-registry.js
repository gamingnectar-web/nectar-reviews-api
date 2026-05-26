/* Nectar admin module registry. */
(function NectarModuleRegistry() {
  window.NECTAR_MODULES = [
    { id:'reviews', productSlug:'review-widget', label:'review-widget', description:'Reviews dashboard, review manager, messaging, import and visual customiser.', adminFolder:'/modules/reviews', legacy:true, defaultModule:true },
    { id:'loyalty', productSlug:'loyalty', label:'Loyalty', description:'Points, tiers, rewards, customer userboard and checkout redemption.', adminFolder:'/modules/loyalty', legacy:true },
    { id:'discounts', productSlug:'discounts', label:'Discounts', description:'Shared discount templates and issued codes for reviews, loyalty and cart rewards.', adminFolder:'/modules/discounts', legacy:true },
    { id:'cart-rewards', productSlug:'cart-rewards', label:'Cart Rewards', description:'Cart drawer, cart page and checkout reward milestones.', adminFolder:'/modules/cart-rewards', css:'/modules/cart-rewards/admin.css', script:'/modules/cart-rewards/admin.js' },
    { id:'referrals', productSlug:'referrals', label:'Referrals', description:'Referral links, friend offers and attribution. Coming soon.', adminFolder:'/modules/referrals', legacy:true }
  ];
})();
