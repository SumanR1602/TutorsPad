/**
 * receiptTemplate.js
 * Pure function — takes pre-computed receipt data, returns a full HTML string.
 * No business logic, no imports, no side effects.
 */
export function buildReceiptHTML({
  recNo, teacherName, issued, student, isMonthly,
  payment, periodLabel, sessionRows, sessionCount, totalHours,
  carryForward, periodDue, creditBalance, creditHours, fmt,
}) {
  const balancePositive = creditBalance >= 0
  const balanceLabel    = balancePositive ? 'Credit Balance' : 'Balance Due'
  const balanceColor    = balancePositive ? '#16a34a' : '#dc2626'
  const balanceBg       = balancePositive ? '#f0fdf4' : '#fef2f2'
  const balanceBorder   = balancePositive ? '#bbf7d0' : '#fecaca'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Receipt_${student.name.replace(/\s+/g, '-')}_${recNo}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {
      box-sizing: border-box; margin: 0; padding: 0;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    body {
      font-family: 'Inter', 'Segoe UI', -apple-system, Arial, sans-serif;
      background: #f0fdf4;
      color: #1e293b; font-size: 12px; line-height: 1.5;
    }
    .screen-pad { padding: 14px 12px 28px; }

    /* ── Print button ─────────────────────────────────── */
    .no-print { display: flex; justify-content: center; margin-bottom: 12px; }
    .print-btn {
      background: #16a34a; color: #fff; border: none;
      padding: 9px 24px; border-radius: 8px; font-size: 13px;
      font-weight: 600; cursor: pointer;
      display: inline-flex; align-items: center; gap: 7px;
    }
    .print-btn:hover { background: #15803d; }

    /* ── Card ─────────────────────────────────────────── */
    .page {
      position: relative; background: #fff;
      max-width: 760px; margin: 0 auto;
      overflow: hidden;
      box-shadow: 0 4px 28px rgba(22,163,74,.13);
    }

    /* ── Watermark ────────────────────────────────────── */
    .wm-svg {
      position: absolute; top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none; z-index: 2;
    }
    .page > *:not(.wm-svg) { position: relative; z-index: 1; }

    /* ── Header ───────────────────────────────────────── */
    .rec-header {
      background: linear-gradient(135deg, #15803d 0%, #16a34a 100%);
      padding: 14px 24px;
      display: flex; justify-content: space-between; align-items: flex-start; color: #fff;
    }
    .t-name  { font-size: 16px; font-weight: 600; letter-spacing: -.2px; }
    .t-role  { font-size: 10px; opacity: .65; margin-top: 2px; text-transform: uppercase; letter-spacing: .9px; }
    .rec-right { text-align: right; }
    .rec-word  { font-size: 8.5px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; opacity: .65; }
    .rec-num   { font-size: 15px; font-weight: 700; margin-top: 1px; }
    .rec-date  { font-size: 10px; opacity: .65; margin-top: 2px; }

    /* ── Meta grid ────────────────────────────────────── */
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #e2e8f0; }
    .meta-cell { padding: 10px 24px; }
    .meta-cell + .meta-cell { border-left: 1px solid #e2e8f0; }
    .m-label { font-size: 8px; font-weight: 600; letter-spacing: 1.8px; text-transform: uppercase; color: #16a34a; margin-bottom: 4px; }
    .m-name  { font-size: 13px; font-weight: 600; color: #0f172a; }
    .m-sub   { font-size: 11px; color: #64748b; margin-top: 2px; }
    .rate-chip {
      display: inline-block; margin-top: 8px;
      background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0;
      border-radius: 100px; padding: 2px 11px; font-size: 11.5px; font-weight: 500;
    }

    /* ── Payment highlight ────────────────────────────── */
    .payment-box {
      margin: 14px 24px; padding: 14px 18px;
      background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
      border: 1px solid #bbf7d0; border-radius: 12px;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
    }
    .pay-label { font-size: 9px; font-weight: 600; letter-spacing: 1.6px; text-transform: uppercase; color: #15803d; margin-bottom: 3px; }
    .pay-amount { font-size: 28px; font-weight: 700; color: #15803d; letter-spacing: -.5px; }
    .pay-date   { font-size: 11px; color: #64748b; margin-top: 2px; }
    .pay-note   { font-size: 11px; color: #475569; margin-top: 2px; font-style: italic; }
    .pay-badge  {
      background: #16a34a; color: #fff;
      border-radius: 100px; padding: 4px 14px;
      font-size: 11px; font-weight: 600; white-space: nowrap;
    }

    /* ── Table ────────────────────────────────────────── */
    .tbl-wrap  { padding: 12px 24px 0; }
    .tbl-label { font-size: 8px; font-weight: 600; letter-spacing: 1.8px; text-transform: uppercase; color: #94a3b8; margin-bottom: 7px; }

    table.items { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.items thead { display: table-header-group; }
    table.items tfoot { display: table-footer-group; }
    table.items thead th {
      background: #15803d; color: rgba(255,255,255,.9);
      padding: 6px 10px; font-size: 9px; font-weight: 600;
      letter-spacing: .8px; text-transform: uppercase; text-align: left;
    }
    table.items thead th:first-child { border-radius: 7px 0 0 7px; }
    table.items thead th:last-child  { border-radius: 0 7px 7px 0; }
    table.items tbody tr:nth-child(even) { background: #f8fafc; }
    table.items tbody td { padding: 5px 10px; font-size: 11.5px; color: #374151; border-bottom: 1px solid #f1f5f9; }
    table.items tbody tr:last-child td { border-bottom: none; }
    table.items tfoot td {
      border-top: 2px solid #e2e8f0; padding: 7px 10px;
      font-size: 12px; font-weight: 600; color: #0f172a; background: #fff;
    }
    .badge { display: inline-block; padding: 2px 9px; border-radius: 100px; font-size: 10.5px; font-weight: 500; }
    .badge-regular { background: #dcfce7; color: #15803d; }
    .badge-extra   { background: #fef3c7; color: #92400e; }
    .c { text-align: center; }
    .r { text-align: right; }
    .muted { color: #94a3b8; }
    table.items th.r { text-align: right; }
    table.items th.c { text-align: center; }

    /* ── Financial summary ────────────────────────────── */
    .summary-wrap { padding: 12px 24px 16px; display: flex; justify-content: flex-end; }
    .summary-card { min-width: 300px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
    .sum-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 16px; border-bottom: 1px solid #f1f5f9; font-size: 11.5px;
    }
    .sum-row:last-child { border-bottom: none; }
    .sum-row .lbl { color: #64748b; }
    .sum-row .val { font-weight: 600; color: #0f172a; }
    .sum-row.total {
      background: #f8fafc; border-top: 2px solid #e2e8f0;
      font-size: 12px; padding: 10px 16px;
    }
    .balance-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 16px; font-size: 13px; font-weight: 600;
    }

    /* ── Footer ───────────────────────────────────────── */
    .rec-footer {
      padding: 10px 24px; border-top: 1px solid #e2e8f0; background: #f8fafc;
      display: flex; justify-content: space-between; align-items: flex-end;
    }
    .f-left  { font-size: 11.5px; color: #94a3b8; }
    .f-left em { display: block; font-style: italic; color: #64748b; margin-bottom: 2px; }
    .f-right { text-align: right; }
    .f-name  { font-size: 13px; font-weight: 600; color: #0f172a; }
    .f-role  { font-size: 10.5px; color: #94a3b8; margin-top: 1px; }

    /* ── Print ────────────────────────────────────────── */
    @media print {
      html, body { background: #fff !important; padding: 0 !important; }
      .screen-pad { padding: 0 !important; }
      .no-print   { display: none !important; }
      .page { box-shadow: none !important; overflow: visible !important; max-width: 100% !important; }
      .rec-header  { border-radius: 0 !important; }
      .meta-grid   { break-inside: avoid; }
      .payment-box { break-inside: avoid; }
      .summary-wrap { break-inside: avoid; }
      .rec-footer  { break-inside: avoid; }
      table.items tbody tr { break-inside: avoid; }
      table.items thead { display: table-header-group; }
      table.items tfoot { display: table-footer-group; }
      @page { margin: 1.1cm 1.3cm; size: A4; }
    }
  </style>
  <script>
    function dlPDF() {
      if (typeof html2pdf === 'undefined') { window.print(); return; }
      html2pdf().set({
        margin: [6,6,6,6],
        filename: '${recNo}.pdf',
        image: { type: 'jpeg', quality: 0.97 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      }).from(document.querySelector('.page')).save();
    }
  <\/script>
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
      Download PDF
    </button>
  </div>

  <div class="page">

    <!-- Watermark -->
    <svg class="wm-svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <text x="380" y="560" text-anchor="middle"
        transform="rotate(-35, 380, 560)"
        font-family="Inter,Arial,sans-serif" font-size="72" font-weight="700"
        fill="#15803d" opacity="0.12" letter-spacing="10">TutorDesk</text>
    </svg>

    <!-- Header -->
    <div class="rec-header">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0">
          <svg style="width:36px;height:36px" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#4338ca"/></linearGradient></defs>
            <rect width="512" height="512" rx="112" fill="url(#logo-grad)"/>
            <rect x="96" y="248" width="320" height="36" rx="18" fill="white"/>
            <rect x="128" y="284" width="36" height="120" rx="18" fill="white"/>
            <rect x="348" y="284" width="36" height="120" rx="18" fill="white"/>
            <path d="M168 136 Q200 128 256 148 L256 248 Q200 228 168 236 Z" fill="rgba(255,255,255,0.92)"/>
            <path d="M344 136 Q312 128 256 148 L256 248 Q312 228 344 236 Z" fill="rgba(255,255,255,0.75)"/>
            <line x1="256" y1="148" x2="256" y2="248" stroke="rgba(79,70,229,0.4)" stroke-width="4"/>
            <rect x="310" y="118" width="14" height="72" rx="7" fill="rgba(255,255,255,0.6)" transform="rotate(20 317 154)"/>
            <polygon points="317,186 310,202 324,202" fill="rgba(255,255,255,0.5)" transform="rotate(20 317 154)"/>
          </svg>
          <span style="font-size:7px;font-weight:700;color:rgba(255,255,255,0.75);letter-spacing:2px;text-transform:uppercase">TutorDesk</span>
        </div>
        <div>
          <div class="t-name">${teacherName}</div>
          <div class="t-role">Private Tutor</div>
        </div>
      </div>
      <div class="rec-right">
        <div class="rec-word">Receipt</div>
        <div class="rec-num">${recNo}</div>
        <div class="rec-date">Issued ${issued}</div>
      </div>
    </div>

    <!-- Received From / Received By -->
    <div class="meta-grid">
      <div class="meta-cell">
        <div class="m-label">Received From</div>
        <div class="m-name">${student.name}</div>
        ${student.city ? `<div class="m-sub">${student.city}${student.timezone ? ` &middot; ${student.timezone}` : ''}</div>` : ''}
        <div class="rate-chip">${fmt(student.ratePerHour)} / ${isMonthly ? 'month' : 'hour'}</div>
      </div>
      <div class="meta-cell">
        <div class="m-label">Received By</div>
        <div class="m-name">${teacherName}</div>
        <div class="m-sub" style="margin-top:3px">Ref: <strong style="color:#0f172a">${recNo}</strong></div>
      </div>
    </div>

    <!-- Payment highlight -->
    <div class="payment-box">
      <div>
        <div class="pay-label">Amount Received</div>
        <div class="pay-amount">${fmt(payment.amount)}</div>
        <div class="pay-date">Paid on ${payment.date}</div>
        ${payment.note ? `<div class="pay-note">"${payment.note}"</div>` : ''}
      </div>
      <div class="pay-badge">✓ Payment Confirmed</div>
    </div>

    <!-- Sessions table -->
    <div class="tbl-wrap">
      <div class="tbl-label">Sessions This Period &nbsp;<span style="font-weight:400;color:#94a3b8">(${periodLabel})</span></div>
      <table class="items">
        <thead>
          <tr>
            <th style="width:18%">Date</th>
            <th style="width:27%">Type</th>
            <th class="c" style="width:11%">Hrs</th>
            <th class="r" style="width:22%">Rate</th>
            <th class="r" style="width:22%">Cost</th>
          </tr>
        </thead>
        <tbody>
          ${sessionRows || `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:18px">No sessions in this period</td></tr>`}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3">${sessionCount} session${sessionCount !== 1 ? 's' : ''} · ${totalHours.toFixed(1)}h</td>
            <td></td>
            <td class="r">${fmt(periodDue)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Financial summary -->
    <div class="summary-wrap">
      <div class="summary-card">
        ${carryForward !== 0 ? `
        <div class="sum-row">
          <span class="lbl">Carry-forward balance</span>
          <span class="val" style="color:${carryForward >= 0 ? '#16a34a' : '#dc2626'}">
            ${carryForward >= 0 ? '+' : '&minus;'}&nbsp;${fmt(Math.abs(carryForward))}
          </span>
        </div>` : ''}
        <div class="sum-row">
          <span class="lbl">Sessions this period</span>
          <span class="val" style="color:#dc2626">&minus; ${fmt(periodDue)}</span>
        </div>
        <div class="sum-row total">
          <span class="lbl">This payment received</span>
          <span class="val" style="color:#16a34a">+ ${fmt(payment.amount)}</span>
        </div>
        <div class="balance-row" style="background:${balanceBg};border-top:2px solid ${balanceBorder}">
          <span style="color:${balanceColor};font-size:12.5px">${balanceLabel}</span>
          <span style="color:${balanceColor};font-size:18px;font-weight:700">${fmt(Math.abs(creditBalance))}</span>
        </div>
        ${!isMonthly && creditHours !== null ? `
        <div style="text-align:center;padding:7px 16px;background:#f8fafc;font-size:11px;color:#64748b;border-top:1px solid #f1f5f9">
          ${balancePositive
            ? `≈ <strong style="color:${balanceColor}">${Math.abs(creditHours).toFixed(1)} hrs</strong> of sessions pre-paid`
            : `<strong style="color:${balanceColor}">${Math.abs(creditHours).toFixed(1)} hrs</strong> of sessions not yet paid`
          }
        </div>` : ''}
      </div>
    </div>

    <!-- Footer -->
    <div class="rec-footer">
      <div class="f-left">
        <em>Thank you for your payment.</em>
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
