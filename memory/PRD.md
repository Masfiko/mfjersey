# MF.Jersey_id — Finance Dashboard PRD

## Problem Statement
Build a simple finance website for an original vintage jersey sales business named **MF.Jersey_id**. Modules required:
1. Ready Stock (Item Name, Image, Purchase Price, Shipping Cost, Remake, Status, Total)
2. Beginning Balance Sheet (Kas, Kas Bank, Piutang, Persediaan Jersey, Perlengkapan Jersey, Perlengkapan, Total Aset)
3. Bank Cash Book (Date, Description, Income, Expense, Balance)
4. Profit & Loss (Sales, COGS, Gross Profit, Costs, Total Expenses, Other Income, Net Profit/Loss)
5. Summary (Dashboard)
6. Balance Sheet (Neraca)

## User Choices
- Language: Bahasa Indonesia
- Currency: Rupiah (IDR)
- Auth: Simple JWT (email/password)
- Image storage: Emergent object storage for jersey images
- Design: Modern minimalist (Swiss + Sports Heritage archetype)

## User Personas
- **Pemilik toko jersey vintage**: butuh dashboard tunggal untuk memantau stok, kas, untung-rugi & neraca harian.

## Architecture
- **Backend**: FastAPI + MongoDB (motor). JWT auth via httpOnly cookies. Emergent object storage for image upload. All routes prefixed `/api`.
- **Frontend**: React 19 + Tailwind + shadcn UI. Routes: `/login`, `/register`, `/` (Dashboard), `/ready-stock`, `/saldo-awal`, `/buku-kas`, `/laba-rugi`, `/neraca`.

## What's Implemented (Feb 2026)
- JWT auth (register, login, logout, /me) with admin seeding (`admin@mfjersey.id` / `admin123`)
- Ready Stock CRUD + image upload via Emergent storage with blob fetch in UI
- Beginning Balance upsert (single doc per user)
- Bank Cash Book transactions CRUD with running balance derived from opening kas+kas_bank
- Profit & Loss computation from sold items + categorized cash book entries
- Balance Sheet (Aktiva vs Pasiva) with BALANCED/UNBALANCED indicator
- Summary dashboard with hero stats, P&L mini, stock breakdown, recent transactions
- Sidebar layout with active state, logout button
- 100% backend & frontend tests passed

## Prioritized Backlog
### P1 (next)
- Auto-create cash-book "pembelian" transaction when adding new Ready Stock to keep neraca balanced
- Date range filter for P&L (bulan / tahun)
- Edit transaction inline in Cash Book

### P2
- Export to PDF/Excel for laporan
- Multi-period comparison
- WhatsApp share for ringkasan harian
- Charts (income vs expense line chart on Dashboard)
- Brute-force lockout on /auth/login (5 fails = 15min lockout)

## Files
- Backend: `/app/backend/server.py` (single-file)
- Frontend pages: `/app/frontend/src/pages/`
- Auth context: `/app/frontend/src/context/AuthContext.js`
- Layout/sidebar: `/app/frontend/src/components/Layout.js`
- Image blob loader: `/app/frontend/src/components/JerseyImage.js`
