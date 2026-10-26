import { Schema, model } from 'mongoose';

export interface SecurityGroupRecord {
  /** The group's Entra ID object id (GUID). Unique business key – see the schema below. */
  groupId: string;
  displayName: string;
  description: string | null;
  securityEnabled: boolean;
  mailEnabled: boolean;
  groupTypes: string[];
  membershipRule: string | null;
  createdDateTime: Date | null;
  lastSyncedAt: Date;
}

/**
 * Keys: MongoDB's primary key is always `_id` (an auto-generated ObjectId here).
 * `groupId` is the Entra object id with a *unique index*, so MongoDB rejects duplicates and
 * the sync upserts on it. Keeping it separate from `_id` decouples our storage identity from
 * Microsoft's and keeps API responses free of Mongo-specific fields.
 */
const securityGroupSchema = new Schema<SecurityGroupRecord>(
  {
    groupId: { type: String, required: true, unique: true },
    displayName: { type: String, required: true, index: true },
    description: { type: String, default: null },
    securityEnabled: { type: Boolean, required: true },
    mailEnabled: { type: Boolean, required: true },
    groupTypes: { type: [String], default: [] },
    membershipRule: { type: String, default: null },
    createdDateTime: { type: Date, default: null },
    lastSyncedAt: { type: Date, required: true },
  },
  // createdAt / updatedAt are when *we* first stored / last changed the document.
  { timestamps: true, versionKey: false },
);

export const SecurityGroup = model<SecurityGroupRecord>('SecurityGroup', securityGroupSchema);
