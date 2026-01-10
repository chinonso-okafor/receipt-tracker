# ReceiptLens - Product Requirements Document

## Original Problem Statement
Build an internal receipt and expense tracking web application for freelancers and individuals. The app combines AI-powered receipt scanning with intuitive expense management to eliminate manual tracking tedium.

## Architecture
- **Frontend**: React + Tailwind CSS + Shadcn/UI + Recharts
- **Backend**: FastAPI + Python
- **Database**: MongoDB
- **AI**: Anthropic Claude Vision (via Emergent Universal Key)
- **Auth**: Emergent Google OAuth

## User Personas
1. **Freelancers** - Need to track business expenses for tax deductions and client billing
2. **Individuals** - Want to understand spending patterns without complex accounting software

## Core Requirements (Static)
- Receipt upload via drag-drop and mobile camera capture
- AI-powered data extraction (vendor, date, amount, category, line items)
- Expense organization with search, filters, tags, and notes
- Professional PDF/Excel report generation
- Spending visualization with charts and insights
- Secure cloud storage with automatic backup
- Mobile-responsive design (375px+ width)

## What's Been Implemented (January 10, 2026)

### Phase 1 - MVP Complete ✅
- [x] Google OAuth authentication (Emergent-managed)
- [x] Login page with split-screen design
- [x] Dashboard with spending analytics and charts
  - Total spent, receipt count, average expense stats
  - Spending trend area chart
  - Category breakdown pie chart
  - Top vendors bar chart
  - Recent expenses list
- [x] Expenses page with full CRUD operations
  - Search and filter functionality
  - Category, date range filters
  - Bulk selection and delete
  - Edit modal for expense updates
- [x] Receipt upload modal
  - Drag-and-drop file upload
  - Mobile camera capture
  - AI-powered data extraction with confidence scores
  - Manual review and edit before saving
  - Tag and note support
- [x] Reports page
  - Date range presets (last 7 days, month, quarter, YTD)
  - Custom date selection
  - Category filtering
  - PDF and Excel export formats
- [x] Mobile-responsive layout with bottom navigation
- [x] AI receipt scanning using Anthropic Vision API

## Prioritized Backlog

### P0 (Critical) - Completed
- ✅ Core authentication
- ✅ Receipt upload and AI extraction
- ✅ Expense CRUD
- ✅ Basic reporting

### P1 (High Priority) - Future
- [ ] Email receipt submission (unique email per user)
- [ ] Receipt image storage optimization (compress/resize)
- [ ] Offline support (PWA)
- [ ] Multi-currency support

### P2 (Medium Priority) - Future
- [ ] Budget setting and tracking
- [ ] Recurring expense detection
- [ ] Custom category creation
- [ ] Receipt duplicate detection
- [ ] Export to accounting software formats

### P3 (Low Priority) - Future
- [ ] Team/organization sharing
- [ ] Receipt OCR accuracy improvement ML
- [ ] Integration with bank statements
- [ ] Tax category mapping

## API Endpoints
- `POST /api/auth/session` - Exchange OAuth session
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout
- `POST /api/scan-receipt` - AI receipt scanning
- `POST /api/upload-receipt-image` - Upload receipt image
- `GET/POST /api/expenses` - List/Create expenses
- `GET/PUT/DELETE /api/expenses/{id}` - Single expense operations
- `POST /api/expenses/bulk-delete` - Bulk delete
- `GET /api/analytics/summary` - Dashboard analytics
- `POST /api/reports/generate` - Generate PDF/Excel
- `GET /api/categories` - List categories
- `GET /api/tags` - List user tags

## Next Tasks
1. Test the full receipt scanning flow with real receipts
2. Add more chart customization options
3. Implement email receipt submission (Phase 2)
4. Add PWA support for mobile installation
