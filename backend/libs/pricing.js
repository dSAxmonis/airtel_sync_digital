// The only place prices and eligibility are decided. The advisor (rules or AI) proposes a profile; this engine disposes.
import { recommend, explainProduct, currentToolsNote } from './recommend.js';

export const GST_RATE = 0.18;
const CONNECTIVITY = ['P01', 'P02', 'P03', 'P04', 'P05', 'P06'];
const BUNDLE_NAMES = { retail: 'Everyday Business Bundle', professional: 'Professional Growth Bundle', multi: 'Multi-site Control Bundle', manufacturing: 'Workshop Connect Bundle' };
const SUMMARY = {
  retail: ids => (ids.includes('P07') ? 'Reliable internet, a business mobile line and practical tools for your shop.' : 'Plug-and-play internet and a website to get your shop online. Fibre, a business line and GST billing can be added any time.'),
  professional: ids => {
    const extras = [ids.includes('P11') && 'a static IP', ids.includes('P16') && 'business email', ids.includes('P17') && 'cloud backup', (ids.includes('P20') || ids.includes('P21')) && 'device protection'].filter(Boolean);
    return `A stronger connection${extras.length ? ` with ${extras.length > 1 ? `${extras.slice(0, -1).join(', ')} and ${extras.at(-1)}` : extras[0]}` : ''} for a professional team.`;
  },
  multi: () => 'Connectivity and backup across your locations, with customer outreach and cameras available as add-ons.',
  manufacturing: ids => (ids.includes('P05') ? 'Dedicated connectivity, firewall protection and machine monitoring for day-to-day operations.' : 'Core connectivity and cloud tools; an active GSTIN check can unlock dedicated lines and monitoring.'),
};

export const normaliseProfile = profile => ({
  business: ['retail', 'professional', 'multi', 'manufacturing'].includes(profile?.business) ? profile.business : 'retail',
  // Exact counts (not buckets), so catalogue thresholds such as 10 or 25 people are applied exactly.
  employees: Math.max(1, Math.min(10000, Math.round(Number(profile?.employees)) || 1)),
  sites: Math.max(1, Math.min(500, Math.round(Number(profile?.sites)) || 1)),
  tier: ['1', '2'].includes(String(profile?.tier)) ? String(profile.tier) : '2',
  gstin: profile?.gstin === 'yes' ? 'yes' : 'no',
  current: ['hotspot', 'home', 'business', 'leased', 'none'].includes(profile?.current) ? profile.current : '',
  goal: ['reliable', 'customers', 'security', 'operations', 'locations'].includes(profile?.goal) ? profile.goal : 'reliable',
  spend: profile?.spend ? String(Math.max(0, Math.round(Number(profile.spend) || 0))) : '',
});

// Returns every rule a product fails (not only the first), so the owner sees the full reason at once.
export function eligibility(product, profile, gstVerified) {
  const failures = [];
  if (!product.available_city_tiers.split(';').includes(profile.tier)) failures.push({ reason: 'tier' });
  if (profile.employees < Number(product.min_employees)) failures.push({ reason: 'employees', min: Number(product.min_employees) });
  if (profile.sites < Number(product.min_sites)) failures.push({ reason: 'sites', min: Number(product.min_sites) });
  if (product.requires_gstin === 'Y' && !gstVerified) failures.push({ reason: 'gst' });
  return failures.length ? { ok: false, ...failures[0], failures } : { ok: true, failures: [] };
}

// The nearest product that meets the same need, when the requested one is not eligible.
const ALTERNATIVES = { P03: ['P02', 'P01'], P05: ['P02', 'P01'], P06: ['P05', 'P02'], P10: ['P09'], P21: ['P20'], P12: ['P07', 'P08'], P13: ['P07'], P15: ['P18'], P14: ['P18'], P24: ['P23'], P02: ['P01', 'P04'], P01: ['P04'] };

const defaultQuantity = (product, profile) => {
  if (['per site', 'per camera', 'per counter'].includes(product.unit)) return profile.sites;
  if (product.unit === 'per line') return Math.max(1, Math.min(profile.employees, 3));
  if (['per user', 'per device'].includes(product.unit)) return Math.max(1, Math.min(profile.employees, 5));
  return 1;
};

export function priceLines(lines, byId) {
  const items = lines.map(({ productId, quantity }) => {
    const product = byId.get(productId);
    return {
      productId, name: product.product_name, category: product.category, unit: product.unit, quantity,
      monthly: Number(product.price_min_inr_per_month) * quantity, monthlyMax: Number(product.price_max_inr_per_month) * quantity,
      setup: Number(product.one_time_setup_inr) * quantity, months: Number(product.min_contract_months), installDays: Number(product.typical_install_days),
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.monthly, 0);
  const setup = items.reduce((sum, item) => sum + item.setup, 0);
  const tax = Math.round(subtotal * GST_RATE), setupTax = Math.round(setup * GST_RATE);
  return {
    items,
    totals: {
      subtotal, subtotalMax: items.reduce((sum, item) => sum + item.monthlyMax, 0), tax, monthly: subtotal + tax,
      setup, setupTax, dueNow: subtotal + tax + setup + setupTax,
      commitmentMonths: Math.max(1, ...items.map(item => item.months)), installDays: Math.max(1, ...items.map(item => item.installDays)),
    },
  };
}

// profile: advisor profile; gstVerified: business has an active, registry-verified GSTIN.
export function buildQuote({ profile: rawProfile, catalogue, gstVerified = false, wants = [], budget = null, enabledAddons = [], quantities = {}, removed = [] }) {
  const profile = normaliseProfile(rawProfile);
  const byId = new Map(catalogue.map(product => [product.product_id, product]));
  const base = recommend(profile, catalogue, gstVerified);
  const notes = [];
  const core = base.ids.filter(id => !removed.includes(id));
  const qty = { ...base.quantities };
  const name = id => byId.get(id)?.product_name || id;

  for (const id of [...new Set(wants)]) {
    const product = byId.get(id);
    if (!product) continue;
    if (core.includes(id)) { notes.push({ code: 'requested_included', params: { product: name(id) }, text: `${name(id)} is already in your plan.` }); continue; }
    const check = eligibility(product, profile, gstVerified);
    if (!check.ok) {
      const alternativeId = (ALTERNATIVES[id] || []).find(other => byId.get(other) && eligibility(byId.get(other), profile, gstVerified).ok);
      const already = alternativeId && core.includes(alternativeId);
      const parts = check.failures.map(failure => ({ tier: `it is not sold in tier ${profile.tier} cities`, employees: `it needs at least ${failure.min} people (you have ${profile.employees})`, sites: `it needs at least ${failure.min} locations (you have ${profile.sites})`, gst: 'it needs a verified, active GSTIN' }[failure.reason]));
      let text = `${name(id)} can't be added: ${parts.join('; ')}.`;
      if (check.failures.length === 1 && check.reason === 'gst') text += ' Verify your GST registration to add it.';
      else if (alternativeId) text += already ? ` ${name(alternativeId)}, already in your plan, covers the same need.` : ` ${name(alternativeId)} is the closest option.`;
      notes.push({ code: `requested_${check.reason}`, params: { product: name(id), min: check.min, alternative: alternativeId ? name(alternativeId) : '', reasons: check.failures.map(failure => failure.reason) }, text });
      continue;
    }
    const needs = product.requires_one_of.split('|').filter(Boolean);
    if (needs.length && !needs.some(need => core.includes(need))) {
      notes.push({ code: 'requested_needs_connectivity', params: { product: name(id) }, text: `${name(id)} needs a compatible internet connection in the plan.` });
      continue;
    }
    core.push(id);
    qty[id] = defaultQuantity(product, profile);
    notes.push({ code: 'requested_added', params: { product: name(id) }, text: `Added ${name(id)} as you asked.` });
  }

  const addons = base.addons.filter(id => !core.includes(id));
  for (const id of addons) qty[id] ??= defaultQuantity(byId.get(id), profile);
  for (const [id, value] of Object.entries(quantities || {})) if (qty[id] !== undefined) qty[id] = Math.max(1, Math.min(25, Math.round(Number(value) || 1)));
  let enabled = enabledAddons.filter(id => addons.includes(id));
  let selected = [...core, ...enabled];

  if (budget && budget > 0) {
    const monthlyOf = ids => Math.round(ids.reduce((sum, id) => sum + Number(byId.get(id).price_min_inr_per_month) * qty[id], 0) * (1 + GST_RATE));
    const dropped = [];
    while (monthlyOf(selected) > budget && enabled.length) { dropped.push(enabled.pop()); selected = [...core, ...enabled]; }
    const optional = core.filter(id => !CONNECTIVITY.includes(id) && !wants.includes(id)).reverse();
    for (const id of optional) {
      if (monthlyOf(selected) <= budget) break;
      dropped.push(id);
      core.splice(core.indexOf(id), 1);
      selected = [...core, ...enabled];
    }
    const remaining = new Set(selected);
    for (const id of [...core]) {
      const needs = byId.get(id).requires_one_of.split('|').filter(Boolean);
      if (needs.length && !needs.some(need => remaining.has(need))) { core.splice(core.indexOf(id), 1); dropped.push(id); }
    }
    selected = [...core, ...enabled];
    if (dropped.length) notes.push({ code: 'budget_trimmed', params: { budget, products: dropped.map(name).join(', ') }, text: `To stay within ₹${budget.toLocaleString('en-IN')} a month, we left out ${dropped.map(name).join(', ')}. You can add them back.` });
    const total = monthlyOf(selected);
    if (total > budget) notes.push({ code: 'budget_unreachable', params: { budget, minimum: total }, text: `The essential plan costs ₹${total.toLocaleString('en-IN')} a month including GST, above your ₹${budget.toLocaleString('en-IN')} budget.` });
  }
  // Only products the catalogue itself restricts to an active GSTIN are described as needing GST.
  const gstOnly = (base.locked || []).filter(id => byId.get(id)?.requires_gstin === 'Y');
  if (gstOnly.length) notes.push({ code: 'gst_unlocks', params: { products: gstOnly.map(name).join(', ') }, text: `${gstOnly.map(name).join(', ')} ${gstOnly.length > 1 ? 'need' : 'needs'} an active GSTIN by catalogue rules. Verify your GST registration to add ${gstOnly.length > 1 ? 'them' : 'it'}.` });

  const { items, totals } = priceLines(selected.map(productId => ({ productId, quantity: qty[productId] })), byId);
  for (const item of items) item.why = explainProduct(item.productId, item.quantity, profile);
  const addonOptions = addons.filter(id => !selected.includes(id) || enabled.includes(id)).map(id => {
    const product = byId.get(id);
    return { productId: id, name: product.product_name, unit: product.unit, quantity: qty[id], monthly: Number(product.price_min_inr_per_month) * qty[id], enabled: enabled.includes(id), why: explainProduct(id, qty[id], profile) || product.description };
  });
  const note = currentToolsNote(profile.current);
  return {
    profile, bundleName: BUNDLE_NAMES[profile.business], summary: SUMMARY[profile.business](core) + (note ? ` ${note}` : ''),
    items, addons: addonOptions, enabledAddons: enabled, locked: gstOnlyLocked(base.locked, byId), notes, totals, gstVerified,
    spendComparison: profile.spend ? Number(profile.spend) - totals.monthly : null,
  };
}

const gstOnlyLocked = (locked = [], byId) => locked.filter(id => byId.get(id)?.requires_gstin === 'Y');

// Server-side guard used when an order is placed: every line must still be eligible for this business.
export function validateLines(lines, profile, catalogue, gstVerified) {
  const byId = new Map(catalogue.map(product => [product.product_id, product]));
  const ids = new Set(lines.map(line => line.productId));
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) return `Unknown product ${line.productId}.`;
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 25) return `Invalid quantity for ${product.product_name}.`;
    const check = eligibility(product, normaliseProfile(profile), gstVerified);
    if (!check.ok) return check.reason === 'gst' ? `${product.product_name} requires a verified, active GSTIN.` : `${product.product_name} is not eligible for this business.`;
    const needs = product.requires_one_of.split('|').filter(Boolean);
    if (needs.length && !needs.some(need => ids.has(need))) return `${product.product_name} needs compatible connectivity in the order.`;
  }
  return null;
}
