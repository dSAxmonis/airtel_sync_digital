// Mitu, the advisor's persona. When an owner asks who they are talking to, the answer is a short, warm
// introduction in the owner's own language and script, then the chat moves on to the next question.

const ASKS_IDENTITY = /\b(your name|who are you|what are you|are you (a |an )?(bot|robot|human|real person|ai|machine))\b|\b(kya|kia)\s*(naam|nam|name)\b|\b(naam|nam|name)\s*(kya|kia)\b|\b(tumhara|tera|aapka|apka|tumhaara)\s*(naam|nam|name)\b|\b(tum|aap|ap)\s*(kaun|kon)\b|आपका नाम|तुम्हारा नाम|तेरा नाम|नाम क्या|कौन हो|कौन हैं|तुमचे नाव|तुझे नाव|कोण आहात|உங்கள் பெயர்|உன் பெயர்|நீங்கள் யார்|நீ யார்|మీ పేరు|నీ పేరు|మీరు ఎవరు|ನಿಮ್ಮ ಹೆಸರು|ನಿನ್ನ ಹೆಸರು|ನೀವು ಯಾರು|તમારું નામ|તારું નામ|તમે કોણ|আপনার নাম|তোমার নাম|আপনি কে|তুমি কে|നിങ്ങളുടെ പേര്|നിന്റെ പേര്|നിങ്ങൾ ആരാണ്|ਤੁਹਾਡਾ ਨਾਮ|ਤੇਰਾ ਨਾਮ|ਤੁਸੀਂ ਕੌਣ/i;

const INTRO = {
  en: 'I’m Mitu, your plan buddy! I’ll help you pick the right plan for your business.',
  hinglish: 'Main Mitu hoon, aapka plan buddy! Aapke business ke liye sahi plan chunne mein madad karunga.',
  hi: 'मैं मीतू हूँ, आपका प्लान साथी! आपके बिज़नेस के लिए सही प्लान चुनने में मदद करूँगा।',
  mr: 'मी मीतू, तुमचा प्लॅन साथी! तुमच्या व्यवसायासाठी योग्य प्लॅन निवडायला मदत करतो.',
  ta: 'நான் மிது, உங்கள் பிளான் துணை! உங்கள் தொழிலுக்குச் சரியான பிளானைத் தேர்ந்தெடுக்க உதவுகிறேன்.',
  te: 'నేను మితు, మీ ప్లాన్ తోడు! మీ వ్యాపారానికి సరైన ప్లాన్ ఎంచుకోవడంలో సహాయం చేస్తాను.',
  kn: 'ನಾನು ಮಿತು, ನಿಮ್ಮ ಪ್ಲಾನ್ ಜೊತೆಗಾರ! ನಿಮ್ಮ ವ್ಯಾಪಾರಕ್ಕೆ ಸರಿಯಾದ ಪ್ಲಾನ್ ಆಯ್ಕೆ ಮಾಡಲು ಸಹಾಯ ಮಾಡುತ್ತೇನೆ.',
  gu: 'હું મીતુ છું, તમારો પ્લાન સાથી! તમારા બિઝનેસ માટે યોગ્ય પ્લાન પસંદ કરવામાં મદદ કરીશ.',
  bn: 'আমি মিতু, আপনার প্ল্যান সঙ্গী! আপনার ব্যবসার জন্য ঠিক প্ল্যান বেছে নিতে সাহায্য করব।',
  ml: 'ഞാൻ മിതു, നിങ്ങളുടെ പ്ലാൻ കൂട്ടുകാരൻ! നിങ്ങളുടെ ബിസിനസിന് ശരിയായ പ്ലാൻ തിരഞ്ഞെടുക്കാൻ സഹായിക്കാം.',
  pa: 'ਮੈਂ ਮੀਤੂ ਹਾਂ, ਤੁਹਾਡਾ ਪਲਾਨ ਸਾਥੀ! ਤੁਹਾਡੇ ਕਾਰੋਬਾਰ ਲਈ ਸਹੀ ਪਲਾਨ ਚੁਣਨ ਵਿੱਚ ਮਦਦ ਕਰਾਂਗਾ।',
};

// The reply follows the script the owner typed in, not only the language picked on screen.
function replyLanguage(text, language = 'en-IN') {
  const code = String(language).slice(0, 2);
  if (/[஀-௿]/.test(text)) return 'ta';
  if (/[ఀ-౿]/.test(text)) return 'te';
  if (/[ಀ-೿]/.test(text)) return 'kn';
  if (/[઀-૿]/.test(text)) return 'gu';
  if (/[ঀ-৿]/.test(text)) return 'bn';
  if (/[ഀ-ൿ]/.test(text)) return 'ml';
  if (/[਀-੿]/.test(text)) return 'pa';
  if (/[ऀ-ॿ]/.test(text)) return code === 'mr' || /तुमचे|तुझे|कोण आहात/.test(text) ? 'mr' : 'hi';
  if (/\b(kya|kia|hai|hain|h|tum|tumhara|aap|apka|aapka|kaun|kon|naam|nam|bhai|bata|batao)\b/i.test(text)) return 'hinglish';
  return 'en';
}

export const asksIdentity = text => ASKS_IDENTITY.test(String(text || ''));
export const mituIntro = (text, language) => INTRO[replyLanguage(String(text || ''), language)];
