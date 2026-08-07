import { Schema, model, models, Document, Types } from "mongoose";

export interface MatchDoc extends Document {
  userId: string;
  listingId: Types.ObjectId;
  compatibilityScore: number;
  rank: number;
  createdAt: Date;
}

const matchSchema = new Schema<MatchDoc>(
  {
    userId: { type: String, required: true, index: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
    compatibilityScore: { type: Number, required: true },
    rank: { type: Number, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform: (_doc, ret: any) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

matchSchema.index({ userId: 1, listingId: 1 }, { unique: true });

export const Match = models.Match || model<MatchDoc>("Match", matchSchema);
