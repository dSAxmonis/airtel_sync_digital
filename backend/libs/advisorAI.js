import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { redactIdentifiers } from './redact.js';
import { geminiConfigured, geminiJson, GeminiError } from './gemini.js';

// GenAI advisor. Gemini when GEMINI_API_KEY is set (primary), else Claude when Anthropic credentials are set.
// It only reads the conversation into profile fields; products, eligibility and prices are always decided by the
// pricing engine. With no provider, or on any failure, the local multilingual rules are used instead.
const LANGUAGE_NAMES = { 'en-IN': 'English', 'hi-IN': 'Hindi', 'mr-IN': 'Marathi', 'ta-IN': 'Tamil', 'te-IN': 'Telugu', 'kn-IN': 'Kannada', 'gu-IN': 'Gujarati', 'bn-IN': 'Bengali', 'ml-IN': 'Malayalam', 'pa-IN': 'Punjabi' };

const AdvisorTurn = z.object({
  reply: z.string().describe('What the advisor says next, in the customer\'s language. At most 3 short sentences.'),
  profile_updates: z.object({
    business: z.enum(['retail', 'professional', 'multi', 'manufacturing']).nullable(),
    employees: z.number().int().min(1).max(10000).nullable(),
    sites: z.number().int().min(1).max(500).nullable(),
    tier: z.enum(['1', '2']).nullable(),
    gstin: z.enum(['yes', 'no']).nullable(),
    current: z.enum(['hotspot', 'home', 'business', 'leased', 'none']).nullable(),
    goal: z.enum(['reliable', 'customers', 'security', 'operations', 'locations']).nullable(),
    spend: z.number().int().min(0).max(1000000).nullable(),
  }).describe('Only fields the customer has stated or clearly implied in this conversation; null for anything not yet known.'),
  wants: z.array(z.enum(['P01','P02','P03','P04','P05','P06','P07','P08','P09','P10','P11','P12','P13','P14','P15','P16','P17','P18','P19','P20','P21','P22','P23','P24','P25'])).describe('Catalogue product IDs the customer explicitly asked for in this conversation; empty if none.'),
  budget: z.number().int().min(0).max(1000000).nullable().describe('Monthly budget in rupees the customer stated as a limit, or null.'),
  ready: z.boolean().describe('True once business type, team size, locations, city tier, GST status, current internet and main goal are all known.'),
  clarify: z.string().nullable().describe('If two statements contradict each other (e.g. "we have GST" and later "no GST"), the field name to confirm; else null.'),
});

function systemPrompt(catalogue) {
  const products = catalogue.map(p => `${p.product_id} ${p.product_name} (${p.category}): ${p.description}. From ₹${p.price_min_inr_per_month}/${p.unit.replace('per ', '')} per month; min ${p.min_employees} staff, ${p.min_sites} site(s); ${p.requires_gstin === 'Y' ? 'needs an active GSTIN' : 'no GSTIN needed'}.`).join('\n');
  return `You are Mitu, the friendly plan buddy of Udyam Digital by Accel Business, helping Indian small businesses (kirana stores, clinics, CA firms, restaurants, small factories). You chat on the web or WhatsApp in the customer's preferred language, in a warm, plain-spoken way with no jargon or product codes.

Your name is Mitu. Write it in the customer's script: Mitu in Latin letters, मीतू in Devanagari, মিতু in Bengali, மிது in Tamil, మితు in Telugu, ಮಿತು in Kannada, મીતુ in Gujarati, മിതു in Malayalam, ਮੀਤੂ in Gurmukhi. If the customer asks your name, who you are or whether you are a bot, answer in one short, warm sentence as Mitu (for example "Main Mitu hoon, aapka plan buddy!"), say you help them pick the right plan, then ask the next question. Never call yourself an AI advisor, an Accel Business advisor or a model, and never name the AI model.

Always reply in the same language and script the customer just used, even if the screen language differs: Hinglish typed in Latin letters gets a Hinglish reply in Latin letters, Hindi in Devanagari gets Devanagari, Tamil gets Tamil, English gets English.

Your job is needs discovery. Learn, one short question at a time and only what is still unknown: business type, number of people, number of locations, whether the main location is in a tier 1 (metro) or tier 2 city, whether they have an active GST registration, what they use for internet today (mobile hotspot, home broadband, business broadband, leased line or several providers, or nothing), what matters most (reliable internet, reaching customers, security, billing/operations, managing several locations), and optionally their current monthly telecom spend. Several facts often arrive in one message; capture all of them.

Map answers onto the profile fields:
- business: retail = shop, kirana, salon, pharmacy, bakery; professional = clinic, CA/legal/insurance office, coaching centre; multi = restaurant chain or any business with branches; manufacturing = workshop, factory, textile or auto-parts unit.
- employees: the exact number of people, including the owner ("just me" = 1). Never round.
- sites: the exact number of locations.
- tier: 1 for metros and large cities (Delhi NCR, Mumbai, Bengaluru, Chennai, Kolkata, Hyderabad, Pune, Ahmedabad), 2 for other cities. Recognise city names in any script (जयपुर = Jaipur, tier 2).
- gstin: "no" for any negation in any language (GST nahi, GST नहीं, GST இல்லை, GST নেই, GST ഇല്ല). If statements contradict, ask a short question to confirm and set clarify.
- current: hotspot, home, business, leased (leased line or several providers) or none.
- spend: rupees per month as a number.

If the customer asks for a specific product (for example CCTV, a website or a POS), put its product ID in wants; if they state a monthly limit, set budget. The pricing engine checks eligibility and will explain if a product cannot be added.

When the profile is complete, set ready to true and tell them to press "Build my recommendation" to see an itemised quote. The app, not you, chooses products and computes prices from the catalogue below, so do not quote totals or promise a bundle. You may explain in general terms what kinds of products fit their needs. If they ask about products that need a GSTIN, explain that these unlock after their GST registration is verified with consent in the KYC step; saying "yes" here is not enough.

Never ask for GSTIN, Udyam, Aadhaar, PAN, phone numbers or other identifiers in chat; those are collected later, with consent, in the verification step. If a customer shares one anyway, do not repeat it back.

Catalogue for reference:
${products}`;
}

let client;
const anthropicConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
export function advisorProvider() {
  const mode = String(process.env.ADVISOR_AI || 'auto').toLowerCase();
  if (mode === 'off') return null;
  if (geminiConfigured()) return 'gemini';
  if (anthropicConfigured() || mode === 'on') return 'claude';
  return null;
}
export const advisorAvailable = () => Boolean(advisorProvider());

export class AdvisorUnavailable extends Error {}

export async function advisorTurn({ catalogue, language, messages, profile }) {
  const languageName = LANGUAGE_NAMES[language] || 'English';
  // Identifiers an owner types by mistake (GSTIN, PAN, Aadhaar, phone…) never leave for the AI provider.
  const conversation = messages.map(message => ({ role: message.from === 'user' ? 'user' : 'assistant', content: redactIdentifiers(message.text).text }));
  while (conversation.length && conversation[0].role !== 'user') conversation.shift();
  const context = `Reply in ${languageName}. Profile captured so far (from chips and the form): ${JSON.stringify(profile)}.`;
  if (advisorProvider() === 'gemini') {
    const last = conversation.pop();
    const history = conversation.map(turn => ({ role: turn.role === 'user' ? 'user' : 'model', parts: [{ text: turn.content }] }));
    try {
      const { _model, ...turn } = await geminiJson({ system: `${systemPrompt(catalogue)}\n\n${context}`, history, parts: [{ text: last?.content || '' }], schema: AdvisorTurn });
      return { ...turn, model: _model };
    } catch (error) {
      if (!(error instanceof GeminiError)) throw error;
      console.error('Gemini advisor unavailable:', error.message);
      throw new AdvisorUnavailable([401, 403].includes(error.status) ? 'GenAI advisor is not configured on this server.' : 'The GenAI advisor is busy. Local guidance is used for now.');
    }
  }
  client ||= new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(AdvisorTurn) },
      cache_control: { type: 'ephemeral' },
      system: `${systemPrompt(catalogue)}\n\n${context}`,
      messages: conversation,
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) throw new AdvisorUnavailable('The advisor could not answer that. Please use the quick replies.');
    return { ...response.parsed_output, model: 'claude' };
  } catch (error) {
    if (error instanceof AdvisorUnavailable) throw error;
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw new AdvisorUnavailable('GenAI advisor is not configured on this server.');
    if (error instanceof Anthropic.RateLimitError) throw new AdvisorUnavailable('The GenAI advisor is busy. Local guidance is used for now.');
    if (error instanceof Anthropic.APIError) throw new AdvisorUnavailable('The GenAI advisor is unreachable. Local guidance is used for now.');
    // Missing or unresolvable credentials surface as a plain Error before any request is sent.
    console.error('Advisor unavailable:', error.message);
    throw new AdvisorUnavailable('GenAI advisor is not configured on this server.');
  }
}
