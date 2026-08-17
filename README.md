# Remindi 

**AMC Management Software for Indian Service Contractors.**

Remindi is a B2B SaaS platform that helps service contractors in India manage their Annual Maintenance Contracts — from quotations and invoices to client tracking and payment records. Built for electricians, HVAC technicians, plumbers, and other field service professionals who want to ditch manual paperwork and run their contracts digitally.

> Live at [remindi.online](https://remindi.online)

---

## What It Does

Managing AMCs manually is painful — scattered Excel sheets, handwritten quotations, missed renewal dates, and clients who never received a proper invoice. Remindi fixes that.

- **Quotation Generation** — Create professional PDF quotations with your company branding, GSTIN/PAN details, itemized line items, and GST breakdowns
- **Invoice Generation** — Convert quotations to invoices in one click; includes payment details (bank transfer + UPI), amount in words, and optional order numbers
- **Client Management** — Maintain a clean database of your AMC clients with contract details
- **Company Profile** — Set up your business once (name, address, GSTIN, PAN, logo) and it auto-populates all your documents
- **PDF Thumbnails** — Optional branded header thumbnail on all PDF exports
- **GST-Compliant Documents** — CGST/SGST/IGST breakdown, tax totals, and compliant invoice formatting out of the box

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js + React |
| Styling | Tailwind CSS |
| Backend / DB | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| PDF Generation | Custom PDF renderer |
| Deployment | Vercel |

---


## Database

Remindi uses Supabase with the following key tables:

- `company_profile` — stores business name, address, GSTIN, PAN, logo, and payment details
- `clients` — AMC client records
- `contracts` — AMC contract details linked to clients
- `quotations` / `invoices` — document records with line items and totals

---


---

## Part of Cosmos

Remindi is built and maintained by Cosmos — a product studio building practical software for Indian SMBs. Founder prakash jadhav (prince)

Sister product: **Gain.ai** — AI fitness platform for gym owners.

---

## License

Private / Proprietary. All rights reserved.

---
