# Udyam Digital in production

The prototype runs the full journey end to end: advisor, quote, KYC, e-sign, payment, installation and go-live, for every role. Government and payment services are simulated behind the same interfaces a real provider uses, so going live is mostly a matter of plugging in licensed providers, hardening the platform and rolling out in steps.

This document is our plan for taking it there.

---

## 1. Where we are today

| Layer | What the prototype runs |
|---|---|
| Channels | Mobile-first React web app (10 languages, voice input), a WhatsApp simulator and a working Meta Cloud API webhook, consoles for each staff role |
| API | One Node.js / Express service with cookie sessions, role-based access, CSRF checks and rate limits |
| AI advisor (Mitu) | Gemini turns the owner's words into a profile, grounded on the product catalogue. Falls back to a lighter model, then to local rules |
| Pricing | Rules engine over the 25-product catalogue. It alone decides products, eligibility and price |
| KYC engine | DigiLocker flow with signature checks, PAN + ₹1 bank check, documents read by Tesseract OCR and an AI reader, registry match, hard stops, maker-checker |
| Orders and field | Idempotent e-sign and UPI, installation slots, technician GPS check-in, owner sign-off code, 11-step tracker |
| Data | MongoDB Atlas, identifiers encrypted and masked, private document storage, audit log |
| Simulated | DigiLocker, Aadhaar e-KYC, GSTN, Udyam, PAN, bank penny-drop, eSign, UPI and SMS |

---

## 2. Target architecture

```
Owners (web, WhatsApp)   Partners · KYC officers · Technicians · Ops
            │                              │
            └──────────── HTTPS ───────────┘
                            │
               Load balancer + WAF (India region)
                            │
            API service (Node.js, stateless, 2+ instances)
     ┌──────────┬───────────┼───────────┬──────────────┐
  Advisor    Pricing      KYC engine   Orders       Field + notifications
  (Gemini)   rules                     e-sign, UPI
     │                      │
     │              Background workers: document reading, reminders,
     │              SLA checks, WhatsApp outbox
     │                      │
  MongoDB Atlas (replica set)   Private object storage   Audit store
                            │
       Licensed providers: DigiLocker, e-KYC, GSTN, PAN, bank, eSign, UPI, SMS
```

The design stays the same as the prototype. Three things change:

- **Stateless API, more instances.** Sessions are already in signed cookies and data is in MongoDB, so the API can run as several copies behind a load balancer without code changes.
- **Background work moves to workers.** Document reading (OCR plus the AI reader), reminders, SLA checks and outgoing WhatsApp messages run on a scheduler today. In production they run as a separate worker process, so slow jobs never slow down the owner's screen.
- **Everything stays in India.** API, database, document storage and backups run in an Indian cloud region, as the DPDP Act and telecom KYC rules expect.

---

## 3. From simulated to real

| Part of the journey | In the prototype | In production |
|---|---|---|
| DigiLocker documents | Full OAuth 2.0 + PKCE flow and issuer-signature checks, against a simulated DigiLocker | DigiLocker Requester access through API Setu, or a licensed KYC provider |
| Aadhaar e-KYC | Simulated OTP to the registered mobile | Licensed AUA/KUA partner |
| GSTIN and Udyam lookup | Case registries (3,534 GSTIN, 2,723 Udyam records) | GST Suvidha Provider and the Udyam API |
| PAN and bank check | Simulated PAN-to-name and ₹1 penny-drop | Protean PAN verification and a bank penny-drop API |
| e-Sign | One-time code on screen | Aadhaar eSign through a licensed eSign provider |
| Payment | Simulated UPI with autopay | RBI-licensed payment aggregator (UPI, autopay mandate) |
| Login OTP | Code shown on screen in demo mode | DLT-registered SMS provider (for example MSG91 or Gupshup) |
| WhatsApp | Simulator, plus a working Meta Cloud API integration | Meta Cloud API with approved message templates |
| AI advisor and document reader | Gemini API with a free key | Gemini on an enterprise tier with a data processing agreement, India region where available |
| Documents | Local disk or Cloudflare R2 | Private object storage in India, encrypted, no public access |

The journey only talks to these services through one internal module, so a simulated service is swapped for the real one without touching the journey, the rules or the screens.

---

## 4. Reliability and scale

- **The journey never depends on the AI.** If Gemini is slow or down, the advisor falls back to a lighter model, then to local rules. Prices and KYC decisions are always rules.
- **Payments and e-sign are idempotent.** A double tap or a retry never charges or signs twice.
- **Provider outages are expected.** Every provider call gets a timeout, as the AI call already does (8 seconds). If DigiLocker is down, the owner can still verify through PAN, the ₹1 bank check and documents, and nobody is left stuck.
- **Capacity.** India has over six crore small businesses, but onboarding traffic is bursty (campaigns, month ends), not constant. One API instance covers the pilot. Beyond that we add instances and workers and move to a larger Atlas tier. The heaviest step, reading documents, scales on its own worker pool.
- **Monitoring.** Health checks, error tracking and alerts on the numbers that matter: time to quote, KYC pass rate, payment failures and days to activate. The ops dashboard already shows the funnel live.

---

## 5. Compliance and trust

What the prototype already does, and keeps doing in production:

- Consent for one stated purpose (DPDP Act 2023) before any check, with withdrawal and erasure.
- Only the fields each step needs. For Aadhaar we keep the last 4 digits and a keyed reference, never the number.
- GSTIN, Udyam and Aadhaar references encrypted at rest (AES-256-GCM), looked up by keyed hash, and masked on every screen.
- Identifiers removed from text before anything reaches the AI.
- Hard stops nobody can override, maker-checker for every exception, and an audit log of every decision and document view.

What production adds:

- All personal data, documents and backups stored in India.
- A written retention schedule with an automatic purge of unverified data, alongside the erasure-on-request that exists today.
- Processing agreements with every provider, including the AI provider, and each one named in the privacy notice.

## 6. Security

Today: owners sign in with a one-time code, staff with a password; sessions are signed, httpOnly cookies; every route checks the user's role; state-changing requests pass a CSRF origin check; OTP and chat endpoints are rate limited; uploads are checked by file signature; WhatsApp webhooks are verified with Meta's signature. The server refuses to start in production with weak secrets.

What production adds:

- Secrets and encryption keys in a managed key vault, rotated on a schedule.
- Documents encrypted in object storage, readable only through the API.
- A tamper-evident audit store and a breach-response plan with CERT-In reporting.
- An independent security review and penetration test before launch, then once a year.

The full privacy note is in [submission/privacy](submission/privacy/Udyam_Digital_Privacy_Note.pdf).

---

## 7. Rollout

| Phase | Scope | Moves on when |
|---|---|---|
| 1. Pilot | Two tier-1 cities, professional offices and micro shops, English and Hindi, live KYC through a licensed provider | Activation, days to live and status calls hit the pilot targets |
| 2. Scale | Tier-2 cities, multi-site businesses and small manufacturers with sales support, WhatsApp, regional languages | The same gates hold at higher volume |
| 3. National | All circles, connected to the telco's order management and billing | — |

Pilot targets, from the business case: lead to activation from 7.4% to 12%, days to activate from 17.6 to 7 or fewer, status calls per customer from 3 to under 0.5, and cost per activation from ₹15,053 to under ₹9,000.

---

## 8. Risks and how we handle them

| Risk | How we handle it |
|---|---|
| Provider approvals take months | Start DigiLocker, e-KYC and eSign onboarding before the pilot; launch the pilot through one licensed KYC aggregator that already holds these approvals |
| A fake or borrowed business identity | Proof of control (DigiLocker or PAN + ₹1), hard stops on reused identities, maker-checker, GPS check at the premises |
| The AI misreads or invents | AI never sets prices or decides KYC; documents are read twice and matched to the registry; disagreement goes to an officer |
| Customer data sent to an outside AI | Identifiers masked first; enterprise tier with a processing agreement; named in the privacy notice |
| A provider is down | Timeouts, the PAN + documents path when DigiLocker is down, and retries from the queue |
| Sales teams see digital as a threat | Hot and complex leads still go to partners and field sales; commission is paid on activation |

---

## 9. Deploying the current build

The simplest setup is one server: Express serves the built React app and the API from the same domain.

```bash
npm run install:all
npm run build
NODE_ENV=production npm start --prefix backend
```

Put HTTPS in front of it (Nginx, Caddy or the host's load balancer), then check `GET /api/health`. Run `npm run create-admin` once to create the first operations admin.

If the frontend and API are on separate hosts, there are two ways:

- Recommended: keep the API on the frontend's domain with a rewrite. On a Render Static Site add the rewrites `/api/*` → `https://<api>.onrender.com/api/*` and `/*` → `/index.html` (both as Rewrite, not Redirect). On Vercel use a `vercel.json` with the same two rules. Set `CLIENT_URL` to the frontend URL and leave `COOKIE_SAMESITE=lax`.
- Or call the API directly: build the frontend with `VITE_API_BASE=https://<api>/api`, and on the API set `CORS_ORIGINS` to the frontend URL and `COOKIE_SAMESITE=none`.

### Settings (`backend/.env`, see `backend/.env.example`)

| Setting | Purpose |
|---|---|
| `NODE_ENV=production`, `PORT` | Production mode (secure cookies, strong-secret check) and the listening port |
| `MONGO_URI` | MongoDB Atlas connection string |
| `CLIENT_URL` | The site's public URL, for CORS and the CSRF check |
| `CORS_ORIGINS` | Extra allowed origins, comma-separated (wildcards like `https://*.vercel.app` work) |
| `COOKIE_SAMESITE` | `lax` when the frontend reaches the API through a rewrite or one server; `none` when it calls the API on another domain |
| `JWT_SECRET`, `DATA_ENCRYPTION_KEY` | Long random values. Never change the encryption key after launch, or stored data can't be read |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The first operations admin |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | AI advisor and document reader |
| `R2_*` or another object store | Private document storage. Without it, files go to local disk, which must be persistent and backed up |
| `WHATSAPP_*` | Meta Cloud API. Webhook: `https://your-domain/api/whatsapp/webhook` |
| `DEMO_MODE=false`, `OTP_DEV_MODE=false` | Turn off demo data, the role switcher and on-screen codes for real customers |

With `OTP_DEV_MODE=false`, owners need a real SMS provider to receive their login code (section 2), so connect one before opening sign-up to the public.

---

Team Ticchi Gang · NSUT Delhi · Monis (Team Leader), Ubesh Siddiqui
