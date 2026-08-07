import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable in .env");
}

// Cache the connection across hot reloads in dev so we don't open a new
// connection to MongoDB on every file change / request.
type MongooseCache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const globalWithMongoose = global as typeof globalThis & { mongooseCache?: MongooseCache };

const cached: MongooseCache = globalWithMongoose.mongooseCache || { conn: null, promise: null };
globalWithMongoose.mongooseCache = cached;

export async function connectToDatabase() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI as string);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
