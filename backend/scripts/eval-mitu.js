// Runs Mitu's evaluation set against a running API (default http://localhost:5050) and prints message → reply → pass/fail.
// Usage: node scripts/eval-mitu.js [baseUrl] [maxCases]
import { CASES, check } from './mitu-eval-cases.js';

const base = process.argv[2] || 'http://localhost:5050';
const max = Number(process.argv[3] || CASES.length);
const SCREEN_NEXT = { 'hi-IN': 'आप किस तरह का व्यवसाय चलाते हैं?', 'ta-IN': 'நீங்கள் எந்த வகையான தொழில் செய்கிறீர்கள்?', 'bn-IN': 'আপনি কী ধরনের ব্যবসা চালান?', 'en-IN': 'What kind of business do you run?' };
let pass = 0, n = 0;
for (const [text, language] of CASES.slice(0, max)) {
  let reply = '', mode = '', noQuestion = false;
  try {
    const response = await fetch(`${base}/api/advisor/message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, language, profile: {}, answered: [] }), signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    mode = data.mode;
    if (data.error && /quota|429/i.test(data.error)) { console.log('Stopping: quota reached'); break; }
    noQuestion = Boolean(data.noQuestion);
    reply = data.intro ? (data.noQuestion ? data.intro : `${data.intro} ${data.bridge || SCREEN_NEXT[language]}`) : data.reply || (data.recognized ? `(next question) ${SCREEN_NEXT[language]}` : `(not understood) ${SCREEN_NEXT[language]}`);
  } catch (error) { reply = `ERROR ${error.message}`; }
  const problems = check(text, reply, { noQuestion });
  n++; if (!problems.length) pass++;
  console.log(`${problems.length ? 'FAIL' : 'pass'} | ${mode.padEnd(5)} | ${text} → ${reply.replace(/\s+/g, ' ')}${problems.length ? `  [${problems.join('; ')}]` : ''}`);
}
console.log(`\n${pass}/${n} passed (${Math.round(pass / n * 100)}%)`);
