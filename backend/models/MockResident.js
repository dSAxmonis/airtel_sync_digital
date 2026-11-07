import mongoose from 'mongoose';

// SIMULATION ONLY: residents enrolled in the mock UIDAI on first use (see libs/mockGov.js).
const mockResidentSchema = new mongoose.Schema({
  aadhaarRef: { type: String, unique: true },
  aadhaar: String,
  name: String,
  yearOfBirth: Number,
  mobileLast4: String,
}, { timestamps: true });

export const MockResident = mongoose.model('MockResident', mockResidentSchema);
