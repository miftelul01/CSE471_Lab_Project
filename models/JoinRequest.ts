import { Schema, model, models, Document, Types } from "mongoose";

export type JoinRequestStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";

export interface JoinRequestDoc extends Document {
  userId: string;
  listingId: Types.ObjectId;
  status: JoinRequestStatus;
  message?: string;
  createdAt: Date;
  updatedAt: Date;
}

const joinRequestSchema = new Schema<JoinRequestDoc>(
  {
    userId: { type: String, required: true, index: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED", "WITHDRAWN"],
      default: "PENDING",
    },
    message: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: any) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

export const JoinRequest =
  models.JoinRequest || model<JoinRequestDoc>("JoinRequest", joinRequestSchema);
