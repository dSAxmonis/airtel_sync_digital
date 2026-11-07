import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, Check, X, AlertTriangle, Upload, Eye, Loader2, ArrowRight, Landmark, FileCheck2, Sparkles } from 'lucide-react';
import UnregisteredPanel from '../../components/kyc/UnregisteredPanel.jsx';
import { api, errorMessage } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../i18n/index.jsx';
import { readDocument } from '../../lib/kycOcr.js';
import { gstinChecksumValid } from '../../lib/kycParse.js';
import { longDate, dateTime } from '../../lib/format.js';
import { Alert, Badge, Button, Callout, Spinner, Steps, STATUS_TONE, useToast, cx } from '../../components/ui.jsx';
import OnboardingStepper from '../../components/OnboardingStepper.jsx';

const DOCS = [['Address proof', true], ['Signatory ID', true], ['Authority letter', 'conditional'], ['GST certificate', false], ['Udyam certificate', false]];
// Unregistered: a bill, plus a shop licence or a shop-front photo (either one is enough).
const UNREGISTERED_DOCS = [['Address proof', true], ['Shop licence', 'oneOf'], ['Shop photo', 'oneOf']];

// The demo's drawn documents are SVG; OCR reads pixels, so draw them onto a canvas first.
async function svgToPng(url, name) {
  const svg = await (await fetch(url)).text();
  const image = new Image();
  const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = blobUrl; });
  const canvas = Object.assign(document.createElement('canvas'), { width: image.naturalWidth, height: image.naturalHeight });
  canvas.getContext('2d').drawImage(image, 0, 0);
  URL.revokeObjectURL(blobUrl);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return new File([blob], name, { type: 'image/png' });
}
const SPECIMEN_TYPE = { gst_certificate: 'GST certificate', udyam_certificate: 'Udyam certificate', address_proof: 'Address proof', signatory_id: 'Signatory ID' };
const ICON = { pass: [Check, 'text-ok-600'], warn: [AlertTriangle, 'text-warn-600'], fail: [X, 'text-brand-600'] };

export default function Kyc() {
  const { t } = useLanguage();
  const { refresh } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [gstin, setGstin] = useState('');
  const [udyam, setUdyam] = useState('');
  const [reading, setReading] = useState({});
  const [busy, setBusy] = useState('');
  const [helpSent, setHelpSent] = useState(false);
  const [choice, setChoice] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [pan, setPan] = useState('');
  const [bank, setBank] = useState({ ifsc: '', account: '' });
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const completing = useRef(false);

  const load = async () => {
    const [{ data: me }, { data: mine }] = await Promise.all([api.get('/business/me'), api.get('/orders/mine')]);
    setData(me);
    setOrders(mine.orders);
  };
  useEffect(() => {
    Promise.all([api.get('/business/me'), api.get('/orders/mine')])
      .then(([{ data: me }, { data: mine }]) => { setData(me); setOrders(mine.orders); })
      .catch(error => toast(errorMessage(error), 'error'));
  }, [toast]);

  // Back from DigiLocker with an authorization code: exchange it on the server (PKCE-checked) for signed documents.
  useEffect(() => {
    const code = params.get('code'), state = params.get('state');
    if (params.get('digilocker') !== 'done' || !code || completing.current) return;
    completing.current = true;
    api.post('/kyc/digilocker/complete', { state, code })
      .then(({ data: result }) => { setData(current => (current ? { ...current, business: result.business } : current)); toast(result.linked ? t('dl.linked') : t('dl.personOnly')); })
      .catch(error => toast(errorMessage(error), 'error'))
      .finally(() => setParams({}, { replace: true }));
  }, [params, setParams, t, toast]);

  const run = async (key, task) => {
    setBusy(key);
    try { await task(); } catch (error) { toast(errorMessage(error), 'error'); } finally { setBusy(''); }
  };
  const setBusiness = business => setData(current => ({ ...current, business }));
  const consent = checked => run('consent', async () => {
    if (checked) { const { data: given } = await api.post('/kyc/consent'); toast(t('kyc.consentActive', { time: dateTime(given.consent.expiresAt) })); }
    else { const { data: result } = await api.post('/kyc/consent/withdraw'); setBusiness(result.business); toast(`${t('kyc.withdraw')} ✓`); }
    await load();
  });
  // Registry errors with a code are shown in the owner's language; anything else falls back to the server's text.
  const registryError = error => {
    const details = error?.response?.data?.details;
    if (details?.code === 'registry_mismatch') return t('kyc.mismatch', { entered: `${details.entered.name} (${details.entered.place})`, current: `${details.current.name} (${details.current.place})`, existing: details.existing === 'udyam' ? 'Udyam' : 'GST' });
    if (details?.code === 'registry_locked') return t('kyc.locked', { masked: details.masked || '' });
    return errorMessage(error);
  };
  const lookup = async (kind, value) => {
    setBusy(kind);
    try {
      const { data: result } = await api.post(`/kyc/${kind}`, kind === 'gstin' ? { gstin: value } : { udyam: value });
      setBusiness(result.business);
      if (kind === 'gstin' && !result.active) toast(t('kyc.inactive', { status: result.status.toLowerCase() }), 'error'); else toast(t('kyc.registryOk'));
      await refresh();
    } catch (error) { toast(registryError(error), 'error'); } finally { setBusy(''); }
  };
  const removeRegistry = kind => run(`remove-${kind}`, async () => {
    const { data: result } = await api.delete(`/kyc/registry/${kind === 'gstin' ? 'gst' : 'udyam'}`);
    setBusiness(result.business);
    if (kind === 'gstin') setGstin(''); else setUdyam('');
    await refresh();
  });

  // Reads the document on this device, auto-fills the registry number it finds, then uploads file + fields.
  const addDocument = async (type, file) => {
    if (!data?.consent) { toast(t('kyc.consentCheck'), 'error'); return; }
    setReading(current => ({ ...current, [type]: true }));
    try {
      const ocr = await readDocument(file, type).catch(error => { console.warn('Could not read the document on this device:', error); return { confidence: 0, fields: {} }; });
      if (type === 'GST certificate' && ocr.fields.gstin && gstinChecksumValid(ocr.fields.gstin) && !data.business.gst) { setGstin(ocr.fields.gstin); await api.post('/kyc/gstin', { gstin: ocr.fields.gstin }).catch(error => toast(registryError(error), 'error')); }
      if (type === 'Udyam certificate' && ocr.fields.udyam_number && !data.business.udyam) { setUdyam(ocr.fields.udyam_number); await api.post('/kyc/udyam', { udyam: ocr.fields.udyam_number }).catch(error => toast(registryError(error), 'error')); }
      const form = new FormData();
      form.append('type', type);
      form.append('confidence', String(ocr.confidence));
      form.append('fields', JSON.stringify(ocr.fields));
      if (ocr.looksLike) form.append('looksLike', ocr.looksLike);
      form.append('file', file);
      const { data: result } = await api.post('/kyc/documents', form);
      setBusiness(result.business);
      await refresh();
    } catch (error) { toast(errorMessage(error), 'error'); } finally { setReading(current => ({ ...current, [type]: false })); }
  };
  const loadSpecimen = async applicant => run('specimen', async () => {
    const { data: list } = await api.get('/specimens');
    const files = (list.applicants[applicant] || []).sort((a, b) => (a.includes('gst') ? -1 : b.includes('gst') ? 1 : 0));
    for (const name of files) {
      const blob = await (await fetch(`/api/specimens/${name}`)).blob();
      await addDocument(SPECIMEN_TYPE[name.slice(4, -4)], new File([blob], name, { type: 'image/png' }));
    }
  });
  const startDigiLocker = () => run('digilocker', async () => { const { data: started } = await api.post('/kyc/digilocker/start'); navigate(started.authorizeUrl); });
  const verifyPan = event => { event.preventDefault(); run('pan', async () => { const { data: result } = await api.post('/kyc/ownership/pan', { pan }); setBusiness(result.business); toast(t('own.panOk', { name: result.pan.name })); }); };
  const verifyBank = event => { event.preventDefault(); run('bank', async () => { const { data: result } = await api.post('/kyc/ownership/bank', bank); setBusiness(result.business); toast(t('own.bankOk', { holder: result.bank.holder })); await refresh(); }); };
  // Demo only: the simulated PAN and bank records for this case-pack business.
  const demoFill = () => run('demo-fill', async () => {
    const { data: ids } = await api.get('/kyc/demo-identities');
    if (ids.forThisBusiness?.pan && !data.business.ownership?.pan) setPan(ids.forThisBusiness.pan);
    if (ids.forThisBusiness?.account) setBank({ ifsc: ids.forThisBusiness.ifsc, account: ids.forThisBusiness.account });
    else toast(t('own.noDemo'), 'error');
  });
  const askReview = () => run('review', async () => { const { data: result } = await api.post('/kyc/request-review'); setBusiness(result.business); toast(t('kyc.reviewSent')); });
  const askHelp = () => run('help', async () => { await api.post('/kyc/registration-help'); setHelpSent(true); });
  const loadShopSample = () => run('specimen', async () => {
    for (const [kind, type] of [['bill', 'Address proof'], ['licence', 'Shop licence'], ['photo', 'Shop photo']]) await addDocument(type, await svgToPng(`/api/kyc/demo-documents/${kind}`, `sample-${kind}.png`));
  });

  if (!data) return <Spinner />;
  const { business } = data;
  const status = business.kyc.status;
  const verified = status === 'verified';
  const registryOk = business.gst?.status === 'Active' || business.udyam;
  // Which path the owner is on: registered (GST/Udyam), unregistered (owner e-KYC), or not chosen yet.
  const mode = choice || (business.gst || business.udyam ? 'registered' : business.registration?.path === 'unregistered' ? 'unregistered' : null);
  const unregistered = mode === 'unregistered';
  const docs = unregistered ? UNREGISTERED_DOCS : DOCS;
  const registryMismatch = business.kyc.failed?.some(item => item.type === 'Registry');
  const docOf = type => business.documents.find(doc => doc.type === type);
  const waiting = orders.filter(order => ['awaiting_kyc', 'awaiting_signature'].includes(order.status));
  const openRequests = business.kyc.reviewRequests.filter(request => !request.resolved);

  // Step states: done steps fold to one line; only the step in front of the owner opens.
  const needsAuthority = business.kyc.missing.includes('Authority letter') || Boolean(docOf('Authority letter'));
  const owned = Boolean(business.ownership?.verifiedAt);
  const ownershipDone = verified || owned;
  const consentDone = verified || Boolean(data.consent);
  const businessDone = verified || (unregistered ? Boolean(business.ownerKyc && business.registration?.declared) : Boolean(registryOk));
  const docsDone = verified || status === 'in_review' || (business.documents.length > 0 && !business.kyc.missing.length && !business.documents.some(doc => doc.status === 'fail') && !['action_needed', 'registry_needed'].includes(status));
  const stateOf = (done, ready) => (done ? 'done' : ready ? 'current' : 'todo');
  const open = (state, key) => showAll || state === 'current' || (!verified && state === 'done' && key !== 'consent');
  const consentState = stateOf(consentDone, true);
  const businessState = stateOf(businessDone, consentDone);
  const docsState = stateOf(docsDone, consentDone && (businessDone || Boolean(mode)));
  const ownershipState = stateOf(ownershipDone, consentDone && businessDone);
  const resultState = verified ? 'done' : status === 'action_needed' ? 'blocked' : docsDone ? 'current' : 'todo';
  const registryName = [business.gst && `${business.gst.tradeName} · GSTIN ${business.gst.masked}`, business.udyam && `${business.udyam.enterpriseName} · Udyam ${business.udyam.masked}`].filter(Boolean).join(' / ');

  const consentBody = (
    <div className="max-w-2xl">
      <p className="text-sm text-ink-soft">{t(unregistered ? 'ureg.consentBody' : 'kyc.consentBody')}</p>
      <ul className="mt-2 space-y-0.5 text-sm text-ink-muted">{['kyc.p1', 'kyc.p2', 'kyc.p3'].map(key => <li key={key} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 flex-none text-ok-600" />{t(key)}</li>)}</ul>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-[#cfcfca] bg-white p-3 hover:border-ink"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-ink" checked={Boolean(data.consent)} disabled={busy === 'consent'} onChange={event => consent(event.target.checked)} /><span className="text-sm font-medium">{t('kyc.consentCheck')}</span></label>
    </div>
  );

  const choiceBody = (
    <div className="max-w-2xl divide-y divide-line rounded-lg border border-line bg-white">
      {[
        ['registered', t('ureg.yes'), t('kyc.subtitle')],
        ['udyam', t('ureg.getUdyam'), t('ureg.getUdyamBody')],
        ['unregistered', t('ureg.without'), t('ureg.withoutBody')],
      ].map(([key, title, body]) => {
        const inner = <><div className="flex-1"><p className="font-medium">{title}</p><p className="mt-0.5 text-sm text-ink-muted">{body}</p></div><ArrowRight className="mt-1 h-4 w-4 flex-none text-ink-faint group-hover:text-ink" /></>;
        return key === 'udyam'
          ? <Link key={key} to="/app/udyam" className="group flex gap-4 p-4 hover:bg-paper/60">{inner}</Link>
          : <button key={key} type="button" onClick={() => setChoice(key)} className="group flex w-full gap-4 p-4 text-left hover:bg-paper/60">{inner}</button>;
      })}
    </div>
  );

  const digiLockerCard = !verified && (
    <div className="flex flex-col gap-3 rounded-xl border border-[#c9d4ee] bg-[#f3f6fd] p-4 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-[#1d3f8f] text-white"><FileCheck2 className="h-5 w-5" /></span>
      <div className="flex-1"><p className="font-semibold text-[#1d3f8f]">{t('dl.title')}</p><p className="text-sm text-ink-muted">{t('dl.body')}</p></div>
      <Button loading={busy === 'digilocker'} disabled={!data.consent} onClick={startDigiLocker}>{t('dl.cta')}<ArrowRight className="h-4 w-4" /></Button>
    </div>
  );

  const ownershipBody = (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-ink-muted">{t('own.why')}</p>
      {owned ? (
        <div className="flex items-start gap-2 border-l-2 border-ok-600 py-1 pl-3 text-sm"><Check className="mt-0.5 h-4 w-4 flex-none text-ok-600" /><p>{business.ownership.method === 'digilocker' ? t('own.byDigiLocker', { role: business.ownership.role || '' }) : t('own.byBank', { holder: business.ownership.bank?.holder || '', account: business.ownership.bank?.masked || '' })}</p></div>
      ) : (
        <>
          {digiLockerCard}
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{t('own.or')}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <form className="space-y-2" onSubmit={verifyPan}>
              <p className="label">{t('own.pan')} {business.ownership?.pan && <span className="font-normal text-ok-700">· {business.ownership.pan.masked} · {business.ownership.pan.name} ✓</span>}</p>
              <div className="flex gap-2"><input className="input font-mono uppercase" maxLength={10} placeholder="ABCDE1234F" value={pan} disabled={!data.consent || Boolean(business.ownership?.pan)} onChange={event => setPan(event.target.value.toUpperCase())} /><Button type="submit" variant="secondary" loading={busy === 'pan'} disabled={!pan || Boolean(business.ownership?.pan)}>{t('kyc.check')}</Button></div>
              <p className="text-xs text-ink-muted">{t('own.panHint')}</p>
            </form>
            <form className="space-y-2" onSubmit={verifyBank}>
              <p className="label flex items-center gap-1.5"><Landmark className="h-4 w-4" />{t('own.bank')}</p>
              <div className="grid grid-cols-[1fr_1.3fr] gap-2"><input className="input font-mono uppercase" maxLength={11} placeholder="IFSC" value={bank.ifsc} onChange={event => setBank({ ...bank, ifsc: event.target.value.toUpperCase() })} /><input className="input font-mono" inputMode="numeric" placeholder={t('own.account')} value={bank.account} onChange={event => setBank({ ...bank, account: event.target.value.replace(/\D/g, '') })} /></div>
              <div className="flex flex-wrap gap-2"><Button type="submit" variant="secondary" loading={busy === 'bank'} disabled={!bank.ifsc || !bank.account || (business.gst && !business.ownership?.pan)}>{t('own.bankCta')}</Button><Button type="button" variant="ghost" size="sm" loading={busy === 'demo-fill'} onClick={demoFill}>{t('own.demo')}</Button></div>
              <p className="text-xs text-ink-muted">{t('own.bankHint')}</p>
            </form>
          </div>
        </>
      )}
    </div>
  );

  const registeredBody = (
    <div className="space-y-4">
      {!registryOk && digiLockerCard}
      {registryMismatch && <Alert tone="error" title={t('kyc.mismatchTitle')}>{t('kyc.mismatchBody')}</Alert>}
      <div className="grid gap-5 md:grid-cols-2">
        {[['gstin', t('kyc.gst'), t('kyc.gstHint'), gstin, setGstin, business.gst], ['udyam', t('kyc.udyam'), t('kyc.udyamHint'), udyam, setUdyam, business.udyam]].filter(([kind, , , , , record]) => record || kind === 'gstin' || business.gst?.status !== 'Active').map(([kind, label, hint, value, setValue, record]) => (
          <div key={kind}>
            <p className="label">{label} <span className="font-normal text-ink-muted">· {t('common.optional')}</span></p>
            {record ? (
              <div className={cx('border-l-2 py-1 pl-3 text-sm', kind === 'gstin' && record.status !== 'Active' ? 'border-brand-600' : 'border-ok-600')}>
                <p className="font-medium">{kind === 'gstin' ? record.tradeName : record.enterpriseName}</p>
                <p className="text-ink-muted"><span className="font-mono text-[13px]">{record.masked}</span> · {kind === 'gstin' ? record.status : `${record.enterpriseType || ''} · ${record.city}`}</p>
                {kind === 'gstin' && <p className="text-ink-muted">{record.legalName} · {record.address}</p>}
                {kind === 'gstin' && record.status !== 'Active' && <p className="mt-1 font-medium text-brand-700">{t('kyc.inactive', { status: record.status.toLowerCase() })}</p>}
                {!verified && <button type="button" className="mt-1 text-[13px] text-ink-muted underline hover:text-ink" disabled={busy === `remove-${kind}`} onClick={() => removeRegistry(kind)}>{t('kyc.removeRegistry')}</button>}
              </div>
            ) : (
              <form className="flex gap-2" onSubmit={event => { event.preventDefault(); lookup(kind, value); }}>
                <input className="input font-mono uppercase" placeholder={hint} aria-label={label} value={value} disabled={!data.consent} onChange={event => setValue(event.target.value.toUpperCase())} autoComplete="off" />
                <Button type="submit" variant="secondary" loading={busy === kind} disabled={!data.consent || !value}>{t('kyc.check')}</Button>
              </form>
            )}
          </div>
        ))}
      </div>
      {!registryOk && (
        <div className="flex flex-col gap-3 border-t border-line pt-4 text-sm sm:flex-row sm:items-center">
          <p className="flex-1 text-ink-muted"><span className="font-medium text-ink">{t('kyc.noReg')}</span> {t('ureg.withoutBody')}</p>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setChoice(null)}>{t('ureg.no')}</Button><Button size="sm" variant="ghost" loading={busy === 'help'} disabled={helpSent} onClick={askHelp}>{helpSent ? t('order.callbackDone') : t('kyc.partner')}</Button></div>
        </div>
      )}
    </div>
  );

  const docsBody = (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-muted">{unregistered ? t('ureg.docsHint') : t('kyc.docsHint')}</p>
        {unregistered ? (
          <Button variant="ghost" size="sm" loading={busy === 'specimen'} disabled={!data.consent || !business.registration?.declared} onClick={loadShopSample}>{t('ureg.demo')}</Button>
        ) : (
          <select className="input w-auto py-1.5 text-sm" value="" disabled={!data.consent || busy === 'specimen'} onChange={event => event.target.value && loadSpecimen(event.target.value)} aria-label={t('kyc.specimen')}>
            <option value="">{busy === 'specimen' ? t('kyc.reading') : t('kyc.specimen')}</option>
            {Array.from({ length: 12 }, (_, index) => `K${String(index + 1).padStart(2, '0')}`).map(code => <option key={code} value={code}>{code}</option>)}
          </select>
        )}
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line bg-white">
        {docs.filter(([, required]) => required !== 'conditional' || needsAuthority).map(([type, required]) => {
          const doc = docOf(type);
          const isReading = reading[type];
          const checks = doc?.checks.filter(check => check.label !== 'Document read') || [];
          return (
            <li key={type} className="p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-[10rem] flex-1">
                  <p className="font-medium">{t(`doc.${type}`)}</p>
                  <p className="text-[13px] text-ink-muted">{required === true || required === 'conditional' ? t('common.required') : required === 'oneOf' ? t('ureg.oneOf') : t('common.optional')}{required === 'conditional' ? ` · ${t('own.letterWhy')}` : ''}</p>
                  {doc?.source === 'digilocker' && <p className="mt-0.5 flex items-center gap-1 text-[12px] font-medium text-[#1d3f8f]"><FileCheck2 className="h-3.5 w-3.5" />{t('dl.badge', { issuer: doc.issued?.issuer || '' })}</p>}
                  {doc?.source === 'upload' && doc.ai && <p className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-muted"><Sparkles className="h-3.5 w-3.5" />{t('kyc.readTwice')}</p>}
                </div>
                <div className="text-sm">
                  {isReading ? <span className="flex items-center gap-1.5 text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" />{t('kyc.reading')}</span>
                    : doc ? <Badge tone={doc.status === 'pass' ? 'green' : status === 'in_review' ? 'blue' : doc.status === 'fail' ? 'red' : 'amber'}>{t(`kycs.${doc.status === 'pass' ? 'verified' : status === 'in_review' ? 'in_review' : doc.status === 'fail' ? 'action_needed' : 'in_review'}`)}</Badge> : null}
                </div>
                <div className="flex gap-2">
                  {doc?.hasFile && <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-ink-muted hover:bg-ink/5 hover:text-ink"><Eye className="h-4 w-4" />{t('common.view')}</a>}
                  <label className={cx('inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#cfcfca] bg-white px-3 py-1.5 text-sm font-medium hover:border-ink', (!data.consent || isReading) && 'pointer-events-none opacity-50')}><Upload className="h-4 w-4" />{doc ? t('kyc.replace') : t('kyc.choose')}<input type="file" className="sr-only" accept={type === 'Shop photo' ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf'} capture={type === 'Shop photo' ? 'environment' : undefined} disabled={!data.consent || isReading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) addDocument(type, file); }} /></label>
                </div>
              </div>
              {checks.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-dashed border-line pt-3">
                  {checks.map((check, index) => { const [Icon, color] = ICON[check.status]; return <li key={index} className="flex gap-2 text-sm"><Icon className={cx('mt-0.5 h-4 w-4 flex-none', color)} /><div><span className={cx(check.status === 'fail' && 'font-medium text-brand-800')}>{check.label}</span>{check.detail && <span className="text-ink-muted"> · {check.detail}</span>}</div></li>; })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {business.kyc.missing.filter(type => type !== 'Ownership proof').length > 0 && business.documents.length > 0 && <p className="mt-3 text-sm text-warn-700">{business.kyc.missing.filter(type => type !== 'Ownership proof').map(type => t(`doc.${type}`)).join(', ')}: {t('common.required')}</p>}
    </div>
  );

  const steps = [
    { key: 'consent', state: consentState, title: t('kyc.consentTitle'), summary: consentDone && !open(consentState, 'consent') ? (data.consent ? t('kyc.consentActive', { time: dateTime(data.consent.expiresAt) }) : t('kyc.p1')) : null, aside: data.consent && !verified && <button className="text-sm text-ink-muted underline hover:text-ink" onClick={() => consent(false)}>{t('kyc.withdraw')}</button>, children: open(consentState, 'consent') && consentBody },
    { key: 'business', state: businessState, title: unregistered ? t('ureg.stepOwner') : t('kyc.step1'), summary: businessDone && !unregistered ? registryName : businessDone ? business.name : !mode && businessState === 'current' ? t('ureg.question') : null, aside: mode && !businessDone && businessState !== 'todo' && <button className="text-sm text-ink-muted underline hover:text-ink" onClick={() => setChoice(null)}>{t('ureg.question')}</button>, children: open(businessState, 'business') && (!mode ? choiceBody : unregistered ? <UnregisteredPanel business={business} consent={Boolean(data.consent)} verified={verified} onBusiness={result => { setBusiness(result); refresh(); }} onSwitch={() => setChoice('registered')} /> : registeredBody) },
    ...(unregistered ? [] : [{ key: 'ownership', state: ownershipState, title: t('own.title'), summary: owned && !open(ownershipState, 'ownership') ? (business.ownership.method === 'digilocker' ? 'DigiLocker' : `${t('own.bank')} ${business.ownership.bank?.masked || ''}`) : null, children: open(ownershipState, 'ownership') && ownershipBody }]),
    { key: 'docs', state: docsState, title: t('kyc.docs'), summary: business.documents.length ? business.documents.map(doc => t(`doc.${doc.type}`)).join(' · ') : null, children: open(docsState, 'docs') && docsBody },
    { key: 'result', state: resultState, title: t('kyc.step3'), summary: verified ? `${t('kyc.verifiedTitle')} · ${t(`tier.${business.kyc.tier}`)}` : status === 'in_review' ? t('kyc.reviewSent') : status === 'action_needed' ? t('kycs.action_needed') : null, aside: status === 'action_needed' && <Button variant="secondary" size="sm" loading={busy === 'review'} onClick={askReview}>{t('kyc.askReview')}</Button> },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <OnboardingStepper currentStep={3} />

      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold sm:text-[28px]">
            {t('kyc.title')}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {unregistered ? t('ureg.withoutBody') : t('kyc.subtitle')}
          </p>
        </div>
        <div>
          <Badge tone={STATUS_TONE[status]} className="text-xs">
            {t(unregistered && status === 'registry_needed' ? 'ureg.status' : `kycs.${status}`)}
          </Badge>
        </div>
      </div>

      {verified && (
        <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 sm:flex-row sm:items-center shadow-card">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-600 text-white flex-none">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <p className="text-base font-semibold text-emerald-950">
              {t('kyc.verifiedTitle')} · {t(`tier.${business.kyc.tier}`)}
            </p>
            <p className="mt-0.5 text-xs text-emerald-800">
              {t('kyc.verifiedBody', { date: longDate(business.kyc.expiresAt) })}
            </p>
          </div>
          {waiting[0] && (
            <Button to={`/app/orders/${waiting[0].id}`} size="md">
              <span>{t('kyc.backToOrder')}</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {status === 'action_needed' && business.kyc.failed?.length > 0 && (
        <Callout tone="action" className="mb-8">
          <p className="font-semibold text-sm">{t('kycs.action_needed')}</p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {business.kyc.failed.map((item, index) => (
              <li key={index} className="flex gap-2">
                <X className="mt-0.5 h-3.5 w-3.5 flex-none text-brand-600" />
                <span>
                  <strong className="text-brand-900">{item.type === 'Registry' ? t('kyc.step1') : t(`doc.${item.type}`)}:</strong> {item.label}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" loading={busy === 'review'} onClick={askReview}>
              {t('kyc.askReview')}
            </Button>
          </div>
        </Callout>
      )}

      {openRequests.length > 0 && (
        <div className="mb-8 space-y-2">
          {openRequests.map((request) => (
            <Alert key={request.at} tone="warning" title={t(`doc.${request.docType}`)}>
              {t('kyc.reviewerAsked', { message: request.message })}
            </Alert>
          ))}
        </div>
      )}

      <div className="card p-6 sm:p-8 shadow-card">
        <Steps items={steps} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4 text-xs text-ink-muted">
        <div className="flex items-center gap-4">
          {verified && (
            <button className="font-semibold text-ink underline hover:text-brand-600" onClick={() => setShowAll(!showAll)}>
              {showAll ? t('common.close') : t('kyc.checks')} (17 Checks Breakdown)
            </button>
          )}
          <span>Secure Storage: {data.storage === 'r2' ? 'Cloudflare R2 (Private Encrypted Bucket)' : 'Local Encrypted Storage'}</span>
        </div>
        <Link to="/privacy" className="font-semibold text-brand-600 hover:underline">
          {t('footer.privacy')} · DPDP Act 2023
        </Link>
      </div>
    </div>
  );
}
