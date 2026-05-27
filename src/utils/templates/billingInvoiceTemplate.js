/**
 * billingInvoiceTemplate.js
 * Pure function — takes pre-computed invoice data, returns an HTML string.
 * No business logic, no imports, no side effects.
 *
 * @param {{
 *   invNo:        string,
 *   teacherName:  string,
 *   issued:       string,
 *   student:      object,
 *   isMonthly:    boolean,
 *   periodLabel:  string,
 *   filtered:     Array,
 *   totalHours:   number,
 *   totalEarned:  number,
 *   sessionRows:  string,
 *   fmt:          (n: number) => string,
 * }} data
 * @returns {string} Full HTML document
 */
export function buildInvoiceHTML({
  invNo, teacherName, issued, student, isMonthly,
  periodLabel, filtered, totalHours, totalEarned,
  sessionRows, fmt,
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Invoice_${student.name.replace(/\s+/g, '-')}_${invNo}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    /* ── Reset + force colours in print ──────────────── */
    *, *::before, *::after {
      box-sizing: border-box; margin: 0; padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Base ─────────────────────────────────────────── */
    body {
      font-family: 'Inter', 'Segoe UI', -apple-system, 'Helvetica Neue', Arial, sans-serif;
      background: #eef2ff;
      color: #1e293b;
      font-size: 12px;
      line-height: 1.5;
    }
    .screen-pad { padding: 14px 12px 28px; }

    /* ── Print button ─────────────────────────────────── */
    .no-print { display: flex; justify-content: center; margin-bottom: 12px; }
    .print-btn {
      background: #4f46e5; color: #fff; border: none;
      padding: 9px 24px; border-radius: 8px;
      font-size: 13px; font-weight: 600; cursor: pointer;
      display: inline-flex; align-items: center; gap: 7px;
    }
    .print-btn:hover { background: #4338ca; }

    /* ── Page card ────────────────────────────────────── */
    .page {
      position: relative;
      background: #fff; max-width: 760px; margin: 0 auto;
      border-radius: 14px; overflow: hidden;
      box-shadow: 0 4px 28px rgba(79,70,229,.14);
    }

    /* ── Watermark ────────────────────────────────────── */
    .watermark {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 420px; height: 420px;
      opacity: 0.10;
      pointer-events: none;
      z-index: 0;
    }
    .page > *:not(.watermark) { position: relative; z-index: 1; }

    /* ── Header ───────────────────────────────────────── */
    .inv-header {
      background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
      padding: 14px 24px; border-radius: 14px 14px 0 0;
      display: flex; justify-content: space-between; align-items: flex-start; color: #fff;
    }
    .t-name { font-size: 16px; font-weight: 600; letter-spacing: -.2px; }
    .t-role { font-size: 10px; opacity: .65; margin-top: 2px; text-transform: uppercase; letter-spacing: .9px; font-weight: 400; }
    .inv-right { text-align: right; }
    .inv-word  { font-size: 8.5px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; opacity: .65; }
    .inv-num   { font-size: 15px; font-weight: 700; margin-top: 1px; }
    .inv-date  { font-size: 10px; opacity: .65; margin-top: 2px; font-weight: 400; }

    /* ── Meta grid ────────────────────────────────────── */
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #e2e8f0; }
    .meta-cell { padding: 10px 24px; }
    .meta-cell + .meta-cell { border-left: 1px solid #e2e8f0; }
    .m-label { font-size: 8px; font-weight: 600; letter-spacing: 1.8px; text-transform: uppercase; color: #4f46e5; margin-bottom: 4px; }
    .m-name  { font-size: 13px; font-weight: 600; color: #0f172a; }
    .m-sub   { font-size: 11px; color: #64748b; margin-top: 2px; font-weight: 400; }
    .rate-chip {
      display: inline-block; margin-top: 8px;
      background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe;
      border-radius: 100px; padding: 2px 11px; font-size: 11.5px; font-weight: 500;
    }

    /* ── Summary bar ──────────────────────────────────── */
    .summary-bar {
      padding: 7px 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
      display: flex; gap: 20px; align-items: center; flex-wrap: wrap;
    }
    .s-pill { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #475569; }
    .s-dot  { width: 6px; height: 6px; border-radius: 50%; background: #a5b4fc; flex-shrink: 0; }
    .s-pill strong { color: #1e293b; }

    /* ── Table ────────────────────────────────────────── */
    .tbl-wrap  { padding: 12px 24px 0; }
    .tbl-label { font-size: 8px; font-weight: 600; letter-spacing: 1.8px; text-transform: uppercase; color: #94a3b8; margin-bottom: 7px; }

    table.items { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.items thead { display: table-header-group; }
    table.items tfoot { display: table-footer-group; }
    table.items thead th {
      background: #4f46e5; color: rgba(255,255,255,.9);
      padding: 6px 10px; font-size: 9px; font-weight: 600;
      letter-spacing: .8px; text-transform: uppercase; text-align: left;
    }
    table.items thead th:first-child { border-radius: 7px 0 0 7px; }
    table.items thead th:last-child  { border-radius: 0 7px 7px 0; }
    table.items tbody tr.data-row:nth-child(even) { background: #f8fafc; }
    table.items tbody td { padding: 5px 10px; font-size: 11.5px; color: #374151; border-bottom: 1px solid #f1f5f9; }
    table.items tbody tr:last-child td { border-bottom: none; }

    .badge { display: inline-block; padding: 2px 9px; border-radius: 100px; font-size: 10.5px; font-weight: 500; }
    .badge-regular { background: #e0e7ff; color: #3730a3; }
    .badge-extra   { background: #fef3c7; color: #92400e; }

    tr.fee-row td {
      background: #eef2ff; color: #3730a3; font-size: 11.5px;
      border-top: 1px solid #c7d2fe; border-bottom: 1px solid #c7d2fe; padding: 5px 10px;
    }
    table.items tfoot td {
      border-top: 2px solid #e2e8f0; padding: 7px 10px;
      font-size: 12px; font-weight: 600; color: #0f172a; background: #fff;
    }

    /* ── Totals ───────────────────────────────────────── */
    .totals-wrap { padding: 10px 24px 16px; display: flex; justify-content: flex-end; }
    .totals-card { min-width: 268px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
    .t-row.bal {
      background: #4f46e5; color: #fff; border-bottom: none; padding: 12px 16px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .t-row.bal .lbl { font-size: 12.5px; font-weight: 500; }
    .t-row.bal .amt { font-size: 17px; font-weight: 700; }

    /* ── Footer ───────────────────────────────────────── */
    .inv-footer {
      padding: 10px 24px; border-top: 1px solid #e2e8f0; background: #f8fafc;
      display: flex; justify-content: space-between; align-items: flex-end;
    }
    .f-left  { font-size: 11.5px; color: #94a3b8; }
    .f-left em { display: block; font-style: italic; color: #64748b; margin-bottom: 2px; }
    .f-right { text-align: right; }
    .f-name  { font-size: 13px; font-weight: 600; color: #0f172a; }
    .f-role  { font-size: 10.5px; color: #94a3b8; margin-top: 1px; font-weight: 400; }

    /* ── Utility ──────────────────────────────────────── */
    .c { text-align: center; }
    .r { text-align: right; }
    .muted { color: #94a3b8; }
    table.items th.r { text-align: right; }
    table.items th.c { text-align: center; }

    /* ── Print ────────────────────────────────────────── */
    @media print {
      html, body { background: #fff !important; padding: 0 !important; }
      .screen-pad { padding: 0 !important; }
      .no-print   { display: none !important; }
      .page { box-shadow: none !important; border-radius: 0 !important; overflow: visible !important; max-width: 100% !important; }
      .inv-header  { border-radius: 0 !important; }
      .meta-grid   { break-inside: avoid; }
      .summary-bar { break-inside: avoid; }
      .totals-wrap { break-inside: avoid; }
      .inv-footer  { break-inside: avoid; }
      table.items tbody tr { break-inside: avoid; }
      table.items thead { display: table-header-group; }
      table.items tfoot { display: table-footer-group; }
      @page { margin: 1.1cm 1.3cm; size: A4; }
    }
  </style>
</head>
<body>
<div class="screen-pad">

  <div class="no-print">
    <button class="print-btn" onclick="dlPDF()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Re-download PDF
    </button>
  </div>

  <div class="page">

    <!-- Watermark -->
    <svg class="watermark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 600" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#4f46e5"/>
      <rect x="96" y="248" width="320" height="36" rx="18" fill="white"/>
      <rect x="128" y="284" width="36" height="120" rx="18" fill="white"/>
      <rect x="348" y="284" width="36" height="120" rx="18" fill="white"/>
      <path d="M168 136 Q200 128 256 148 L256 248 Q200 228 168 236 Z" fill="rgba(255,255,255,0.92)"/>
      <path d="M344 136 Q312 128 256 148 L256 248 Q312 228 344 236 Z" fill="rgba(255,255,255,0.75)"/>
      <line x1="256" y1="148" x2="256" y2="248" stroke="rgba(79,70,229,0.5)" stroke-width="4"/>
      <text x="256" y="558" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="64" font-weight="700" fill="#4f46e5" letter-spacing="-1">TutorDesk</text>
    </svg>

    <div class="inv-header">
      <div>
        <div class="t-name">${teacherName}</div>
        <div class="t-role">Private Tutor</div>
      </div>
      <div class="inv-right">
        <div class="inv-word">Invoice</div>
        <div class="inv-num">${invNo}</div>
        <div class="inv-date">Issued ${issued}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-cell">
        <div class="m-label">Billed To</div>
        <div class="m-name">${student.name}</div>
        ${student.city ? `<div class="m-sub">${student.city}${student.timezone ? ` &middot; ${student.timezone}` : ''}</div>` : ''}
        <div class="rate-chip">${fmt(student.ratePerHour)} / ${isMonthly ? 'month' : 'hour'}</div>
      </div>
      <div class="meta-cell">
        <div class="m-label">Invoice Details</div>
        <div class="m-name" style="font-size:13.5px">${periodLabel}</div>
        <div class="m-sub" style="margin-top:3px">Ref: <strong style="color:#0f172a">${invNo}</strong></div>
      </div>
    </div>

    <div class="summary-bar">
      <div class="s-pill"><span class="s-dot"></span>Sessions: <strong>${filtered.length}</strong></div>
      <div class="s-pill"><span class="s-dot"></span>Hours: <strong>${totalHours.toFixed(1)}h</strong></div>
      <div class="s-pill"><span class="s-dot"></span>Total Billed: <strong>${fmt(totalEarned)}</strong></div>
    </div>

    <div class="tbl-wrap">
      <div class="tbl-label">Session Breakdown</div>
      <table class="items">
        <thead>
          <tr>
            <th style="width:17%">Date</th>
            <th style="width:28%">Type</th>
            <th class="c" style="width:11%">Duration</th>
            <th class="r" style="width:22%">Rate</th>
            <th class="r" style="width:22%">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${sessionRows || `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:18px">No sessions in this period</td></tr>`}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3">Total</td>
            <td></td>
            <td class="r">${fmt(totalEarned)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="totals-wrap">
      <div class="totals-card">
        <div class="t-row bal" style="border-radius:10px">
          <span class="lbl">Total Billed</span>
          <span class="amt">${fmt(totalEarned)}</span>
        </div>
      </div>
    </div>

    <div class="inv-footer">
      <div class="f-left">
        <em>Thank you for your continued trust.</em>
        <span>Generated via TutorDesk &middot; ${issued}</span>
      </div>
      <div class="f-right">
        <div class="f-name">${teacherName}</div>
        <div class="f-role">Private Tutor</div>
      </div>
    </div>

  </div>
</div>
</body>
</html>`
}
