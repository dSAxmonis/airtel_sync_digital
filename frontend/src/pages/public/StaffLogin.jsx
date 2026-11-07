import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api/client.js';
import { useAuth, HOME_FOR_ROLE } from '../../context/AuthContext.jsx';
import { Logo, ROLE_LABEL } from '../../components/Layout.jsx';
import { Alert, Button, Field } from '../../components/ui.jsx';

export default function StaffLogin() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [demo, setDemo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/auth/demo-accounts').then(({ data }) => setDemo(data)).catch(() => {}); }, []);
  const go = async () => { const user = await refresh(); navigate(HOME_FOR_ROLE[user?.role] || '/'); };
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    try { await api.post('/auth/staff/login', form); await go(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  const quick = async account => { try { await api.post('/auth/demo-login', { userId: account.id }); await go(); } catch (err) { setError(errorMessage(err)); } };
  const staff = demo?.accounts?.filter(account => account.role !== 'customer') || [];
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="hidden flex-col justify-between bg-night p-12 text-white lg:flex">
        <Logo dark />
        <div>
          <h2 className="max-w-sm text-3xl font-semibold leading-tight text-white">One desk for partners, field teams and operations.</h2>
          <p className="mt-4 max-w-sm text-white/60">Each role sees only its own work: partner cases, delivery and installation jobs, KYC reviews and the live operations view.</p>
        </div>
        <p className="text-xs text-white/40">Access is logged for audit under the DPDP Act 2023.</p>
      </aside>
      <div className="flex flex-col px-4 py-10 sm:px-10">
        <div className="lg:hidden"><Logo /></div>
        <div className="mx-auto my-auto w-full max-w-md py-10">
          <h1 className="text-2xl font-semibold">Staff & partner sign-in</h1>
          <p className="mt-1 text-sm text-ink-muted">Use your work email and password.</p>
          {error && <Alert tone="error" className="mt-4">{error}</Alert>}
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Work email"><input className="input" type="email" required autoComplete="username" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></Field>
            <Field label="Password"><input className="input" type="password" required autoComplete="current-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></Field>
            <Button type="submit" className="w-full" size="lg" loading={busy}>Sign in</Button>
          </form>
          <p className="mt-6 text-sm text-ink-muted">Business owner? <Link className="font-semibold text-brand-600 hover:underline" to="/login">Sign in with your mobile number</Link></p>
          {staff.length > 0 && (
            <div className="mt-10 border-t border-line pt-6">
              <p className="text-sm font-semibold">Demo accounts</p>
              <p className="mt-0.5 text-xs text-ink-muted">One click to sign in. Password for all: <code className="rounded bg-paper px-1.5 py-0.5">{demo.password}</code></p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {staff.map(account => <button key={account.id} onClick={() => quick(account)} className="rounded-xl border border-line p-3 text-left transition hover:border-brand-600"><p className="text-sm font-semibold">{account.name}</p><p className="text-xs text-ink-muted">{ROLE_LABEL[account.role]}</p></button>)}
              </div>
            </div>
          )}
        </div>
        <Link to="/" className="mx-auto text-sm text-ink-muted hover:text-ink">← Back to the website</Link>
      </div>
    </div>
  );
}
