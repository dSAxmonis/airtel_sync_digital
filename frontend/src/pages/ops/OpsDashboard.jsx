import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, RotateCcw, ShieldCheck, Briefcase, PackageCheck, AlertCircle, ArrowRight } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { rupees, titleCase } from '../../lib/format.js';
import { Badge, Button, Donut, LoadState, Meter, PageHeader, Panel, Stat, STATUS_TONE, useLoad, useToast, cx } from '../../components/ui.jsx';

// How much of the gap from baseline to target is closed already (0–1).
const towardTarget = kpi => {
  if (kpi.value === null || kpi.value === undefined) return null;
  const gap = kpi.better === 'lower' ? kpi.baseline - kpi.target : kpi.target - kpi.baseline;
  const moved = kpi.better === 'lower' ? kpi.baseline - kpi.value : kpi.value - kpi.baseline;
  return gap ? Math.max(0, Math.min(1, moved / gap)) : null;
};

const fmt = (kpi, value) => (value === null || value === undefined ? '—' : kpi.unit === '₹' ? rupees(value) : `${value.toLocaleString('en-IN')}${kpi.unit === '%' ? '%' : kpi.unit ? ` ${kpi.unit}` : ''}`);

// A card of label → count rows that link to the filtered view.
function CountList({ title, rows }) {
  return (
    <Panel title={title} bodyClassName="px-5 pb-4 pt-2">
      {rows.length ? <ul className="divide-y divide-line text-sm">{rows.map(([key, label, count, to, tone]) => <li key={key}><Link to={to} className="flex items-center justify-between gap-3 py-2.5 hover:text-brand-600">{tone ? <Badge tone={tone}>{label}</Badge> : <span>{label}</span>}<span className="num font-semibold">{count}</span></Link></li>)}</ul> : <p className="text-sm text-ink-muted">None</p>}
    </Panel>
  );
}

const RING_COLORS = { green: '#16a34a', blue: '#2563eb', amber: '#f59e0b', red: '#e40000', neutral: '#c9c9d1' };

export default function OpsDashboard() {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const state = useLoad(async () => (await api.get('/ops/dashboard')).data);
  const run = async (key, request, message) => {
    setBusy(key);
    try { await request(); toast(message); await state.reload(true); } catch (error) { toast(errorMessage(error), 'error'); } finally { setBusy(''); }
  };
  return (
    <div>
      <PageHeader title="Operations overview" subtitle="Live orders and the work waiting on your teams." actions={<><Button variant="secondary" size="sm" loading={busy === 'sched'} onClick={() => run('sched', () => api.post('/ops/scheduler/run'), 'Checks run: stalled quotes and late orders routed')}><RefreshCw className="h-4 w-4" />Run SLA checks</Button><Button variant="ghost" size="sm" loading={busy === 'reset'} onClick={() => window.confirm('Reset all demo customers, orders and cases?') && run('reset', () => api.post('/ops/demo/reset'), 'Demo data reset')}><RotateCcw className="h-4 w-4" />Reset demo</Button></>} />
      <LoadState state={state}>
        {data => {
          const top = Math.max(1, ...data.funnel.map(row => row.count));
          const work = [['KYC in review', data.work.kycInReview, '/review', ShieldCheck, 'blue'], ['Open partner cases', data.work.openCases, '/ops/cases', Briefcase, 'amber'], ['Kits to pack', data.work.packing, '/ops/packing', PackageCheck, 'ink'], ['Orders past due', data.work.late, '/ops/orders?late=true', AlertCircle, data.work.late ? 'red' : 'green']];
          const groups = Object.entries(data.byStatus).reduce((map, [status, count]) => { const tone = STATUS_TONE[status] || 'neutral'; map[tone] = (map[tone] || 0) + count; return map; }, {});
          const ring = [['green', 'Live'], ['blue', 'On the way'], ['amber', 'Waiting'], ['red', 'Problem'], ['neutral', 'Cancelled']].map(([tone, label]) => ({ label, value: groups[tone] || 0, color: RING_COLORS[tone] }));
          return (
            <div className="space-y-6">
              <section className="card flex flex-col gap-6 p-5 lg:flex-row lg:items-center">
                <div className="flex items-center gap-5 lg:border-r lg:border-line lg:pr-8">
                  <Donut segments={ring} caption="Total orders" />
                  <ul className="space-y-1.5 text-[13px]">{ring.map(item => <li key={item.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} /><span className="text-ink-muted">{item.label}</span><span className="num ml-3 font-semibold">{item.value}</span></li>)}</ul>
                </div>
                <div className="grid flex-1 grid-cols-2 gap-5 sm:grid-cols-4 sm:divide-x sm:divide-line">
                  {work.map(([label, value, to, Icon, tone]) => (
                    <Link key={label} to={to} className="group sm:px-5 sm:first:pl-0"><Stat label={label} value={value} icon={Icon} tone={tone} /><span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-ink-faint group-hover:text-brand-600">Open<ArrowRight className="h-3 w-3" /></span></Link>
                  ))}
                </div>
              </section>

              <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
                <Panel title="Live funnel" action={<span className="hidden text-xs text-ink-muted sm:inline">Share kept from the previous stage</span>}>
                  <ul className="space-y-4">
                    {data.funnel.map((row, index) => {
                      const previous = data.funnel[index - 1]?.count;
                      const kept = previous ? Math.round((row.count / previous) * 100) : null;
                      return (
                        <li key={row.stage}>
                          <div className="flex items-baseline justify-between gap-3 text-sm"><span className="text-ink-soft">{row.stage}</span><span className="flex items-baseline gap-3"><span className="num font-semibold">{row.count}</span><span className={cx('num w-10 text-right text-xs', kept === null ? 'text-ink-faint' : kept >= 80 ? 'text-ok-700' : kept >= 60 ? 'text-warn-700' : 'text-brand-700')}>{kept === null ? 'start' : `${kept}%`}</span></span></div>
                          <span className="mt-1.5 block h-2 rounded-full bg-[#f0f0f3]"><span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.max(1.5, (row.count / top) * 100)}%`, opacity: 1 - index * 0.1 }} /></span>
                        </li>
                      );
                    })}
                  </ul>
                </Panel>
                <div className="space-y-6">
                  <CountList title="Open cases by reason" rows={Object.entries(data.work.cases).filter(([kind]) => kind !== 'lead').map(([kind, count]) => [kind, titleCase(kind), count, `/ops/cases?kind=${kind}`])} />
                  {data.work.jobsToday.length > 0 && <CountList title="Field jobs today" rows={data.work.jobsToday.map(row => [`${row.type}-${row.status}`, `${titleCase(row.type)} · ${titleCase(row.status)}`, row.n, '/ops/orders'])} />}
                  {data.late.length > 0 && <CountList title="Running late" rows={data.late.map(order => [order.id, order.ref, titleCase(order.status), `/ops/orders/${order.id}`])} />}
                </div>
              </div>

              <Panel title="Success metrics" bodyClassName="p-0 pt-3">
                <div className="scroll-x border-t border-line">
                  <table className="table">
                    <thead><tr><th>Metric</th><th className="text-right">Now</th><th className="text-right">Baseline</th><th className="text-right">Target</th><th className="w-40">Toward target</th><th>How it is measured</th></tr></thead>
                    <tbody>
                      {data.kpis.map(kpi => {
                        const live = kpi.value !== null && kpi.value !== undefined;
                        const better = live && (kpi.better === 'lower' ? kpi.value < kpi.baseline : kpi.value > kpi.baseline);
                        const share = towardTarget(kpi);
                        return (
                          <tr key={kpi.key}>
                            <td className="font-medium text-ink">{kpi.label}</td>
                            <td className={cx('num whitespace-nowrap text-right font-semibold', live && (better ? 'text-ok-700' : 'text-brand-700'))}>{fmt(kpi, kpi.value)}</td>
                            <td className="num whitespace-nowrap text-right text-ink-muted">{fmt(kpi, kpi.baseline)}</td>
                            <td className="num whitespace-nowrap text-right">{kpi.better === 'lower' ? '≤ ' : '≥ '}{fmt(kpi, kpi.target)}</td>
                            <td>{share === null ? <span className="text-xs text-ink-faint">Not live yet</span> : <div className="flex items-center gap-2"><Meter value={share} tone={share >= 1 ? 'ok' : share > 0 ? 'amber' : 'red'} className="flex-1" label={`${kpi.label} toward target`} /><span className="num w-9 text-right text-xs text-ink-muted">{Math.round(share * 100)}%</span></div>}</td>
                            <td className="text-ink-muted">{kpi.note}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>
          );
        }}
      </LoadState>
    </div>
  );
}
