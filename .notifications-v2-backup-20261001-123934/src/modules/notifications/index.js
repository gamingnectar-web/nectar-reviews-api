const adminRoutes=require('./routes/admin.routes');
const storefrontRoutes=require('./routes/storefront.routes');
const { startNotificationScheduler,stopNotificationScheduler }=require('./jobs/notificationScheduler');
function mountNotificationsModule(app,deps={}){const requireAdminSession=deps.requireAdminSession||((_r,_s,n)=>n());const makeRateLimiter=deps.makeRateLimiter||((_o)=>(_r,_s,n)=>n());app.use('/api/admin/notifications',makeRateLimiter({windowMs:60000,max:120,keyPrefix:'notifications-admin'}),requireAdminSession,adminRoutes);app.use('/api/elev8/proxy',makeRateLimiter({windowMs:60000,max:120,keyPrefix:'notifications-storefront'}),storefrontRoutes)}
function startNotificationsJobs(){if(String(process.env.ELEV8_NOTIFICATIONS_DISABLED||'').toLowerCase()==='true')return null;return startNotificationScheduler()}
module.exports={mountNotificationsModule,startNotificationsJobs,stopNotificationScheduler};
