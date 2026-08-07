import { Schema, model, models, Document } from "mongoose";
import type { SleepSchedule, CleanlinessLevel } from "./Preference";

export interface ListingDoc extends Document {
  landlordId: string;
  title: string;
  description: string;
  rent: number;
  area: string;
  roomType: string;
  capacity: number;
  amenities: string[];
  latitude?: number;
  longitude?: number;
  isActive: boolean;
  // Aggregate lifestyle signal used by the matching engine (optional —
  // can be derived later from current residents' preferences).
  sleepSchedule?: SleepSchedule;
  cleanliness?: CleanlinessLevel;
  allowsSmoking?: boolean;
  allowsPets?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const listingSchema = new Schema<ListingDoc>(
  {
    landlordId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    rent: { type: Number, required: true },
    area: { type: String, required: true },
    roomType: { type: String, required: true },
    capacity: { type: Number, default: 1 },
    amenities: { type: [String], default: [] },
    latitude: { type: Number },
    longitude: { type: Number },
    isActive: { type: Boolean, default: true },
    sleepSchedule: { type: String, enum: ["EARLY_BIRD", "NIGHT_OWL", "FLEXIBLE"] },
    cleanliness: { type: String, enum: ["VERY_TIDY", "MODERATE", "RELAXED"] },
    allowsSmoking: { type: Boolean },
    allowsPets: { type: Boolean },
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

export const Listing = models.Listing || model<ListingDoc>("Listing", listingSchema);
