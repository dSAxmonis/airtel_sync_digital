// Evaluation set for Mitu's replies: [message, screen language, intent the pre-router should pick (null = answer/AI)].
export const CASES = [
  ['hey cute boy', 'hi-IN', 'compliment'], ['kya naam h tumhara', 'hi-IN', 'identity'], ['tum bot ho?', 'en-IN', 'model'],
  ['What is your name?', 'en-IN', 'identity'], ['आपका नाम क्या है?', 'hi-IN', 'identity'], ['உங்கள் பெயர் என்ன?', 'ta-IN', 'identity'],
  ['hi', 'en-IN', 'greeting'], ['hello', 'hi-IN', 'greeting'], ['नमस्ते', 'hi-IN', 'greeting'], ['வணக்கம்', 'ta-IN', 'greeting'],
  ['নমস্কার', 'bn-IN', 'greeting'], ['kaise ho', 'hi-IN', 'greeting'], ['thank you mitu', 'en-IN', 'thanks'], ['धन्यवाद', 'hi-IN', 'thanks'],
  ['kya kar sakte ho?', 'hi-IN', 'capability'], ['What can you do?', 'en-IN', 'capability'], ['kitna kharcha aayega', 'hi-IN', 'price'],
  ['how much will it cost?', 'en-IN', 'price'], ['इसकी कीमत क्या है?', 'hi-IN', 'price'], ['static IP kya hota hai', 'hi-IN', 'product'],
  ['what is failover?', 'en-IN', 'product'], ['leased line kya hai', 'hi-IN', 'product'], ['documents kya chahiye?', 'hi-IN', 'kyc'],
  ['do I need DigiLocker?', 'en-IN', 'kyc'], ['kitne din mein lagega?', 'hi-IN', 'time'], ['how long does installation take?', 'en-IN', 'time'],
  ['kisi se baat karni hai', 'hi-IN', 'human'], ['can I talk to a person?', 'en-IN', 'human'], ['weather kaisa hai', 'hi-IN', 'offtopic'],
  ['joke sunao', 'hi-IN', 'offtopic'], ['who will win the cricket match?', 'en-IN', 'offtopic'], ['மழை வருமா? வானிலை எப்படி?', 'ta-IN', 'offtopic'],
  ['mera dukaan kolkata mein hai', 'hi-IN', null], ['mujhe wifi chahiye', 'hi-IN', null], ['dental clinic in Kolkata, 8 staff', 'en-IN', null],
  ['मेरी दुकान में 3 लोग हैं, जीएसटी नहीं', 'hi-IN', null], ['we have GST', 'en-IN', null], ['hi, I run a salon in Pune', 'en-IN', 'greeting'],
  ['you are so smart', 'en-IN', 'compliment'],
  ['wow who made u', 'en-IN', 'creator'], ['tumhe kisne banaya', 'hi-IN', 'creator'], ['who built you?', 'en-IN', 'creator'],
  ['why u not answering what i ask', 'en-IN', 'complaint'], ['do u always give this answer only', 'en-IN', 'complaint'],
  ['u dont understand', 'en-IN', 'complaint'], ['which ai are u', 'en-IN', 'model'], ['are you chatgpt?', 'en-IN', 'model'],
  ['are u a bot', 'en-IN', 'model'], ['who r u', 'en-IN', 'identity'],
  ['who is monis', 'en-IN', 'team'], ['who is ubesh?', 'en-IN', 'team'], ['monis kaun hai', 'hi-IN', 'team'],
  ['who is alien', 'en-IN', 'offtopic'], ['who is the prime minister?', 'en-IN', 'offtopic'], ['shahrukh khan kaun hai', 'hi-IN', 'offtopic'],
  ['प्रधानमंत्री कौन है?', 'hi-IN', 'offtopic'],
];

// Multi-turn chats: each reply must differ from the one before, and the same question is never asked twice in a row.
export const CONVERSATIONS = [
  ['wow who made u', 'why u not answering what i ask', 'do u always give this answer only'],
  ['hi', 'who r u', 'what can you do?'],
  ['kya naam h tumhara', 'tumhe kisne banaya', 'kitna kharcha aayega'],
  ['are u a bot', 'which ai are u', 'u dont understand'],
  ['hey cute boy', 'thank you mitu', 'documents kya chahiye?'],
  ['why u not answering what i ask', 'why u not answering what i ask', 'how long does installation take?'],
  ['what is failover?', 'what is ur name', 'can I talk to a person?'],
  ['who is monis', 'who is alien', 'who is alien'],
];

// Checks every reply must pass.
const SCRIPTS = [['Devanagari', /[ऀ-ॿ]/], ['Tamil', /[஀-௿]/], ['Bengali', /[ঀ-৿]/], ['Telugu', /[ఀ-౿]/], ['Kannada', /[ಀ-೿]/], ['Gujarati', /[઀-૿]/], ['Malayalam', /[ഀ-ൿ]/], ['Gurmukhi', /[਀-੿]/]];
const scriptOf = text => (SCRIPTS.find(([, regex]) => regex.test(text)) || ['Latin'])[0];
export function check(message, reply, { noQuestion = false } = {}) {
  const problems = [];
  if (!reply || !reply.trim()) return ['empty reply'];
  if (scriptOf(reply) !== scriptOf(message)) problems.push(`script ${scriptOf(reply)} ≠ ${scriptOf(message)}`);
  const sentences = reply.split(/(?<=[.!?।])\s+/).filter(Boolean).length;
  const words = reply.split(/\s+/).filter(Boolean).length;
  if (sentences > 3) problems.push(`${sentences} sentences`);
  if (words > 45) problems.push(`${words} words`);
  if (!noQuestion && !/[?？]/.test(reply)) problems.push('no next question');
  if (/gemini|claude|openai|gpt|language model|\bLLM\b/i.test(reply)) problems.push('names a model');
  if (/₹\s?(?!1\b)\d/.test(reply)) problems.push('quotes a price');
  return problems;
}
