async function processAutomatedSiteImports() {
  return { disabled: true, reason: 'manual-only supplier imports' };
}
function startSiteImportAutomation() { return null; }
module.exports = { startSiteImportAutomation, processAutomatedSiteImports };
