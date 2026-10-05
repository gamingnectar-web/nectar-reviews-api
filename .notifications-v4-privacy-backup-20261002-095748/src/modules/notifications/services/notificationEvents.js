const nodemailer=require('nodemailer');
const { EmailProviderSettings }=require('../../../models');
const { decryptSecret }=require('../../../utils/crypto');
const NotificationEvent=require('../models/NotificationEvent');

async function createEvent(input){
  try{return await NotificationEvent.create(input)}catch(error){if(error?.code===11000)return null;throw error}
}

async function sendEventEmail(event){
  if(!event?.email) return false;
  const settings=await EmailProviderSettings.findOne({shopDomain:event.shopDomain,enabled:true}).lean();
  if(!settings?.smtpHost||!settings?.fromEmail||!settings?.smtpPassEncrypted) return false;
  const transporter=nodemailer.createTransport({
    host:settings.smtpHost,port:Number(settings.smtpPort||587),secure:settings.secureMode==='ssl',requireTLS:settings.secureMode==='starttls',
    auth:{user:settings.smtpUser,pass:decryptSecret(settings.smtpPassEncrypted)}
  });
  const title=String(event.title||'ELEV8 notification').replace(/[<>]/g,'');
  const body=String(event.body||'').replace(/[<>]/g,'');
  const url=String(event.url||'');
  await transporter.sendMail({from:`"${settings.fromName||'ELEV8'}" <${settings.fromEmail}>`,to:event.email,replyTo:settings.replyToEmail||undefined,subject:title,text:`${body}${url?`\n\n${url}`:''}`,html:`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto"><h2>${title}</h2><p>${body}</p>${url?`<p><a href="${url}">View details</a></p>`:''}</div>`});
  event.delivered.email=true;event.deliveredAt=new Date();await event.save();return true;
}
module.exports={createEvent,sendEventEmail};
