// Asked "what's your name?", the advisor answers as Mitu in the owner's own language and script.
import test from 'node:test';
import assert from 'node:assert/strict';
import { asksIdentity, mituIntro } from '../libs/mitu.js';

test('identity questions are recognised in several languages', () => {
  for (const text of ['kya naam h tumhara', 'What is your name?', 'who are you', 'are you a bot?', 'आपका नाम क्या है?', 'உங்கள் பெயர் என்ன?', 'আপনার নাম কী?', 'tum kaun ho'])
    assert.ok(asksIdentity(text), text);
  for (const text of ['Dental clinic in Kolkata, 8 staff', 'मेरी दुकान में 3 लोग हैं', 'name of my shop is Sharma Stores']) assert.ok(!asksIdentity(text), text);
});

test('Mitu replies in the same language and script', () => {
  assert.match(mituIntro('kya naam h tumhara', 'en-IN'), /^Main Mitu hoon/);
  assert.match(mituIntro('What is your name?', 'en-IN'), /^I’m Mitu/);
  assert.match(mituIntro('आपका नाम क्या है?', 'en-IN'), /मीतू/);
  assert.match(mituIntro('உங்கள் பெயர் என்ன?', 'ta-IN'), /மிது/);
  for (const text of ['kya naam h tumhara', 'who are you', 'आपका नाम क्या है?']) assert.doesNotMatch(mituIntro(text, 'en-IN'), /advisor|Gemini|Claude/i);
});

test('the advisor API answers the name question as Mitu, then carries on', async () => {
  const { startServer, dropDatabase } = await import('./helpers.js');
  const DB = 'udyam_digital_mitu_test';
  await dropDatabase(DB);
  const server = await startServer(5097, DB);
  try {
    const anon = server.actor();
    for (const [text, language, expected] of [['kya naam h tumhara', 'en-IN', /Main Mitu hoon/], ['What is your name?', 'en-IN', /I’m Mitu/], ['आपका नाम क्या है?', 'hi-IN', /मीतू/]]) {
      const turn = await anon.post('/advisor/message', { text, language, profile: {}, answered: [] });
      assert.equal(turn.status, 200);
      assert.match(turn.body.intro, expected);
      assert.equal(turn.body.recognized, true);
    }
  } finally { server.stop(); await dropDatabase(DB); }
});
