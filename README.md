<div align="center">

# TutorGo

**The one-stop management app for independent tutors.**

Students, sessions, billing, invoices — all in one place, right in your browser.
No account. No server. No data leaves your device.

[![Live App](https://img.shields.io/badge/Live_App-TutorGo-4F46E5?style=for-the-badge)](https://tutorgo.vercel.app)
[![Version](https://img.shields.io/badge/version-1.0.0-0F172A?style=for-the-badge)](https://github.com/SumanR1602/TutorGo/releases)
[![License](https://img.shields.io/badge/license-MIT-10B981?style=for-the-badge)](./LICENSE)
[![PWA](https://img.shields.io/badge/PWA-offline_ready-F59E0B?style=for-the-badge)](#)

</div>

---

## What is TutorGo?

TutorGo is a Progressive Web App (PWA) built specifically for tutors who teach students in different countries and time zones. It replaces scattered spreadsheets and manual calculations with one clean tool that works completely offline after the first load.

---

## Features

### 🧑‍🎓 Students
- Add students with name, city, timezone, hourly or monthly rate, and avatar color
- Auto-detects timezone from city name — 100+ cities supported
- Live local time on each student card
- Set a scheduled class time per student for reminders

### 📚 Sessions
- Log Regular or Extra sessions with date, duration (0.5–3h), and optional notes
- Filter sessions by month, student, or custom date range
- Teaching streak tracker on the dashboard

### 💰 Billing
- Monthly breakdown per student — earned, paid, and pending balance
- Record payments with date, amount, and reference note
- Supports hourly and monthly flat-fee billing

### 🧾 Invoices & Receipts
- Generate professional PDF invoices for any date range with one tap
- Per-payment receipts with session breakdown and carry-forward balance
- Export per-student or all-students data as Excel (.xlsx)

### 🌏 Timezone Converter
- Type any IST time → instantly see every student's local time
- Warns when a time falls outside 6 AM – 10 PM for a student (⚠ odd hours)
- Live IST clock, resets to current time in one tap

### 🔔 Reminders
- Daily reminder notification at your configured time
- Per-student class reminders at their scheduled time — fires in-app and as a push notification

### 📴 Fully Offline
- Works with zero internet after the first load
- PDFs generate offline — no internet needed

---

## Getting Started (Users)

No installation needed. Open the app and install it to your home screen like a native app.

🔗 **[Open TutorGo →](https://tutorgo.vercel.app)**

| Platform | Steps |
|---|---|
| Android | Chrome → ⋮ → **Add to Home Screen** |
| iPhone | Safari → Share → **Add to Home Screen** |
| Desktop | Click the **install icon** in the address bar |

> **Privacy:** All your data is stored locally in your browser. Nothing is sent to any server.
> Use **Settings → Export backup** regularly — clearing browser data will erase your app data.

---

## For Developers

### Tech Stack

| Layer | Choice |
|---|---|
| Framework | React 18 + TypeScript |
| Build tool | Vite 5 |
| State & persistence | Zustand + localStorage |
| Styling | Tailwind CSS — light / dark / system |
| Routing | React Router v6 |
| Icons | Lucide React |
| PDF generation | html2pdf.js (bundled — works offline) |
| Excel export | ExcelJS |
| PWA | vite-plugin-pwa (Workbox autoUpdate) |

### Local Setup

**Prerequisites:** Node.js v18+, npm v9+

```bash
git clone https://github.com/SumanR1602/TutorGo.git
cd TutorGo
npm install
npm run dev
```

App runs at `http://localhost:5173` with hot module replacement.

### Build

```bash
npm run build       # production build → dist/
npm run preview     # preview the build at localhost:4173
```

### Project Structure

```
src/
├── components/       # UI components (billing, sessions, students, shared, timezone)
├── pages/            # Dashboard, Students, Sessions, Billing, Settings
├── store/            # Zustand store — all state, actions, selectors
├── utils/            # Billing logic, PDF templates, Excel exports, timezone helpers
├── types/            # Shared TypeScript interfaces
└── constants/        # Colors, currencies, app-wide defaults
```

---

## Deploying

TutorGo is a fully static PWA — no server or environment variables required.

1. Push to GitHub
2. Import repo at [vercel.com](https://vercel.com) → **Add New Project**
3. Vercel auto-detects Vite — just click **Deploy**

Every push to `main` deploys automatically.

---

## License

MIT © [Reguri Suman](https://github.com/SumanR1602/TutorGo)

---

<div align="center">
  <sub>Built for tutors, by a tutor · v1.0.0</sub>
</div>