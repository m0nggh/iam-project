import mongoose from 'mongoose';

export async function connect(uri: string): Promise<void> {
  // Fail within 5s instead of hanging if MongoDB is unreachable.
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
}

export async function disconnect(): Promise<void> {
  await mongoose.disconnect();
}

export function isConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
