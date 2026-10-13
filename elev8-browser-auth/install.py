#!/usr/bin/env python3
"""Run inside the GitHub Codespace repo root. Additive, disabled by default."""
from pathlib import Path
import shutil

root=Path.cwd()
source=Path(__file__).resolve().parent
app=root/'src/app.js'
if not app.exists():raise SystemExit('Run this installer at the nectar-reviews-api repository root')
s=app.read_text()
needle="const elev8Workflows = require('./modules/workflows');"
addition="""const elev8BrowserAuth = require('./modules/elev8BrowserAuth');
// Browser identities are checked first; existing Shopify auth remains the fallback.
function hybridAdminSession(req,res,next) {
  elev8BrowserAuth.browserAdminMiddleware(req,res,(error)=>{
    if(error)return next(error);
    if(req.adminAuthMode === 'elev8-browser')return next();
    return requireAdminSession(req,res,next);
  });
}
"""
if 'const elev8BrowserAuth =' not in s:
 if s.count(needle)!=1:raise SystemExit('Unexpected src/app.js structure: workflows import')
 s=s.replace(needle,needle+'\n'+addition,1)
# Switch all app-level guards to hybrid, preserving legacy function in wrapper.
s=s.replace('requireAdminSession, brandDirectory', 'hybridAdminSession, brandDirectory')
s=s.replace('requireAdminSession, elev8Commerce', 'hybridAdminSession, elev8Commerce')
s=s.replace('requireAdminSession, manualReview', 'hybridAdminSession, manualReview')
s=s.replace('requireAdminSession, brandRules', 'hybridAdminSession, brandRules')
s=s.replace('requireAdminSession, elev8Dashboard', 'hybridAdminSession, elev8Dashboard')
s=s.replace('requireAdminSession, notificationsAdmin', 'hybridAdminSession, notificationsAdmin')
s=s.replace('requireAdminSession, aiEmail', 'hybridAdminSession, aiEmail')
s=s.replace('requireAdminSession, emailModule', 'hybridAdminSession, emailModule')
s=s.replace('requireAdminSession, brandDirectoryDirect', 'hybridAdminSession, brandDirectoryDirect')
s=s.replace('makeRateLimiter, requireAdminSession });','makeRateLimiter, requireAdminSession: hybridAdminSession });')
s=s.replace('app.patch(\'/api/reviews/:id\', requireAdminSession,','app.patch(\'/api/reviews/:id\', hybridAdminSession,')
s=s.replace('app.post(\'/api/reviews/import\', requireAdminSession,','app.post(\'/api/reviews/import\', hybridAdminSession,')
# Ensure the routes that rely on the adminRoutes own middleware are separately guarded by hybrid.
s=s.replace("app.use('/api/admin', adminRoutes);","app.use('/api/admin', hybridAdminSession, adminRoutes);")
# Mount browser auth before HTML pages and API routes.
anchor="app.get('/admin', async (req, res, next) => {"
if s.count(anchor)!=1:raise SystemExit('Expected one admin entry')
s=s.replace(anchor,"app.use('/elev8', elev8BrowserAuth.router);\n"+anchor,1)
# Add direct browser session support into admin entry before legacy direct-access logic.
marker="    const shopDomain = cleanShopDomain(req.query.shop || req.query.shopDomain || '');"
marker2="    const launchShop = cleanShopDomain(req.query.shop || req.query.shopDomain || '');"
if marker2 in s:
 # previous browser guard code exists; direct navigation without shop needs browser session check first
 old="    // Direct visits require an existing authenticated admin cookie."
 if old in s:
  s=s.replace(old,"""    if (elev8BrowserAuth.featureEnabled()) {
      const browserAuth = await elev8BrowserAuth.browserSession(req);
      if (browserAuth && !req.query.shop && !req.query.shopDomain) {
        return res.redirect(302, `/admin?shop=${encodeURIComponent(browserAuth.member.shopDomain)}`);
      }
    }
    // Direct visits require an existing authenticated admin cookie.""",1)
elif marker in s:
 s=s.replace(marker,"""    if (elev8BrowserAuth.featureEnabled()) {
      const browserAuth = await elev8BrowserAuth.browserSession(req);
      if (browserAuth && !req.query.shop && !req.query.shopDomain) {
        return res.redirect(302, `/admin?shop=${encodeURIComponent(browserAuth.member.shopDomain)}`);
      }
    }
"""+marker,1)
else:raise SystemExit('Unexpected admin entry structure')
# No existing auth case must redirect to login only if there is no shop param and feature is enabled.
# Browser session is not auto-authorized on the basis of a stored Shopify shop token.
app.write_text(s)
for name in ['src/modules/elev8BrowserAuth/model.js','src/modules/elev8BrowserAuth/index.js','scripts/elev8-invite.js']:
 dest=root/name
 if dest.exists():raise SystemExit(f'Already exists: {name}; review manually')
 dest.parent.mkdir(parents=True,exist_ok=True)
 shutil.copyfile(source/name,dest)
print('Installed browser identity module (disabled by default). Review git diff.')
