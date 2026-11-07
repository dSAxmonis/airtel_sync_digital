import { Link, useNavigate } from 'react-router-dom';
import { Plus, ArrowRight, CheckCircle2 } from 'lucide-react';
import { api, rememberQuoteToken, errorMessage } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../i18n/index.jsx';
import { rupees, shortDate } from '../../lib/format.js';
import { Avatar, Badge, Button, Callout, Donut, Empty, LoadState, Meter, ORDER_FLOW, Panel, STATUS_TONE, orderShare, orderTone, useLoad, useToast } from '../../components/ui.jsx';

// Statuses where the order waits on the owner, in the order they come up.
const OWNER_TURN = ['awaiting_kyc', 'awaiting_signature', 'awaiting_payment', 'awaiting_slot'];
const IN_FLIGHT = ['packing', 'ready_for_dispatch', 'out_for_delivery', 'delivered', 'installing', 'installed'];

export default function Dashboard() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const toast = useToast();
  const state = useLoad(async () => {
    const [business, orders, quotes, services] = await Promise.all([api.get('/business/me'), api.get('/orders/mine'), api.get('/quotes/mine'), api.get('/me/services')]);
    return { business: business.data.business, orders: orders.data.orders, quotes: quotes.data.quotes.filter(quote => quote.status === 'saved'), services: services.data };
  });
  const addMore = async baseOrderId => {
    try {
      const { data } = await api.post('/quotes', { mode: 'addon', baseOrderId, language });
      rememberQuoteToken(data.quote.id, data.accessToken);
      navigate(`/quote/${data.quote.id}`);
    } catch (error) { toast(errorMessage(error), 'error'); }
  };
  return (
    <LoadState state={state}>
      {({ business, orders, quotes, services }) => {
        const verified = business.kyc.status === 'verified';
        const firstActive = services.orders[0];
        const kycLabel = t(`kycs.${business.kyc.status === 'registry_needed' && business.registration?.path === 'unregistered' ? 'owner_needed' : business.kyc.status}`);
        // One thing to do next: an order waiting on the owner, then verification, then an order on its way.
        const mine = orders.filter(order => OWNER_TURN.includes(order.status)).sort((a, b) => OWNER_TURN.indexOf(a.status) - OWNER_TURN.indexOf(b.status))[0];
        const moving = orders.find(order => IN_FLIGHT.includes(order.status));
        const next = mine ? { title: mine.status === 'awaiting_kyc' ? t('order.waitingKyc') : t(`os.${mine.status}`), body: `${mine.bundleName} · ${mine.ref}`, to: mine.status === 'awaiting_kyc' ? '/app/kyc' : `/app/orders/${mine.id}`, cta: mine.status === 'awaiting_kyc' ? t('dash.verifyNow') : t('dash.open'), urgent: true, share: orderShare(mine.status) }
          : !verified ? { title: t('dash.verifyNow'), body: `${kycLabel} · ${t('dash.reuse')}`, to: '/app/kyc', cta: t('dash.verifyNow'), urgent: true }
            : moving ? { title: t(`os.${moving.status}`), body: `${moving.bundleName} · ${moving.ref}${moving.slot?.date ? ` · ${shortDate(moving.slot.date)} ${moving.slot.window}` : ''}`, to: `/app/orders/${moving.id}`, cta: t('dash.open'), share: orderShare(moving.status) }
              : null;
        const live = orders.filter(order => ['active', 'installed'].includes(order.status)).length;
        const waiting = orders.filter(order => OWNER_TURN.includes(order.status)).length;
        const progress = orders.filter(order => IN_FLIGHT.includes(order.status) && order.status !== 'installed').length;
        const cancelled = orders.filter(order => order.status === 'cancelled').length;
        const ring = [{ label: 'Waiting on you', value: waiting, color: '#f59e0b' }, { label: 'On the way', value: progress, color: '#2563eb' }, { label: 'Live', value: live, color: '#16a34a' }, { label: 'Cancelled', value: cancelled, color: '#c9c9d1' }];
        return (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Avatar name={business.name === 'My business' ? user.name || 'Owner' : business.name} size="lg" />
                <div><h1 className="text-xl font-semibold sm:text-2xl">{business.name === 'My business' ? t('dash.hello', { name: user.name ? `, ${user.name}` : '' }) : business.name}</h1>{business.city && <p className="mt-0.5 text-sm text-ink-muted">{business.city}{business.state ? `, ${business.state}` : ''}</p>}</div>
              </div>
              <div className="flex flex-wrap gap-2">{firstActive && <Button variant="outline" onClick={() => addMore(firstActive.id)}><Plus className="h-4 w-4" />{t('dash.addMore')}</Button>}<Button to="/advisor"><Plus className="h-4 w-4" />{t('dash.new')}</Button></div>
            </div>

            <Callout tone={next?.urgent ? 'action' : next ? 'info' : 'ok'} className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex-1">
                <p className="text-[13px] font-medium text-ink-muted">{t('dash.next')}</p>
                {next ? <><p className="mt-1 text-lg font-semibold">{next.title}</p><p className="mt-0.5 text-sm text-ink-soft">{next.body}</p>{next.share !== undefined && <Meter value={next.share} tone={orderTone(mine?.status || moving?.status)} className="mt-3 max-w-sm" label={next.title} />}</>
                  : <p className="mt-1 flex items-center gap-2"><CheckCircle2 className="h-5 w-5 flex-none text-ok-600" />{t('dash.allGood')}</p>}
              </div>
              {next && <Button to={next.to} variant={next.urgent ? 'primary' : 'dark'}>{next.cta}<ArrowRight className="h-4 w-4" /></Button>}
            </Callout>

            <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
              <section className="card flex flex-col items-center gap-6 p-5 sm:flex-row">
                <Donut segments={ring} total={orders.length} caption={t('dash.orders')} />
                <ul className="grid w-full flex-1 grid-cols-2 gap-x-8 gap-y-3 text-sm sm:max-w-md">{ring.map(item => <li key={item.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: item.color }} /><span className="text-ink-muted">{item.label}</span><span className="num ml-auto font-semibold">{item.value}</span></li>)}</ul>
              </section>
              <section className="card grid grid-cols-2 gap-5 p-5 lg:grid-cols-1">
                <div><p className="text-[13px] text-ink-muted">{t('dash.verification')}</p><Link to="/app/kyc" className="mt-1.5 inline-block"><Badge tone={STATUS_TONE[business.kyc.status]}>{kycLabel}</Badge></Link></div>
                <div><p className="text-[13px] text-ink-muted">{t('dash.services')}</p><Link to="/app/services" className="num mt-1 block font-display text-xl font-semibold hover:text-brand-600">{services.services.length}{services.monthly ? <span className="ml-2 text-sm font-normal text-ink-muted">{rupees(services.monthly)}{t('common.perMonth')}</span> : null}</Link></div>
              </section>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
              <Panel title={t('dash.orders')} bodyClassName="p-0 pt-3">
                {orders.length ? (
                  <ul className="divide-y divide-line border-t border-line">
                    {[...orders].sort((a, b) => (a.status === 'cancelled') - (b.status === 'cancelled')).map(order => (
                      <li key={order.id}><Link to={`/app/orders/${order.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 hover:bg-[#fafafb]">
                        <div className="min-w-0 flex-1"><p className="font-medium">{order.bundleName}{order.kind === 'addon' && <span className="ml-2 text-sm font-normal text-ink-muted">· Add-on</span>}</p><p className="text-sm text-ink-muted"><span className="whitespace-nowrap">{order.ref}</span> · {shortDate(order.createdAt)}{order.slot?.date ? ` · ${shortDate(order.slot.date)} ${order.slot.window}` : ''}</p></div>
                        <div className="w-full sm:w-44"><div className="flex items-baseline justify-between gap-2"><Badge tone={STATUS_TONE[order.status]}>{t(`os.${order.status}`)}</Badge>{order.status !== 'cancelled' && <span className="num text-xs text-ink-muted">{ORDER_FLOW.indexOf(order.status) + 1}/{ORDER_FLOW.length}</span>}</div>{order.status !== 'cancelled' && <Meter value={orderShare(order.status)} tone={orderTone(order.status)} className="mt-2" label={t(`os.${order.status}`)} />}</div>
                        <span className="num text-sm font-medium sm:w-28 sm:text-right">{rupees(order.monthly)}{t('common.perMonth')}</span>
                      </Link></li>
                    ))}
                  </ul>
                ) : <Empty title={t('dash.noOrders')} action={<Button to="/advisor" size="sm" variant="outline" className="mt-2">{t('dash.new')}</Button>} />}
              </Panel>
              <Panel title={t('dash.quotes')}>
                {quotes.length ? <ul className="space-y-3">{quotes.slice(0, 5).map(quote => <li key={quote.id}><Link to={`/quote/${quote.id}`} className="flex items-center justify-between gap-3 text-sm hover:text-brand-600"><span className="truncate">{quote.result.bundleName}</span><span className="num flex-none text-ink-muted">{rupees(quote.result.totals.monthly)}</span></Link></li>)}</ul> : <p className="text-sm text-ink-muted">No saved quotes.</p>}
              </Panel>
            </div>
          </div>
        );
      }}
    </LoadState>
  );
}
