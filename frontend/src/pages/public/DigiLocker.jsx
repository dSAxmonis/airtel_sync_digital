import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileCheck2, Lock, ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { Button, Spinner, useToast } from '../../components/ui.jsx';

// SIMULATED DigiLocker sign-in and consent screen. In production the owner is redirected to digilocker.gov.in
// (OAuth 2.0 + PKCE) and comes back with an authorization code; this page stands in for that provider.
export default function DigiLocker() {
  const [params] = useSearchParams();
  const state = params.get('state') || '';
  const navigate = useNavigate();
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [aadhaar, setAadhaar] = useState('');
  const [otp, setOtp] = useState(null);
  const [code, setCode] = useState('');
  const [docs, setDocs] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [busy, setBusy] = useState('');

  useEffect(() => { api.get('/digilocker-sim/request', { params: { state } }).then(({ data }) => setInfo(data)).catch(error => setInfo({ error: errorMessage(error) })); }, [state]);
  const run = async (key, task) => { setBusy(key); try { await task(); } catch (error) { toast(errorMessage(error), 'error'); } finally { setBusy(''); } };
  const signIn = event => { event.preventDefault(); run('signin', async () => { const { data } = await api.post('/digilocker-sim/signin', { state, aadhaar }); setOtp(data); setCode(''); }); };
  const verify = event => { event.preventDefault(); run('verify', async () => { const { data } = await api.post('/digilocker-sim/verify', { state, code }); setDocs(data); setChosen(data.documents.map(doc => doc.uri)); }); };
  const allow = () => run('allow', async () => { const { data } = await api.post('/digilocker-sim/consent', { state, uris: chosen }); navigate(data.redirect); });

  if (!info) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  return (
    <div className="min-h-screen bg-[#f2f5fb] px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#1d3f8f] text-white"><Lock className="h-5 w-5" /></span>
          <div><p className="text-lg font-semibold text-[#1d3f8f]">DigiLocker</p><p className="text-xs text-ink-muted">Simulated for the hackathon demo · production uses digilocker.gov.in</p></div>
        </div>
        <div className="rounded-2xl border border-[#d6dcea] bg-white p-6 shadow-card">
          {info.error ? <p className="text-sm text-brand-700">{info.error}</p> : (
            <>
              <p className="text-sm text-ink-muted"><span className="font-semibold text-ink">{info.client}</span> is requesting access to your documents to {info.purpose.charAt(0).toLowerCase() + info.purpose.slice(1)}.</p>
              {!otp && (
                <form className="mt-5 space-y-3" onSubmit={signIn}>
                  <label className="label" htmlFor="dl-aadhaar">Aadhaar number</label>
                  <input id="dl-aadhaar" className="input font-mono tracking-wider" inputMode="numeric" maxLength={14} required placeholder="12-digit Aadhaar" value={aadhaar} onChange={event => setAadhaar(event.target.value.replace(/[^\d ]/g, ''))} />
                  <Button type="submit" className="w-full" loading={busy === 'signin'}>Get OTP on Aadhaar-registered mobile</Button>
                  {info.demoResidents?.length > 0 && (
                    <div className="rounded-lg bg-paper p-3 text-xs">
                      <p className="mb-2 font-medium text-ink">Demo residents (synthetic, from the case pack)</p>
                      <select className="input py-1.5 text-xs" value="" onChange={event => event.target.value && setAadhaar(event.target.value)} aria-label="Pick a demo resident">
                        <option value="">Choose a person…</option>
                        {info.demoResidents.map(person => <option key={person.aadhaar} value={person.aadhaar}>{person.key} · {person.name} · {person.role} of {person.business}</option>)}
                      </select>
                    </div>
                  )}
                </form>
              )}
              {otp && !docs && (
                <form className="mt-5 space-y-3" onSubmit={verify}>
                  <p className="text-sm">OTP sent to the mobile registered with UIDAI: <span className="font-mono">{otp.sentTo}</span></p>
                  {otp.devCode && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Demo OTP: <span className="font-mono font-semibold">{otp.devCode}</span></p>}
                  <input className="input text-center font-mono tracking-[0.4em]" inputMode="numeric" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} aria-label="OTP" />
                  <Button type="submit" className="w-full" loading={busy === 'verify'}>Sign in</Button>
                </form>
              )}
              {docs && (
                <div className="mt-5">
                  <p className="text-sm">Signed in as <span className="font-semibold">{docs.name}</span>. Choose what to share:</p>
                  <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
                    {docs.documents.map(doc => (
                      <li key={doc.uri}>
                        <label className="flex cursor-pointer items-start gap-3 p-3">
                          <input type="checkbox" className="mt-1 h-4 w-4 accent-[#1d3f8f]" checked={chosen.includes(doc.uri)} onChange={event => setChosen(current => event.target.checked ? [...current, doc.uri] : current.filter(uri => uri !== doc.uri))} />
                          <span className="flex-1"><span className="flex items-center gap-1.5 text-sm font-medium"><FileCheck2 className="h-4 w-4 text-[#1d3f8f]" />{doc.docType}</span><span className="block text-xs text-ink-muted">{doc.issuer}{doc.label ? ` · ${doc.label}` : ''}</span></span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {docs.documents.length === 1 && <p className="mt-2 text-xs text-ink-muted">No business registration is linked to this Aadhaar. Your identity will be shared; the business needs a bank check instead.</p>}
                  <div className="mt-4 flex gap-2">
                    <Button className="flex-1" loading={busy === 'allow'} disabled={!chosen.length} onClick={allow}><ShieldCheck className="h-4 w-4" />Allow</Button>
                    <Button variant="secondary" onClick={() => navigate('/app/kyc')}>Deny</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-ink-muted">Documents are pulled from the issuing departments and carry their digital signature.</p>
      </div>
    </div>
  );
}
