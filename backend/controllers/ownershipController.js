// Proof that the applicant controls the business, not only that the business exists:
//  1. DigiLocker (strongest): documents issued to the applicant's own Aadhaar, signed by the issuing department.
//  2. PAN check plus a ₹1 penny-drop to a current account in the business's name.
// The providers are simulated in libs/mockGov.js; everything in this file is the app's real logic.
import crypto from 'node:crypto';
import { z } from 'zod';
import { User, DigiLockerSession } from '../models/index.js';
import { panLookup, pennyDrop, uidaiResident, digilockerDocuments, verifyIssued, demoResidents, demoAccounts } from '../libs/mockGov.js';
import { similarity } from '../libs/kycRules.js';
import { encrypt, decrypt, hmac, maskGstin, maskUdyam } from '../libs/security.js';
import { config } from '../libs/config.js';
import { gstRow, udyamRow } from '../services/reference.js';
import { evaluateBusiness, activeConsent, registryGst, registryUdyam, syncIdentity } from '../services/kycService.js';
import { issueOtp, verifyOtp } from '../services/otp.js';
import { audit } from '../services/audit.js';
import { ensureBusiness } from './quoteController.js';
import { presentBusiness } from './kycController.js';
import { HttpError } from '../middlewares/error.js';

async function consented(req) {
  const business = await ensureBusiness(req.user);
  if (!(await activeConsent(req.user, business))) throw new HttpError(403, 'Please give consent before we check your business details.');
  if (business.kyc.status === 'verified') throw new HttpError(409, 'Your business is already verified.', { code: 'registry_locked' });
  return business;
}
const proprietorOf = legalName => String(legalName || '').match(/^(.*?)\s*\(\s*prop/i)?.[1]?.trim() || '';
const maskPan = pan => `${pan.slice(0, 2)}XXX${pan.slice(5, 9).replace(/\d(?=\d{2})/g, 'X')}${pan.slice(-1)}`;
const maskAccount = account => `XXXX${String(account).slice(-4)}`;
// Names a bank account or PAN may legitimately carry for this business.
function businessNames(business) {
  const gst = registryGst(business), udyam = registryUdyam(business);
  return [gst?.trade_name, gst?.legal_name, proprietorOf(gst?.legal_name), udyam?.enterprise_name].filter(Boolean);
}

// ---- PAN (cross-check, not proof of control on its own: a GSTIN already contains the PAN) ----
export async function verifyPan(req, res) {
  const { pan } = z.object({ pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'A PAN has 5 letters, 4 digits and a letter.') }).parse(req.body);
  const business = await consented(req);
  const gst = registryGst(business);
  if (!gst && !business.udyam?.masked) throw new HttpError(409, 'Check your GSTIN or Udyam number first.');
  const result = panLookup(pan);
  if (!result.valid) throw new HttpError(404, 'This PAN was not found in the Income Tax records.');
  // Characters 3–12 of a GSTIN are the business's PAN, so a different PAN is a hard mismatch.
  if (gst && gst.gstin.slice(2, 12) !== result.pan) throw new HttpError(409, 'This PAN is not the PAN in your GSTIN. Use the business PAN (for a proprietorship, the proprietor’s PAN).', { code: 'pan_mismatch' });
  const names = businessNames(business);
  if (names.length && !names.some(name => similarity(name, result.name) >= 0.85)) throw new HttpError(409, `The PAN holder (${result.name}) does not match this business.`, { code: 'pan_name_mismatch' });
  business.set('ownership.pan', { masked: maskPan(result.pan), hash: hmac(`pan:${result.pan}`), name: result.name, verifiedAt: new Date() });
  await business.save();
  await audit(req.user, 'kyc.pan_verified', 'Business', business._id, { provider: 'Protean (simulated)' });
  res.json({ pan: { masked: maskPan(result.pan), name: result.name }, business: presentBusiness(business) });
}

// ---- ₹1 penny-drop: the bank names the account holder; it must be this business ----
export async function verifyBank(req, res) {
  const body = z.object({ ifsc: z.string().trim().toUpperCase(), account: z.string().trim() }).parse(req.body);
  const business = await consented(req);
  const gst = registryGst(business);
  if (!gst && !business.udyam?.masked) throw new HttpError(409, 'Check your GSTIN or Udyam number first.');
  if (gst && !business.ownership?.pan?.verifiedAt) throw new HttpError(409, 'Verify the business PAN first.');
  const drop = pennyDrop(body.ifsc, body.account);
  if (!drop.ok) throw new HttpError(400, 'Check the IFSC (11 characters) and the account number.');
  const names = businessNames(business);
  const matched = names.find(name => similarity(name, drop.holder) >= 0.85);
  await audit(req.user, matched ? 'kyc.bank_verified' : 'kyc.bank_mismatch', 'Business', business._id, { provider: 'Penny-drop (simulated)', utr: drop.utr });
  if (!matched) throw new HttpError(409, `The bank says this account belongs to "${drop.holder}", not to ${names[0] || 'this business'}. Use the business current account.`, { code: 'bank_name_mismatch', holder: drop.holder });
  const proprietorship = /proprietor/i.test(business.gst?.constitution || '');
  business.set('ownership', {
    ...(business.ownership?.toObject?.() || {}), method: 'bank', role: proprietorship ? 'Proprietor' : 'Account holder', verifiedAt: new Date(),
    bank: { masked: maskAccount(body.account), hash: hmac(`bank:${body.ifsc}:${body.account}`), ifsc: body.ifsc, holder: drop.holder, verifiedAt: new Date() },
  });
  await business.save();
  await evaluateBusiness(business, { trigger: 'registry' });
  res.json({ bank: { holder: drop.holder, masked: maskAccount(body.account), utr: drop.utr }, business: presentBusiness(business) });
}

// ---- DigiLocker (OAuth 2.0 authorization code + PKCE; the provider side is simulated) ----
const base64url = buffer => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function startDigiLocker(req, res) {
  const business = await consented(req);
  const state = base64url(crypto.randomBytes(18)), verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  await DigiLockerSession.create({ state, user: req.user._id, business: business._id, codeChallenge: challenge, codeVerifier: verifier, expiresAt: new Date(Date.now() + 10 * 60_000) });
  await audit(req.user, 'kyc.digilocker_started', 'Business', business._id);
  res.json({ authorizeUrl: `/digilocker/authorize?client_id=udyam-digital&response_type=code&state=${state}&code_challenge=${challenge}&code_challenge_method=S256&scope=issued_documents%20e-aadhaar` });
}

// Provider side (simulated DigiLocker). These three endpoints are what the DigiLocker sign-in page talks to.
async function providerSession(state) {
  const session = await DigiLockerSession.findOne({ state, expiresAt: { $gt: new Date() } });
  if (!session) throw new HttpError(410, 'This DigiLocker request has expired. Start again from the verification page.');
  return session;
}
export async function providerInfo(req, res) {
  const session = await providerSession(String(req.query.state || ''));
  res.json({ client: 'Udyam Digital (Accel Business)', purpose: 'Verify your identity and your business registration for a business connection', status: session.status, simulated: true, demoResidents: config.demoMode ? demoResidents() : [] });
}
export async function providerSignIn(req, res) {
  const { state, aadhaar } = z.object({ state: z.string(), aadhaar: z.string() }).parse(req.body);
  const session = await providerSession(state);
  const resident = await uidaiResident(aadhaar, { name: req.user.name, phone: req.user.phone });
  if (!resident) throw new HttpError(400, 'That is not a valid Aadhaar number.');
  session.aadhaarEnc = encrypt(resident.aadhaar);
  session.aadhaarRef = hmac(`aadhaar:${resident.aadhaar}`);
  await session.save();
  // The OTP goes to the mobile registered with UIDAI, not to the phone of whoever is signing in.
  const { devCode } = await issueOtp('digilocker', `${state}:${session.aadhaarRef}`);
  res.json({ sentTo: `XXXXXX${resident.mobileLast4}`, devCode });
}
export async function providerVerify(req, res) {
  const { state, code } = z.object({ state: z.string(), code: z.string().trim() }).parse(req.body);
  const session = await providerSession(state);
  if (!session.aadhaarRef) throw new HttpError(409, 'Sign in with your Aadhaar first.');
  await verifyOtp('digilocker', `${state}:${session.aadhaarRef}`, code);
  session.otpVerified = true;
  session.status = 'signed_in';
  await session.save();
  const resident = await uidaiResident(decrypt(session.aadhaarEnc), {}, { enrol: false });
  res.json({ name: resident.name, documents: digilockerDocuments(resident).map(doc => ({ uri: doc.uri, docType: doc.docType, issuer: doc.issuerName, label: doc.payload.trade_name || doc.payload.enterprise_name || doc.payload.pan?.replace(/^(.{2}).{3}/, '$1XXX') || doc.payload.name })) });
}
export async function providerConsent(req, res) {
  const { state, uris } = z.object({ state: z.string(), uris: z.array(z.string()).min(1) }).parse(req.body);
  const session = await providerSession(state);
  if (!session.otpVerified) throw new HttpError(409, 'Sign in with your Aadhaar first.');
  session.sharedUris = uris;
  session.code = base64url(crypto.randomBytes(24));
  session.status = 'consented';
  await session.save();
  res.json({ redirect: `/app/kyc?digilocker=done&state=${state}&code=${session.code}` });
}

// Our side again: exchange the code (PKCE-checked) for the shared documents and verify each issuer signature.
export async function completeDigiLocker(req, res) {
  const { state, code } = z.object({ state: z.string(), code: z.string() }).parse(req.body);
  const business = await consented(req);
  const session = await providerSession(state);
  if (String(session.user) !== String(req.user._id) || String(session.business) !== String(business._id)) throw new HttpError(403, 'This DigiLocker request belongs to another session.');
  if (session.status !== 'consented' || session.code !== code) throw new HttpError(409, 'This DigiLocker request was already used or not completed.');
  const pkceOk = base64url(crypto.createHash('sha256').update(session.codeVerifier).digest()) === session.codeChallenge;
  if (!pkceOk) throw new HttpError(400, 'DigiLocker token exchange failed.');
  session.status = 'exchanged';
  await session.save();

  const resident = await uidaiResident(decrypt(session.aadhaarEnc), {}, { enrol: false });
  const shared = digilockerDocuments(resident).filter(doc => session.sharedUris.includes(doc.uri));
  const verified = shared.map(doc => ({ ...doc, ok: verifyIssued(doc) }));
  const aadhaarDoc = verified.find(doc => doc.docType === 'e-Aadhaar');
  if (!aadhaarDoc?.ok) throw new HttpError(422, 'Share your e-Aadhaar so we can confirm who is signing.');
  const fetchedAt = new Date();
  const record = (type, doc, fields) => ({ type, source: 'digilocker', fields, confidence: 100, uploadedAt: fetchedAt, issued: { uri: doc.uri, issuer: doc.issuer, issuerName: doc.issuerName, signatureVerified: doc.ok, fetchedAt } });
  const replace = (type, value) => { business.documents = business.documents.filter(doc => doc.type !== type); business.documents.push(value); };

  // Person: name and year of birth come from UIDAI, never from what was typed.
  business.set('ownerKyc', { method: 'digilocker', last4: aadhaarDoc.payload.aadhaarLast4, name: aadhaarDoc.payload.name, yearOfBirth: aadhaarDoc.payload.yearOfBirth, verifiedAt: fetchedAt, aadhaarRef: session.aadhaarRef });
  if (!req.user.name) await User.updateOne({ _id: req.user._id }, { $set: { name: aadhaarDoc.payload.name } });

  const panDoc = verified.find(doc => doc.docType === 'PAN' && doc.ok);
  if (panDoc) business.set('ownership.pan', { masked: maskPan(panDoc.payload.pan), hash: hmac(`pan:${panDoc.payload.pan}`), name: panDoc.payload.name, verifiedAt: fetchedAt });

  // Business: a registration certificate in the applicant's own DigiLocker links the person to the business.
  const gstDoc = verified.find(doc => doc.docType === 'GST registration certificate');
  const udyamDoc = verified.find(doc => doc.docType === 'Udyam registration certificate');
  const current = registryGst(business), currentUdyam = registryUdyam(business);
  if (gstDoc && current && current.gstin !== gstDoc.payload.gstin) throw new HttpError(409, `DigiLocker shows GSTIN ${maskGstin(gstDoc.payload.gstin)}, not the GSTIN you entered. Remove the GSTIN you entered to continue with DigiLocker.`, { code: 'digilocker_mismatch' });
  if (udyamDoc && currentUdyam && currentUdyam.udyam_number !== udyamDoc.payload.udyam_number) throw new HttpError(409, `DigiLocker shows Udyam ${maskUdyam(udyamDoc.payload.udyam_number)}, not the number you entered.`, { code: 'digilocker_mismatch' });
  if (gstDoc) {
    const row = await gstRow(gstDoc.payload.gstin);
    business.set('registration.path', 'registered');
    business.gst = { gstinEnc: encrypt(row.gstin), gstinHash: hmac(row.gstin), masked: maskGstin(row.gstin), legalName: row.legal_name, tradeName: row.trade_name, constitution: row.constitution, address: row.principal_place_of_business, state: row.state, status: row.status, registrationDate: row.registration_date, verifiedAt: fetchedAt };
    replace('GST certificate', record('GST certificate', gstDoc, { gstin: row.gstin, legal_name: row.legal_name, trade_name: row.trade_name, constitution: row.constitution, address: row.principal_place_of_business, registration_date: row.registration_date }));
  }
  if (udyamDoc) {
    const row = await udyamRow(udyamDoc.payload.udyam_number);
    business.set('registration.path', 'registered');
    business.udyam = { numberEnc: encrypt(row.udyam_number), numberHash: hmac(row.udyam_number), masked: maskUdyam(row.udyam_number), enterpriseName: row.enterprise_name, enterpriseType: row.enterprise_type, majorActivity: row.major_activity, city: row.city, state: row.state, verifiedAt: fetchedAt };
    replace('Udyam certificate', record('Udyam certificate', udyamDoc, { udyam_number: row.udyam_number, enterprise_name: row.enterprise_name, major_activity: row.major_activity, city: row.city, state: row.state, registration_date: row.date_of_registration }));
  }
  const link = gstDoc || udyamDoc;
  if (link?.ok) business.set('ownership', { ...(business.ownership?.toObject?.() || {}), method: 'digilocker', role: link.payload.holderRole, verifiedAt: fetchedAt, gstFromIssuer: Boolean(gstDoc?.ok) });
  syncIdentity(business);
  await business.save();
  await evaluateBusiness(business, { trigger: 'registry' });
  await audit(req.user, 'kyc.digilocker_completed', 'Business', business._id, { documents: verified.map(doc => `${doc.docType}${doc.ok ? '' : ' (signature failed)'}`).join(', '), linked: Boolean(link) });
  res.json({ shared: verified.map(doc => ({ docType: doc.docType, issuer: doc.issuerName, signatureVerified: doc.ok })), linked: Boolean(link), business: presentBusiness(business) });
}

// Demo mode: the synthetic residents and bank accounts the simulated providers know about.
export async function demoIdentities(req, res) {
  if (!config.demoMode) throw new HttpError(404, 'Not found.');
  const business = await ensureBusiness(req.user);
  const gst = registryGst(business), names = businessNames(business);
  const account = demoAccounts().find(item => names.some(name => similarity(item.business.replace(/\s*\(.*\)$/, ''), name) >= 0.9));
  res.json({
    residents: demoResidents(), accounts: demoAccounts(),
    forThisBusiness: { pan: gst ? gst.gstin.slice(2, 12) : null, ...(account ? { ifsc: account.ifsc, account: account.account } : {}) },
    note: 'Simulated UIDAI / DigiLocker / bank records for the synthetic case-pack businesses.',
  });
}
