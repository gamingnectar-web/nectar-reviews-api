require('dotenv').config();
const mongoose=require('mongoose');
const {connectDb}=require('../src/config/db');
const {Settings}=require('../src/models');

(async()=>{
  await connectDb();
  const result=await Settings.updateMany(
    {
      $or:[
        {'reviewAutomation.delayDays':{$exists:false}},
        {'reviewAutomation.delayDays':14}
      ]
    },
    {$set:{'reviewAutomation.delayDays':7}}
  );
  console.log(`✓ Review delay migrated to 7 days for ${result.modifiedCount||0} settings document(s).`);
  await mongoose.connection.close();
})().catch(async(error)=>{
  console.error(error);
  try{await mongoose.connection.close()}catch(_){}
  process.exit(1);
});
