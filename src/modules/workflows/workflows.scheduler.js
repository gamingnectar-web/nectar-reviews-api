const { Workflow, WorkflowRun } = require('./workflows.models');
const { queueWorkflow, executeRun } = require('./workflows.engine');

let timer = null;
let busy = false;

async function processQueued() {
  if (busy) return;
  busy = true;
  try {
    const now = new Date();
    const runs = await WorkflowRun.find({ status: 'queued', scheduledFor: { $lte: now } }).sort({ scheduledFor: 1 }).limit(20);
    for (const run of runs) {
      const claimed = await WorkflowRun.findOneAndUpdate(
        { _id: run._id, status: 'queued' },
        { $set: { status: 'running', startedAt: new Date() } },
        { new: true }
      );
      if (!claimed) continue;
      await executeRun(claimed);
    }

    const scheduled = await Workflow.find({ enabled: true, 'trigger.kind': 'schedule', 'trigger.everyMinutes': { $gt: 0 } }).limit(100);
    for (const workflow of scheduled) {
      const everyMs = Math.max(1, Number(workflow.trigger.everyMinutes)) * 60 * 1000;
      if (workflow.lastScheduledAt && (now.getTime() - new Date(workflow.lastScheduledAt).getTime()) < everyMs) continue;
      await Workflow.updateOne(
        { _id: workflow._id, $or: [{ lastScheduledAt: workflow.lastScheduledAt }, { lastScheduledAt: null }] },
        { $set: { lastScheduledAt: now } }
      );
      await queueWorkflow(workflow, { resourceType: 'schedule', resourceId: '', scheduledAt: now.toISOString() }, 'schedule');
    }
  } catch (error) {
    console.error('[ELEV8 Workflows] worker error', error);
  } finally {
    busy = false;
  }
}

function startWorkflowWorker() {
  if (timer) return timer;
  timer = setInterval(processQueued, 10000);
  timer.unref?.();
  setTimeout(processQueued, 1500).unref?.();
  console.info('[ELEV8 Workflows] worker started');
  return timer;
}

function stopWorkflowWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { processQueued, startWorkflowWorker, stopWorkflowWorker };
