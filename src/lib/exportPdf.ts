import { toast } from 'sonner';
import { formatNumeric, formatDateTime } from './format-date';
import { formatHours } from './utils';
import type { WorkLog, Profile, ClientWithSites, WorkLogWithEmployee } from '../types';
import { DEVICE_KIND_LABEL, siteAddress, CLIENT_KIND_LABEL } from './clients';

// ─── Shared helpers ────────────────────────────────────────────────────────

/** HTML escaping – vrijednosti iz baze (opis, lokacija, ime) ne smiju se ubaciti kao markup. */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Vraća false ako je preglednik blokirao skočni prozor. */
function openPrintWindow(html: string): boolean {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  // Auto-print on desktop after content loads; mobile users print via browser menu
  if (win) {
    setTimeout(() => {
      try { win.print(); } catch { /* silent on mobile */ }
    }, 800);
  }
  // Revoke blob URL after enough time for the window to have loaded
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return !!win;
}

const baseStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; padding: 32px; color: #1e293b; font-size: 13px; }
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
): boolean {
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
  <title>HVAC Izvješće — ${esc(periodLabel)}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="header">
    <h1>HVAC Dashboard — Izvješće</h1>
    <p>Period: <strong>${esc(periodLabel)}</strong></p>
    <p>Generirano: ${formatDateTime(new Date())}</p>
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
        <td>${esc(emp.full_name)}</td>
        <td>${esc(emp.email)}</td>
        <td class="hours">${formatHours(hours)}</td>
        <td>${empLogs.length}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <h2>Detalji radnih zapisa</h2>
  <table>
    <thead>
      <tr>
        <th>Datum</th><th>Zaposlenik</th><th>Opis zadatka</th><th>Lokacija</th><th>Napomena</th><th>Sati</th>
      </tr>
    </thead>
    <tbody>
      ${logs.map(log => {
        const emp = (log as Record<string, unknown> & { profiles?: { full_name?: string } }).profiles;
        return `<tr>
          <td style="white-space:nowrap">${formatNumeric(log.log_date)}</td>
          <td>${esc(emp?.full_name ?? '—')}</td>
          <td>${esc(log.task_description)}</td>
          <td>${esc(log.location)}</td>
          <td style="color:#64748b">${esc(log.notes ?? '')}</td>
          <td class="hours">${formatHours(Number(log.hours_worked))}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  <p class="generated">Izvješće generirano automatski — HVAC Dashboard</p>
</body>
</html>`;

  return openPrintWindow(html);
}

// ─── 2. Single employee — selected period ──────────────────────────────────

export function exportEmployeePdf(
  logs: WorkLog[],
  employee: Profile,
  periodLabel: string
): boolean {
  const empLogs = logs.filter(l => l.employee_id === employee.id);
  const totalHours = empLogs.reduce((s, l) => s + Number(l.hours_worked), 0);

  const html = `<!DOCTYPE html>
<html lang="hr">
<head>
  <meta charset="UTF-8">
  <title>HVAC Izvješće — ${esc(employee.full_name)} — ${esc(periodLabel)}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="header">
    <h1>HVAC Dashboard — Izvješće zaposlenika</h1>
    <p>Zaposlenik: <strong>${esc(employee.full_name)}</strong></p>
    <p>E-mail: ${esc(employee.email)}</p>
    <p>Period: <strong>${esc(periodLabel)}</strong></p>
    <p>Generirano: ${formatDateTime(new Date())}</p>
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
        <th>Datum</th><th>Opis zadatka</th><th>Lokacija</th><th>Napomena</th><th>Sati</th>
      </tr>
    </thead>
    <tbody>
      ${empLogs.map(log => `<tr>
        <td style="white-space:nowrap">${formatNumeric(log.log_date)}</td>
        <td>${esc(log.task_description)}</td>
        <td>${esc(log.location)}</td>
        <td style="color:#64748b">${esc(log.notes ?? '')}</td>
        <td class="hours">${formatHours(Number(log.hours_worked))}</td>
      </tr>`).join('')}
    </tbody>
  </table>`}

  <p class="generated">Izvješće generirano automatski — HVAC Dashboard</p>
</body>
</html>`;

  return openPrintWindow(html);
}

// ─── 3. Per-employee sections — full month (page break between employees) ──

export function exportMonthPerEmployeePdf(
  logs: WorkLog[],
  employees: Profile[],
  monthLabel: string
): boolean {
  const totalHours = logs.reduce((s, l) => s + Number(l.hours_worked), 0);
  const activeEmployees = employees.filter(emp => logs.some(l => l.employee_id === emp.id));

  const employeeSections = activeEmployees.map((emp, idx) => {
    const empLogs = logs.filter(l => l.employee_id === emp.id);
    const empHours = empLogs.reduce((s, l) => s + Number(l.hours_worked), 0);

    return `<div class="${idx === 0 ? 'first-section' : 'emp-section'}">
      <div class="header">
        <h1>${esc(emp.full_name)}</h1>
        <p>E-mail: ${esc(emp.email)}</p>
        <p>Period: <strong>${esc(monthLabel)}</strong></p>
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
            <th>Datum</th><th>Opis zadatka</th><th>Lokacija</th><th>Napomena</th><th>Sati</th>
          </tr>
        </thead>
        <tbody>
          ${empLogs.map(log => `<tr>
            <td style="white-space:nowrap">${formatNumeric(log.log_date)}</td>
            <td>${esc(log.task_description)}</td>
            <td>${esc(log.location)}</td>
            <td style="color:#64748b">${esc(log.notes ?? '')}</td>
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
  <title>HVAC Izvješće po zaposlenicima — ${esc(monthLabel)}</title>
  <style>
    ${baseStyles}
    .emp-section { page-break-before: always; break-before: page; padding-top: 32px; }
    .first-section { padding-top: 0; }
  </style>
</head>
<body>
  <!-- Cover summary -->
  <div class="header">
    <h1>HVAC Dashboard — Mjesečno izvješće po zaposlenicima</h1>
    <p>Period: <strong>${esc(monthLabel)}</strong></p>
    <p>Generirano: ${formatDateTime(new Date())}</p>
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
          <td>${esc(emp.full_name)}</td>
          <td>${esc(emp.email)}</td>
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

  return openPrintWindow(html);
}

// ─── 4. Izvješće za klijenta – posjeti, sati i servisirani uređaji ──────────

export function exportClientPdf(
  client: ClientWithSites,
  logs: WorkLogWithEmployee[],
  periodLabel: string,
  logDevices: Record<string, string[]>,
): boolean {
  const totalHours = logs.reduce((s, l) => s + Number(l.hours_worked), 0);
  const visits = new Set(logs.map(l => l.log_date)).size;
  const siteById = new Map(client.sites.map(s => [s.id, s]));
  const deviceById = new Map(client.sites.flatMap(s => s.devices.map(d => [d.id, d] as const)));
  const deviceName = (id: string) => {
    const d = deviceById.get(id);
    if (!d) return '';
    return [[d.brand, d.model].filter(Boolean).join(' ') || DEVICE_KIND_LABEL[d.kind], d.serial_number ? `(S/N ${d.serial_number})` : '']
      .filter(Boolean).join(' ');
  };
  const multiSite = client.sites.length > 1;

  const html = `<!DOCTYPE html>
<html lang="hr">
<head>
  <meta charset="UTF-8">
  <title>Izvješće – ${esc(client.name)} – ${esc(periodLabel)}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="header">
    <h1>${esc(client.name)}</h1>
    <p>${esc(CLIENT_KIND_LABEL[client.kind])}${client.oib ? ` · OIB ${esc(client.oib)}` : ''}</p>
    <p>${client.sites.filter(s => !s.archived_at).map(s => esc(siteAddress(s))).join('<br>')}</p>
    <p>Period: <strong>${esc(periodLabel)}</strong></p>
    <p>Generirano: ${formatDateTime(new Date())}</p>
  </div>

  <div class="summary">
    <div class="stat"><div class="stat-label">Ukupni sati</div><div class="stat-value">${formatHours(totalHours)}</div></div>
    <div class="stat"><div class="stat-label">Posjeti</div><div class="stat-value">${visits}</div></div>
    <div class="stat"><div class="stat-label">Unosi</div><div class="stat-value">${logs.length}</div></div>
  </div>

  <h2>Obavljeni radovi</h2>
  ${logs.length === 0 ? '<p class="empty">U ovom periodu nije bilo posjeta.</p>' : `<table>
    <thead><tr><th>Datum</th>${multiSite ? '<th>Objekt</th>' : ''}<th>Opis</th><th>Uređaji</th><th>Tehničar</th><th>Sati</th></tr></thead>
    <tbody>
      ${[...logs].sort((a, b) => a.log_date.localeCompare(b.log_date)).map(l => {
        const site = l.site_id ? siteById.get(l.site_id) : undefined;
        return `<tr>
          <td style="white-space:nowrap">${formatNumeric(l.log_date)}</td>
          ${multiSite ? `<td>${esc(site ? siteAddress(site) : l.location)}</td>` : ''}
          <td>${esc(l.task_description)}${l.notes ? `<br><span style="color:#64748b">${esc(l.notes)}</span>` : ''}</td>
          <td>${(logDevices[l.id] ?? []).map(id => esc(deviceName(id))).join('<br>')}</td>
          <td>${esc(l.profiles?.full_name ?? '—')}</td>
          <td class="hours">${formatHours(Number(l.hours_worked))}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`}

  <p class="generated">Izvješće generirano automatski — HVAC Dashboard</p>
</body>
</html>`;

  return openPrintWindow(html);
}

// ─── Povratna informacija korisniku ─────────────────────────────────────────

export function reportExport(ok: boolean) {
  if (ok) {
    toast.success('Izvješće otvoreno u novoj kartici', {
      description: 'U dijalogu za ispis odaberite "Spremi kao PDF".',
    });
  } else {
    toast.error('Preglednik je blokirao skočni prozor', {
      description: 'Dopustite skočne prozore za ovu stranicu pa pokušajte ponovno.',
    });
  }
}
