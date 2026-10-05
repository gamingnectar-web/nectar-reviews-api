#!/usr/bin/env bash
set -euo pipefail

FILE="public/supplier-sites-admin.js"
[ -f "$FILE" ] || { echo "ERROR: Run from repo root; missing $FILE"; exit 1; }

python3 - <<'PY'
from pathlib import Path

p = Path("public/supplier-sites-admin.js")
s = p.read_text()

if "async function runInitialSitePass(" not in s:
    marker = "  async function createSite(){"
    if marker not in s:
        raise SystemExit("Could not find createSite() in supplier-sites-admin.js")

    helper = """  async function runInitialSitePass(batchId){
    // A site scrape is one deliberate user command.
    // Every discovered product may be attempted once during this command.
    // Nothing retries automatically after this function finishes.
    const attempted=new Set();
    let processed=0;
    let failed=0;

    while(true){
      const latest=await api(`/batches/${batchId}`);
      state.activeBatch=latest.batch;
      renderProducts();

      // Initial pass includes queued sitemap discoveries and needs_review
      // structured Shopify products so each gets normal merchant-catalogue
      // enrichment exactly once.
      // Failed products are deliberately excluded here.
      const target=(state.activeBatch.items||[]).find(item =>
        ['queued','needs_review'].includes(item.status) &&
        !attempted.has(item.itemId) &&
        item.status!=='created'
      );

      if(!target) break;
      attempted.add(target.itemId);

      const remaining=(state.activeBatch.items||[]).filter(item =>
        ['queued','needs_review'].includes(item.status) &&
        !attempted.has(item.itemId)
      ).length;
      const total=attempted.size+remaining;

      const label=target.draft?.title || target.title || target.sourceUrl || target.itemId;
      setStatus(
        `Initial scrape ${attempted.size} of ${total}: ${esc(label)}. Each product is attempted once only; AI is off.`,
        'warn'
      );

      try{
        const result=await api(`/batches/${batchId}/scan`,{
          method:'POST',
          body:JSON.stringify({
            itemIds:[target.itemId],
            limit:1,
            processAll:false,
            useAi:false
          })
        });
        state.activeBatch=result.batch;
        const row=(result.results||[]).find(x=>x.itemId===target.itemId);
        if(row?.status==='failed') failed+=1;
        else processed+=1;
      }catch(error){
        failed+=1;
        console.warn('[Supplier Sites] initial product scrape failed',target.itemId,error);
      }

      renderProducts();
      await new Promise(resolve=>setTimeout(resolve,100));
    }

    await openBatch(batchId);
    const remainingFailed=(state.activeBatch.items||[]).filter(i=>i.status==='failed').length;

    if(remainingFailed){
      setStatus(
        `Initial scrape finished. ${processed} product(s) processed and ${remainingFailed} failed. Failed products will not retry automatically — press Run one pass only if you want to retry them.`,
        'warn'
      );
    }else{
      setStatus(
        `Initial scrape finished. ${processed} product(s) processed once. No automatic retries will run.`,
        'ok'
      );
    }
  }

"""
    s = s.replace(marker, helper + marker)

old = """      state.activeBatch=data.batch;
      await loadSites();
      await openBatch(data.batch._id);"""

new = """      state.activeBatch=data.batch;
      await loadSites();
      await openBatch(data.batch._id);
      await runInitialSitePass(data.batch._id);"""

if old in s:
    s = s.replace(old, new)
elif "await runInitialSitePass(data.batch._id);" not in s:
    raise SystemExit("Could not patch createSite() completion block")

p.write_text(s)
print("Restored initial one-shot supplier scrape")
PY

node --check public/supplier-sites-admin.js

echo
echo "Running deploy preflight..."
npm run deploy:preflight

echo
echo "Supplier site initial scrape repaired."
echo "Commit with:"
echo "  git add public/supplier-sites-admin.js"
echo '  git commit -m "Restore one-shot supplier site scraping"'
echo "  git push origin clean-main"
