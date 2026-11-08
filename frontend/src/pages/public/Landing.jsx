import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Plus, Minus, ShieldCheck, CheckCircle2, Sparkles, MessageCircle, Store, Stethoscope, Building2, Factory,
  ReceiptText, Truck, Languages, Lock, Clock3, Headset, PhoneCall, Search, Check,
} from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { useLanguage, LANGUAGES } from '../../i18n/index.jsx';
import { Button, Field, cx, useToast } from '../../components/ui.jsx';

// Every block on this page appears once. Product details live in the advisor; account work lives behind sign-in.

// What changes for the owner, against the journey today (case study, Apr–Jun 2026 funnel).
const OUTCOMES = [
  [Clock3, '3 min', 'to a clear monthly quote, instead of 3–5 days'],
  [ShieldCheck, '17', 'automatic KYC checks via GST, Udyam or Aadhaar'],
  [Truck, '2–7 days', 'typical activation, instead of 17.6 days today'],
  [Languages, '10', 'Indian languages, by text, voice or WhatsApp'],
];

const FEATURES = [
  [Sparkles, 'Mitu, your plan buddy', 'Tell Mitu your business type, size, locations and current tools, in your own language. Mitu recommends a bundle from the catalogue and explains why in plain words.'],
  [ReceiptText, 'One transparent price', 'One monthly figure with GST, setup fee and contract length shown up front. Toggle add-ons and watch the price change.'],
  [ShieldCheck, 'Smart KYC', 'GSTIN and Udyam lookup with your consent, document reading on your phone, and 17 checks that catch expired or mismatched papers.'],
  [Truck, 'Order tracker', 'Every step from packing to activation, with dates. Check it any time instead of calling support.'],
  [MessageCircle, 'WhatsApp and voice', 'Get a quote, check an order or ask for a call back on WhatsApp, in your own language.'],
  [Lock, 'DPDP-compliant by design', 'Consent for one purpose at a time, masked identifiers, minimal data and the right to erase, as the DPDP Act 2023 requires.'],
];

// The four MSME segments from the case study (share of the SMB base) with what each needs most.
const SOLUTIONS = [
  { business: 'retail', example: { employees: 3, sites: 1 }, icon: Store, title: 'Micro retail & services', who: 'Kirana, salon, pharmacy · 55% of MSMEs', items: ['Biz Fibre or 5G AirFiber for UPI and POS', 'Cloud POS & GST billing', 'WhatsApp Business catalogue'] },
  { business: 'professional', example: { employees: 8, sites: 1 }, icon: Stethoscope, title: 'Professional offices', who: 'Clinic, CA firm, coaching · 25%', items: ['Biz Fibre with backup failover', 'Cloud email & 1 TB backup', 'Endpoint security for patient and client data'] },
  { business: 'multi', example: { employees: 15, sites: 3 }, icon: Building2, title: 'Small multi-site businesses', who: 'Restaurant chain, 3–10 stores · 15%', items: ['One bill across every site', 'Managed SD-WAN and failover', 'Cloud CCTV for each location'] },
  { business: 'manufacturing', example: { employees: 30, sites: 1 }, icon: Factory, title: 'Small manufacturers', who: 'Auto-parts, textile unit · 5%', items: ['Internet leased line, dedicated bandwidth', 'Machine monitoring IoT', 'Managed firewall'] },
];

const STEPS = [
  ['Tell us about your business', 'A few questions, in your language, by chat or voice.'],
  ['Get your bundle and price', 'One monthly figure with add-ons you can toggle.'],
  ['Verify in minutes', 'GSTIN, Udyam or Aadhaar lookup with your consent.'],
  ['Track to activation', 'Pick a slot and follow every step online.'],
];

const FAQ = [
  ['What documents do I need?', 'For a registered business, your GSTIN or Udyam number, a recent electricity bill and the signatory’s ID. Not registered yet? Aadhaar OTP for the owner plus a shop photo is enough.'],
  ['How fast is activation?', 'You pick a delivery and technician slot right after paying. Mobile lines, email and security start in a day; fibre in about 5 days; leased lines take 3–4 weeks. Every date shows in your tracker.'],
  ['I don’t have a GSTIN. Can I still register?', 'Yes. Verify with Udyam, or with the owner’s Aadhaar OTP and a shop photo. A few products, such as leased lines, need an active GSTIN by law and stay locked until you add one.'],
  ['Can I add products later?', 'Yes. Your verification is reused, so adding a product from your dashboard takes under a minute.'],
  ['Is my data safe?', 'We ask before every check, mask your identifiers, and you can withdraw consent or ask us to delete your data at any time.'],
];

function Heading({ eyebrow, title, body, center = false }) {
  return (
    <div className={cx('max-w-2xl', center && 'mx-auto text-center')}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="mt-2 text-2xl font-semibold sm:text-[32px] sm:leading-tight">{title}</h2>
      {body && <p className="mt-3 text-ink-muted">{body}</p>}
    </div>
  );
}

// A telecom tower sending signal, drawn in darker reds so it sits quietly on the red hero.
function Tower({ className = '' }) {
  return (
    <svg viewBox="0 0 400 520" className={className} fill="none" aria-hidden="true">
      <g stroke="#8f0010" strokeLinecap="round" opacity="0.55">
        {[70, 110, 150].map(r => <path key={`l${r}`} d={`M ${200 - r * 0.62} ${140 - r * 0.78} A ${r} ${r} 0 0 0 ${200 - r * 0.62} ${140 + r * 0.78}`} strokeWidth="9" />)}
        {[70, 110, 150].map(r => <path key={`r${r}`} d={`M ${200 + r * 0.62} ${140 - r * 0.78} A ${r} ${r} 0 0 1 ${200 + r * 0.62} ${140 + r * 0.78}`} strokeWidth="9" />)}
      </g>
      <g stroke="#7a000c" strokeWidth="7" strokeLinejoin="round">
        <path d="M200 110 L150 520 M200 110 L250 520" />
        {[180, 240, 300, 360, 420, 480].map((y, i) => { const half = 8 + (y - 110) * 0.122; const next = 8 + (y + 60 - 110) * 0.122; return <path key={y} d={`M${200 - half} ${y} H${200 + half} M${200 - half} ${y} L${200 + next} ${y + 60} M${200 + half} ${y} L${200 - next} ${y + 60}`} opacity={i === 5 ? 0 : 1} />; })}
      </g>
      <g fill="#8f0010">
        <rect x="150" y="125" width="22" height="70" rx="4" />
        <rect x="228" y="125" width="22" height="70" rx="4" />
        <rect x="186" y="95" width="28" height="30" rx="4" />
        <path d="M158 70 a34 34 0 0 1 40 30 l-40 0 z" />
        <path d="M242 70 a34 34 0 0 0 -40 30 l40 0 z" />
        <circle cx="200" cy="88" r="7" />
      </g>
    </svg>
  );
}

// A low city skyline along the bottom of the hero.
function Skyline() {
  return (
    <svg viewBox="0 0 1440 160" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-28 w-full sm:h-36" aria-hidden="true">
      <path fill="#7a000c" fillOpacity="0.45" d="M0 160 V110 h60 V80 h40 v30 h50 V60 h30 v-20 h20 v20 h30 v100 h40 V90 h70 v20 h40 V70 h20 v-25 h10 v25 h20 v115 h60 V100 h50 V80 h40 v80 h50 V50 h40 v110 h60 V95 h80 v-15 h40 v80 h50 V70 h30 v-30 h20 v30 h30 v90 h70 V105 h60 V85 h50 v75 h40 V60 h40 v100 h60 V100 h70 v60 Z" />
    </svg>
  );
}

function CallbackForm() {
  const { t, language } = useLanguage();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', phone: '', city: '', language });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    try { await api.post('/callback-requests', form); setDone(true); } catch (error) { toast(errorMessage(error), 'error'); } finally { setBusy(false); }
  };
  if (done) {
    return (
      <div className="rounded-xl bg-ok-50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-ok-600" />
        <p className="mt-2 font-semibold">Request received</p>
        <p className="mt-1 text-sm text-ink-muted">A local partner{form.city ? ` in ${form.city}` : ''} will call {form.phone} shortly.</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label={t('login.name')}><input className="input" required minLength={2} autoComplete="name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
      <Field label={t('login.phone')}><input className="input" required inputMode="numeric" autoComplete="tel-national" pattern="[6-9][0-9]{9}" maxLength={10} placeholder="10-digit mobile" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value.replace(/\D/g, '') })} /></Field>
      <Field label="City"><input className="input" required autoComplete="address-level2" value={form.city} onChange={event => setForm({ ...form, city: event.target.value })} /></Field>
      <Field label="Language"><select className="input" value={form.language} onChange={event => setForm({ ...form, language: event.target.value })}>{LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
      <Button type="submit" loading={busy} className="sm:col-span-2"><PhoneCall className="h-4 w-4" />{t('help.cta')}</Button>
    </form>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [faq, setFaq] = useState(0);
  const start = event => {
    event.preventDefault();
    navigate('/advisor', { state: message.trim() ? { message: message.trim() } : undefined });
  };

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#d4001a] via-[#c40016] to-[#9e0012] text-white">
        <Tower className="pointer-events-none absolute -bottom-6 right-[-60px] h-[420px] w-auto opacity-90 sm:right-[4%] sm:h-[500px] lg:right-[12%] lg:h-[560px]" />
        <Skyline />
        <div className="container-x relative pb-28 pt-16 sm:pb-40 sm:pt-24">
          <h1 className="text-white">
            <span className="block font-display text-[46px] font-bold leading-[0.95] tracking-tight sm:text-[96px] lg:text-[112px]">udyam<span className="text-white/75">digital</span></span>
            <span className="mt-4 block font-display text-2xl font-light tracking-wide text-white/90 sm:text-4xl">Business Registration Portal</span>
          </h1>
          <p className="mt-6 max-w-xl text-base text-white/80 sm:text-lg">Take your shop, clinic or factory digital in one sitting: find the right Accel Business bundle, see one clear monthly price, verify with GST, Udyam or Aadhaar, and track it to activation. On your phone, in your language.</p>
          <form onSubmit={start} className="mt-8 flex max-w-lg items-center gap-2 rounded-full bg-white p-1.5 shadow-pop">
            <Search className="ml-3 h-5 w-5 flex-none text-ink-faint" />
            <input aria-label="Describe your business" className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-ink placeholder:text-ink-faint focus:outline-none" placeholder="e.g. Clinic with 8 staff in Pune" value={message} onChange={event => setMessage(event.target.value)} />
            <button type="submit" className="inline-flex h-10 flex-none items-center gap-1.5 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">Start registration<ArrowRight className="h-4 w-4" /></button>
          </form>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/75">
            <Link to="/track" className="inline-flex items-center gap-1.5 hover:text-white"><Truck className="h-4 w-4" />Track an application</Link>
            <Link to="/#contact" className="inline-flex items-center gap-1.5 hover:text-white"><Headset className="h-4 w-4" />Talk to an expert</Link>
          </div>
        </div>
      </section>

      {/* Outcomes */}
      <section className="border-b border-line bg-white">
        <div className="container-x grid grid-cols-2 gap-6 py-10 lg:grid-cols-4">
          {OUTCOMES.map(([Icon, value, label]) => (
            <div key={label} className="flex items-start gap-3">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></span>
              <div><p className="font-display text-xl font-semibold">{value}</p><p className="text-sm text-ink-muted">{label}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 bg-paper py-20">
        <div className="container-x">
          <Heading eyebrow="Features" title="From first question to activation, without a sales visit" body="Everything the owner needs to discover, buy and activate a bundle on their own, with a person one tap away." center />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([Icon, title, body]) => (
              <div key={title} className="card card-hover p-6">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></span>
                <h3 className="mt-5 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solutions */}
      <section id="solutions" className="scroll-mt-20 bg-white py-20">
        <div className="container-x">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <Heading eyebrow="Solutions" title="A bundle for every kind of small business" body="Pick your segment to start with a bundle sized for you. You can change anything before you pay." />
            <Button variant="outline" to="/advisor" className="self-start sm:self-auto">See all plans<ArrowRight className="h-4 w-4" /></Button>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {SOLUTIONS.map(({ business, example, icon: Icon, title, who, items }) => (
              <button key={business} type="button" onClick={() => navigate('/advisor', { state: { preset: { business, example } } })} className="card card-hover group flex flex-col p-6 text-left">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-paper text-ink transition group-hover:bg-brand-600 group-hover:text-white"><Icon className="h-5 w-5" /></span>
                <h3 className="mt-5 text-base font-semibold">{title}</h3>
                <p className="text-sm text-ink-muted">{who}</p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-soft">{items.map(item => <li key={item} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 flex-none text-brand-600" />{item}</li>)}</ul>
                <span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">Get my price<ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 bg-paper py-20">
        <div className="container-x">
          <Heading eyebrow="How it works" title="Four steps, one sitting" body="What used to take 17.6 days, a sales visit and three status calls." center />
          <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([title, body], index) => (
              <li key={title} className="card relative p-6">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 font-display text-sm font-semibold text-white">{index + 1}</span>
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-ink-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* About */}
      <section id="about" className="scroll-mt-20 bg-white py-20">
        <div className="container-x grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Heading eyebrow="Who we are" title="Udyam Digital is Accel Business’s front door for India’s 6 crore+ MSMEs" />
            <p className="mt-4 text-ink-muted">Kirana stores, clinics, coaching centres, CA firms, restaurants and small factories need more than a SIM: broadband, business lines, a WhatsApp channel, cloud email, security and CCTV. Today they buy each piece from a different vendor, wait 3–5 days for a quote, hand over papers in person and chase status for weeks.</p>
            <p className="mt-4 text-ink-muted">Udyam Digital puts the whole journey on the owner’s phone: discover, buy and activate a bundle with one bill and one support number. Local channel partners and the field team stay in the loop, picking up the leads that need a person and earning on every activation they help close.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[['One bill, one number', 'Every product on one monthly bill and one support line.'], ['Partners, not replaced', 'Stalled leads go to a local partner who speaks your language.'], ['Built on consent', 'Every registry check is purpose-bound and expires in 30 minutes.'], ['Grows with you', 'Add a branch, a line or CCTV later without verifying again.']].map(([title, body]) => (
              <div key={title} className="rounded-2xl bg-paper p-5"><p className="font-semibold">{title}</p><p className="mt-1.5 text-sm text-ink-muted">{body}</p></div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact and FAQ */}
      <section id="contact" className="scroll-mt-20 bg-paper py-20">
        <div className="container-x grid gap-6 lg:grid-cols-2">
          <div className="card p-6 sm:p-8">
            <h2 className="text-xl font-semibold">Prefer to talk to a person?</h2>
            <p className="mt-1.5 text-sm text-ink-muted">Leave your number. A local partner who speaks your language will call you back.</p>
            <div className="mt-6"><CallbackForm /></div>
          </div>
          <div className="card p-6 sm:p-8">
            <h2 className="text-xl font-semibold">Questions owners ask</h2>
            <div className="mt-4 divide-y divide-line">
              {FAQ.map(([question, answer], index) => (
                <div key={question} className="py-4">
                  <button type="button" onClick={() => setFaq(faq === index ? -1 : index)} aria-expanded={faq === index} className="flex w-full items-center justify-between gap-4 text-left text-[15px] font-medium hover:text-brand-600">
                    {question}
                    <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-paper text-ink-muted">{faq === index ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}</span>
                  </button>
                  {faq === index && <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">{answer}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="bg-white py-16">
        <div className="container-x">
          <div className="flex flex-col items-start gap-6 rounded-3xl bg-brand-600 px-8 py-10 text-white sm:flex-row sm:items-center sm:justify-between sm:px-12">
            <div><h2 className="text-2xl font-semibold text-white">Ready to take your business digital?</h2><p className="mt-1.5 text-white/80">See your bundle and price in three minutes. No sign-up needed to look.</p></div>
            <Link to="/advisor" className="inline-flex h-12 flex-none items-center gap-2 rounded-xl bg-white px-6 font-semibold text-brand-600 hover:bg-brand-50">Start registration<ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>
    </>
  );
}
