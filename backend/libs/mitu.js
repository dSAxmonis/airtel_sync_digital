// Mitu, the advisor's persona, and a small rule-based pre-router for messages that are not answers to the
// advisor's questions (greetings, compliments, "who are you", "what can you do", price, product, KYC, time to go
// live, asking for a person, off-topic). Mitu answers those in the owner's own language and script, in one short
// line, and the app then asks the next question. Everything else goes to the AI (or the local rules).

const LANGS = ['en', 'hinglish', 'hi', 'mr', 'ta', 'te', 'kn', 'gu', 'bn', 'ml', 'pa'];

// The reply follows the script the owner typed in, not only the language picked on screen.
export function replyLanguage(text, language = 'en-IN') {
  const value = String(text || '');
  const code = String(language).slice(0, 2);
  if (/[஀-௿]/.test(value)) return 'ta';
  if (/[ఀ-౿]/.test(value)) return 'te';
  if (/[ಀ-೿]/.test(value)) return 'kn';
  if (/[઀-૿]/.test(value)) return 'gu';
  if (/[ঀ-৿]/.test(value)) return 'bn';
  if (/[ഀ-ൿ]/.test(value)) return 'ml';
  if (/[਀-੿]/.test(value)) return 'pa';
  if (/[ऀ-ॿ]/.test(value)) return code === 'mr' || /तुमचे|तुझे|कोण आहात|काय|आहे|किती/.test(value) ? 'mr' : 'hi';
  if (/\b(kya|kia|hai|hain|h|ho|tum|tumhara|tera|aap|ap|apka|aapka|kaun|kon|naam|nam|bhai|bata|batao|sunao|kitna|kitne|kaise|kese|chahiye|mujhe|mera|meri|nahi|nhi|karo|kar|sakte|lagega|kharcha|din|baat|kisi|tumhe|tumko|kisne|banaya|kyu|kyun|samajh|samjhe|jawab|yaar)\b/i.test(value)) return 'hinglish';
  return 'en';
}

const INTENTS = [
  ['team', /\b(who|whos|who's|kaun|kon)\b.*\b(monis|ubesh|ticchi)\b|\b(monis|ubesh|ticchi)\b.*\b(kaun|kon|who)\b|(मोनिस|उबेश|टिच्ची).*कौन/i],
  ['creator', /\bwho (made|built|created|developed|designed|programmed|trained) (you|u)\b|\bwho is your (maker|creator|owner|developer)\b|\b(tumhe|tumko|aapko|apko|tujhe) kisne (banaya|bnaya)|kisne (banaya|bnaya) (tumhe|tumko|aapko|apko)|तुम्हें किसने|आपको किसने|किसने बनाया|உன்னை யார் உருவாக்கினார்|உங்களை யார் உருவாக்கினார்|నిన్ను ఎవరు తయారు|మిమ్మల్ని ఎవరు|ನಿನ್ನನ್ನು ಯಾರು|ನಿಮ್ಮನ್ನು ಯಾರು|તને કોણે બનાવ્યો|તમને કોણે|তোমাকে কে বানিয়েছে|আপনাকে কে তৈরি|നിന്നെ ആരാണ് ഉണ്ടാക്കിയത്|ਤੈਨੂੰ ਕਿਸ ਨੇ ਬਣਾਇਆ/i],
  ['model', /\b(are|r) (you|u) (a |an )?(bot|robot|ai|machine|real|human|real person)\b|\b(tum|aap|tu) (bot|robot|ai|insaan|real) (ho|hai|h)\b|\b(which|what|kaun ?sa|konsa) (ai|model|llm|engine)\b|\bare (you|u) (chatgpt|gpt|gemini|claude|openai|google)\b|\b(chatgpt|gemini|gpt|claude) (ho|hai|h)\b|कौन सा (AI|मॉडल)/i],
  ['complaint', /\b(not|n't|nahi|nhi|nahin) (answering|answer|replying|reply|listening|helping|understanding|understand|samajh|samajhte|samjhe)\b|\b(you|u) (don'?t|dont|do not) (understand|get it|listen)\b|\b(bad|worst|stupid|dumb) (bot|answer|reply)\b|\bdidn'?t (answer|reply|listen)\b|\b(same|this) (answer|reply|question) (only|again)\b|\balways (give|say|ask|giving|saying|asking)\b|\bagain and again\b|\b(baar|bar) (baar|bar)\b|\brepeat(ing)?\b|\b(useless|bakwas|bekaar|bekar)\b|\bjawab (nahi|nhi|kyu|kyon)|\bsun (nahi|nhi) (rahe|rha|raha)|बार बार|जवाब नहीं|जवाब क्यों नहीं|सुन नहीं रहे|बेकार/i],
  ['identity', /\b(your name|ur name|who (are|r) (you|u)|what (are|r) (you|u)|are you (a |an )?(bot|robot|human|real person|ai|machine))\b|\b(kya|kia)\s*(naam|nam|name)\b|\b(naam|nam|name)\s*(kya|kia)\b|\b(tumhara|tera|aapka|apka|tumhaara)\s*(naam|nam|name)\b|\b(tum|aap|ap)\s*(kaun|kon)\b|\b(tum|aap|ap)\s*bot\b|आपका नाम|तुम्हारा नाम|तेरा नाम|नाम क्या|कौन हो|कौन हैं|तुमचे नाव|तुझे नाव|कोण आहात|உங்கள் பெயர்|உன் பெயர்|நீங்கள் யார்|நீ யார்|మీ పేరు|నీ పేరు|మీరు ఎవరు|ನಿಮ್ಮ ಹೆಸರು|ನಿನ್ನ ಹೆಸರು|ನೀವು ಯಾರು|તમારું નામ|તારું નામ|તમે કોણ|আপনার নাম|তোমার নাম|আপনি কে|তুমি কে|നിങ്ങളുടെ പേര്|നിന്റെ പേര്|നിങ്ങൾ ആരാണ്|ਤੁਹਾਡਾ ਨਾਮ|ਤੇਰਾ ਨਾਮ|ਤੁਸੀਂ ਕੌਣ/i],
  ['human', /\b(talk|speak|connect) (to|with) (a |an )?(real |actual )?(person|human|agent|someone|executive|representative)|customer care|call me( back)?|callback|kisi se baat|kisi insaan|agent se baat|insaan se baat|किसी से बात|कॉल करो|मुझे कॉल/i],
  ['capability', /\bwhat can you do\b|\bhow can you help\b|\bwhat do you do\b|kya (kya )?kar sakte|kya karte ho|kya madad kar|क्या कर सकते|क्या मदद|काय करू शकता|என்ன செய்ய முடியும்|ఏమి చేయగలరు|ಏನು ಮಾಡಬಲ್ಲಿರಿ|શું કરી શકો|কী করতে পারো|কি করতে পারেন|എന്ത് ചെയ്യാൻ കഴിയും|ਕੀ ਕਰ ਸਕਦੇ/i],
  ['kyc', /\b(kyc|digilocker|documents?|papers?|kagaz|kaagaz|verification|verify)\b|दस्तावेज़|कागज़|केवाईसी|डिजिलॉकर|ஆவணங்கள்|పత్రాలు|ದಾಖಲೆ|દસ્તાવેજ|নথি|കാഗസ്|രേഖ|ਦਸਤਾਵੇਜ਼/i],
  ['time', /\b(how long|how many days|when (will|can) (it|i|you)|installation time|kitne din|kab tak|kab lagega|kab chalu|kab install)\b|कितने दिन|कब तक|कब लगेगा|किती दिवस|எத்தனை நாள்|ఎన్ని రోజులు|ಎಷ್ಟು ದಿನ|કેટલા દિવસ|কত দিন|എത്ര ദിവസം|ਕਿੰਨੇ ਦਿਨ/i],
  ['price', /\b(price|prices|pricing|cost|costs|charges?|fees?|rate|tariff|kitna|kitne ka|kharcha|kharch|paisa|paise|sasta|mehenga|budget)\b|कितना|कितने का|ख़र्च|खर्च|कीमत|दाम|किती|விலை|எவ்வளவு|ధర|ఎంత|ಬೆಲೆ|ಎಷ್ಟು|કિંમત|કેટલું|দাম|কত টাকা|വില|എത്ര|ਕੀਮਤ|ਕਿੰਨਾ/i],
  ['offtopic', /^\s*(who|whos|who's|who is|who was)\b(?!.*\b(you|u|your|ur)\b)|\b(kaun|kon) (hai|tha|h)\s*\??\s*$|कौन (है|था)|\b(weather|mausam|joke|jokes|cricket|score|match|movie|film|song|gaana|politics|election|news|recipe|homework|girlfriend|boyfriend|shayari)\b|मौसम|चुटकुला|क्रिकेट|फ़िल्म|गाना|राजनीति|வானிலை|நகைச்சுவை|వాతావరణం|ಹವಾಮಾನ|હવામાન|আবহাওয়া|കാലാവസ്ഥ|ਮੌਸਮ/i],
  ['thanks', /\b(thanks|thank you|thank u|thnx|thx|shukriya|dhanyavad|dhanyawad)\b|धन्यवाद|शुक्रिया|आभार|நன்றி|ధన్యవాదాలు|ಧನ್ಯವಾದ|આભાર|ধন্যবাদ|നന്ദി|ਧੰਨਵਾਦ/i],
  ['compliment', /\b(cute|sweet|nice|lovely|awesome|great job|good boy|good bot|smart|so cool|beautiful)\b|प्यारा|अच्छे हो|बढ़िया/i],
  ['greeting', /^\s*((?:hi+|hello|hey+|hii+|helo|namaste|namaskar|good (morning|afternoon|evening)|kaise ho|kese ho|how are you|yo|sup|नमस्ते|नमस्कार|हेलो|कैसे हो|வணக்கம்|నమస్కారం|ನಮಸ್ಕಾರ|નમસ્તે|নমস্কার|নমস্তে|നമസ്കാരം|ਸਤ ਸ੍ਰੀ ਅਕਾਲ|हैलो|हाय|हलो|ஹலோ|హలో|ಹಲೋ|હેલો|হ্যালো|ഹലോ|ਹੈਲੋ)(?=$|[\s!.?,।🙏👋]))/i],
];

// Product names, only from the catalogue. The answer quotes the catalogue's own description.
const PRODUCT_WORDS = [
  [/static ip|स्टैटिक आईपी/i, /static ip/i], [/failover|backup (internet|connection|4g|5g)/i, /failover/i], [/leased line|लीज़्ड लाइन/i, /leased line/i],
  [/sd-?wan/i, /sd-?wan/i], [/cctv|camera|कैमरा/i, /cctv/i], [/air ?fiber|5g/i, /airfiber/i], [/\bfib(re|er)\b|broadband|wifi|wi-fi|वाईफाई|इंटरनेट/i, /fibre/i],
  [/\b(email|office suite|domain email)\b/i, /email/i], [/antivirus|endpoint|security software/i, /endpoint/i], [/firewall/i, /firewall/i], [/website|वेबसाइट/i, /website/i],
  [/\bpos\b|billing machine|billing software/i, /pos|billing/i], [/sensor|iot/i, /sensor|iot/i], [/postpaid|business line|sim/i, /postpaid/i],
];
const ASKS_MEANING = /\bwhat (is|are|does)\b|\bmeaning\b|\bmatlab\b|kya hota|kya hai|kya hoti|kya karta|kaam kya|क्या होता|क्या है|क्या होती|मतलब|काय आहे|என்றால் என்ன|అంటే ఏమిటి|ಎಂದರೇನು|એટલે શું|মানে কী|কী\b|എന്താണ്|ਕੀ ਹੁੰਦਾ/i;

const L = (en, hinglish, hi, mr, ta, te, kn, gu, bn, ml, pa) => ({ en, hinglish, hi, mr, ta, te, kn, gu, bn, ml, pa });
const SAY = {
  identity: L('I’m Mitu, your plan buddy! I’ll help you pick the right plan for your business.', 'Main Mitu hoon, aapka plan buddy! Aapke business ke liye sahi plan chunne mein madad karunga.', 'मैं मीतू हूँ, आपका प्लान साथी! आपके बिज़नेस के लिए सही प्लान चुनने में मदद करूँगा।', 'मी मीतू, तुमचा प्लॅन साथी! तुमच्या व्यवसायासाठी योग्य प्लॅन निवडायला मदत करतो.', 'நான் மிது, உங்கள் பிளான் துணை! உங்கள் தொழிலுக்குச் சரியான பிளானைத் தேர்ந்தெடுக்க உதவுகிறேன்.', 'నేను మితు, మీ ప్లాన్ తోడు! మీ వ్యాపారానికి సరైన ప్లాన్ ఎంచుకోవడంలో సహాయం చేస్తాను.', 'ನಾನು ಮಿತು, ನಿಮ್ಮ ಪ್ಲಾನ್ ಜೊತೆಗಾರ! ನಿಮ್ಮ ವ್ಯಾಪಾರಕ್ಕೆ ಸರಿಯಾದ ಪ್ಲಾನ್ ಆಯ್ಕೆ ಮಾಡಲು ಸಹಾಯ ಮಾಡುತ್ತೇನೆ.', 'હું મીતુ છું, તમારો પ્લાન સાથી! તમારા બિઝનેસ માટે યોગ્ય પ્લાન પસંદ કરવામાં મદદ કરીશ.', 'আমি মিতু, আপনার প্ল্যান সঙ্গী! আপনার ব্যবসার জন্য ঠিক প্ল্যান বেছে নিতে সাহায্য করব।', 'ഞാൻ മിതു, നിങ്ങളുടെ പ്ലാൻ കൂട്ടുകാരൻ! നിങ്ങളുടെ ബിസിനസിന് ശരിയായ പ്ലാൻ തിരഞ്ഞെടുക്കാൻ സഹായിക്കാം.', 'ਮੈਂ ਮੀਤੂ ਹਾਂ, ਤੁਹਾਡਾ ਪਲਾਨ ਸਾਥੀ! ਤੁਹਾਡੇ ਕਾਰੋਬਾਰ ਲਈ ਸਹੀ ਪਲਾਨ ਚੁਣਨ ਵਿੱਚ ਮਦਦ ਕਰਾਂਗਾ।'),
  creator: L('I’m Mitu, the Udyam Digital plan buddy, built by Team Ticchi Gang (Monis and Ubesh, NSUT Delhi) for Accel Business.', 'Main Mitu hoon, Udyam Digital ka plan buddy. Mujhe Team Ticchi Gang (Monis aur Ubesh, NSUT Delhi) ne Accel Business ke liye banaya hai.', 'मैं मीतू हूँ, उद्यम डिजिटल का प्लान साथी। मुझे टीम टिच्ची गैंग (मोनिस और उबेश, NSUT दिल्ली) ने Accel Business के लिए बनाया है।', 'मी मीतू, उद्यम डिजिटलचा प्लॅन साथी. मला टीम टिच्ची गँग (मोनिस आणि उबेश, NSUT दिल्ली) यांनी Accel Business साठी बनवले आहे.', 'நான் மிது, Udyam Digital பிளான் துணை. என்னை Team Ticchi Gang (மோனிஸ், உபேஷ், NSUT டெல்லி) Accel Business-க்காக உருவாக்கியது.', 'నేను మితు, Udyam Digital ప్లాన్ తోడు. నన్ను Team Ticchi Gang (మోనిస్, ఉబేష్, NSUT ఢిల్లీ) Accel Business కోసం తయారు చేసింది.', 'ನಾನು ಮಿತು, Udyam Digital ಪ್ಲಾನ್ ಜೊತೆಗಾರ. ನನ್ನನ್ನು Team Ticchi Gang (ಮೋನಿಸ್, ಉಬೇಶ್, NSUT ದೆಹಲಿ) Accel Businessಗಾಗಿ ಮಾಡಿದೆ.', 'હું મીતુ છું, Udyam Digital નો પ્લાન સાથી. મને Team Ticchi Gang (મોનિસ અને ઉબેશ, NSUT દિલ્હી) એ Accel Business માટે બનાવ્યો છે.', 'আমি মিতু, Udyam Digital-এর প্ল্যান সঙ্গী। আমাকে Team Ticchi Gang (মোনিস ও উবেশ, NSUT দিল্লি) Accel Business-এর জন্য বানিয়েছে।', 'ഞാൻ മിതു, Udyam Digital-ന്റെ പ്ലാൻ കൂട്ടുകാരൻ. എന്നെ Team Ticchi Gang (മോനിസ്, ഉബേഷ്, NSUT ഡൽഹി) Accel Business-ന് വേണ്ടി ഉണ്ടാക്കി.', 'ਮੈਂ ਮੀਤੂ ਹਾਂ, Udyam Digital ਦਾ ਪਲਾਨ ਸਾਥੀ। ਮੈਨੂੰ Team Ticchi Gang (ਮੋਨਿਸ ਅਤੇ ਉਬੇਸ਼, NSUT ਦਿੱਲੀ) ਨੇ Accel Business ਲਈ ਬਣਾਇਆ ਹੈ।'),
  complaint: L('Sorry, that was repetitive. Ask me anything about plans, prices, documents or installation, and I’ll answer it directly.', 'Sorry, main baar baar wahi keh raha tha. Plans, price, documents ya installation ke baare mein kuch bhi poochiye, main seedha jawab dunga.', 'माफ़ कीजिए, मैं एक ही बात दोहरा रहा था। प्लान, कीमत, दस्तावेज़ या इंस्टॉलेशन के बारे में कुछ भी पूछिए, मैं सीधा जवाब दूँगा।', 'माफ करा, मी तेच तेच सांगत होतो. प्लॅन, किंमत, कागदपत्रे किंवा इन्स्टॉलेशनबद्दल काहीही विचारा, मी थेट उत्तर देईन.', 'மன்னிக்கவும், அதையே திரும்பச் சொன்னேன். பிளான், விலை, ஆவணங்கள் அல்லது நிறுவல் பற்றி எதையும் கேளுங்கள், நேரடியாகப் பதில் சொல்கிறேன்.', 'క్షమించండి, అదే మళ్లీ మళ్లీ చెప్పాను. ప్లాన్, ధర, పత్రాలు లేదా ఇన్‌స్టాలేషన్ గురించి ఏదైనా అడగండి, నేరుగా సమాధానం ఇస్తాను.', 'ಕ್ಷಮಿಸಿ, ಅದನ್ನೇ ಮತ್ತೆ ಮತ್ತೆ ಹೇಳಿದೆ. ಪ್ಲಾನ್, ಬೆಲೆ, ದಾಖಲೆ ಅಥವಾ ಅಳವಡಿಕೆ ಬಗ್ಗೆ ಏನು ಬೇಕಾದರೂ ಕೇಳಿ, ನೇರವಾಗಿ ಉತ್ತರಿಸುತ್ತೇನೆ.', 'માફ કરશો, હું એક જ વાત ફરી ફરી કહેતો હતો. પ્લાન, કિંમત, દસ્તાવેજો કે ઇન્સ્ટોલેશન વિશે કંઈ પણ પૂછો, હું સીધો જવાબ આપીશ.', 'দুঃখিত, একই কথা বারবার বলছিলাম। প্ল্যান, দাম, নথি বা ইনস্টলেশন নিয়ে যা খুশি জিজ্ঞেস করুন, সরাসরি উত্তর দেব।', 'ക്ഷമിക്കണം, ഒരേ കാര്യം ആവർത്തിച്ചു. പ്ലാൻ, വില, രേഖകൾ, ഇൻസ്റ്റലേഷൻ എന്നിവയെക്കുറിച്ച് എന്തും ചോദിക്കൂ, നേരിട്ട് മറുപടി നൽകാം.', 'ਮਾਫ਼ ਕਰਨਾ, ਮੈਂ ਇੱਕੋ ਗੱਲ ਵਾਰ-ਵਾਰ ਕਹਿ ਰਿਹਾ ਸੀ। ਪਲਾਨ, ਕੀਮਤ, ਦਸਤਾਵੇਜ਼ ਜਾਂ ਇੰਸਟਾਲੇਸ਼ਨ ਬਾਰੇ ਕੁਝ ਵੀ ਪੁੱਛੋ, ਮੈਂ ਸਿੱਧਾ ਜਵਾਬ ਦਿਆਂਗਾ।'),
  model: L('I’m Mitu, an AI assistant made for Udyam Digital. I can’t share technical details, but I’m here to help you with your plan.', 'Main Mitu hoon, Udyam Digital ke liye bana ek AI assistant. Technical details share nahi kar sakta, par aapke plan mein poori madad karunga.', 'मैं मीतू हूँ, उद्यम डिजिटल के लिए बना एक AI सहायक। तकनीकी जानकारी साझा नहीं कर सकता, पर आपके प्लान में पूरी मदद करूँगा।', 'मी मीतू, उद्यम डिजिटलसाठी बनवलेला AI सहाय्यक. तांत्रिक माहिती सांगू शकत नाही, पण तुमच्या प्लॅनमध्ये पूर्ण मदत करेन.', 'நான் மிது, Udyam Digital-க்காக உருவாக்கப்பட்ட AI உதவியாளர். தொழில்நுட்ப விவரங்களைப் பகிர முடியாது, ஆனால் உங்கள் பிளானுக்கு உதவுவேன்.', 'నేను మితు, Udyam Digital కోసం తయారైన AI సహాయకుడిని. సాంకేతిక వివరాలు చెప్పలేను, కానీ మీ ప్లాన్‌లో సహాయం చేస్తాను.', 'ನಾನು ಮಿತು, Udyam Digitalಗಾಗಿ ಮಾಡಿದ AI ಸಹಾಯಕ. ತಾಂತ್ರಿಕ ವಿವರ ಹಂಚಲು ಆಗದು, ಆದರೆ ನಿಮ್ಮ ಪ್ಲಾನ್‌ಗೆ ಸಹಾಯ ಮಾಡುತ್ತೇನೆ.', 'હું મીતુ છું, Udyam Digital માટે બનેલો AI સહાયક. ટેકનિકલ વિગતો કહી શકતો નથી, પણ તમારા પ્લાનમાં પૂરી મદદ કરીશ.', 'আমি মিতু, Udyam Digital-এর জন্য তৈরি একটি AI সহকারী। প্রযুক্তিগত বিবরণ বলতে পারি না, তবে আপনার প্ল্যানে পুরো সাহায্য করব।', 'ഞാൻ മിതു, Udyam Digital-നായി ഉണ്ടാക്കിയ AI സഹായി. സാങ്കേതിക വിവരങ്ങൾ പങ്കിടാനാവില്ല, പക്ഷേ നിങ്ങളുടെ പ്ലാനിൽ സഹായിക്കാം.', 'ਮੈਂ ਮੀਤੂ ਹਾਂ, Udyam Digital ਲਈ ਬਣਿਆ AI ਸਹਾਇਕ। ਤਕਨੀਕੀ ਜਾਣਕਾਰੀ ਸਾਂਝੀ ਨਹੀਂ ਕਰ ਸਕਦਾ, ਪਰ ਤੁਹਾਡੇ ਪਲਾਨ ਵਿੱਚ ਪੂਰੀ ਮਦਦ ਕਰਾਂਗਾ।'),
  greeting: L('Hi! 👋 How can I help you today?', 'Namaste! 🙏 Main aapki kaise madad kar sakta hoon?', 'नमस्ते! 🙏 मैं आपकी कैसे मदद कर सकता हूँ?', 'नमस्कार! 🙏 मी तुमची कशी मदत करू?', 'வணக்கம்! 🙏 நான் உங்களுக்கு எப்படி உதவலாம்?', 'నమస్కారం! 🙏 నేను మీకు ఎలా సహాయం చేయగలను?', 'ನಮಸ್ಕಾರ! 🙏 ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?', 'નમસ્તે! 🙏 હું તમારી કેવી રીતે મદદ કરી શકું?', 'নমস্কার! 🙏 আমি কীভাবে সাহায্য করতে পারি?', 'നമസ്കാരം! 🙏 ഞാൻ എങ്ങനെ സഹായിക്കാം?', 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! 🙏 ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?'),
  compliment: L('Thank you, that’s kind of you! 😊', 'Thank you, aap bhi bahut acche hain! 😊', 'धन्यवाद, आप बहुत अच्छे हैं! 😊', 'धन्यवाद, तुम्ही खूप छान आहात! 😊', 'நன்றி, நீங்களும் அருமை! 😊', 'ధన్యవాదాలు, మీరూ చాలా మంచివారు! 😊', 'ಧನ್ಯವಾದ, ನೀವೂ ತುಂಬಾ ಒಳ್ಳೆಯವರು! 😊', 'આભાર, તમે પણ ખૂબ સરસ છો! 😊', 'ধন্যবাদ, আপনিও খুব ভালো! 😊', 'നന്ദി, നിങ്ങളും വളരെ നല്ലതാണ്! 😊', 'ਧੰਨਵਾਦ, ਤੁਸੀਂ ਵੀ ਬਹੁਤ ਚੰਗੇ ਹੋ! 😊'),
  thanks: L('You’re welcome! 😊', 'Aapka swagat hai! 😊', 'आपका स्वागत है! 😊', 'तुमचे स्वागत आहे! 😊', 'மகிழ்ச்சி! 😊', 'సంతోషం! 😊', 'ಸಂತೋಷ! 😊', 'આપનું સ્વાગત છે! 😊', 'স্বাগতম! 😊', 'സന്തോഷം! 😊', 'ਤੁਹਾਡਾ ਸੁਆਗਤ ਹੈ! 😊'),
  capability: L('I find the right internet and business plan for you, show one clear monthly price, and help you verify and book the installation.', 'Main aapke business ke liye sahi internet aur business plan dhoondta hoon, ek saaf monthly price dikhata hoon, aur verification aur installation mein madad karta hoon.', 'मैं आपके बिज़नेस के लिए सही इंटरनेट और बिज़नेस प्लान ढूँढता हूँ, एक साफ़ मासिक कीमत दिखाता हूँ, और वेरिफ़िकेशन व इंस्टॉलेशन में मदद करता हूँ।', 'मी तुमच्या व्यवसायासाठी योग्य इंटरनेट आणि बिझनेस प्लॅन शोधतो, एक स्पष्ट मासिक किंमत दाखवतो आणि पडताळणी व इन्स्टॉलेशनमध्ये मदत करतो.', 'உங்கள் தொழிலுக்கு ஏற்ற இணையம் மற்றும் பிசினஸ் பிளானைக் கண்டுபிடித்து, ஒரே தெளிவான மாத விலையைக் காட்டி, சரிபார்ப்பு மற்றும் நிறுவலுக்கு உதவுகிறேன்.', 'మీ వ్యాపారానికి సరైన ఇంటర్నెట్ మరియు బిజినెస్ ప్లాన్ కనుగొని, ఒకే స్పష్టమైన నెల ధర చూపి, ధృవీకరణ మరియు ఇన్‌స్టాలేషన్‌లో సహాయం చేస్తాను.', 'ನಿಮ್ಮ ವ್ಯಾಪಾರಕ್ಕೆ ಸರಿಯಾದ ಇಂಟರ್ನೆಟ್ ಮತ್ತು ಬಿಸಿನೆಸ್ ಪ್ಲಾನ್ ಹುಡುಕಿ, ಒಂದೇ ಸ್ಪಷ್ಟ ಮಾಸಿಕ ಬೆಲೆ ತೋರಿಸಿ, ಪರಿಶೀಲನೆ ಮತ್ತು ಅಳವಡಿಕೆಗೆ ಸಹಾಯ ಮಾಡುತ್ತೇನೆ.', 'હું તમારા બિઝનેસ માટે યોગ્ય ઇન્ટરનેટ અને બિઝનેસ પ્લાન શોધું છું, એક સ્પષ્ટ માસિક કિંમત બતાવું છું અને વેરિફિકેશન તથા ઇન્સ્ટોલેશનમાં મદદ કરું છું.', 'আপনার ব্যবসার জন্য ঠিক ইন্টারনেট ও বিজনেস প্ল্যান খুঁজে দিই, একটি পরিষ্কার মাসিক দাম দেখাই, আর যাচাই ও ইনস্টলেশনে সাহায্য করি।', 'നിങ്ങളുടെ ബിസിനസിന് പറ്റിയ ഇന്റർനെറ്റ്, ബിസിനസ് പ്ലാൻ കണ്ടെത്തി, ഒരു വ്യക്തമായ മാസവില കാണിച്ച്, പരിശോധനയിലും ഇൻസ്റ്റലേഷനിലും സഹായിക്കും.', 'ਮੈਂ ਤੁਹਾਡੇ ਕਾਰੋਬਾਰ ਲਈ ਸਹੀ ਇੰਟਰਨੈੱਟ ਅਤੇ ਬਿਜ਼ਨਸ ਪਲਾਨ ਲੱਭਦਾ ਹਾਂ, ਇੱਕ ਸਾਫ਼ ਮਹੀਨਾਵਾਰ ਕੀਮਤ ਦਿਖਾਉਂਦਾ ਹਾਂ ਅਤੇ ਵੈਰੀਫਿਕੇਸ਼ਨ ਤੇ ਇੰਸਟਾਲੇਸ਼ਨ ਵਿੱਚ ਮਦਦ ਕਰਦਾ ਹਾਂ।'),
  price: L('The price depends on your business; you’ll see one clear monthly price with GST as soon as I know a little more.', 'Price aapke business par depend karta hai; thoda aur jaanne ke baad aapko GST ke saath ek saaf monthly price dikh jaayega.', 'कीमत आपके बिज़नेस पर निर्भर है; थोड़ा और जानने के बाद आपको GST सहित एक साफ़ मासिक कीमत दिख जाएगी।', 'किंमत तुमच्या व्यवसायावर अवलंबून आहे; थोडी माहिती मिळाली की GST सह एक स्पष्ट मासिक किंमत दिसेल.', 'விலை உங்கள் தொழிலைப் பொறுத்தது; இன்னும் கொஞ்சம் தெரிந்ததும் GST உடன் ஒரே தெளிவான மாத விலை தெரியும்.', 'ధర మీ వ్యాపారంపై ఆధారపడి ఉంటుంది; ఇంకొంచెం తెలిశాక GST తో ఒకే స్పష్టమైన నెల ధర కనిపిస్తుంది.', 'ಬೆಲೆ ನಿಮ್ಮ ವ್ಯಾಪಾರವನ್ನು ಅವಲಂಬಿಸಿದೆ; ಇನ್ನೂ ಸ್ವಲ್ಪ ತಿಳಿದ ನಂತರ GST ಸಹಿತ ಒಂದೇ ಸ್ಪಷ್ಟ ಮಾಸಿಕ ಬೆಲೆ ಕಾಣುತ್ತದೆ.', 'કિંમત તમારા બિઝનેસ પર આધાર રાખે છે; થોડું વધુ જાણ્યા પછી GST સાથે એક સ્પષ્ટ માસિક કિંમત દેખાશે.', 'দাম আপনার ব্যবসার উপর নির্ভর করে; আরেকটু জানলেই GST সহ একটি পরিষ্কার মাসিক দাম দেখতে পাবেন।', 'വില നിങ്ങളുടെ ബിസിനസിനെ ആശ്രയിച്ചിരിക്കുന്നു; കുറച്ചുകൂടി അറിഞ്ഞാൽ GST ഉൾപ്പെടെ ഒരു വ്യക്തമായ മാസവില കാണാം.', 'ਕੀਮਤ ਤੁਹਾਡੇ ਕਾਰੋਬਾਰ ’ਤੇ ਨਿਰਭਰ ਹੈ; ਥੋੜ੍ਹਾ ਹੋਰ ਜਾਣਨ ਤੋਂ ਬਾਅਦ GST ਸਮੇਤ ਇੱਕ ਸਾਫ਼ ਮਹੀਨਾਵਾਰ ਕੀਮਤ ਦਿਖੇਗੀ।'),
  kyc: L('Verification is online: about a minute with DigiLocker, or your business PAN, a ₹1 bank check and a few document photos.', 'Verification online hota hai: DigiLocker se lagbhag ek minute, ya business PAN, ₹1 bank check aur kuch documents ki photo se.', 'वेरिफ़िकेशन ऑनलाइन होता है: DigiLocker से लगभग एक मिनट, या बिज़नेस PAN, ₹1 बैंक चेक और कुछ दस्तावेज़ों की फ़ोटो से।', 'पडताळणी ऑनलाइन होते: DigiLocker ने सुमारे एक मिनिट, किंवा बिझनेस PAN, ₹1 बँक तपासणी आणि काही कागदपत्रांचे फोटो.', 'சரிபார்ப்பு ஆன்லைனில்: DigiLocker மூலம் ஒரு நிமிடம், அல்லது பிசினஸ் PAN, ₹1 வங்கிச் சோதனை மற்றும் சில ஆவணப் படங்கள்.', 'ధృవీకరణ ఆన్‌లైన్‌లో: DigiLocker తో సుమారు ఒక నిమిషం, లేదా బిజినెస్ PAN, ₹1 బ్యాంక్ చెక్ మరియు కొన్ని పత్రాల ఫొటోలు.', 'ಪರಿಶೀಲನೆ ಆನ್‌ಲೈನ್: DigiLocker ಮೂಲಕ ಸುಮಾರು ಒಂದು ನಿಮಿಷ, ಅಥವಾ ಬಿಸಿನೆಸ್ PAN, ₹1 ಬ್ಯಾಂಕ್ ಪರಿಶೀಲನೆ ಮತ್ತು ಕೆಲವು ದಾಖಲೆಗಳ ಫೋಟೋ.', 'વેરિફિકેશન ઓનલાઇન થાય છે: DigiLocker થી લગભગ એક મિનિટ, અથવા બિઝનેસ PAN, ₹1 બેંક ચેક અને થોડા દસ્તાવેજોના ફોટા.', 'যাচাই অনলাইনে হয়: DigiLocker দিয়ে প্রায় এক মিনিট, অথবা ব্যবসার PAN, ₹1 ব্যাংক যাচাই আর কয়েকটি নথির ছবি।', 'പരിശോധന ഓൺലൈനായി: DigiLocker വഴി ഏകദേശം ഒരു മിനിറ്റ്, അല്ലെങ്കിൽ ബിസിനസ് PAN, ₹1 ബാങ്ക് പരിശോധന, കുറച്ച് രേഖകളുടെ ഫോട്ടോ.', 'ਵੈਰੀਫਿਕੇਸ਼ਨ ਔਨਲਾਈਨ ਹੁੰਦੀ ਹੈ: DigiLocker ਨਾਲ ਲਗਭਗ ਇੱਕ ਮਿੰਟ, ਜਾਂ ਬਿਜ਼ਨਸ PAN, ₹1 ਬੈਂਕ ਜਾਂਚ ਅਤੇ ਕੁਝ ਦਸਤਾਵੇਜ਼ਾਂ ਦੀਆਂ ਫੋਟੋਆਂ।'),
  time: L('After you pay, you pick an installation slot yourself, usually within a few days, and you can follow every step on the tracker.', 'Payment ke baad aap khud installation slot chunte hain, aam taur par kuch hi dinon mein, aur har step tracker par dikhta hai.', 'भुगतान के बाद आप ख़ुद इंस्टॉलेशन का समय चुनते हैं, आमतौर पर कुछ ही दिनों में, और हर कदम ट्रैकर पर दिखता है।', 'पेमेंटनंतर तुम्ही स्वतः इन्स्टॉलेशनची वेळ निवडता, साधारण काही दिवसांत, आणि प्रत्येक टप्पा ट्रॅकरवर दिसतो.', 'பணம் செலுத்திய பின் நிறுவல் நேரத்தை நீங்களே தேர்ந்தெடுக்கலாம், பொதுவாக சில நாட்களில்; ஒவ்வொரு படியும் டிராக்கரில் தெரியும்.', 'చెల్లింపు తర్వాత ఇన్‌స్టాలేషన్ సమయాన్ని మీరే ఎంచుకుంటారు, సాధారణంగా కొన్ని రోజుల్లో; ప్రతి దశ ట్రాకర్‌లో కనిపిస్తుంది.', 'ಪಾವತಿಯ ನಂತರ ಅಳವಡಿಕೆಯ ಸಮಯವನ್ನು ನೀವೇ ಆಯ್ಕೆ ಮಾಡುತ್ತೀರಿ, ಸಾಮಾನ್ಯವಾಗಿ ಕೆಲವೇ ದಿನಗಳಲ್ಲಿ; ಪ್ರತಿ ಹಂತ ಟ್ರ್ಯಾಕರ್‌ನಲ್ಲಿ ಕಾಣುತ್ತದೆ.', 'પેમેન્ટ પછી તમે જાતે ઇન્સ્ટોલેશનનો સમય પસંદ કરો છો, સામાન્ય રીતે થોડા દિવસોમાં, અને દરેક પગલું ટ્રેકર પર દેખાય છે.', 'পেমেন্টের পর আপনি নিজেই ইনস্টলেশনের সময় বেছে নেন, সাধারণত কয়েক দিনের মধ্যে, আর প্রতিটি ধাপ ট্র্যাকারে দেখা যায়।', 'പണമടച്ചശേഷം ഇൻസ്റ്റലേഷൻ സമയം നിങ്ങൾതന്നെ തിരഞ്ഞെടുക്കാം, സാധാരണ ചില ദിവസങ്ങൾക്കുള്ളിൽ; ഓരോ ഘട്ടവും ട്രാക്കറിൽ കാണാം.', 'ਭੁਗਤਾਨ ਤੋਂ ਬਾਅਦ ਤੁਸੀਂ ਖੁਦ ਇੰਸਟਾਲੇਸ਼ਨ ਦਾ ਸਮਾਂ ਚੁਣਦੇ ਹੋ, ਆਮ ਤੌਰ ’ਤੇ ਕੁਝ ਦਿਨਾਂ ਵਿੱਚ, ਅਤੇ ਹਰ ਕਦਮ ਟ੍ਰੈਕਰ ’ਤੇ ਦਿਖਦਾ ਹੈ।'),
  human: L('Of course! Tap “Request a call” after you see your plan, and a local partner will call you back.', 'Bilkul! Plan dekhne ke baad “Request a call” dabaiye, ek local partner aapko call karega.', 'ज़रूर! प्लान देखने के बाद “Request a call” दबाइए, एक स्थानीय पार्टनर आपको कॉल करेगा।', 'नक्की! प्लॅन पाहिल्यानंतर “Request a call” दाबा, स्थानिक पार्टनर तुम्हाला कॉल करेल.', 'நிச்சயமாக! பிளானைப் பார்த்த பின் “Request a call” அழுத்துங்கள், உள்ளூர் பார்ட்னர் அழைப்பார்.', 'తప్పకుండా! ప్లాన్ చూసిన తర్వాత “Request a call” నొక్కండి, స్థానిక భాగస్వామి కాల్ చేస్తారు.', 'ಖಂಡಿತ! ಪ್ಲಾನ್ ನೋಡಿದ ನಂತರ “Request a call” ಒತ್ತಿ, ಸ್ಥಳೀಯ ಪಾರ್ಟ್ನರ್ ಕರೆ ಮಾಡುತ್ತಾರೆ.', 'ચોક્કસ! પ્લાન જોયા પછી “Request a call” દબાવો, સ્થાનિક પાર્ટનર તમને કૉલ કરશે.', 'অবশ্যই! প্ল্যান দেখার পর “Request a call” চাপুন, একজন স্থানীয় পার্টনার আপনাকে কল করবেন।', 'തീർച്ചയായും! പ്ലാൻ കണ്ടശേഷം “Request a call” അമർത്തൂ, ഒരു പ്രാദേശിക പാർട്ണർ വിളിക്കും.', 'ਜ਼ਰੂਰ! ਪਲਾਨ ਦੇਖਣ ਤੋਂ ਬਾਅਦ “Request a call” ਦਬਾਓ, ਇੱਕ ਸਥਾਨਕ ਪਾਰਟਨਰ ਤੁਹਾਨੂੰ ਕਾਲ ਕਰੇਗਾ।'),
  offtopic: L('Sorry, I can’t help you with that. I’m here to help with your business internet: plans, prices, documents and installation.', 'Sorry, main ismein madad nahi kar sakta. Main aapke business internet mein madad ke liye hoon: plans, price, documents aur installation.', 'माफ़ कीजिए, मैं इसमें मदद नहीं कर सकता। मैं आपके बिज़नेस इंटरनेट में मदद के लिए हूँ: प्लान, कीमत, दस्तावेज़ और इंस्टॉलेशन।', 'माफ करा, मी यात मदत करू शकत नाही. मी तुमच्या व्यवसायाच्या इंटरनेटसाठी आहे: प्लॅन, किंमत, कागदपत्रे आणि इन्स्टॉलेशन.', 'மன்னிக்கவும், இதில் என்னால் உதவ முடியாது. உங்கள் தொழில் இணையத்துக்காக நான் இருக்கிறேன்: பிளான், விலை, ஆவணங்கள், நிறுவல்.', 'క్షమించండి, దీనిలో నేను సహాయం చేయలేను. మీ వ్యాపార ఇంటర్నెట్ కోసం నేను ఉన్నాను: ప్లాన్లు, ధరలు, పత్రాలు, ఇన్‌స్టాలేషన్.', 'ಕ್ಷಮಿಸಿ, ಇದರಲ್ಲಿ ನಾನು ಸಹಾಯ ಮಾಡಲಾರೆ. ನಿಮ್ಮ ವ್ಯಾಪಾರದ ಇಂಟರ್ನೆಟ್‌ಗಾಗಿ ನಾನಿದ್ದೇನೆ: ಪ್ಲಾನ್, ಬೆಲೆ, ದಾಖಲೆ, ಅಳವಡಿಕೆ.', 'માફ કરશો, હું આમાં મદદ કરી શકતો નથી. હું તમારા બિઝનેસ ઇન્ટરનેટ માટે છું: પ્લાન, કિંમત, દસ્તાવેજો અને ઇન્સ્ટોલેશન.', 'দুঃখিত, এতে আমি সাহায্য করতে পারব না। আমি আপনার ব্যবসার ইন্টারনেটের জন্য আছি: প্ল্যান, দাম, নথি আর ইনস্টলেশন।', 'ക്ഷമിക്കണം, ഇതിൽ എനിക്ക് സഹായിക്കാനാവില്ല. നിങ്ങളുടെ ബിസിനസ് ഇന്റർനെറ്റിനായി ഞാനുണ്ട്: പ്ലാൻ, വില, രേഖകൾ, ഇൻസ്റ്റലേഷൻ.', 'ਮਾਫ਼ ਕਰਨਾ, ਮੈਂ ਇਸ ਵਿੱਚ ਮਦਦ ਨਹੀਂ ਕਰ ਸਕਦਾ। ਮੈਂ ਤੁਹਾਡੇ ਬਿਜ਼ਨਸ ਇੰਟਰਨੈੱਟ ਲਈ ਹਾਂ: ਪਲਾਨ, ਕੀਮਤ, ਦਸਤਾਵੇਜ਼ ਅਤੇ ਇੰਸਟਾਲੇਸ਼ਨ।'),
  team: L('Monis (Team Leader) and Ubesh Siddiqui from NSUT Delhi are Team Ticchi Gang. They built Udyam Digital, and me, for Accel Business.', 'Monis (Team Leader) aur Ubesh Siddiqui, NSUT Delhi se, Team Ticchi Gang hain. Unhone Accel Business ke liye Udyam Digital aur mujhe banaya.', 'मोनिस (टीम लीडर) और उबेश सिद्दीकी, NSUT दिल्ली से, टीम टिच्ची गैंग हैं। उन्होंने Accel Business के लिए उद्यम डिजिटल और मुझे बनाया।', 'मोनिस (टीम लीडर) आणि उबेश सिद्दीकी, NSUT दिल्ली, म्हणजे टीम टिच्ची गँग. त्यांनी Accel Business साठी उद्यम डिजिटल आणि मला बनवले.', 'மோனிஸ் (டீம் லீடர்), உபேஷ் சித்திகி, NSUT டெல்லி: இவர்கள்தான் Team Ticchi Gang. Accel Business-க்காக Udyam Digital-ஐயும் என்னையும் உருவாக்கினார்கள்.', 'మోనిస్ (టీమ్ లీడర్), ఉబేష్ సిద్దికీ, NSUT ఢిల్లీ: వీరే Team Ticchi Gang. Accel Business కోసం Udyam Digital ను, నన్ను తయారు చేశారు.', 'ಮೋನಿಸ್ (ಟೀಮ್ ಲೀಡರ್) ಮತ್ತು ಉಬೇಶ್ ಸಿದ್ದಿಕಿ, NSUT ದೆಹಲಿ: ಇವರೇ Team Ticchi Gang. Accel Businessಗಾಗಿ Udyam Digital ಮತ್ತು ನನ್ನನ್ನು ಮಾಡಿದರು.', 'મોનિસ (ટીમ લીડર) અને ઉબેશ સિદ્દીકી, NSUT દિલ્હી: આ જ Team Ticchi Gang છે. તેમણે Accel Business માટે Udyam Digital અને મને બનાવ્યો.', 'মোনিস (টিম লিডার) আর উবেশ সিদ্দিকি, NSUT দিল্লি: এঁরাই Team Ticchi Gang। Accel Business-এর জন্য Udyam Digital আর আমাকে বানিয়েছেন।', 'മോനിസ് (ടീം ലീഡർ), ഉബേഷ് സിദ്ദിഖി, NSUT ഡൽഹി: ഇവരാണ് Team Ticchi Gang. Accel Business-ന് വേണ്ടി Udyam Digital-ഉം എന്നെയും ഉണ്ടാക്കി.', 'ਮੋਨਿਸ (ਟੀਮ ਲੀਡਰ) ਅਤੇ ਉਬੇਸ਼ ਸਿੱਦੀਕੀ, NSUT ਦਿੱਲੀ: ਇਹੀ Team Ticchi Gang ਹਨ। ਉਨ੍ਹਾਂ ਨੇ Accel Business ਲਈ Udyam Digital ਅਤੇ ਮੈਨੂੰ ਬਣਾਇਆ।'),
};

const COMPLAINT_AGAIN = {
  en: 'You’re right, I should answer what you ask. Try me: “what is a static IP?”, “how much will it cost?” or “which documents do I need?”',
  hinglish: 'Aap sahi keh rahe hain, mujhe aapke sawaal ka jawab dena chahiye. Poochiye: “static IP kya hai?”, “kitna kharcha aayega?” ya “documents kya chahiye?”',
  hi: 'आप सही कह रहे हैं, मुझे आपके सवाल का जवाब देना चाहिए। पूछिए: “स्टैटिक IP क्या है?”, “कितना खर्च आएगा?” या “कौन से दस्तावेज़ चाहिए?”',
};

// A last line Mitu just said is not said again: the reply moves on, or the AI answers instead.
export function mituReply(text, { language = 'en-IN', answered = [], history = [], catalogue = [] } = {}) {
  const turn = mituTurn(text, { language, answered, catalogue });
  if (!turn) return null;
  const lastBot = [...history].reverse().find(item => item.from === 'assistant')?.text || '';
  if (lastBot && lastBot.includes(turn.intro)) {
    // A second complaint in a row gets a fresh, more concrete line; anything else repeated goes to the AI.
    if (turn.intent !== 'complaint') return null;
    return { ...turn, intro: COMPLAINT_AGAIN[turn.lang] || COMPLAINT_AGAIN.en, bridge: null, noQuestion: true };
  }
  const question = turn.noQuestion ? null : nextQuestion(turn.lang, answered);
  const repeated = Boolean(question && lastBot.includes(question));
  return { ...turn, bridge: repeated ? null : question, noQuestion: Boolean(turn.noQuestion || repeated) };
}

// Next questions in Hinglish (the screen languages already have their own; Hinglish is typed, not chosen).
const HINGLISH_NEXT = {
  business: 'Aapka business kis type ka hai: dukaan, clinic ya office, restaurant, ya workshop?',
  employees: 'Aapke business mein kitne log kaam karte hain?',
  sites: 'Aapki kitni locations ya branches hain?',
  tier: 'Aapki dukaan kis shehar mein hai?',
  gstin: 'Kya aapke paas GST registration hai?',
  current: 'Abhi internet ke liye kya use karte hain: mobile hotspot, broadband ya kuch nahi?',
  goal: 'Abhi business ke liye sabse zaroori kya hai: achha internet, zyada customers, ya security?',
  spend: 'Har mahine internet par roughly kitna kharcha hota hai? Chahein to skip kar sakte hain.',
};
const ENGLISH_NEXT = {
  business: 'What kind of business do you run: a shop, a clinic or office, a restaurant, or a workshop?',
  employees: 'How many people work in your business?',
  sites: 'How many locations or branches do you have?',
  tier: 'Which city is your business in?',
  gstin: 'Do you have an active GST registration?',
  current: 'What do you use for internet today: a mobile hotspot, broadband, or nothing yet?',
  goal: 'What would help your business most right now: reliable internet, more customers, or security?',
  spend: 'Roughly how much do you spend on internet each month? You can skip this.',
};
const ORDER = ['business', 'employees', 'sites', 'tier', 'gstin', 'current', 'goal', 'spend'];

const NO_QUESTION = new Set(['complaint', 'offtopic']);

export function classify(text) {
  const value = String(text || '');
  if (ASKS_MEANING.test(value)) for (const [words] of PRODUCT_WORDS) if (words.test(value)) return 'product';
  for (const [intent, regex] of INTENTS) if (regex.test(value)) return intent;
  return null;
}

export const asksIdentity = text => ['identity', 'model'].includes(classify(text));
export const mituIntro = (text, language) => SAY.identity[replyLanguage(text, language)];

function productLine(text, catalogue = []) {
  const entry = PRODUCT_WORDS.find(([words]) => words.test(text));
  const product = entry && catalogue.find(item => entry[1].test(item.product_name));
  return product ? `${product.product_name}: ${String(product.description).replace(/\.?$/, '.')}` : null;
}

// A short reply for a message that is not (only) an answer. Returns null when the AI or rules should handle it.
// Answers ride along: "hi, dental clinic in Kolkata" still fills the profile, and Mitu only adds the greeting.
export function mituTurn(text, { language = 'en-IN', answered = [], catalogue = [] } = {}) {
  const intent = classify(text);
  if (!intent) return null;
  const lang = replyLanguage(text, language);
  let say = intent === 'product' ? productLine(text, catalogue) : SAY[intent][lang];
  if (!say) return null;
  return { intent, lang, intro: say, bridge: NO_QUESTION.has(intent) ? null : nextQuestion(lang, answered), noQuestion: NO_QUESTION.has(intent) };
}

// The next question in Hinglish or English (screen languages use the app's own question text instead).
export function nextQuestion(lang, answered = []) {
  const next = ORDER.find(key => !answered.includes(key));
  if (!next) return null;
  return lang === 'hinglish' ? HINGLISH_NEXT[next] : lang === 'en' ? ENGLISH_NEXT[next] : null;
}

const ACK = L('Got it!', 'Theek hai!', 'ठीक है!', 'ठीक आहे!', 'சரி!', 'సరే!', 'ಸರಿ!', 'બરાબર!', 'ঠিক আছে!', 'ശരി!', 'ਠੀਕ ਹੈ!');
// When the local rules understood an answer: a short acknowledgement in the owner's script, then the next question.
export function acknowledge(text, language, answered) {
  const lang = replyLanguage(text, language);
  return { intro: ACK[lang], bridge: nextQuestion(lang, answered) };
}

export const MITU_LANGS = LANGS;
