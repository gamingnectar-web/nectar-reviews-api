const adminRoutes=require('./routes/admin.routes');
const storefrontRoutes=require('./routes/storefront.routes');
const { startNotificationScheduler,stopNotificationScheduler }=require('./jobs/notificationScheduler');

// The newer Restock Notifications Center owns /api/admin/notifications.
// Keep the original tracking/account module available under a legacy admin path
// so its storefront feed, tracking and historical controls remain intact without
// shadowing the canonical Notifications Center routes.
function mountNotificationsModule(app,deps={}){
  const requireAdminSession=deps.requireAdminSession||((_r,_s,n)=>n());
  const makeRateLimiter=deps.makeRateLimiter||((_o)=>(_r,_s,n)=>n());
  app.use('/api/admin/notifications-legacy',makeRateLimiter({windowMs:60000,max:120,keyPrefix:'notifications-legacy-admin'}),requireAdminSession,adminRoutes);
  app.use('/api/elev8/proxy',makeRateLimiter({windowMs:60000,max:120,keyPrefix:'notifications-storefront'}),storefrontRoutes);
}
function startNotificationsJobs(){if(String(process.env.ELEV8_NOTIFICATIONS_DISABLED||'').toLowerCase()==='true')return null;return startNotificationScheduler()}
module.exports={mountNotificationsModule,startNotificationsJobs,stopNotificationScheduler};
