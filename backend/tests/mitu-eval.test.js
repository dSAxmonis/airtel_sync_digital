// Mitu's evaluation set through the deterministic path (pre-router + local rules, no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES, CONVERSATIONS, check } from '../scripts/mitu-eval-cases.js';
import { classify, mituReply, mituTurn, nextQuestion, replyLanguage } from '../libs/mitu.js';
import { understand } from '../libs/advisorNlu.js';

const CATALOGUE = [
  { product_name: 'Static IP', description: 'Fixed public IP for CCTV, servers or remote access' },
  { product_name: 'Backup 4G/5G Failover', description: 'Automatic switch to 4G/5G when the main line drops' },
  { product_name: 'Leased Line 20 Mbps', description: 'Dedicated, symmetric business-grade line' },
];
// What the app shows: Mitu's line, then the next question (screen languages use their own question text).
const SCREEN_NEXT = { 'hi-IN': 'आप किस तरह का व्यवसाय चलाते हैं?', 'ta-IN': 'நீங்கள் எந்த வகையான தொழில் செய்கிறீர்கள்?', 'bn-IN': 'আপনি কী ধরনের ব্যবসা চালান?', 'en-IN': 'What kind of business do you run?' };

test('the pre-router picks the right intent for each message', () => {
  for (const [text, , intent] of CASES) assert.equal(classify(text), intent, text);
});

test('every routed reply answers first, then asks one next question, in the owner\'s script', () => {
  let passed = 0, total = 0;
  for (const [text, language, intent] of CASES) {
    if (!intent) continue;
    total++;
    const turn = mituTurn(text, { language, answered: [], catalogue: CATALOGUE });
    const done = understand(text).found;
    const reply = turn.noQuestion ? turn.intro : `${turn.intro} ${nextQuestion(turn.lang, done) || SCREEN_NEXT[language]}`;
    const problems = check(text, reply, { noQuestion: turn.noQuestion });
    if (!problems.length) passed++; else console.log('FAIL', text, '→', reply, problems);
  }
  assert.ok(passed / total >= 0.9, `${passed}/${total} passed`);
});

test('the reply language follows the script typed', () => {
  assert.equal(replyLanguage('kya naam h tumhara', 'en-IN'), 'hinglish');
  assert.equal(replyLanguage('hey cute boy', 'hi-IN'), 'en');
  assert.equal(replyLanguage('नमस्ते', 'en-IN'), 'hi');
  assert.equal(replyLanguage('வணக்கம்', 'en-IN'), 'ta');
});

test('who made Mitu and which AI it is get direct answers, never a model name', () => {
  assert.match(mituTurn('wow who made u').intro, /Team Ticchi Gang \(Monis and Ubesh, NSUT Delhi\)/);
  assert.match(mituTurn('tumhe kisne banaya', { language: 'hi-IN' }).intro, /Monis aur Ubesh/);
  assert.doesNotMatch(mituTurn('which ai are u').intro, /gemini|gpt|claude|openai/i);
});

test('a complaint gets an apology and an invitation, not the business question again', () => {
  const turn = mituReply('why u not answering what i ask');
  assert.equal(turn.noQuestion, true);
  assert.equal(turn.bridge, null);
  assert.match(turn.intro, /Sorry/);
});

test('in a multi-turn chat Mitu never repeats its last reply or its last question', () => {
  for (const chat of CONVERSATIONS) {
    const history = [];
    for (const text of chat) {
      history.push({ from: 'user', text });
      const turn = mituReply(text, { history, catalogue: CATALOGUE });
      // null means the message goes to the AI with the history, so nothing is repeated here.
      const reply = turn ? (turn.bridge ? `${turn.intro}\n${turn.bridge}` : turn.intro) : `(AI answer to: ${text})`;
      const last = [...history].reverse().find(item => item.from === 'assistant')?.text || '';
      assert.notEqual(reply, last, `${chat.join(' | ')} → repeated reply`);
      if (turn?.bridge) assert.ok(!last.includes(turn.bridge), `${chat.join(' | ')} → repeated question`);
      history.push({ from: 'assistant', text: reply });
    }
  }
});
