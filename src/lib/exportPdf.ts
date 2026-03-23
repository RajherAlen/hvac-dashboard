import { format, parseISO } from 'date-fns';
import { formatHours } from './utils';
import type { WorkLog, Profile } from '../types';

// ─── Shared helpers ────────────────────────────────────────────────────────

const TOOLBAR_HTML = `
<div class="no-print" style="
  position:fixed;top:0;left:0;right:0;
  background:#fff;border-bottom:1px solid #e2e8f0;
  padding:10px 32px;display:flex;align-items:center;gap:10px;
  z-index:9999;box-shadow:0 2px 12px rgba(0,0,0,.08);
">
  <span style="flex:1;font-size:13px;font-weight:600;color:#1e293b;">HVAC Dashboard — Izvješće</span>

  <button onclick="window.print()" style="
    display:flex;align-items:center;gap:6px;
    padding:8px 16px;background:#f1f5f9;color:#475569;
    border:1px solid #e2e8f0;border-radius:8px;
    font-size:13px;font-weight:600;cursor:pointer;
  ">
    🖨️&nbsp; Ispiši
  </button>

  <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
    <button onclick="window.print()" style="
      display:flex;align-items:center;gap:6px;
      padding:8px 16px;background:#3b82f6;color:#fff;
      border:none;border-radius:8px;
      font-size:13px;font-weight:600;cursor:pointer;
    ">
      ⬇️&nbsp; Spremi kao PDF
    </button>
    <span style="font-size:10px;color:#94a3b8;">U tisku odaberi „Spremi kao PDF"</span>
  </div>

  <button onclick="window.close()" style="
    padding:8px 14px;background:#fff;color:#94a3b8;
    border:1px solid #e2e8f0;border-radius:8px;
    font-size:13px;cursor:pointer;
  ">✕</button>
</div>
<div class="no-print" style="height:72px;"></div>
`;

function openPrintWindow(html: string) {
  const win = window.open('', '_blank');
  if (win) {
    // Inject toolbar before </body> — no auto-print, user chooses
    win.document.write(html.replace('</body>', TOOLBAR_HTML + '</body>'));
    win.document.close();
  }
}

const baseStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; padding: 32px; color: #1e293b; font-size: 13px; }
  @media print { .no-print { display: none !important; } }
  .header { margin-bottom: 24px; border-bottom: 2px solid #3b82f6; padding-bottom: 16px; }
  .header h1 { font-size: 22px; font-weight: 700; }
  .header p { color: #64748b; margin-top: 4px; }
  .summary { display: flex; gap: 16px; margin-bottom: 24px; }
  .stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; flex: 1; }
  .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat-value { font-size: 22px; font-weight: 700; margin-top: 2px; }
  h2 { font-size: 14px; font-weight: 600; margin: 24px 0 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #3b82f6; color: white; text-align: left; padding: 8px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #f8fafc; }
  .hours { font-weight: 600; color: #2563eb; white-space: nowrap; }
  .generated { color: #94a3b8; font-size: 11px; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 12px; }
  .empty { color: #94a3b8; padding: 16px 0; }
`;

// ─── 1. All employees — selected period ────────────────────────────────────

export function exportDashboardPdf(
  logs: WorkLog[],
  employees: Profile[],
  periodLabel: string
) {
  const totalHours = logs.reduce((s, l) => s + Number(l.hours_worked), 0);

  const empRows = employees
    .map(emp => {
      const empLogs = logs.filter(l => l.employee_id === emp.id);
      return { emp, empLogs, hours: empLogs.reduce((s, l) => s + Number(l.hours_worked), 0) };
    })
    .filter(({ empLogs }) => empLogs.length > 0);

  const html = `<!DOCTYPE html>
<html lang="hr">
<head>
  <meta charset="UTF-8">
  <title>HVAC Izvješće — ${periodLabel}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="header">
    <h1>HVAC Dashboard — Izvješće</h1>
    <p>Period: <strong>${periodLabel}</strong></p>
    <p>Generirano: ${format(new Date(), 'dd.MM.yyyy HH:mm')}</p>
  </div>

  <div class="summary">
    <div class="stat">
      <div class="stat-label">Ukupni sati</div>
      <div class="stat-value">${formatHours(totalHours)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Ukupni unosi</div>
      <div class="stat-value">${logs.length}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Aktivnih zaposlenika</div>
      <div class="stat-value">${empRows.length}</div>
    </div>
  </div>

  <h2>Pregled po zaposleniku</h2>
  <table>
    <thead>
      <tr>
        <th>Zaposlenik</th><th>E-mail</th><th>Sati</th><th>Unosi</th>
      </tr>
    </thead>
    <tbody>
      ${empRows.map(({ emp, empLogs, hours }) => `<tr>
        <td>${emp.full_name}</td>
        <td>${emp.email}</td>
        <td class="hours">${formatHours(hours)}</td>
        <td>${empLogs.length}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <h2>Detalji radnih zapisa</h2>
  <table>
    <thead>
      <tr>
        <th>Datum</th><th>Zaposlenik</th><th>Opis zadatka</th><th>Lokacija</th><th>Sati</th>
      </tr>
    </thead>
    <tbody>
      ${logs.map(log => {
        const emp = (log as Record<string, unknown> & { profiles?: { full_name?: string } }).profiles;
        return `<tr>
          <td style="white-space:nowrap">${format(parseISO(log.log_date), 'dd.MM.yyyy')}</td>
          <td>${emp?.full_name ?? '—'}</td>
          <td>${log.task_description}</td>
          <td>${log.location}</td>
          <td class="hours">${formatHours(Number(log.hours_worked))}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  <p class="generated">Izvješće generirano automatski — HVAC Dashboard</p>
</body>
</html>`;

  openPrintWindow(html);
}

// ─── 2. Single employee — selected period ──────────────────────────────────

export function exportEmployeePdf(
  logs: WorkLog[],
  employee: Profile,
  periodLabel: string
) {
  const empLogs = logs.filter(l => l.employee_id === employee.id);
  const totalHours = empLogs.reduce((s, l) => s + Number(l.hours_worked), 0);

  const html = `<!DOCTYPE html>
<html lang="hr">
<head>
  <meta charset="UTF-8">
  <title>HVAC Izvješće — ${employee.full_name} — ${periodLabel}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="header">
    <h1>HVAC Dashboard — Izvješće zaposlenika</h1>
    <p>Zaposlenik: <strong>${employee.full_name}</strong></p>
    <p>E-mail: ${employee.email}</p>
    <p>Period: <strong>${periodLabel}</strong></p>
    <p>Generirano: ${format(new Date(), 'dd.MM.yyyy HH:mm')}</p>
  </div>

  <div class="summary">
    <div class="stat">
      <div class="stat-label">Ukupni sati</div>
      <div class="stat-value">${formatHours(totalHours)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Ukupni unosi</div>
      <div class="stat-value">${empLogs.length}</div>
    </div>
  </div>

  <h2>Radni zapisi</h2>
  ${empLogs.length === 0
    ? '<p class="empty">Nema radnih zapisa u ovom periodu.</p>'
    : `<table>
    <thead>
      <tr>
        <th>Datum</th><th>Opis zadatka</th><th>Lokacija</th><th>Sati</th>
      </tr>
    </thead>
    <tbody>
      ${empLogs.map(log => `<tr>
        <td style="white-space:nowrap">${format(parseISO(log.log_date), 'dd.MM.yyyy')}</td>
        <td>${log.task_description}</td>
        <td>${log.location}</td>
        <td class="hours">${formatHours(Number(log.hours_worked))}</td>
      </tr>`).join('')}
    </tbody>
  </table>`}

  <p class="generated">Izvješće generirano automatski — HVAC Dashboard</p>
</body>
</html>`;

  openPrintWindow(html);
}

// ─── 3. Per-employee sections — full month (page break between employees) ──

export function exportMonthPerEmployeePdf(
  logs: WorkLog[],
  employees: Profile[],
  monthLabel: string
) {
  const totalHours = logs.reduce((s, l) => s + Number(l.hours_worked), 0);
  const activeEmployees = employees.filter(emp => logs.some(l => l.employee_id === emp.id));

  const employeeSections = activeEmployees.map((emp, idx) => {
    const empLogs = logs.filter(l => l.employee_id === emp.id);
    const empHours = empLogs.reduce((s, l) => s + Number(l.hours_worked), 0);

    return `<div class="${idx === 0 ? 'first-section' : 'emp-section'}">
      <div class="header">
        <h1>${emp.full_name}</h1>
        <p>E-mail: ${emp.email}</p>
        <p>Period: <strong>${monthLabel}</strong></p>
      </div>
      <div class="summary">
        <div class="stat">
          <div class="stat-label">Ukupni sati</div>
          <div class="stat-value">${formatHours(empHours)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Ukupni unosi</div>
          <div class="stat-value">${empLogs.length}</div>
        </div>
      </div>
      <h2>Radni zapisi</h2>
      ${empLogs.length === 0
        ? '<p class="empty">Nema radnih zapisa u ovom periodu.</p>'
        : `<table>
        <thead>
          <tr>
            <th>Datum</th><th>Opis zadatka</th><th>Lokacija</th><th>Sati</th>
          </tr>
        </thead>
        <tbody>
          ${empLogs.map(log => `<tr>
            <td style="white-space:nowrap">${format(parseISO(log.log_date), 'dd.MM.yyyy')}</td>
            <td>${log.task_description}</td>
            <td>${log.location}</td>
            <td class="hours">${formatHours(Number(log.hours_worked))}</td>
          </tr>`).join('')}
        </tbody>
      </table>`}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="hr">
<head>
  <meta charset="UTF-8">
  <title>HVAC Izvješće po zaposlenicima — ${monthLabel}</title>
  <style>
    ${baseStyles}
    .emp-section { page-break-before: always; break-before: page; padding-top: 32px; }
    .first-section { padding-top: 0; }
  </style>
</head>
<body>
  <!-- Cover summary -->
  <div class="header">
    <h1>HVAC Dashboard — Miesečno izvješće po zaposlenicima</h1>
    <p>Period: <strong>${monthLabel}</strong></p>
    <p>Generirano: ${format(new Date(), 'dd.MM.yyyy HH:mm')}</p>
  </div>

  <div class="summary">
    <div class="stat">
      <div class="stat-label">Ukupni sati</div>
      <div class="stat-value">${formatHours(totalHours)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Aktivnih zaposlenika</div>
      <div class="stat-value">${activeEmployees.length}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Ukupni unosi</div>
      <div class="stat-value">${logs.length}</div>
    </div>
  </div>

  <h2>Pregled po zaposleniku</h2>
  <table>
    <thead>
      <tr>
        <th>Zaposlenik</th><th>E-mail</th><th>Sati</th><th>Unosi</th>
      </tr>
    </thead>
    <tbody>
      ${activeEmployees.map(emp => {
        const empLogs = logs.filter(l => l.employee_id === emp.id);
        const empHours = empLogs.reduce((s, l) => s + Number(l.hours_worked), 0);
        return `<tr>
          <td>${emp.full_name}</td>
          <td>${emp.email}</td>
          <td class="hours">${formatHours(empHours)}</td>
          <td>${empLogs.length}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  ${employeeSections}

  <p class="generated">Izvješće generirano automatski — HVAC Dashboard</p>
</body>
</html>`;

  openPrintWindow(html);
}
