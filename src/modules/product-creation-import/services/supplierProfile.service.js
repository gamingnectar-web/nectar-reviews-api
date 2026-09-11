const { isXZeroUrl, applyXZeroProfile } = require('./supplierProfiles/xZero.profile');
function profileForUrl(url=''){ return isXZeroUrl(url) ? 'x-zero' : ''; }
function applySupplierProfile(draft={}){ return profileForUrl(draft.sourceUrl || draft.url || '') === 'x-zero' ? applyXZeroProfile(draft) : draft; }
function supplierDefaultsForUrl(url=''){ return profileForUrl(url)==='x-zero' ? { supplierName:'X-Zero', supplierUrl:'https://x-zero.co.uk/', brand:'X-Zero', vendor:'X-Zero', handleLocation:'uk' } : {}; }
module.exports = { profileForUrl, applySupplierProfile, supplierDefaultsForUrl };
