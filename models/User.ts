import { Schema, models, model } from "mongoose";

// Minimal shared User model. If a teammate's auth module already defines
// a fuller User schema, merge this into theirs rather than keeping both.
export type Role = "RESIDENT" | "LANDLORD" | "ADMIN";

export interface IUser {
  name: string;
  email: string;
  passwordHash?: string;
  role: Role;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String },
    role: { type: String, enum: ["RESIDENT", "LANDLORD", "ADMIN"], default: "RESIDENT" },
  },
  { timestamps: true }
);

export default models.User || model<IUser>("User", UserSchema);
