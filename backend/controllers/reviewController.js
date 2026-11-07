import { z } from 'zod';
import { Business, User, AuditLog } from '../models/index.js';
import { DOC_TYPES } from '../libs/kycRules.js';
import { afterKycChange, evaluateBusiness } from '../services/kycService.js';
import { presentBusiness } from './kycController.js';
import { audit } from '../services/audit.js';
import { HttpError } from '../middlewares/error.js';

// KYC officers see only flagged applications and only what failed or needs a human look.
export async function queue(req, res) {
  const status = req.query.status === 'decided' ? { $in: ['verified', 'rejected', 'action_needed'] } : 'in_review';
  const businesses = await Business.find({ 'kyc.status': status, ...(req.query.status === 'decided' ? { 'kyc.decisions.0': { $exists: true } } : {}) }).sort({ 'kyc.submittedForReviewAt': 1, updatedAt: -1 }).limit(50).lean();
  res.json({
    businesses: businesses.map(business => ({
      id: String(business._id), name: business.name, city: business.city, status: business.kyc.status, tier: business.kyc.tier,
      submittedAt: business.kyc.submittedForReviewAt || business.updatedAt, waitingHours: Math.round((Date.now() - new Date(business.kyc.submittedForReviewAt || business.updatedAt)) / 3_600_000),
      flags: [...(business.kyc.failed || []), ...(business.kyc.warnings || [])].map(item => `${item.type}: ${item.label}`),
      ownerRequested: business.kyc.decisions?.some(decision => decision.decision === 'owner_requested_review'),
      pendingChecker: Boolean(business.kyc.pendingApproval?.at), hardStops: business.kyc.hardStops || 0,
    })),
  });
}

export async function detail(req, res) {
  const business = await Business.findById(req.params.id);
  if (!business) throw new HttpError(404, 'Application not found.');
  const owner = await User.findById(business.owner).select('name preferredLanguage').lean();
  await audit(req.user, 'kyc.review_opened', 'Business', business._id);
  res.json({ business: presentBusiness(business), owner: { name: owner?.name, language: owner?.preferredLanguage }, viewed: await viewedBy(req.user, business), me: String(req.user._id) });
}

// Uploaded documents this officer has opened (approval needs every one of them looked at).
async function viewedBy(user, business) {
  const rows = await AuditLog.find({ actor: user._id, action: 'kyc.document_viewed', targetId: String(business._id) }).select('meta').lean();
  return [...new Set(rows.map(row => row.meta?.docId).filter(Boolean))];
}

const REASONS = ['registry_checked_manually', 'name_variant_confirmed', 'document_legible_on_review', 'branch_address_confirmed', 'called_owner', 'other'];
const decisionSchema = z.object({
  decision: z.enum(['approve', 'confirm', 'reject', 'request_reupload', 'reopen', 'return']),
  docType: z.enum(DOC_TYPES).optional(),
  message: z.string().trim().max(400).default(''),
  overrides: z.array(z.object({ label: z.string().max(200), reason: z.enum(REASONS) })).default([]),
});

function verify(business, at = new Date()) {
  business.kyc.status = 'verified';
  business.kyc.tier = business.gst?.status === 'Active' ? 'gst' : business.udyam?.verifiedAt ? 'udyam' : 'owner';
  business.kyc.verifiedAt = at;
  business.kyc.expiresAt = new Date(at.getTime() + 365 * 86_400_000);
  business.kyc.pendingApproval = undefined;
}

// Officer decisions with guardrails: approvals only from review, never over a hard stop, every failed check
// overridden one by one with a reason, every uploaded document opened first, and a second officer (checker)
// for any override or missing proof of ownership.
export async function decide(req, res) {
  const body = decisionSchema.parse(req.body);
  const business = await Business.findById(req.params.id);
  if (!business) throw new HttpError(404, 'Application not found.');
  const kyc = business.kyc;
  if (body.decision === 'request_reupload' && (!body.docType || !body.message)) throw new HttpError(400, 'Say which document to re-upload and why.');
  if (['reject', 'reopen', 'return'].includes(body.decision) && !body.message) throw new HttpError(400, 'Add a note explaining the decision.');
  const ownerPath = business.registration?.path === 'unregistered' && !business.gst?.masked && !business.udyam?.masked;

  if (body.decision === 'approve') {
    if (!['in_review', 'action_needed'].includes(kyc.status)) throw new HttpError(409, `Only applications in review can be approved (this one is ${kyc.status.replace('_', ' ')}).`);
    if (kyc.pendingApproval?.at) throw new HttpError(409, 'This approval is already waiting for a second officer.');
    if ((kyc.failed || []).some(item => item.hard) || kyc.hardStops) throw new HttpError(409, 'This application has a hard stop (for example a cancelled GSTIN or an identity already used by another owner). It cannot be approved.', { code: 'hard_stop' });
    if (!(business.gst?.status === 'Active' || business.udyam?.verifiedAt || (ownerPath && business.ownerKyc?.verifiedAt))) throw new HttpError(409, 'A verified GST or Udyam registration, or the owner\u2019s Aadhaar e-KYC, is required before approval.');
    const evidence = business.documents.filter(doc => doc.storageKey || doc.source === 'digilocker');
    if (!evidence.length) throw new HttpError(409, 'There are no documents to approve on. Ask the owner to upload or use DigiLocker.');
    const missingDocs = (kyc.missing || []).filter(item => item !== 'Ownership proof');
    if (missingDocs.length) throw new HttpError(409, `Required documents are missing: ${missingDocs.join(', ')}.`);
    const viewed = new Set(await viewedBy(req.user, business));
    const unopened = business.documents.filter(doc => doc.storageKey && doc.source !== 'digilocker' && !viewed.has(String(doc._id)));
    if (unopened.length) throw new HttpError(409, `Open every uploaded document before approving: ${unopened.map(doc => doc.type).join(', ')}.`, { code: 'documents_unopened' });
    const failedLabels = (kyc.failed || []).map(item => `${item.type}: ${item.label}`);
    const covered = new Set(body.overrides.map(item => item.label));
    const uncovered = failedLabels.filter(label => !covered.has(label));
    if (uncovered.length) throw new HttpError(409, `Give a reason for each failed check you are overriding: ${uncovered.join('; ')}.`, { code: 'override_reason_needed', uncovered });
    const needsChecker = body.overrides.length > 0 || (!ownerPath && kyc.missing?.includes('Ownership proof'));
    kyc.decisions.push({ decision: needsChecker ? 'approve_pending_checker' : 'approve', note: body.message, at: new Date(), by: req.user._id, overrides: body.overrides });
    if (needsChecker) {
      kyc.pendingApproval = { by: req.user._id, at: new Date(), note: body.message, overrides: body.overrides };
      kyc.status = 'in_review';
    } else verify(business);
  } else if (body.decision === 'confirm') {
    if (!kyc.pendingApproval?.at) throw new HttpError(409, 'There is no approval waiting for confirmation.');
    if (String(kyc.pendingApproval.by) === String(req.user._id)) throw new HttpError(403, 'A second officer must confirm an approval that overrides checks.', { code: 'checker_must_differ' });
    if (kyc.hardStops) throw new HttpError(409, 'A hard stop appeared after the first approval. It cannot be confirmed.', { code: 'hard_stop' });
    kyc.decisions.push({ decision: 'approve_confirmed', note: body.message, at: new Date(), by: req.user._id, overrides: kyc.pendingApproval.overrides });
    verify(business);
  } else if (body.decision === 'return') {
    if (!kyc.pendingApproval?.at) throw new HttpError(409, 'There is no approval waiting for confirmation.');
    kyc.decisions.push({ decision: 'approval_returned', note: body.message, at: new Date(), by: req.user._id });
    kyc.pendingApproval = undefined;
  } else if (body.decision === 'reject') {
    kyc.decisions.push({ decision: 'reject', note: body.message, at: new Date(), by: req.user._id });
    kyc.status = 'rejected';
    kyc.pendingApproval = undefined;
  } else if (body.decision === 'reopen') {
    if (kyc.status !== 'rejected') throw new HttpError(409, 'Only a rejected application can be reopened.');
    kyc.decisions.push({ decision: 'reopen', note: body.message, at: new Date(), by: req.user._id });
    kyc.status = 'not_started';
    await business.save();
    await evaluateBusiness(business, { trigger: 'officer' });
  } else {
    kyc.decisions.push({ decision: body.decision, note: body.message || body.docType, at: new Date(), by: req.user._id });
    kyc.status = 'action_needed';
    kyc.reviewRequests.push({ docType: body.docType, message: body.message, at: new Date(), by: req.user._id });
    kyc.failed.push({ type: body.docType, status: 'fail', label: 'Reviewer asked for a new upload', detail: body.message });
    const doc = business.documents.find(item => item.type === body.docType);
    if (doc) { doc.status = 'fail'; doc.checks.push({ status: 'fail', label: 'Reviewer asked for a new upload', detail: body.message }); }
  }
  await business.save();
  await audit(req.user, `kyc.${body.decision}`, 'Business', business._id, { docType: body.docType, overrides: body.overrides.length, pendingChecker: Boolean(kyc.pendingApproval?.at) });
  await afterKycChange(business, business.kyc.status);
  res.json({ business: presentBusiness(business), pendingChecker: Boolean(kyc.pendingApproval?.at) });
}
