import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Mic, Send, RotateCcw, ArrowRight, Check, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import { api, rememberQuoteToken, errorMessage } from '../../api/client.js';
import { useLanguage } from '../../i18n/index.jsx';
import { getAdvisorCopy } from '../../lib/advisorLocales.js';
import { rupees } from '../../lib/format.js';
import { Button, useToast, cx } from '../../components/ui.jsx';
import OnboardingStepper from '../../components/OnboardingStepper.jsx';

const START = { business: 'retail', employees: 1, sites: 1, tier: '2', gstin: 'no', current: '', goal: 'reliable', spend: '' };
const welcome = copy => [{ from: 'assistant', text: copy.welcome, chips: copy.flow[0].choices }];

export default function Advisor() {
  const { language } = useLanguage();
  return <AdvisorChat key={language} />;
}

function initialFrom(preset, copy) {
  if (!preset) return { profile: START, answered: new Set(), messages: welcome(copy) };
  const answered = new Set(['business', 'employees', 'sites']);
  const label = copy.flow[0].choices.find(([value]) => value === preset.business)?.[1] || preset.business;
  const next = copy.flow.findIndex(step => !answered.has(step.key));
  return { profile: { ...START, business: preset.business, employees: preset.example?.employees ?? 3, sites: preset.example?.sites ?? 1 }, answered, messages: [...welcome(copy), { from: 'user', text: label }, { from: 'assistant', text: copy.flow[next].prompt, chips: copy.flow[next].choices }] };
}

function AdvisorChat() {
  const { t, language } = useLanguage();
  const copy = getAdvisorCopy(language);
  const flow = copy.flow;
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [initial] = useState(() => initialFrom(location.state?.preset, copy));
  const [profile, setProfile] = useState(initial.profile);
  const [answered, setAnswered] = useState(initial.answered);
  const [messages, setMessages] = useState(initial.messages);
  const [wants, setWants] = useState([]);
  const [budget, setBudget] = useState(null);
  const [quote, setQuote] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(false);
  const [listening, setListening] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const quoteId = useRef(null);
  const chatEnd = useRef(null);

  useEffect(() => { api.get('/advisor/status').then(({ data }) => setAi(data.ai)).catch(() => {}); }, []);
  useEffect(() => { chatEnd.current?.parentElement?.scrollTo({ top: 1e6, behavior: 'smooth' }); }, [messages]);

  const nextStep = useCallback(done => flow.findIndex(step => !done.has(step.key)), [flow]);
  const promptFor = useCallback(index => (index < 0 ? { from: 'assistant', text: copy.complete, chips: [] } : { from: 'assistant', text: flow[index].prompt, chips: flow[index].choices }), [copy, flow]);

  // Keep one quote in sync with the conversation so the owner sees the price while answering.
  useEffect(() => {
    if (!answered.size) return undefined;
    const timer = setTimeout(async () => {
      try {
        const body = { profile, wants, budget, language };
        if (quoteId.current) setQuote((await api.patch(`/quotes/${quoteId.current}`, body)).data.quote);
        else {
          const { data } = await api.post('/quotes', body);
          quoteId.current = data.quote.id;
          rememberQuoteToken(data.quote.id, data.accessToken);
          setQuote(data.quote);
        }
      } catch { /* the price panel simply stays as it was */ }
    }, 350);
    return () => clearTimeout(timer);
  }, [profile, wants, budget, answered, language]);

  useEffect(() => { if (location.state?.preset || location.state?.message) window.history.replaceState({}, ''); }, [location.state]);


  const apply = (updates = {}) => {
    setProfile(current => {
      const next = { ...current, ...updates };
      if (updates.business === 'multi' && !updates.sites) next.sites = Math.max(2, current.sites);
      return next;
    });
  };

  const answerChip = (value, label) => {
    const index = nextStep(answered);
    const key = flow[index]?.key;
    if (!key) return;
    apply({ [key]: key === 'employees' || key === 'sites' ? Number(value) : key === 'spend' ? (value === 'skip' ? '' : String(value)) : value });
    const done = new Set([...answered, key]);
    setAnswered(done);
    setMessages(current => [...current, { from: 'user', text: label }, promptFor(nextStep(done))]);
  };

  const send = async (event, typed) => {
    event?.preventDefault();
    const message = (typed ?? text).trim();
    if (!message || busy) return;
    setText('');
    const history = messages.filter(item => !item.thinking).slice(-12).map(({ from, text: body }) => ({ from, text: body }));
    setMessages(current => [...current, { from: 'user', text: message }, { from: 'assistant', text: t('adv.thinking'), thinking: true }]);
    setBusy(true);
    try {
      const { data } = await api.post('/advisor/message', { text: message, language, profile, answered: [...answered], history });
      if (data.mode === 'rules' && data.notice) setAi(false);
      apply(data.updates);
      if (data.wants?.length) setWants(current => [...new Set([...current, ...data.wants])]);
      if (data.budget) setBudget(data.budget);
      const done = new Set([...answered, ...(data.found || [])]);
      if (data.wants?.length || data.budget) done.add('__extra');
      setAnswered(done);
      const index = nextStep(done);
      const reply = data.mode === 'ai' && data.reply ? { from: 'assistant', text: data.reply, chips: index < 0 || data.ready ? [] : flow[index].choices }
        : !data.recognized ? { from: 'assistant', text: `${copy.invalid} ${flow[nextStep(answered)]?.prompt || ''}`, chips: flow[nextStep(answered)]?.choices || [] }
          : promptFor(index);
      setMessages(current => [...current.filter(item => !item.thinking), reply]);
    } catch (error) {
      setMessages(current => current.filter(item => !item.thinking));
      toast(errorMessage(error), 'error');
    } finally { setBusy(false); }
  };

  // A sentence typed on the landing page arrives here and is sent as the owner's first message.
  const opening = useRef(location.state?.message);
  useEffect(() => {
    if (!opening.current) return;
    const message = opening.current;
    opening.current = null;
    send(null, message);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const listen = () => {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { toast('Voice input is not available in this browser.', 'error'); return; }
    const recognizer = new Speech();
    recognizer.lang = language;
    recognizer.interimResults = false;
    recognizer.onresult = event => setText(event.results[0][0].transcript);
    recognizer.onend = () => setListening(false);
    recognizer.onerror = () => setListening(false);
    setListening(true);
    recognizer.start();
  };

  const seePrice = async () => {
    try {
      let id = quoteId.current;
      if (!id) {
        const { data } = await api.post('/quotes', { profile, wants, budget, language });
        id = data.quote.id;
        rememberQuoteToken(id, data.accessToken);
      } else await api.patch(`/quotes/${id}`, { profile, wants, budget, language });
      navigate(`/quote/${id}`);
    } catch (error) { toast(errorMessage(error), 'error'); }
  };

  const reset = () => { setProfile(START); setAnswered(new Set()); setWants([]); setBudget(null); setQuote(null); quoteId.current = null; setMessages(welcome(copy)); };
  // One row per answer; the value is a quiet select, so a wrong guess is fixed in place.
  const row = (key, label, numeric) => {
    const step = flow.find(item => item.key === key);
    const known = answered.has(key);
    return (
      <div key={key} className="flex min-h-11 items-center justify-between gap-3 py-1.5">
        <span className="text-sm text-ink-muted">{label}</span>
        <select aria-label={label} className={cx('max-w-[60%] cursor-pointer truncate rounded-lg border border-transparent bg-transparent py-2 pl-2 pr-1 text-right text-sm font-medium hover:border-line focus:border-ink focus:outline-none', !known && 'text-ink-faint')} value={profile[key]} onChange={event => { apply({ [key]: numeric ? Number(event.target.value) : event.target.value }); setAnswered(current => new Set([...current, key])); }}>
          {key === 'current' && <option value="">—</option>}
          {step.choices.filter(([value]) => key !== 'spend' || value !== 'skip').map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
      </div>
    );
  };
  const lastChips = useMemo(() => { const last = [...messages].reverse().find(item => item.from === 'assistant' && !item.thinking); return last?.chips || []; }, [messages]);
  const ready = nextStep(answered) < 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <OnboardingStepper currentStep={1} quoteId={quote?.id} />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-[28px]">
            {t('adv.title')}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {t('adv.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold text-ink-muted">
          <span className="rounded-lg bg-paper px-2.5 py-1 text-ink" title={copy.ui.assistantHint}>
            {ai ? 'AI advisor' : 'Guided advisor'}
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1 text-ink-soft hover:text-ink hover:border-line transition-colors"
            onClick={reset}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('adv.reset')}
          </button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_24rem] lg:items-start">
        {/* Chat / Question Assistant Area */}
        <div className="card flex flex-col overflow-hidden lg:min-h-[500px]">
          <div className="flex-1 space-y-4 p-5 sm:p-6 lg:max-h-[520px] lg:overflow-y-auto" aria-live="polite">
            {messages.map((message, index) =>
              message.from === 'user' ? (
                <div
                  key={index}
                  className="ml-auto max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-sm bg-slate-900 px-4 py-3 text-sm font-medium leading-relaxed text-white"
                >
                  {message.text}
                </div>
              ) : (
                <div key={index} className="flex max-w-[90%] items-start gap-3">
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-xl bg-brand-600 text-white" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 15.5c2.5-6 9-9.5 14-7.5" /><path d="M8.5 18.5c2-3.2 5.6-5 9-4.3" /></svg>
                  </span>
                  <div
                    className={cx(
                      'whitespace-pre-line rounded-2xl rounded-tl-sm border border-line/80 bg-paper px-4 py-3 text-sm leading-relaxed text-ink',
                      message.thinking && 'animate-pulse text-ink-muted'
                    )}
                  >
                    {message.text}
                  </div>
                </div>
              )
            )}
            <div ref={chatEnd} />
          </div>

          {/* Quick Choice Chips */}
          {lastChips.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-line/60 bg-paper px-5 py-3">
              {lastChips.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="chip text-xs"
                  onClick={() => answerChip(value, label)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Message Input Bar */}
          <form onSubmit={send} className="flex gap-2 border-t border-line p-3.5 bg-white">
            <input
              className="input text-sm"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t('adv.typeHint')}
              maxLength={600}
              aria-label={t('adv.send')}
            />
            <button
              type="button"
              onClick={listen}
              className={cx(
                'rounded-xl border px-3 transition-colors',
                listening
                  ? 'border-brand-300 bg-brand-50 text-brand-700 animate-pulse'
                  : 'border-line bg-white text-ink-muted hover:text-ink hover:border-line'
              )}
              aria-label={t('adv.speak')}
              title={t('adv.voiceNote')}
            >
              <Mic className="h-5 w-5" />
            </button>
            <Button type="submit" loading={busy} aria-label={t('adv.send')}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>

        {/* Modular Sidebar: Plan Preview & Profile */}
        <aside className="card overflow-hidden border-t-4 border-t-brand-600 lg:sticky lg:top-24">
          <div className="p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-semibold text-ink">
                Recommended Solution
              </span>
              {quote && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                  Live Pricing
                </span>
              )}
            </div>

            {quote ? (
              <>
                <h3 className="text-lg font-semibold text-ink">
                  {quote.result.bundleName}
                </h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold text-ink num">
                    {rupees(quote.result.totals.monthly)}
                  </span>
                  <span className="text-xs text-ink-muted font-medium">
                    {t('common.perMonth')} · {t('common.inclGst')}
                  </span>
                </div>

                <div className="mt-4 border-t border-line/70 pt-3">
                  <p className="text-[13px] font-medium text-ink-muted mb-2">
                    Included in this plan:
                  </p>
                  <ul className="space-y-1.5 text-xs text-ink-soft">
                    {quote.result.items.map((item) => (
                      <li key={item.productId} className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-emerald-600 flex-none" />
                        <span className="truncate">
                          {item.name}
                          {item.quantity > 1 ? ` × ${item.quantity}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {quote.result.notes.filter((note) => note.code !== 'gst_unlocks').map((note) => (
                  <p key={note.code + note.text} className="mt-3 rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-800 border border-amber-200">
                    {note.text}
                  </p>
                ))}
              </>
            ) : (
              <div className="py-2">
                <p className="text-xs text-ink-muted leading-relaxed">
                  {copy.ui.intro}
                </p>
              </div>
            )}

            <Button className="mt-6 w-full text-xs font-semibold" size="lg" onClick={seePrice}>
              <span>See my plan and price</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="mt-2 text-center text-[11px] text-ink-muted">
              {ready ? t('adv.ready') : copy.ui.private}
            </p>
          </div>

          {/* Business Profile Chips & Collapsible Edit */}
          <div className="border-t border-line bg-paper px-6 py-4">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-ink">
                Your Answers
              </p>
              <button
                type="button"
                onClick={() => setShowCustomize(!showCustomize)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                <SlidersHorizontal className="h-3 w-3" />
                <span>{showCustomize ? 'Hide Controls' : 'Edit Manually'}</span>
                {showCustomize ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* Profile summary pill tags */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-lg bg-white border border-line px-2 py-1 text-[11px] font-semibold text-ink-soft capitalize">
                🏢 {profile.business}
              </span>
              <span className="rounded-lg bg-white border border-line px-2 py-1 text-[11px] font-semibold text-ink-soft">
                👥 {profile.employees} staff
              </span>
              <span className="rounded-lg bg-white border border-line px-2 py-1 text-[11px] font-semibold text-ink-soft">
                📍 {profile.sites} site(s)
              </span>
              <span className="rounded-lg bg-white border border-line px-2 py-1 text-[11px] font-semibold text-ink-soft">
                {profile.gstin === 'yes' ? '✓ GST Registered' : 'Unregistered'}
              </span>
            </div>

            {/* Collapsible fine-tuning table: only shown if owner clicks 'Edit Manually' */}
            {showCustomize && (
              <div className="mt-4 border-t border-line pt-2 divide-y divide-line/60">
                {row('business', copy.ui.business.replace(/^Choose your /, '').replace(/^./, c => c.toUpperCase()))}
                {row('employees', copy.ui.employees, true)}
                {row('sites', copy.ui.sites, true)}
                {row('tier', copy.ui.tier)}
                {row('gstin', copy.ui.gstin)}
                {row('current', copy.ui.current)}
                {row('goal', copy.ui.goal)}
              </div>
            )}

            {(wants.length > 0 || budget) && (
              <p className="mt-3 text-xs text-ink-muted font-medium border-t border-line pt-2">
                {wants.length > 0 && `${t('adv.wants')}: ${wants.length}`}
                {wants.length > 0 && budget && ' · '}
                {budget && `${t('adv.budget')}: ${rupees(budget)}`}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
