import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, X, AlertTriangle, CheckCircle2, RotateCcw, Ban, ShieldAlert, Eye, Users } from 'lucide-react';
import { LANGUAGES } from '../../i18n/index.jsx';
import { api, errorMessage } from '../../api/client.js';
import { dateTime, titleCase } from '../../lib/format.js';
import { Alert, Badge, Button, Card, Field, LoadState, PageHeader, STATUS_TONE, useLoad, useToast, cx } from '../../components/ui.jsx';

const ICON = { pass: [Check, 'text-ok-600'], warn: [AlertTriangle, 'text-warn-600'], fail: [X, 'text-brand-600'] };
const LABELS = { gstin: 'GSTIN', legal_name: 'Legal name', trade_name: 'Trade name', constitution: 'Constitution', address: 'Address', registration_date: 'Registered', udyam_number: 'Udyam no.', enterprise_name: 'Enterprise', major_activity: 'Activity', city: 'City', state: 'State', billed_to: 'Billed to', bill_date: 'Bill date', name: 'Name', designation: 'Designation', for_business: 'For business', id_number: 'ID no.', valid_till: 'Valid till', licence_number: 'Licence no.', business_name: 'Establishment', owner_name: 'Licence holder', signboard_text: 'Signboard', authorised_person: 'Authorised person', signed_by: 'Signed by', letter_date: 'Letter date' };
const REASONS = [['registry_checked_manually', 'Registry checked manually'], ['name_variant_confirmed', 'Name variant confirmed'], ['document_legible_on_review', 'Legible on review'], ['branch_address_confirmed', 'Branch address confirmed'], ['called_owner', 'Called the owner'], ['other', 'Other (see note)']];

export default function ReviewDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [selected, setSelected] = useState(0);
  const [form, setForm] = useState({ docType: '', message: '' });
  const [busy, setBusy] = useState('');
  const [reasons, setReasons] = useState({});
  const [opened, setOpened] = useState([]);
  const state = useLoad(async () => (await api.get(`/review/${id}`)).data, [id]);
  const decide = async decision => {
    setBusy(decision);
    const overrides = Object.entries(reasons).filter(([, reason]) => reason).map(([label, reason]) => ({ label, reason }));
    try {
      const { data } = await api.post(`/review/${id}/decision`, { decision, ...(decision === 'request_reupload' ? form : { message: form.message }), ...(decision === 'approve' ? { overrides } : {}) });
      toast(data.pendingChecker ? 'Sent to a second officer to confirm' : { approve: 'Approved: business verified', confirm: 'Confirmed: business verified', reject: 'Rejected', reopen: 'Reopened', return: 'Returned to the first officer' }[decision] || 'Re-upload requested');
      navigate('/review');
    } catch (error) { toast(errorMessage(error), 'error'); } finally { setBusy(''); }
  };
  return (
    <LoadState state={state}>
      {({ business, owner, viewed = [], me }) => {
        const doc = business.documents[selected];
        // Opening a document's image is recorded server-side; the officer must open each uploaded file.
        const seen = new Set([...viewed, ...opened, ...(doc?.hasFile ? [doc.id] : [])]);
        const pending = business.kyc.pendingApproval;
        const hard = business.kyc.hardStops > 0 || business.kyc.failed.some(flag => flag.hard);
        const overridable = business.kyc.failed.filter(flag => !flag.hard);
        return (
          <div className="">
            <PageHeader eyebrow="KYC review" title={business.name} subtitle={`${business.city || ''} · owner ${owner.name || '—'} · prefers ${LANGUAGES.find(([code]) => code === owner.language)?.[1] || owner.language}`} actions={<Badge tone={STATUS_TONE[business.kyc.status]} className="text-sm">{titleCase(business.kyc.status)}</Badge>} />
            {hard && <Alert tone="error" title="Hard stop: this application cannot be approved" className="mb-4">{business.kyc.failed.filter(flag => flag.hard).map(flag => flag.label).join(' · ')}</Alert>}
            {business.kyc.decisions.filter(item => item.decision === 'owner_requested_review').slice(-1).map(item => <Alert key={item.at} tone="info" title="The owner asked for a review" className="mb-4">{item.note || 'No note.'}</Alert>)}
            <div className="grid items-start gap-6 xl:grid-cols-[1.25fr_1fr]">
              <div className="space-y-4">
                {business.registration?.path === 'unregistered' && !business.gst && !business.udyam ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="p-5"><p className="eyebrow mb-2">Owner · Aadhaar e-KYC</p>{business.ownerKyc ? <dl className="space-y-1 text-sm"><div><dt className="text-xs text-ink-muted">Name</dt><dd className="font-semibold">{business.ownerKyc.name}</dd></div><div><dt className="text-xs text-ink-muted">Aadhaar</dt><dd>{business.ownerKyc.aadhaar} · born {business.ownerKyc.yearOfBirth}</dd></div><div><dt className="text-xs text-ink-muted">Verified</dt><dd>{dateTime(business.ownerKyc.verifiedAt)} · OTP to the Aadhaar-linked mobile</dd></div></dl> : <p className="text-sm text-ink-muted">Not done yet</p>}</Card>
                  <Card className="p-5"><p className="eyebrow mb-2">Declared business (unregistered)</p>{business.registration.declared ? <dl className="space-y-1 text-sm"><div><dt className="text-xs text-ink-muted">Name</dt><dd className="font-semibold">{business.registration.declared.name}</dd></div><div><dt className="text-xs text-ink-muted">Shop address</dt><dd>{business.registration.declared.address}, {business.registration.declared.city}, {business.registration.declared.state}</dd></div>{business.registration.declared.activity && <div><dt className="text-xs text-ink-muted">Activity</dt><dd>{business.registration.declared.activity}</dd></div>}</dl> : <p className="text-sm text-ink-muted">Not declared</p>}</Card>
                </div>
                ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="p-5"><p className="eyebrow mb-2">GST registry</p>{business.gst ? <dl className="space-y-1 text-sm"><div><dt className="text-xs text-ink-muted">GSTIN</dt><dd>{business.gst.masked} · <span className={business.gst.status === 'Active' ? 'text-ok-600' : 'text-brand-700'}>{business.gst.status}</span></dd></div><div><dt className="text-xs text-ink-muted">Legal name</dt><dd className="font-semibold">{business.gst.legalName}</dd></div><div><dt className="text-xs text-ink-muted">Trade name</dt><dd>{business.gst.tradeName}</dd></div><div><dt className="text-xs text-ink-muted">Address</dt><dd>{business.gst.address}</dd></div></dl> : <p className="text-sm text-ink-muted">Not provided</p>}</Card>
                  <Card className="p-5"><p className="eyebrow mb-2">Udyam registry</p>{business.udyam ? <dl className="space-y-1 text-sm"><div><dt className="text-xs text-ink-muted">Number</dt><dd>{business.udyam.masked}</dd></div><div><dt className="text-xs text-ink-muted">Enterprise</dt><dd className="font-semibold">{business.udyam.enterpriseName}</dd></div><div><dt className="text-xs text-ink-muted">Type · activity</dt><dd>{business.udyam.enterpriseType} · {business.udyam.majorActivity}</dd></div><div><dt className="text-xs text-ink-muted">Location</dt><dd>{business.udyam.city}, {business.udyam.state}</dd></div></dl> : <p className="text-sm text-ink-muted">Not provided</p>}</Card>
                </div>
                )}
                <Card className="overflow-hidden">
                  <div className="no-scrollbar flex overflow-x-auto border-b border-line">{business.documents.map((item, index) => <button key={item.id} onClick={() => { setSelected(index); if (item.hasFile) setOpened(current => [...new Set([...current, item.id])]); }} className={cx('flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold', selected === index ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-muted')}><span className={cx('h-2 w-2 rounded-full', item.status === 'pass' ? 'bg-ok-600' : item.status === 'fail' ? 'bg-brand-600' : 'bg-warn-600')} />{item.type}{item.source === 'digilocker' ? <Badge tone="blue" className="text-[10px]">DigiLocker</Badge> : seen.has(item.id) ? <Eye className="h-3.5 w-3.5 text-ok-600" aria-label="Opened" /> : null}</button>)}</div>
                  {doc && (
                    <div className="grid gap-4 p-4 lg:grid-cols-2">
                      <div className="overflow-hidden rounded-lg border border-line bg-paper">{doc.hasFile ? (doc.mime === 'application/pdf' ? <a className="block p-6 text-center font-semibold text-brand-700" href={`/api/documents/${doc.id}/file`} target="_blank" rel="noreferrer">Open PDF</a> : <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noreferrer"><img src={`/api/documents/${doc.id}/file`} alt={doc.type} className="max-h-[420px] w-full object-contain" /></a>) : <p className="p-6 text-center text-sm text-ink-muted">No file stored</p>}</div>
                      <div>
                        <p className="eyebrow mb-2">{doc.source === 'digilocker' ? `Issued by ${doc.issued?.issuer} · signature ${doc.issued?.signatureVerified ? 'verified' : 'FAILED'}` : `Read on the server (${doc.confidence}%)${doc.ai ? ` · second reader ${doc.ai.model}` : ''}`}</p>
                        <dl className="space-y-1 text-sm">{Object.entries(doc.fields || {}).filter(([, value]) => value).map(([key, value]) => <div key={key} className="grid grid-cols-[110px_1fr] gap-2"><dt className="text-ink-muted">{LABELS[key] || key}</dt><dd className="break-words">{value}</dd></div>)}</dl>
                        <p className="eyebrow mb-2 mt-4">Checks</p>
                        <ul className="space-y-1.5">{doc.checks.map((check, index) => { const [Icon, color] = ICON[check.status]; return <li key={index} className="flex gap-2 text-sm"><Icon className={cx('mt-0.5 h-4 w-4 flex-none', color)} /><div><p className="font-medium">{check.label}</p>{check.detail && <p className="text-xs text-ink-muted">{check.detail}</p>}</div></li>; })}</ul>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
              <div className="space-y-4">
                {pending && (
                  <Card className="border-blue-200 p-5">
                    <p className="eyebrow mb-2 flex items-center gap-1.5"><Users className="h-4 w-4" />Waiting for a second officer</p>
                    <p className="text-sm">First officer's note: {pending.note || '—'}</p>
                    <ul className="mt-2 space-y-1 text-xs text-ink-muted">{pending.overrides.map(item => <li key={item.label}>Override · {item.label} · {REASONS.find(([key]) => key === item.reason)?.[1]}</li>)}</ul>
                    {pending.by === me ? <p className="mt-3 text-sm text-ink-muted">You made this approval. A different officer must confirm it.</p> : (
                      <div className="mt-3 flex gap-2"><Button loading={busy === 'confirm'} onClick={() => decide('confirm')}><CheckCircle2 className="h-4 w-4" />Confirm</Button><Button variant="secondary" loading={busy === 'return'} disabled={!form.message} onClick={() => decide('return')}>Return with note</Button></div>
                    )}
                  </Card>
                )}
                <Card className="p-5">
                  <p className="eyebrow mb-3">Decision</p>
                  <Field label="Note (required to reject; shown to the owner)"><textarea className="input min-h-20" value={form.message} onChange={event => setForm({ ...form, message: event.target.value })} placeholder="e.g. Please upload the latest GST certificate showing the registered legal name." /></Field>
                  {overridable.length > 0 && !pending && !hard && (
                    <div className="mt-3 rounded-lg border border-line p-3">
                      <p className="mb-2 text-xs font-semibold text-ink">To approve, give a reason for each failed check (a second officer then confirms):</p>
                      <ul className="space-y-2">{overridable.map(flag => { const label = `${flag.type}: ${flag.label}`; return <li key={label} className="text-xs"><p className="mb-1">{label}</p><select className="input py-1 text-xs" value={reasons[label] || ''} onChange={event => setReasons({ ...reasons, [label]: event.target.value })}><option value="">Choose a reason…</option>{REASONS.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></li>; })}</ul>
                    </div>
                  )}
                  <div className="mt-3 grid gap-2">
                    {business.kyc.status === 'rejected' ? (
                      <Button variant="secondary" loading={busy === 'reopen'} disabled={!form.message} onClick={() => decide('reopen')}><RotateCcw className="h-4 w-4" />Reopen the application</Button>
                    ) : (
                      <>
                        <Button loading={busy === 'approve'} disabled={hard || Boolean(pending)} onClick={() => decide('approve')}><CheckCircle2 className="h-4 w-4" />{overridable.length ? 'Approve with overrides' : 'Approve: business verified'}</Button>
                        <div className="flex flex-wrap gap-2"><select className="input min-w-[12rem] flex-1 py-2 text-sm" value={form.docType} onChange={event => setForm({ ...form, docType: event.target.value })}><option value="">Document to re-upload…</option>{['GST certificate', 'Udyam certificate', 'Address proof', 'Signatory ID', 'Authority letter', 'Shop licence', 'Shop photo'].map(type => <option key={type}>{type}</option>)}</select><Button variant="secondary" loading={busy === 'request_reupload'} disabled={!form.docType || !form.message} onClick={() => decide('request_reupload')}><RotateCcw className="h-4 w-4" />Ask</Button></div>
                        <Button variant="danger" loading={busy === 'reject'} disabled={!form.message} onClick={() => decide('reject')}><Ban className="h-4 w-4" />Reject</Button>
                      </>
                    )}
                  </div>
                  <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-muted"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 flex-none" />Open every uploaded document before approving. Hard stops (cancelled GSTIN, identity used by another owner, failed issuer signature) cannot be overridden. Every decision and view is audited.</p>
                </Card>
                {(business.ownership || business.ownerKyc) && (
                  <Card className="p-5"><p className="eyebrow mb-2">Proof of control</p><ul className="space-y-1 text-sm">
                    {business.ownerKyc && <li>Person: {business.ownerKyc.name} · {business.ownerKyc.aadhaar} · {business.ownerKyc.method === 'digilocker' ? 'DigiLocker e-Aadhaar' : 'Aadhaar OTP'}</li>}
                    {business.ownership?.pan && <li>PAN {business.ownership.pan.masked} · {business.ownership.pan.name}</li>}
                    {business.ownership?.bank && <li>Bank {business.ownership.bank.ifsc} {business.ownership.bank.masked} · holder {business.ownership.bank.holder}</li>}
                    <li className={business.ownership?.verifiedAt ? 'text-ok-700' : 'text-warn-700'}>{business.ownership?.verifiedAt ? `Linked to the business via ${business.ownership.method === 'digilocker' ? 'DigiLocker (issuer)' : '₹1 bank check'} · ${business.ownership.role || ''}` : 'Not linked to the business yet'}</li>
                  </ul></Card>
                )}
                {business.documentHistory?.length > 0 && <Card className="p-5"><p className="eyebrow mb-2">Earlier documents (kept on record)</p><ul className="space-y-1 text-xs text-ink-muted">{business.documentHistory.map((item, index) => <li key={index}>{item.type} · {titleCase(item.status || 'pending')} · replaced {dateTime(item.replacedAt)}{item.failed.length ? ` · ${item.failed.join('; ')}` : ''}</li>)}</ul></Card>}
                <Card className="p-5"><p className="eyebrow mb-3">Flags</p><ul className="space-y-1.5 text-sm">{[...business.kyc.failed, ...business.kyc.warnings].map((flag, index) => <li key={index} className={cx('rounded-lg px-3 py-2', flag.status === 'fail' ? 'bg-brand-50 text-brand-800' : 'bg-warn-50 text-warn-700')}><span className="font-semibold">{flag.type}:</span> {flag.label}</li>)}</ul>{business.kyc.decisions.length > 0 && <><p className="eyebrow mb-2 mt-4">History</p><ul className="space-y-1 text-xs text-ink-muted">{business.kyc.decisions.map((item, index) => <li key={index}>{dateTime(item.at)} · {titleCase(item.decision)}{item.note ? ` · ${item.note}` : ''}</li>)}</ul></>}</Card>
              </div>
            </div>
          </div>
        );
      }}
    </LoadState>
  );
}
