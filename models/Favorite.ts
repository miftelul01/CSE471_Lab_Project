import { Schema, model, models, Document, Types } from "mongoose";

export interface FavoriteDoc extends Document {
  userId: string;
  listingId: Types.ObjectId;
  createdAt: Date;
}

const favoriteSchema = new Schema<FavoriteDoc>(
  {
    userId: { type: String, required: true, index: true },
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true },
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

favoriteSchema.index({ userId: 1, listingId: 1 }, { unique: true });

export const Favorite = models.Favorite || model<FavoriteDoc>("Favorite", favoriteSchema);
