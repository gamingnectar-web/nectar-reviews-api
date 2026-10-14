'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;
const opts = { timestamps: true, versionKey: false };
const workspace = new Schema({
  name: { type: String, required: true, maxlength: 120 },
  ownerMemberId: { type: Schema.Types.ObjectId, required: true, index: true },
  status: { type: String, enum: ['active', 'disabled'], default: 'active' }
}, opts);
const membership = new Schema({
  workspaceId: { type: Schema.Types.ObjectId, required: true, index: true },
  memberId: { type: Schema.Types.ObjectId, required: true, index: true },
  role: { type: String, enum: ['owner','admin','editor','viewer'], required: true },
  active: { type: Boolean, default: true }
}, opts);
membership.index({workspaceId:1,memberId:1},{unique:true});
const connection = new Schema({
  workspaceId: { type: Schema.Types.ObjectId, required: true, index: true },
  shopDomain: { type: String, required: true },
  state: { type: String, enum: ['requested','verified','disconnected'], default: 'requested' },
  requestedBy: { type: Schema.Types.ObjectId, required: true },
  verifiedBy: { type: Schema.Types.ObjectId, default: null },
  verifiedAt: { type: Date, default: null },
  approvedScopes: { type: [String], default: [] },
  connectionReference: { type: String, default: '' }
}, opts);
connection.index({workspaceId:1,shopDomain:1},{unique:true});
const proposal = new Schema({
  workspaceId: { type: Schema.Types.ObjectId, required: true, index: true },
  connectionId: { type: Schema.Types.ObjectId, required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, required: true },
  title: { type: String, required: true, maxlength: 160 },
  kind: { type: String, enum: ['product','seo','campaign','discount','inventory','other'], required: true },
  resourceGid: { type: String, default: '', maxlength: 256 },
  original: { type: Schema.Types.Mixed, default: {} },
  proposed: { type: Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['draft','submitted','approved','rejected','cancelled'], default: 'draft' },
  reviewedBy: { type: Schema.Types.ObjectId, default: null },
  reviewedAt: { type: Date, default: null },
  revision: { type: Number, default: 1 }
}, opts);
proposal.index({workspaceId:1,updatedAt:-1});
const audit = new Schema({
  workspaceId: { type: Schema.Types.ObjectId, required: true, index: true },
  actorId: { type: Schema.Types.ObjectId, required: true },
  action: { type: String, required: true, maxlength: 100 },
  subjectType: { type: String, required: true, maxlength: 50 },
  subjectId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey:false });
const named = (name,schema)=>mongoose.models[name]||mongoose.model(name,schema);
module.exports = {
 Workspace:named('Elev8WorkspaceV2',workspace),
 Membership:named('Elev8WorkspaceMembershipV2',membership),
 Connection:named('Elev8StoreConnectionV2',connection),
 Proposal:named('Elev8ProposalV2',proposal),
 Audit:named('Elev8WorkspaceAuditV2',audit)
};
