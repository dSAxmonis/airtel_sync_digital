// SIMULATED external providers: UIDAI (Aadhaar e-KYC), DigiLocker (issued documents), Protean (PAN) and a bank
// penny-drop API. Everything in this file stands in for a third party; the app's own verification logic lives in
// kycRules.js and kycService.js and only ever sees what these "providers" return, exactly as it would in production.
// Issued documents are signed with real Ed25519 keys per issuer, and the app verifies those signatures.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { readCsv } from './csv.js';
import { aadhaarValid, normalizeAadhaar } from './aadhaar.js';

const directory = JSON.parse(fs.readFileSync(path.join(config.dataDir, 'mock_gov_directory.json'), 'utf8'));
const residentsByAadhaar = new Map(directory.residents.map(resident => [resident.aadhaar, resident]));
const accounts = new Map(directory.bankAccounts.map(account => [`${account.ifsc}:${account.account}`, account]));
let gstIndex;
const gstRows = () => (gstIndex ||= new Map(readCsv('mock_gstin_registry.csv').map(row => [row.gstin, row])));
let udyamIndex;
const udyamRows = () => (udyamIndex ||= new Map(readCsv('mock_udyam_registry.csv').map(row => [row.udyam_number, row])));

// Residents not in the demo directory are enrolled on first use with the claimant's name and phone, so the mock
// behaves like UIDAI afterwards: the name and registered mobile are fixed, and a second claimant cannot change them.
import { MockResident } from '../models/MockResident.js';
const synthMobile = aadhaar => String(parseInt(crypto.createHash('sha256').update(`mobile:${aadhaar}`).digest('hex').slice(0, 6), 16) % 10000).padStart(4, '0');

const refOf = aadhaar => crypto.createHmac('sha256', config.dataKey).update(`uidai:${aadhaar}`).digest('hex');
export async function uidaiResident(raw, claimant = {}, { enrol = true } = {}) {
  const aadhaar = normalizeAadhaar(raw);
  if (!aadhaarValid(aadhaar)) return null;
  const known = residentsByAadhaar.get(aadhaar);
  if (known) return known;
  const stored = await MockResident.findOne({ aadhaarRef: refOf(aadhaar) }).lean();
  if (stored) return { aadhaar, name: stored.name, yearOfBirth: stored.yearOfBirth, mobileLast4: stored.mobileLast4, pan: null, links: [], enrolledOnUse: true };
  if (!enrol) return null;
  const resident = { aadhaar, name: claimant.name || 'Resident', yearOfBirth: 1962 + (parseInt(aadhaar.slice(-5), 10) % 40), mobileLast4: String(claimant.phone || '').slice(-4) || synthMobile(aadhaar), pan: null, links: [], enrolledOnUse: true };
  await MockResident.updateOne({ aadhaarRef: refOf(aadhaar) }, { $setOnInsert: { aadhaarRef: refOf(aadhaar), aadhaar: aadhaar.slice(-4), name: resident.name, yearOfBirth: resident.yearOfBirth, mobileLast4: resident.mobileLast4 } }, { upsert: true });
  return resident;
}
export const demoResidents = () => directory.residents.map(({ key, aadhaar, name, links }) => ({ key, aadhaar, name, business: links[0]?.business, role: links[0]?.role }));

// ---- Issuer signatures (one key pair per issuing department) ----
const ISSUERS = { UIDAI: 'Unique Identification Authority of India', ITD: 'Income Tax Department', GSTN: 'Goods and Services Tax Network', MSME: 'Ministry of MSME (Udyam)' };
const keys = Object.fromEntries(Object.keys(ISSUERS).map(id => [id, crypto.generateKeyPairSync('ed25519')]));
const canonical = payload => JSON.stringify(payload, Object.keys(payload).sort());
// Public keys are what a verifier would hold (DigiLocker publishes issuer certificates).
export const issuerPublicKey = issuer => keys[issuer]?.publicKey;
function issue(issuer, docType, payload) {
  const body = { ...payload, docType, issuer, issuedAt: new Date().toISOString() };
  const uri = `in.gov.${issuer.toLowerCase()}-${docType.toLowerCase().replace(/\W+/g, '')}-${crypto.createHash('sha256').update(canonical(payload)).digest('hex').slice(0, 12)}`;
  return { uri, issuer, issuerName: ISSUERS[issuer], docType, payload: body, signature: crypto.sign(null, Buffer.from(canonical(body)), keys[issuer].privateKey).toString('base64') };
}
export function verifyIssued(doc) {
  const key = issuerPublicKey(doc?.issuer);
  if (!key || !doc.signature) return false;
  try { return crypto.verify(null, Buffer.from(canonical(doc.payload)), key, Buffer.from(doc.signature, 'base64')); } catch { return false; }
}

// ---- DigiLocker: the documents issued to one resident (only what is linked to their Aadhaar) ----
export function digilockerDocuments(resident) {
  const docs = [issue('UIDAI', 'e-Aadhaar', { name: resident.name, yearOfBirth: resident.yearOfBirth, aadhaarLast4: resident.aadhaar.slice(-4), referenceKey: crypto.createHash('sha256').update(`ref:${resident.aadhaar}`).digest('hex').slice(0, 24) })];
  if (resident.pan) docs.push(issue('ITD', 'PAN', { pan: resident.pan, name: resident.name }));
  for (const link of resident.links || []) {
    const gst = link.gstin && gstRows().get(link.gstin);
    if (gst) docs.push(issue('GSTN', 'GST registration certificate', { gstin: gst.gstin, legal_name: gst.legal_name, trade_name: gst.trade_name, constitution: gst.constitution, address: gst.principal_place_of_business, state: gst.state, status: gst.status, registration_date: gst.registration_date, holder: resident.name, holderRole: link.role }));
    const udyam = link.udyam && udyamRows().get(link.udyam);
    if (udyam) docs.push(issue('MSME', 'Udyam registration certificate', { udyam_number: udyam.udyam_number, enterprise_name: udyam.enterprise_name, enterprise_type: udyam.enterprise_type, major_activity: udyam.major_activity, city: udyam.city, state: udyam.state, registration_date: udyam.date_of_registration, holder: resident.name, holderRole: link.role }));
  }
  return docs;
}

// ---- Protean PAN verification: entity PANs come from the GST registry, personal PANs from residents ----
export function panLookup(pan) {
  const value = String(pan || '').toUpperCase();
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(value)) return { valid: false };
  const resident = directory.residents.find(item => item.pan === value);
  if (resident) return { valid: true, pan: value, name: resident.name, category: 'Individual', status: 'Active' };
  const row = [...gstRows().values()].find(item => item.gstin.slice(2, 12) === value);
  if (!row) return { valid: false };
  const proprietor = row.legal_name.match(/^(.*?)\s*\(\s*prop/i)?.[1];
  return { valid: true, pan: value, name: proprietor || row.legal_name, category: proprietor ? 'Individual' : row.constitution, status: 'Active' };
}

// ---- Bank penny-drop: ₹1 credit, the bank returns the account holder's name ----
export function pennyDrop(ifsc, account) {
  const IFSC = String(ifsc || '').toUpperCase(), number = String(account || '').replace(/\s/g, '');
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(IFSC) || !/^\d{9,18}$/.test(number)) return { ok: false, reason: 'invalid' };
  const known = accounts.get(`${IFSC}:${number}`);
  // Any other account exists in the simulation but belongs to someone unrelated, as it would for a borrowed number.
  const holder = known?.holder || ['Ramesh Traders', 'Sita Devi', 'Om Sai Enterprises', 'Mohd. Arif'][parseInt(number.slice(-3), 10) % 4];
  return { ok: true, holder, accountType: known?.type || 'Savings', utr: `SIM${Date.now().toString().slice(-9)}` };
}
export const demoAccounts = () => directory.bankAccounts.map(({ ifsc, account, business }) => ({ ifsc, account, business }));
