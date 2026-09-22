const routes=require('./settingsCenter.routes');

function mountSettingsCenterModule(app,deps={}){
  const requireAdminSession=deps.requireAdminSession||((_req,_res,next)=>next());
  const makeRateLimiter=deps.makeRateLimiter||((_opts)=>(_req,_res,next)=>next());
  app.use(
    '/api/admin/settings-center',
    makeRateLimiter({windowMs:60*1000,max:120,keyPrefix:'settings-center'}),
    requireAdminSession,
    routes
  );
}
function startSettingsCenterJobs(){return null}
module.exports={mountSettingsCenterModule,startSettingsCenterJobs};
