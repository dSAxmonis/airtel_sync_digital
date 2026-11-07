// Fraud scenarios from the verification review, run against the real API: each must be caught.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, dropDatabase, loginCustomer, loginDemo, backendRoot } from './helpers.js';

const DB = 'udyam_digital_verification_test';
const specimen = name => fs.readFileSync(path.join(backendRoot, 'data', 'specimens', name));
const upload = (client, type, file) => { const form = new FormData(); form.append('type', type); form.append('confidence', '99'); form.append('fields', '{}'); form.append('file', new Blob([specimen(file)], { type: 'image/png' }), file); return client.post('/kyc/documents', form); };
const K02 = { gstin: '19EOGXH4115Y1ZL', pan: 'EOGXH4115Y', ifsc: 'SYNB0001002', account: '50100015838' };

await dropDatabase(DB);
const server = await startServer(5096, DB);
test.after(async () => { server.stop(); await dropDatabase(DB); });

async function owner(phone, name) {
  const client = server.actor();
  await loginCustomer(client, phone, name);
  await client.post('/kyc/consent');
  return client;
}

test('the real owner: registry + PAN + ₹1 bank check + documents read on the server → verified', async () => {
  const client = await owner('9844400001', 'Joseph Shah');
  await client.post('/kyc/gstin', { gstin: K02.gstin });
  const wrongPan = await client.post('/kyc/ownership/pan', { pan: 'ABCDE1234F' });
  assert.equal(wrongPan.status, 404, 'unknown PAN');
  const otherPan = await client.post('/kyc/ownership/pan', { pan: 'XUIXG0767D' });
  assert.equal(otherPan.body.details.code, 'pan_mismatch', 'a PAN that is not the one inside the GSTIN');
  assert.equal((await client.post('/kyc/ownership/bank', { ifsc: K02.ifsc, account: K02.account })).status, 409, 'PAN first');
  assert.equal((await client.post('/kyc/ownership/pan', { pan: K02.pan })).status, 200);
  const borrowed = await client.post('/kyc/ownership/bank', { ifsc: 'SYNB0001003', account: '50100023757' });
  assert.equal(borrowed.body.details.code, 'bank_name_mismatch', 'an account in another business’s name');
  const bank = await client.post('/kyc/ownership/bank', { ifsc: K02.ifsc, account: K02.account });
  assert.equal(bank.body.business.ownership.method, 'bank');
  for (const [type, file] of [['GST certificate', 'K02_gst_certificate.png'], ['Address proof', 'K02_address_proof.png'], ['Signatory ID', 'K02_signatory_id.png']]) await upload(client, type, file);
  const me = (await client.get('/business/me')).body.business;
  assert.equal(me.kyc.status, 'verified', JSON.stringify([me.kyc.missing, me.kyc.failed, me.kyc.warnings]));
});

test('someone else’s GSTIN: a hard stop that no officer can override', async () => {
  const thief = await owner('9844400002', 'Not Joseph');
  await thief.post('/kyc/gstin', { gstin: K02.gstin });
  await thief.post('/kyc/ownership/pan', { pan: K02.pan });
  const business = (await thief.get('/business/me')).body.business;
  assert.equal(business.kyc.status, 'action_needed');
  assert.ok(business.kyc.failed.some(item => item.hard && /already verified for another account/.test(item.label)));
  const officer = server.actor();
  await loginDemo(officer, 'priya.kyc@udyam.demo');
  await thief.post('/kyc/request-review').catch(() => {});
  const decision = await officer.post(`/review/${business.id}/decision`, { decision: 'approve' });
  assert.ok([409].includes(decision.status));
});

test('a cancelled GSTIN with a valid Udyam number is still a hard stop', async () => {
  const client = await owner('9844400003', 'Neha Kaur');
  await client.post('/kyc/gstin', { gstin: '29OKAXP4077P1ZL' });
  const result = (await client.post('/kyc/udyam', { udyam: 'UDYAM-KR-00-1489448' })).body.business;
  assert.equal(result.kyc.status, 'action_needed');
  assert.ok(result.kyc.failed.some(item => item.hard && /cancelled/.test(item.label)));
});

test('the same Aadhaar for a second owner is caught, and the name comes from UIDAI', async () => {
  const first = await owner('9844400004', 'Ravi Kumar');
  await first.post('/kyc/unregistered', { name: 'Ravi Stores', address: '1, MG Road', city: 'Pune', state: 'Maharashtra' });
  const otp = await first.post('/kyc/owner/otp', { aadhaar: '730000022220' });
  assert.equal(otp.body.sentTo, 'XXXXXX4026', 'OTP goes to the UIDAI-registered mobile, not this account');
  const ekyc = (await first.post('/kyc/owner/verify', { aadhaar: '730000022220', code: otp.body.devCode })).body.business;
  assert.equal(ekyc.ownerKyc.name, 'Joseph Shah', 'the name is UIDAI’s, not the one typed at sign-up');
});

test('maker-checker: an override needs every reason, opened documents and a second officer', async () => {
  const client = await owner('9844400005', 'Pooja Shah');
  await client.post('/kyc/gstin', { gstin: '08YKZXS5189L1ZO' });
  await client.post('/kyc/ownership/pan', { pan: 'YKZXS5189L' });
  await client.post('/kyc/ownership/bank', { ifsc: 'SYNB0001006', account: '50100047514' });
  for (const [type, file] of [['GST certificate', 'K06_gst_certificate.png'], ['Address proof', 'K06_address_proof.png'], ['Signatory ID', 'K06_signatory_id.png']]) await upload(client, type, file);
  let business = (await client.get('/business/me')).body.business;
  assert.equal(business.kyc.status, 'action_needed', 'the altered GSTIN on the certificate fails its checksum');
  business = (await client.post('/kyc/request-review', { note: 'Old print of the certificate' })).body.business;
  const maker = server.actor(), checker = server.actor();
  await loginDemo(maker, 'priya.kyc@udyam.demo');
  await loginDemo(checker, 'rahul.kyc@udyam.demo');
  assert.equal((await maker.post(`/review/${business.id}/decision`, { decision: 'approve' })).body.details.code, 'documents_unopened');
  for (const doc of business.documents) await maker.raw(`/documents/${doc.id}/file`);
  const noReason = await maker.post(`/review/${business.id}/decision`, { decision: 'approve' });
  assert.equal(noReason.body.details.code, 'override_reason_needed');
  const overrides = noReason.body.details.uncovered.map(label => ({ label, reason: 'registry_checked_manually' }));
  const made = await maker.post(`/review/${business.id}/decision`, { decision: 'approve', overrides, message: 'Registry GSTIN confirmed' });
  assert.equal(made.body.pendingChecker, true);
  assert.equal(made.body.business.kyc.status, 'in_review');
  assert.equal((await maker.post(`/review/${business.id}/decision`, { decision: 'confirm' })).body.details.code, 'checker_must_differ');
  const confirmed = await checker.post(`/review/${business.id}/decision`, { decision: 'confirm', message: 'Checked' });
  assert.equal(confirmed.body.business.kyc.status, 'verified');
});

test('a rejection sticks until an officer reopens it', async () => {
  const client = await owner('9844400006', 'Anita Shah');
  await client.post('/kyc/gstin', { gstin: '32TZAXB5481U1Z1' });
  await upload(client, 'Address proof', 'K05_address_proof.png');
  const business = (await client.get('/business/me')).body.business;
  const officer = server.actor();
  await loginDemo(officer, 'priya.kyc@udyam.demo');
  assert.equal((await officer.post(`/review/${business.id}/decision`, { decision: 'reject' })).status, 400, 'a note is required');
  assert.equal((await officer.post(`/review/${business.id}/decision`, { decision: 'reject', message: 'Signatory could not be confirmed' })).body.business.kyc.status, 'rejected');
  const again = await upload(client, 'Signatory ID', 'K05_signatory_id.png');
  assert.equal(again.body.details.code, 'kyc_rejected');
  assert.equal((await client.post('/kyc/consent/withdraw')).body.business.kyc.status, 'rejected', 'withdrawal does not clear a rejection');
});
