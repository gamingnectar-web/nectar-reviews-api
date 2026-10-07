const { Workflow, WorkflowRun, WorkflowLease } = require('./workflows.models');
const { queueWorkflow, executeRun } = require('./workflows.engine');

let timer = null;
let busy = false;

const leaseOwner = `${process.env.RENDER_INSTANCE_ID || process.env.HOSTNAME || 'local'}:${process.pid}`;

async function acquireLease() {
  const now = new Date();
  const lockedUntil = new Date(Date.now() + 45000);
  let lease = await WorkflowLease.findOneAndUpdate(
    { key: 'workflow-worker', lockedUntil: { $lte: now } },
    { $set: { owner: leaseOwner, lockedUntil } },
    { new: true }
  );
  if (lease) return true;
  try {
    await WorkflowLease.create({ key: 'workflow-worker', owner: leaseOwner, lockedUntil });
    return true;
  } catch (error) {
    if (error?.code === 11000) return false;
    throw error;
  }
}

async function releaseLease() {
  await WorkflowLease.updateOne(
    { key: 'workflow-worker', owner: leaseOwner },
    { $set: { lockedUntil: new Date() } }
  ).catch(() => {});
}

async function processQueued() {
  if (busy) return;
  busy = true;
  let leased = false;
  try {
    leased = await acquireLease();
    if (!leased) return;
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
    if (leased) await releaseLease();
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
