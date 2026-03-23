import { format, parseISO } from 'date-fns';
import { formatHours } from './utils';
import type { WorkLog, Profile } from '../types';

export function exportDashboardPdf(
  logs: WorkLog[],
  employees: Profile[],
  periodLabel: string
) {
  const totalHours = logs.reduce((s, l) => s + Number(l.hours_worked), 0);

  const empRows = employees
    .map(emp => {
      const empLogs = logs.filter(l => l.employee_id === emp.id);
      return {
        emp,
        empLogs,
        hours: empLogs.reduce((s, l) => s + Number(l.hours_worked), 0),
      };
    })
    .filter(({ empLogs }) => empLogs.length > 0);

  const html = `<!DOCTYPE html>
<html lang="hr">
<head>
  <meta charset="UTF-8">
  <title>HVAC Izvješće — ${periodLabel}</title>
  <style>
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
  </style>
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
        <th>Zaposlenik</th>
        <th>E-mail</th>
        <th>Sati</th>
        <th>Unosi</th>
      </tr>
    </thead>
    <tbody>
      ${empRows
        .map(
          ({ emp, empLogs, hours }) => `
        <tr>
          <td>${emp.full_name}</td>
          <td>${emp.email}</td>
          <td class="hours">${formatHours(hours)}</td>
          <td>${empLogs.length}</td>
        </tr>`
        )
        .join('')}
    </tbody>
  </table>

  <h2>Detalji radnih zapisa</h2>
  <table>
    <thead>
      <tr>
        <th>Datum</th>
        <th>Zaposlenik</th>
        <th>Opis zadatka</th>
        <th>Lokacija</th>
        <th>Sati</th>
      </tr>
    </thead>
    <tbody>
      ${logs
        .map(log => {
          const emp = (log as Record<string, unknown> & { profiles?: { full_name?: string } }).profiles;
          return `<tr>
          <td style="white-space:nowrap">${format(parseISO(log.log_date), 'dd.MM.yyyy')}</td>
          <td>${emp?.full_name ?? '—'}</td>
          <td>${log.task_description}</td>
          <td>${log.location}</td>
          <td class="hours">${formatHours(Number(log.hours_worked))}</td>
        </tr>`;
        })
        .join('')}
    </tbody>
  </table>

  <p class="generated">Izvješće generirano automatski — HVAC Dashboard</p>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }
}
