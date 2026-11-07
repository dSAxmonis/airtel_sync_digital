# Going to production

## 1. Pick how you deploy (this decides the API URL)

**Option A (recommended): one server.** Express serves the built React app and the API from the same domain.
- Frontend API URL: nothing to set. The app calls `/api` on its own domain.
- Steps: `npm run install:all`, then `npm run build`, then `NODE_ENV=production npm start --prefix backend`.
- Put Nginx, Caddy or your host's HTTPS in front of port `PORT`.

**Option B: frontend and backend on separate hosts** (for example Vercel plus Render).
- The simplest fix is a rewrite on the frontend host: send `/api/*` to `https://api.your-domain.com/api/*`. The browser still sees one domain, so login cookies work.
- If you call the API directly instead, set `VITE_API_BASE=https://api.your-domain.com/api` in `frontend/.env.production` before `npm run build`. Then both hosts must be on the **same parent domain** (`www.` and `api.` of one domain), because the login cookie is `SameSite=Lax`. On two different domains (`*.vercel.app` and `*.onrender.com`), login will not stick.

## 2. Frontend variables (`frontend/.env.production`, read at build time)

| Variable | Needed? | Example | What it does |
|---|---|---|---|
| `VITE_API_BASE` | Only for Option B | `https://api.your-domain.com/api` | API base URL. Default is `/api` |

## 3. Backend variables (`backend/.env`, see `backend/.env.example`)

### Required
| Variable | Example | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Turns on secure cookies and the strong-secret check |
| `PORT` | `5000` | Port Express listens on |
| `MONGO_URI` | `mongodb+srv://user:pass@cluster0.xxxx.mongodb.net/udyam_digital` | MongoDB Atlas or your own server |
| `CLIENT_URL` | `https://www.your-domain.com` | Your site's URL, used for CORS and the CSRF check. Separate several with commas. No trailing slash |
| `JWT_SECRET` | 64 random characters | Signs login cookies. Generate with `openssl rand -hex 32` |
| `DATA_ENCRYPTION_KEY` | 64 random characters | Encrypts GSTIN, Udyam and OTP codes. **Never change it after launch**, or stored data can't be read |
| `ADMIN_EMAIL` | `admin@your-domain.com` | First ops admin account |
| `ADMIN_PASSWORD` | at least 12 characters | The server refuses to start in production if this or the two secrets above are weak |

### Demo switches (keep these off for real customers)
| Variable | Production value | Notes |
|---|---|---|
| `DEMO_MODE` | `false` | When on, it seeds demo data and shows the "view as" one-click login. Default is now off in production |
| `OTP_DEV_MODE` | `false` | When on, the OTP is shown on screen. See the SMS warning below |
| `DEMO_STAFF_PASSWORD` | (blank) | Only used when `DEMO_MODE=true` |

### Optional integrations
| Variable(s) | Without it |
|---|---|
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT` | KYC documents go to `backend/uploads` on disk. That disk must be persistent and backed up |
| `ANTHROPIC_API_KEY`, `ADVISOR_AI=auto` | The plan advisor uses its built-in rules |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_API_VERSION` | WhatsApp only works in the in-app simulator. Webhook URL to give Meta: `https://your-domain.com/api/whatsapp/webhook` |
| `KYC_REFERENCE_DATE` | Leave blank in production so bills are dated against today. In development it defaults to `2026-07-15`, the date of the synthetic data |
| `ABANDON_AFTER_MINUTES` (1440), `SCHEDULER_SECONDS` (60) | Defaults are fine |

## 4. Gap to close before real launch: SMS for OTP

The code has **no SMS provider**. With `OTP_DEV_MODE=false`, business owners never receive their login code, so they can't sign in. You need one of these:
- Add an SMS provider (MSG91, Twilio or Gupshup, with a DLT-registered template in India) in `backend/services/otp.js`, adding variables like `SMS_API_KEY` and `SMS_SENDER_ID`, or
- Keep `OTP_DEV_MODE=true` only for a demo or judging build.

## 5. Checklist
- [ ] MongoDB Atlas cluster created and its IP allowlist includes your server
- [ ] `backend/.env` filled in. Never commit it
- [ ] `npm run build`, then start with `NODE_ENV=production`
- [ ] HTTPS on the domain (secure cookies need it)
- [ ] `npm run create-admin` run once
- [ ] SMS provider added (section 4)
- [ ] `GET https://your-domain.com/api/health` returns OK
