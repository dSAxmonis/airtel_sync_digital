// Reads every uploaded KYC document on the server. What the owner's phone read is only a pre-fill and is never
// trusted: the server runs its own OCR, asks Gemini (when configured) to read the same image as a second reader,
// and looks for signs of tampering. AI never decides: if the readers disagree, or the AI flags tampering,
// the document goes to a human reviewer.
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { createWorker } from 'tesseract.js';
import { backendRoot } from '../libs/config.js';
import { parseKycText } from '../libs/kycParse.js';
import { DOC_FIELDS, DOC_TYPES, similarity } from '../libs/kycRules.js';
import { geminiConfigured, geminiJson, GeminiError } from '../libs/gemini.js';

let workerPromise;
const worker = () => (workerPromise ||= createWorker('eng', 1, {
  langPath: path.join(backendRoot, 'node_modules/@tesseract.js-data/eng/4.0.0'), gzip: true, cachePath: path.join(backendRoot, 'node_modules/.cache'),
}));
// One OCR job at a time on the shared worker.
let queue = Promise.resolve();
const serial = task => (queue = queue.then(task, task));

// Image editors leave their name in PNG text chunks or JPEG/EXIF metadata.
const EDITORS = /photoshop|gimp|canva|picsart|snapseed|pixlr|paint\.net|affinity|illustrator|inkscape|lightroom|remini/i;
function editorSignature(buffer) {
  const head = buffer.subarray(0, Math.min(buffer.length, 256 * 1024)).toString('latin1');
  return head.match(EDITORS)?.[0] || null;
}

const KEY_FIELDS = {
  'GST certificate': ['gstin', 'legal_name', 'trade_name'], 'Udyam certificate': ['udyam_number', 'enterprise_name'],
  'Address proof': ['billed_to', 'bill_date'], 'Signatory ID': ['name', 'for_business', 'valid_till'],
  'Shop licence': ['licence_number', 'business_name', 'owner_name', 'valid_till'], 'Shop photo': ['signboard_text'], 'Authority letter': ['authorised_person', 'business_name', 'signed_by', 'letter_date'],
};
const fieldsSchema = type => z.object(Object.fromEntries(DOC_FIELDS[type].map(key => [key, z.string().nullable()])));
const aiSchema = type => z.object({
  document_type: z.enum([...DOC_TYPES, 'Other']).describe('What this document actually is.'),
  fields: fieldsSchema(type).describe('Values exactly as printed; dates as YYYY-MM-DD; null when not present.'),
  legible: z.boolean(),
  tamper_signals: z.array(z.string()).describe('Concrete visual signs of editing: mismatched fonts or alignment in one field, pasted blocks, inconsistent backgrounds, photo of a screen (moiré, bezel), digitally drawn stamps. Empty if none.'),
});

async function aiRead(buffer, mime, type) {
  if (!geminiConfigured()) return null;
  const system = `You read Indian KYC documents for a telecom onboarding check. The owner says this is a "${type}". Extract only what is printed. Do not guess or correct values. Report concrete tamper signals only when you can see them.`;
  try {
    const { _model, ...result } = await geminiJson({ system, parts: [{ inlineData: { mimeType: mime, data: buffer.toString('base64') } }, { text: `Read this ${type}.` }], schema: aiSchema(type), timeoutMs: 20_000, temperature: 0 });
    const fields = Object.fromEntries(Object.entries(result.fields).map(([key, value]) => [key, value || '']));
    return { ...result, fields, model: _model };
  } catch (error) {
    if (!(error instanceof GeminiError)) throw error;
    return { error: error.message };
  }
}

async function ocrRead(buffer, mime, type) {
  if (!mime.startsWith('image/')) return { confidence: 0, fields: {}, text: '', unsupported: true };
  const { data } = await serial(async () => (await worker()).recognize(buffer, { rotateAuto: true }));
  return { confidence: Math.round(data.confidence), fields: parseKycText(type, data.text), text: data.text };
}

const same = (a, b) => {
  const x = String(a || '').trim(), y = String(b || '').trim();
  if (!x || !y) return null;
  return similarity(x, y) >= 0.85;
};

// Returns the fields the rules engine will use, the server's confidence, and reader signals for the checks.
export async function readDocument({ buffer, mime, type, clientFields = {} }) {
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const [ocr, ai] = await Promise.all([ocrRead(buffer, mime, type).catch(error => ({ confidence: 0, fields: {}, error: error.message })), aiRead(buffer, mime, type)]);
  const keys = DOC_FIELDS[type] || [];
  const usable = ai && !ai.error;
  // OCR is the record; the AI fills a field OCR could not read (flagged for review), never overrides it.
  const fields = {}, aiOnly = [], disagreements = [];
  for (const key of keys) {
    const fromOcr = String(ocr.fields?.[key] || '').trim(), fromAi = usable ? String(ai.fields?.[key] || '').trim() : '';
    if (fromOcr) fields[key] = fromOcr;
    else if (fromAi) { fields[key] = fromAi; if ((KEY_FIELDS[type] || []).includes(key)) aiOnly.push(key); }
    else fields[key] = '';
    if (usable && (KEY_FIELDS[type] || []).includes(key) && same(fromOcr, fromAi) === false) disagreements.push(key);
  }
  // PDFs (text layer) and images OCR could not read: the AI's reading counts only as a pre-fill for a human.
  let confidence = ocr.confidence;
  if (ocr.unsupported && usable && ai.legible) confidence = 70;
  const clientDiffers = keys.filter(key => (KEY_FIELDS[type] || []).includes(key) && String(clientFields[key] || '').trim() && (same(clientFields[key], fields[key]) === false || !String(fields[key] || '').trim()));
  return {
    fields, confidence, fileHash,
    looksLike: usable && ai.document_type !== type && ai.document_type !== 'Other' ? ai.document_type : undefined,
    reader: {
      server: { engine: 'tesseract', confidence: ocr.confidence, unsupported: Boolean(ocr.unsupported) },
      ai: ai ? (ai.error ? { status: 'unavailable', detail: ai.error } : { status: 'read', model: ai.model, legible: ai.legible, documentType: ai.document_type, tamperSignals: ai.tamper_signals.slice(0, 5) }) : { status: 'off' },
      disagreements, aiOnly, clientDiffers,
      editor: editorSignature(buffer),
    },
  };
}

// Checks added to a document's result from the readers (warnings send it to a human; nothing here auto-approves).
export function readerChecks(doc) {
  const reader = doc.reader;
  if (!reader) return [];
  const checks = [];
  if (reader.ai?.status === 'read') {
    if (!reader.disagreements?.length && !reader.aiOnly?.length) checks.push({ status: 'pass', label: 'Server OCR and AI reader agree', detail: `Read twice on the server (${reader.ai.model}).` });
    if (reader.disagreements?.length) checks.push({ status: 'warn', label: 'The two readers disagree', detail: `Fields: ${reader.disagreements.join(', ')}. A KYC officer will compare them with the image.` });
    if (reader.aiOnly?.length) checks.push({ status: 'warn', label: 'Some details were read only by the AI', detail: `Fields: ${reader.aiOnly.join(', ')}. A KYC officer will confirm them.` });
    if (reader.ai.tamperSignals?.length) checks.push({ status: 'warn', label: 'Possible signs of editing', detail: reader.ai.tamperSignals.join('; ') });
  }
  if (reader.clientDiffers?.length) checks.push({ status: 'warn', label: 'Details sent from the device differ from the server reading', detail: `Fields: ${reader.clientDiffers.join(', ')}. The server reading is used.` });
  if (reader.editor) checks.push({ status: 'warn', label: 'Image was saved by an editing app', detail: `${reader.editor} metadata found in the file.` });
  return checks;
}
