// Minimal Gemini client (Google AI Studio REST API). Used for the advisor and for reading KYC documents on the server.
// The key is sent in a header, never in the URL, so it does not end up in proxy or access logs.
import { z } from 'zod';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const geminiConfigured = () => Boolean(process.env.GEMINI_API_KEY);
export const geminiModel = () => process.env.GEMINI_MODEL || 'gemini-3.5-flash';
// Tried in order: the primary model, then a faster fallback when the first times out or is overloaded.
export const geminiModels = () => [...new Set([geminiModel(), process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite'])];

export class GeminiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

// Calls generateContent and returns the parsed JSON object, validated against a zod schema.
// parts: Gemini content parts for the user turn (text and/or inlineData images).
export async function geminiJson(options) {
  let lastError;
  for (const model of geminiModels()) {
    try { return { ...(await callModel(model, options)), _model: model }; } catch (error) {
      lastError = error;
      // Bad requests and auth errors will not improve on another model.
      if ([400, 401, 403].includes(error.status)) break;
    }
  }
  throw lastError;
}

async function callModel(model, { system, history = [], parts, schema, timeoutMs = 8_000, temperature = 0.2 }) {
  if (!geminiConfigured()) throw new GeminiError('Gemini is not configured.', 0);
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [...history, { role: 'user', parts }],
    generationConfig: { temperature, responseMimeType: 'application/json', responseJsonSchema: z.toJSONSchema(schema, { target: 'draft-7' }) },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new GeminiError(error.name === 'AbortError' ? 'Gemini timed out.' : `Gemini unreachable: ${error.message}`, 0);
  } finally { clearTimeout(timer); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new GeminiError(data?.error?.message || `Gemini error ${response.status}`, response.status);
  const candidate = data.candidates?.[0];
  if (!candidate || candidate.finishReason === 'SAFETY') throw new GeminiError('Gemini returned no answer.', 200);
  const text = (candidate.content?.parts || []).filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new GeminiError('Gemini returned invalid JSON.', 200); }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new GeminiError('Gemini answer did not match the expected shape.', 200);
  return result.data;
}
