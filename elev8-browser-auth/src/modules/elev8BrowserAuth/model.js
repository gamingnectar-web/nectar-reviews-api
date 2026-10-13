const mongoose = require('mongoose');
const memberSchema = new mongoose.Schema({
  shopDomain: {type:String,required:true}, email: {type:String,required:true},
  role:{type:String,enum:['owner','admin','editor','viewer'],required:true},
  active:{type:Boolean,default:true}, shopifyUserId:{type:String,default:''}
},{timestamps:true});
memberSchema.index({shopDomain:1,email:1},{unique:true});
memberSchema.index({shopDomain:1,shopifyUserId:1},{sparse:true});
const challengeSchema = new mongoose.Schema({
  tokenHash:{type:String,required:true,unique:true}, memberId:{type:mongoose.Schema.Types.ObjectId,required:true},
  expiresAt:{type:Date,required:true}, consumedAt:{type:Date,default:null}
},{timestamps:true});
challengeSchema.index({expiresAt:1},{expireAfterSeconds:0});
const sessionSchema = new mongoose.Schema({
  tokenHash:{type:String,required:true,unique:true}, memberId:{type:mongoose.Schema.Types.ObjectId,required:true},
  shopDomain:{type:String,required:true}, expiresAt:{type:Date,required:true},
  revokedAt:{type:Date,default:null},lastSeenAt:{type:Date,default:null},
  userAgentHash:{type:String,default:''}
},{timestamps:true});
sessionSchema.index({expiresAt:1},{expireAfterSeconds:0});
module.exports={
 Member:mongoose.models.Elev8Member || mongoose.model('Elev8Member',memberSchema),
 Challenge:mongoose.models.Elev8Challenge || mongoose.model('Elev8Challenge',challengeSchema),
 Session:mongoose.models.Elev8Session || mongoose.model('Elev8Session',sessionSchema)
};
