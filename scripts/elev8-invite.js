require('dotenv').config();
const mongoose=require('mongoose');
const {Member}=require('../src/modules/elev8BrowserAuth/model');
(async()=>{
 const [shop,email,role]=process.argv.slice(2);
 if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop||'')||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'')||!['owner','admin','editor','viewer'].includes(role))throw new Error('Usage: node scripts/elev8-invite.js STORE.myshopify.com user@example.com owner|admin|editor|viewer');
 await mongoose.connect(process.env.CORE_DB_URI||process.env.MONGODB_URI||process.env.MONGO_URI);
 await Member.findOneAndUpdate({shopDomain:shop,email:email.toLowerCase()},{$set:{role,active:true}},{upsert:true});
 console.log('ELEV8 member invitation authorised:',shop,email,role);
 await mongoose.disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
