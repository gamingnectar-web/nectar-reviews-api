const { processNotificationsBatch }=require('../services/notificationEngine');
let timer=null,running=false;
async function run(){if(running)return;running=true;try{await processNotificationsBatch(Number(process.env.ELEV8_NOTIFICATION_BATCH||50))}catch(e){console.warn('[notifications] scheduler:',e.message)}finally{running=false}}
function startNotificationScheduler(){if(timer)return timer;const minutes=Math.max(5,Number(process.env.ELEV8_NOTIFICATION_POLL_MINUTES||15));setTimeout(run,30000);timer=setInterval(run,minutes*60000);return timer}
function stopNotificationScheduler(){if(timer)clearInterval(timer);timer=null}
module.exports={startNotificationScheduler,stopNotificationScheduler,runNotificationScheduler:run};
