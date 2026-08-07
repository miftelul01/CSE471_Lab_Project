import { Schema, model, models, Document } from "mongoose";

export type SleepSchedule = "EARLY_BIRD" | "NIGHT_OWL" | "FLEXIBLE";
export type CleanlinessLevel = "VERY_TIDY" | "MODERATE" | "RELAXED";

export interface PreferenceDoc extends Document {
  userId: string;
  budgetMin: number;
  budgetMax: number;
  sleepSchedule: SleepSchedule;
  cleanliness: CleanlinessLevel;
  smokingOk: boolean;
  petsOk: boolean;
  preferredArea?: string;
  createdAt: Date;
  updatedAt: Date;
}

const preferenceSchema = new Schema<PreferenceDoc>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    budgetMin: { type: Number, required: true },
    budgetMax: { type: Number, required: true },
    sleepSchedule: {
      type: String,
      enum: ["EARLY_BIRD", "NIGHT_OWL", "FLEXIBLE"],
      required: true,
    },
    cleanliness: {
      type: String,
      enum: ["VERY_TIDY", "MODERATE", "RELAXED"],
      required: true,
    },
    smokingOk: { type: Boolean, default: false },
    petsOk: { type: Boolean, default: false },
    preferredArea: { type: String, default: null },
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

// Reuse the compiled model across hot-reloads instead of recompiling it.
export const Preference = models.Preference || model<PreferenceDoc>("Preference", preferenceSchema);
