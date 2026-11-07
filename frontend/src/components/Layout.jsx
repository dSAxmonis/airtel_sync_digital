import { Component, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Menu, X, LogOut, Users, Store, Wrench, ShieldCheck, LayoutDashboard, Truck, Globe2, UserCog, ChevronLeft,
  Home, Wifi, Receipt, MessageSquare, LifeBuoy, Lock, PackageCheck, Briefcase, ScrollText, Headset, ChevronDown, Trophy, ArrowRight,
} from 'lucide-react';
import { useAuth, HOME_FOR_ROLE } from '../context/AuthContext.jsx';
import { useLanguage, LANGUAGES } from '../i18n/index.jsx';
import { api } from '../api/client.js';
import { Avatar, cx, Spinner } from './ui.jsx';

export const ROLE_LABEL = { customer: 'Business owner', partner: 'Channel partner', delivery: 'Delivery agent', technician: 'Technician', kyc_officer: 'KYC officer', ops_admin: 'Operations admin', super_admin: 'Super admin' };

// The red brand mark with the product name beside it.
export function Logo({ to = '/', compact = false, dark = false, onRed = false }) {
  return (
    <Link to={to} className="flex items-center gap-2.5" aria-label="Udyam Digital home">
      <span className={cx('grid h-9 w-9 flex-none place-items-center rounded-xl', onRed ? 'bg-white text-brand-600' : 'bg-brand-600 text-white')}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M5 15.5c2.5-6 9-9.5 14-7.5" /><path d="M8.5 18.5c2-3.2 5.6-5 9-4.3" /></svg>
      </span>
      {!compact && <span className={cx('font-display text-[19px] font-semibold tracking-tight', dark || onRed ? 'text-white' : 'text-ink')}>udyam<span className={onRed ? 'text-white/70' : 'text-brand-600'}>.digital</span></span>}
    </Link>
  );
}

export function LanguagePicker({ className = '', dark = false }) {
  const { language, setLanguage } = useLanguage();
  const { user } = useAuth();
  const change = value => {
    setLanguage(value);
    if (user?.role === 'customer') api.patch('/auth/me', { preferredLanguage: value }).catch(() => {});
  };
  return (
    <label className={cx('relative inline-flex items-center', className)}>
      <Globe2 className={cx('pointer-events-none absolute left-2.5 h-4 w-4', dark ? 'text-white/60' : 'text-ink-muted')} />
      <select aria-label="Language" value={language} onChange={event => change(event.target.value)} className={cx('h-9 appearance-none rounded-lg border bg-transparent py-1 pl-8 pr-3 text-[13px] font-medium focus:border-brand-600 focus:outline-none', dark ? 'border-white/15 text-white [&>option]:text-ink' : 'border-line text-ink-soft hover:border-ink-faint')}>
        {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select>
    </label>
  );
}

export function NotificationBell({ to }) {
  const [unread, setUnread] = useState(0);
  const { pathname } = useLocation();
  useEffect(() => { api.get('/notifications').then(({ data }) => setUnread(data.unread)).catch(() => {}); }, [pathname]);
  return (
    <Link to={to} className="relative grid h-9 w-9 place-items-center rounded-lg text-ink-soft hover:bg-ink/[0.05] hover:text-ink" aria-label={`Messages${unread ? `, ${unread} unread` : ''}`}>
      <Bell className="h-5 w-5" />
      {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}

// ---------- Public site (before sign-in) ----------

const PUBLIC_LINKS = [['/#features', 'Features'], ['/#solutions', 'Solutions'], ['/#how', 'How it works'], ['/#about', 'About us']];

// Red top bar that runs straight into the red hero.
function PublicHeader() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) { setSeenPath(pathname); setOpen(false); }
  const home = user ? HOME_FOR_ROLE[user.role] : null;
  const cta = home ? [home, 'Go to dashboard'] : ['/advisor', 'Get started'];
  return (
    <header className="sticky top-0 z-30 bg-[#d4001a] text-white">
      <div className="container-x flex h-20 items-center gap-10">
        <Logo onRed />
        <nav className="ml-auto hidden items-center gap-10 lg:flex" aria-label="Main">
          {PUBLIC_LINKS.map(([to, label]) => <Link key={to} to={to} className="text-[15px] text-white/90 transition hover:text-white">{label}</Link>)}
          {!home && <Link to="/login" className="text-[15px] text-white/90 transition hover:text-white">Login</Link>}
        </nav>
        <div className="hidden items-center gap-4 lg:flex">
          <LanguagePicker dark />
          <Link to={cta[0]} className="group inline-flex h-12 items-center gap-3 rounded-full bg-[#e8000f] pl-6 pr-2 text-[15px] font-medium text-white shadow-[0_6px_20px_rgba(120,0,10,0.35)] transition hover:bg-[#f0101d]">
            {cta[1]}
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/25 transition group-hover:translate-x-0.5"><ArrowRight className="h-4 w-4" /></span>
          </Link>
        </div>
        <button className="ml-auto grid h-10 w-10 place-items-center rounded-lg text-white hover:bg-white/10 lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
          {open ? <X className="h-6 w-6" /> : <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 6h12M3 12h18M11 18h10" /></svg>}
        </button>
      </div>
      {open && (
        <div className="border-t border-white/15 bg-[#c40016] px-4 pb-5 pt-3 lg:hidden">
          <nav className="flex flex-col" aria-label="Main">
            {PUBLIC_LINKS.map(([to, label]) => <Link key={to} to={to} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-[15px] text-white/90 hover:bg-white/10">{label}</Link>)}
            {!home && <Link to="/login" className="rounded-lg px-3 py-3 text-[15px] text-white/90 hover:bg-white/10">Login</Link>}
          </nav>
          <div className="mt-3 grid gap-3 border-t border-white/15 pt-4">
            <Link to={cta[0]} className="flex items-center justify-center gap-2 rounded-full bg-white py-3 font-semibold text-brand-600">{cta[1]}<ArrowRight className="h-4 w-4" /></Link>
            <LanguagePicker dark className="[&>select]:w-full" />
          </div>
        </div>
      )}
    </header>
  );
}

export function Footer() {
  const columns = [
    ['Product', [['/#features', 'Features'], ['/#solutions', 'Solutions'], ['/advisor', 'Find a plan']]],
    ['Support', [['/track', 'Track an order'], ['/whatsapp', 'WhatsApp assistant'], ['/#contact', 'Request a call']]],
    ['Company', [['/#about', 'About us'], ['/privacy', 'Privacy & your data'], ['/staff/login', 'Partner & staff login']]],
  ];
  return (
    <footer className="bg-night text-white/70">
      <div className="container-x grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-xs">
          <Logo dark />
          <p className="mt-4 text-sm leading-relaxed">Accel Business’s digital journey for India’s small businesses: choose a bundle, verify and go live in one sitting.</p>
          <p className="mt-4 text-sm">MSME helpline <span className="font-semibold text-white">1800-103-4444</span></p>
        </div>
        {columns.map(([title, links]) => (
          <div key={title}>
            <p className="text-sm font-semibold text-white">{title}</p>
            <ul className="mt-4 space-y-2.5 text-sm">{links.map(([to, label]) => <li key={label}><Link to={to} className="hover:text-white">{label}</Link></li>)}</ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="container-x flex flex-col gap-2 py-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Udyam Digital by Accel Business · Hackathon prototype, all data is synthetic</p>
          <p>DPDP Act 2023 compliant · Grievance: privacy@accelbusiness.demo</p>
        </div>
      </div>
    </footer>
  );
}

// Catches a crash in one page so the navigation and a way back stay on screen.
export class PageBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('Page failed to render:', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-semibold">This page could not be shown</h1>
        <p className="mt-2 text-ink-muted">Something went wrong while loading it. Your data is safe.</p>
        <div className="mt-5 flex justify-center gap-2">
          <button className="h-10 rounded-lg border border-line bg-white px-4 text-sm font-semibold hover:border-ink-faint" onClick={() => window.history.back()}>Go back</button>
          <button className="h-10 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}

function Boundary() {
  const { pathname } = useLocation();
  return <PageBoundary key={pathname}><Outlet /></PageBoundary>;
}

export function PublicLayout() {
  return <div className="flex min-h-screen flex-col bg-paper"><PublicHeader /><main className="flex-1"><Boundary /></main><Footer /></div>;
}

// ---------- Signed-in app (every role) ----------

// Each role sees only its own screens, in one sidebar. [path, label, icon, exact]
const NAV = {
  customer: t => [['/app', t('nav.myBusiness'), Home, true], ['/app/kyc', t('dash.verification'), ShieldCheck], ['/app/services', t('srv.title'), Wifi], ['/app/bills', t('bills.title'), Receipt], ['/app/messages', t('notif.title'), MessageSquare], ['/app/help', t('helpPage.title'), LifeBuoy], ['/app/data', t('data.title'), Lock]],
  partner: () => [['/partner', 'My queue', Users, true], ['/partner/leads', 'Ranked leads', Store], ['/partner/activations', 'My activations', Trophy]],
  delivery: () => [['/field', 'My jobs', Truck, true]],
  technician: () => [['/field', 'My jobs', Wrench, true]],
  kyc_officer: () => [['/review', 'Review queue', ShieldCheck, true]],
  ops_admin: () => [['/ops', 'Dashboard', LayoutDashboard, true], ['/ops/orders', 'Orders', Truck], ['/ops/packing', 'Warehouse', PackageCheck], ['/ops/cases', 'Partner cases', Briefcase], ['/ops/tickets', 'Support tickets', Headset], ['/review', 'KYC review', ShieldCheck], ['/ops/users', 'Team & roles', UserCog], ['/ops/catalogue', 'Catalogue', Store], ['/ops/audit', 'Audit & privacy', ScrollText]],
};
NAV.super_admin = NAV.ops_admin;

function UserMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (!ref.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-ink/[0.05]" aria-haspopup="menu" aria-expanded={open}>
        <Avatar name={user.name || user.phone || 'User'} size="sm" />
        <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:block">{user.name || 'My account'}</span>
        <ChevronDown className="hidden h-4 w-4 text-ink-muted sm:block" />
      </button>
      {open && (
        <div role="menu" className="rise absolute right-0 top-full mt-2 w-60 rounded-xl border border-line bg-white p-2 shadow-pop">
          <div className="px-3 py-2"><p className="truncate text-sm font-semibold">{user.name || 'My account'}</p><p className="text-xs text-ink-muted">{ROLE_LABEL[user.role]}{user.region?.cities?.length > 0 && ` · ${user.region.cities.slice(0, 2).join(', ')}`}</p></div>
          <div className="my-1 border-t border-line" />
          <button role="menuitem" onClick={onSignOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-soft hover:bg-paper hover:text-brand-600"><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      )}
    </div>
  );
}

const COLLAPSE_KEY = 'ud_sidebar_collapsed';

export function AppLayout() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } });
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) { setSeenPath(pathname); setMobileOpen(false); }
  const toggle = () => setCollapsed(value => { try { localStorage.setItem(COLLAPSE_KEY, value ? '0' : '1'); } catch { /* private mode */ } return !value; });
  const items = (NAV[user.role] || (() => []))(t);
  const home = HOME_FOR_ROLE[user.role];
  const signOut = async () => { await logout(); navigate(user.role === 'customer' ? '/' : '/staff/login'); };

  const nav = narrow => (
    <nav className="flex flex-col gap-1" aria-label="Sections">
      {items.map(([to, label, Icon, end]) => (
        <NavLink key={to} to={to} end={end} title={narrow ? label : undefined}
          className={({ isActive }) => cx('relative flex h-11 items-center gap-3 rounded-lg text-sm font-medium transition', narrow ? 'justify-center' : 'px-3',
            isActive ? 'bg-brand-50 text-brand-600 after:absolute after:inset-y-2 after:-right-3 after:w-[3px] after:rounded-l after:bg-brand-600' : 'text-ink-muted hover:bg-paper hover:text-ink')}>
          <Icon className="h-5 w-5 flex-none" strokeWidth={1.8} />{!narrow && <span className="truncate">{label}</span>}
        </NavLink>
      ))}
    </nav>
  );

  const sidebar = narrow => (
    <div className="flex h-full flex-col px-3 py-4">
      <div className={cx('flex h-10 items-center', narrow ? 'justify-center' : 'justify-between px-1')}>
        <Logo to={home} compact={narrow} />
      </div>
      {!narrow && <p className="mt-7 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{ROLE_LABEL[user.role]}</p>}
      <div className={narrow ? 'mt-7' : 'mt-2'}>{nav(narrow)}</div>
      <div className="mt-auto space-y-1 border-t border-line pt-3">
        {user.role === 'customer' && <Link to="/" title={narrow ? 'Public site' : undefined} className={cx('flex h-10 items-center gap-3 rounded-lg text-sm text-ink-muted hover:bg-paper hover:text-ink', narrow ? 'justify-center' : 'px-3')}><Globe2 className="h-5 w-5" strokeWidth={1.8} />{!narrow && 'Public site'}</Link>}
        <button onClick={signOut} title={narrow ? 'Sign out' : undefined} className={cx('flex h-10 w-full items-center gap-3 rounded-lg text-sm text-ink-muted hover:bg-paper hover:text-brand-600', narrow ? 'justify-center' : 'px-3')}><LogOut className="h-5 w-5" strokeWidth={1.8} />{!narrow && 'Sign out'}</button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-paper">
      <aside className={cx('sticky top-0 hidden h-screen flex-none border-r border-line bg-white transition-[width] duration-200 lg:block', collapsed ? 'w-[76px]' : 'w-64')}>
        {sidebar(collapsed)}
        <button onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="absolute -right-3 top-6 grid h-6 w-6 place-items-center rounded-lg border border-line bg-white text-ink-muted shadow-card hover:text-ink">
          <ChevronLeft className={cx('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside className="h-full w-72 bg-white shadow-pop" onClick={event => event.stopPropagation()}>{sidebar(false)}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-8">
          <button className="grid h-10 w-10 place-items-center rounded-lg text-ink-soft hover:bg-ink/[0.05] lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <div className="lg:hidden"><Logo to={home} compact /></div>
          <p className="hidden text-sm text-ink-muted lg:block">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            {user.role === 'customer' && <LanguagePicker className="hidden sm:inline-flex" />}
            <NotificationBell to={user.role === 'customer' ? '/app/messages' : '/inbox'} />
            <UserMenu user={user} onSignOut={signOut} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-8 sm:py-8"><Boundary /></main>
      </div>
    </div>
  );
}

export function RequireRole({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  if (!user) return <Navigate to={roles.includes('customer') ? `/login?next=${encodeURIComponent(location.pathname)}` : '/staff/login'} state={{ from: location.pathname }} replace />;
  if (!roles.includes(user.role) && !(user.role === 'super_admin' && !roles.includes('customer'))) return <Navigate to={HOME_FOR_ROLE[user.role]} replace />;
  return children;
}

// Demo only (the server turns it off outside demo mode): switch between seeded actors in one click.
export function RoleSwitcher() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { api.get('/auth/demo-accounts').then(({ data }) => setAccounts(data.enabled ? data.accounts : [])).catch(() => setAccounts([])); }, []);
  if (!accounts?.length) return null;
  const switchTo = async account => {
    await api.post('/auth/demo-login', { userId: account.id });
    const next = await refresh();
    setOpen(false);
    navigate(HOME_FOR_ROLE[next?.role || account.role]);
  };
  const groups = accounts.reduce((map, account) => ({ ...map, [account.role]: [...(map[account.role] || []), account] }), {});
  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end">
      {open && (
        <div className="rise mb-2 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-line bg-white p-2 shadow-pop">
          <p className="px-2 pt-1 text-sm font-semibold">View the demo as</p>
          {Object.entries(groups).map(([role, list]) => (
            <div key={role} className="mt-2"><p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{ROLE_LABEL[role]}</p>
              {list.map(account => <button key={account.id} onClick={() => switchTo(account)} className={cx('flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-paper', user?.id === account.id && 'bg-brand-50 text-brand-700')}><span className="font-medium">{account.name}</span><span className="truncate pl-2 text-xs text-ink-faint">{account.cities.slice(0, 2).join(', ')}</span></button>)}
            </div>
          ))}
        </div>
      )}
      <button onClick={() => setOpen(!open)} className="flex h-9 items-center gap-2 rounded-full border border-line bg-white px-3.5 text-[13px] font-medium text-ink-soft shadow-pop hover:text-ink"><Users className="h-4 w-4" /><span className={open ? '' : 'hidden sm:inline'}>{open ? 'Close' : 'Demo: view as'}</span></button>
    </div>
  );
}
