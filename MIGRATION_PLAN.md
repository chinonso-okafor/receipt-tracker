# Plan: Rewrite Backend to JavaScript (Fastify + SQLite) & Clean Up Emergent

## Context
The receipt-tracker app was built on emergent.sh with a Python/FastAPI backend and MongoDB. The user is migrating to local development and wants:
1. Backend rewritten from Python → JavaScript (Fastify)
2. Database changed from MongoDB → SQLite
3. Auth replaced with simple hardcoded login (admin@example.com / admin123)
4. All Emergent.sh references removed from frontend

The frontend React code stays largely the same — only the auth flow and Emergent references change. The backend is a complete rewrite.

---

## Step 1: Create the new Fastify backend

**Create `backend/package.json`** with these dependencies:
- `fastify` — web framework
- `@fastify/cors` — CORS support
- `@fastify/cookie` — cookie parsing
- `@fastify/multipart` — file upload handling
- `better-sqlite3` — synchronous SQLite driver (simpler than async for SQLite)
- `@anthropic-ai/sdk` — Anthropic Claude API for receipt scanning
- `sharp` — image processing (resize, compress, format conversion)
- `pdf2pic` or `pdfjs-dist` — PDF to image conversion
- `pdfkit` — PDF report generation
- `exceljs` — Excel report generation
- `uuid` — unique ID generation
- `dotenv` — environment variable loading
- `bcrypt` — password hashing (for the hardcoded user seed)

**Create `backend/server.js`** — Main Fastify server with all routes:

### SQLite Schema (`backend/db.js`)

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  picture TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  vendor TEXT NOT NULL,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'USD',
  category TEXT NOT NULL,
  payment_method TEXT,
  receipt_number TEXT,
  line_items TEXT DEFAULT '[]',       -- JSON array
  tags TEXT DEFAULT '[]',              -- JSON array
  notes TEXT,
  receipt_image TEXT,                  -- base64 data URL
  confidence_score REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
```

On startup, seed the default admin user:
- email: `admin@example.com`
- password: `admin123` (bcrypt hashed)
- name: `Admin`
- user_id: `user_admin`

### API Routes (port 8000, all under `/api`)

**Auth:**
- `POST /api/auth/login` — accepts `{email, password}`, verifies credentials, creates session, sets cookie
- `GET /api/auth/me` — returns current user from session cookie
- `POST /api/auth/logout` — clears session

**Receipt scanning:**
- `POST /api/scan-receipt` — accepts file upload, processes image (sharp for resize/compress), calls Anthropic Claude Vision API directly, returns extracted data
- `POST /api/upload-receipt-image` — accepts file upload, returns base64 data URL

**Expenses CRUD:**
- `POST /api/expenses` — create expense
- `GET /api/expenses` — list with filters (search, category, start_date, end_date, vendor, tag, min_amount, max_amount)
- `GET /api/expenses/:expense_id` — get single expense
- `PUT /api/expenses/:expense_id` — update expense
- `DELETE /api/expenses/:expense_id` — delete expense
- `POST /api/expenses/bulk-delete` — delete multiple

**Analytics:**
- `GET /api/analytics/summary` — total, count, average, category breakdown, top vendors, monthly trend

**Reports:**
- `POST /api/reports/generate` — generate PDF (pdfkit) or Excel (exceljs) report

**Utilities:**
- `GET /api/categories` — list categories
- `GET /api/tags` — list user's unique tags
- `GET /api/health` — health check

**Admin:**
- `GET /api/admin/users` — all users with expense stats
- `GET /api/admin/stats` — platform stats

### Key Implementation Details

**Auth middleware**: Extract session_token from cookie, look up in sessions table, check expiry, attach user to request.

**Receipt scanning**: Port the Python logic to JS:
- Use `sharp` instead of Pillow for image processing
- Use `pdfjs-dist` to render PDF first page to image (or `pdf2pic`)
- Call Anthropic API directly using `@anthropic-ai/sdk` (native format only, remove Emergent proxy path)
- Keep the same detailed prompt for data extraction
- Same currency detection logic

**Reports**:
- PDF: Use `pdfkit` to generate expense report with table
- Excel: Use `exceljs` to generate spreadsheet with formatting

**Cookie settings for local dev**: `httpOnly: true, secure: false, sameSite: 'lax', path: '/'`

---

## Step 2: Update frontend auth flow

**Modify `frontend/src/App.js`:**
- Remove `AuthCallback` component (no more Emergent OAuth callback)
- Update `ProtectedRoute` to check `/api/auth/me` (same as now)
- Remove `session_id` hash detection from `AppRouter`
- Keep `AuthContext`, routing, and `ProtectedRoute` structure

**Modify `frontend/src/pages/Login.jsx`:**
- Replace Google OAuth button with email/password form
- `handleLogin` sends `POST /api/auth/login` with `{email, password}`
- On success, navigate to `/dashboard` with user data
- Remove Emergent Auth redirect

**Modify `frontend/src/components/Layout.jsx`:**
- No changes needed (logout already calls `/api/auth/logout`)

---

## Step 3: Clean up Emergent references from frontend

**Modify `frontend/public/index.html`:**
- Remove `<script src="https://assets.emergent.sh/scripts/emergent-main.js">`
- Remove the entire visual edits script block (debug-monitor, Tailwind CDN)
- Remove the "Made with Emergent" badge (`<a id="emergent-badge">...</a>`)
- Remove PostHog analytics script block
- Change `<title>` from "Emergent | Fullstack App" to "ReceiptLens"

**Delete these files/directories:**
- `frontend/plugins/` (entire directory — visual-edits + health-check)
- `.emergent/` (Emergent platform config)
- `.gitconfig` (Emergent git identity)
- `backend_test.py` (points to Emergent preview URL)
- `backend/server.py` (replaced by JS)
- `backend/requirements.txt` (replaced by package.json)

**Modify `frontend/craco.config.js`:**
- Remove visual-edits and health-check plugin imports and references
- Keep only the `@` path alias webpack config

---

## Step 4: Create backend .env.example

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
PORT=8000
```

No MongoDB URL needed — SQLite is file-based (`data.db` in backend directory).

---

## Step 5: Update frontend .env

```
REACT_APP_BACKEND_URL=http://localhost:8000
```

---

## Files to Create
| File | Purpose |
|------|---------|
| `backend/package.json` | Node.js dependencies |
| `backend/server.js` | Main Fastify server (all routes) |
| `backend/db.js` | SQLite setup, schema, seed data |
| `backend/.env.example` | Environment variable template |
| `backend/.gitignore` | Ignore node_modules, .env, *.db |

## Files to Modify
| File | Changes |
|------|---------|
| `frontend/src/App.js` | Remove AuthCallback, session_id detection; simplify auth flow |
| `frontend/src/pages/Login.jsx` | Replace Google OAuth with email/password form |
| `frontend/public/index.html` | Remove Emergent scripts, badge, PostHog; update title |
| `frontend/craco.config.js` | Remove plugin references, keep path alias only |

## Files to Delete
| File/Directory | Reason |
|----------------|--------|
| `frontend/plugins/` | Emergent visual-edits and health-check plugins |
| `.emergent/` | Emergent platform config |
| `.gitconfig` | Emergent git identity |
| `backend_test.py` | Points to Emergent preview URL |
| `backend/server.py` | Replaced by JavaScript version |
| `backend/requirements.txt` | Replaced by package.json |

---

## Verification

1. `cd backend && npm install && node server.js` — should start on port 8000, create data.db, seed admin user
2. `cd frontend && yarn install` — install deps (no changes to frontend deps needed)
3. Create `frontend/.env` with `REACT_APP_BACKEND_URL=http://localhost:8000`
4. `cd frontend && yarn start` — should start on port 3000
5. Navigate to `http://localhost:3000` → should redirect to `/login`
6. Login with `admin@example.com` / `admin123` → should reach dashboard
7. Upload a receipt image → should scan with Claude and show extracted data
8. Save expense → should appear in expenses list
9. Check dashboard analytics → should show chart data
10. Generate PDF and Excel reports → should download files
11. Logout → should redirect to login
12. Verify no Emergent references remain: `grep -r "emergent" frontend/src/ frontend/public/ backend/`
