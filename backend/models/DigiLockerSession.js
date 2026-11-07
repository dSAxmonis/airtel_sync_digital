import mongoose from 'mongoose';

// One DigiLocker consent round trip (OAuth 2.0 authorization code + PKCE, simulated provider).
const digiLockerSessionSchema = new mongoose.Schema({
  state: { type: String, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business' },
  codeChallenge: String,
  codeVerifier: String,
  // Provider side (simulated DigiLocker): who signed in and which documents they agreed to share.
  aadhaarRef: String,
  aadhaarEnc: String,
  otpVerified: Boolean,
  sharedUris: [String],
  code: String,
  status: { type: String, enum: ['started', 'signed_in', 'consented', 'exchanged', 'expired'], default: 'started' },
  expiresAt: { type: Date, index: { expires: 0 } },
}, { timestamps: true });

export const DigiLockerSession = mongoose.model('DigiLockerSession', digiLockerSessionSchema);
