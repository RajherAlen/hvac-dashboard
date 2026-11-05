import { useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Phone, Mail, PlusCircle, Trash2, Clock, ClipboardList, Download, ChevronRight, TrendingUp,
  MoreHorizontal, UserX, UserCheck, Info, History,
} from 'lucide-react';
import { EmployeeChangesDialog } from '../../components/WorkLogHistory';
import { useEmployee, useDeleteEmployee, useSetEmployeeActive } from '../../hooks/useEmployees';
import { BucketEntriesDialog } from '../../components/BucketEntriesDialog';
import type { Bucket } from '../../lib/period';
import { formatDay } from '../../lib/format-date';
import { useWorkLogs, useWorkLogCount } from '../../hooks/useWorkLogs';
import { usePeriod } from '../../hooks/usePeriod';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { HoursChart } from '../../components/HoursChart';
import { EmployeeTimeline } from '../../components/EmployeeTimeline';
import { WorkLogForm } from '../../components/WorkLogForm';
import { ViewToggle, PeriodStepper } from '../../components/PeriodNav';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Field } from '../../components/ui/form';
import { DatePicker } from '../../components/ui/DatePicker';
import { formatHours, todayISO, initials, pluralHr } from '../../lib/utils';
import { elapsedWorkdays, sumHours, isStaff } from '../../lib/period';
import { useWorkCalendar } from '../../hooks/useAbsences';
import { errorMessage } from '../../lib/errors';
import { toISODate } from '../../lib/format-date';
import { subDays } from 'date-fns';
import { exportEmployeePdf, reportExport } from '../../lib/exportPdf';

export function AdminEmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [openBucket, setOpenBucket] = useState<Bucket | null>(null);
  const deleteEmployee = useDeleteEmployee();
  const setActive = useSetEmployeeActive();
  const today = todayISO();

  // Period u URL-u (?view=month&date=2026-11) – pokreće sve na stranici
  const period = usePeriod('month');

  const { data: employee, isLoading: empLoading } = useEmployee(id);
  useDocumentTitle(employee?.full_name ?? (empLoading ? null : 'Zaposlenik nije pronađen'));

  const { data: logs = [], isLoading: logsLoading } = useWorkLogs({ employeeId: id, startDate: period.start, endDate: period.end });
  const { data: todayLogs = [] } = useWorkLogs({ employeeId: id, startDate: today, endDate: today });
  const { data: totalLogCount } = useWorkLogCount(id);
  const { cal } = useWorkCalendar(period.start, period.end);

  const todayHours = sumHours(todayLogs);
  const periodHours = sumHours(logs);
  const workdays = elapsedWorkdays(period.days, todayHours > 0 ? today : toISODate(subDays(new Date(), 1)), cal, id);
  const avgPerDay = workdays > 0 ? periodHours / workdays : 0;
  const isActiveToday = todayHours > 0;
  const chartGroupBy = period.days.length > 31 ? 'week' : 'day';

  const handleDelete = async () => {
    if (!id || !employee) return;
    await deleteEmployee.mutateAsync(id);
    toast.success(`Zaposlenik ${employee.full_name} obrisan`);
    navigate('/admin/employees', { replace: true });
  };

  const handleSetActive = async (active: boolean) => {
    if (!id || !employee) return;
    await setActive.mutateAsync({ employeeId: id, active });
    toast.success(active ? `${employee.full_name} ponovno je aktivan` : `${employee.full_name} je deaktiviran`, {
      description: active ? 'Može se ponovno prijaviti i upisivati rad.' : 'Prijava je onemogućena, povijest sati je sačuvana.',
    });
  };

  const handleExport = () => {
    if (!employee) return;
    reportExport(exportEmployeePdf(logs, employee, period.label));
  };

  // ── Učitavanje / nije pronađen ────────────────────────────────────────
  if (empLoading) {
    return (
      <div className="px-4 py-4 sm:p-6 space-y-4" aria-busy="true">
        <div className="h-5 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-24 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="h-12 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {[0, 1, 2].map(i => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
        <span className="sr-only">Učitavanje…</span>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="px-4 py-4 sm:p-6">
        <p className="text-slate-700">Zaposlenik nije pronađen.</p>
        <Link to="/admin/employees" className="text-blue-700 text-sm mt-2 inline-block hover:underline">← Natrag na zaposlenike</Link>
      </div>
    );
  }

  const isAdmin = !isStaff(employee);
  const isInactive = !!employee.deactivated_at;
  const periodNoun = period.view === 'week' ? 'tjedan' : period.view === 'month' ? 'mjesec' : 'period';

  const actions = (
    <>
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-0 px-3.5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
      >
        <PlusCircle size={15} aria-hidden="true" /> Dodaj unos
      </button>
      <button
        type="button"
        onClick={handleExport}
        disabled={logsLoading}
        className="inline-flex items-center justify-center gap-1.5 min-h-11 sm:min-h-0 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors"
        aria-label={`Izvezi PDF: ${employee.full_name}, ${period.label}`}
      >
        <Download size={15} aria-hidden="true" /> <span className="hidden sm:inline">PDF</span>
      </button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          className="inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 px-2.5 py-2 text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg data-[state=open]:bg-slate-100"
          aria-label="Više radnji"
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6} collisionPadding={12}
            className="z-50 min-w-60 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5">
            <DropdownMenu.Item
              onSelect={() => setShowChanges(true)}
              className="flex items-start gap-3 px-3 py-2.5 min-h-11 rounded-lg text-sm text-slate-800 outline-none cursor-pointer data-[highlighted]:bg-slate-100"
            >
              <History size={16} className="text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
              <span><span className="block font-medium">Povijest izmjena</span><span className="block text-xs text-slate-600">Tko je i kada mijenjao ili brisao unose</span></span>
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
            {isInactive ? (
              <DropdownMenu.Item
                onSelect={() => { void handleSetActive(true).catch(e => toast.error(errorMessage(e))); }}
                className="flex items-start gap-3 px-3 py-2.5 min-h-11 rounded-lg text-sm text-slate-800 outline-none cursor-pointer data-[highlighted]:bg-slate-100"
              >
                <UserCheck size={16} className="text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
                <span><span className="block font-medium">Ponovno aktiviraj</span><span className="block text-xs text-slate-600">Vraća mogućnost prijave</span></span>
              </DropdownMenu.Item>
            ) : (
              <DropdownMenu.Item
                onSelect={() => { setActive.reset(); setShowDeactivate(true); }}
                className="flex items-start gap-3 px-3 py-2.5 min-h-11 rounded-lg text-sm text-slate-800 outline-none cursor-pointer data-[highlighted]:bg-slate-100"
              >
                <UserX size={16} className="text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
                <span><span className="block font-medium">Deaktiviraj</span><span className="block text-xs text-slate-600">Onemogućuje prijavu, čuva povijest sati</span></span>
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
            <DropdownMenu.Item
              onSelect={() => { deleteEmployee.reset(); setShowDelete(true); }}
              className="flex items-start gap-3 px-3 py-2.5 min-h-11 rounded-lg text-sm text-red-700 outline-none cursor-pointer data-[highlighted]:bg-red-50"
            >
              <Trash2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span><span className="block font-medium">Trajno obriši…</span><span className="block text-xs text-red-700/80">Briše račun i sve unose</span></span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );

  return (
    <div className="px-4 py-4 sm:p-6 space-y-4 sm:space-y-5">
      {/* Breadcrumb */}
      <nav aria-label="Putanja">
        <ol className="flex items-center gap-1.5 text-sm text-slate-600">
          <li><Link to="/admin/employees" className="hover:text-slate-900 hover:underline">Zaposlenici</Link></li>
          <li aria-hidden="true"><ChevronRight size={14} className="text-slate-400" /></li>
          <li aria-current="page" className="font-medium text-slate-900 truncate">{employee.full_name}</li>
        </ol>
      </nav>

      {/* ── Zaglavlje zaposlenika ───────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="relative shrink-0" aria-hidden="true">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-blue-600 flex items-center justify-center">
              <span className="text-base sm:text-lg font-bold text-white tracking-wide">{initials(employee.full_name)}</span>
            </div>
            {isActiveToday && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-white" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">{employee.full_name}</h1>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isAdmin ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'}`}>
                {isAdmin ? 'Administrator' : 'Zaposlenik'}
              </span>
              {isInactive && <span className="text-xs font-semibold text-slate-700 bg-slate-200 px-2 py-0.5 rounded-full">Neaktivan</span>}
              {isActiveToday && <span className="text-xs font-medium text-green-800 bg-green-50 px-2 py-0.5 rounded-full">Aktivan danas</span>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
              <a href={`mailto:${employee.email}`} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-blue-700 min-w-0">
                <Mail size={13} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{employee.email}</span>
              </a>
              {employee.phone && (
                <a href={`tel:${employee.phone}`} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-blue-700">
                  <Phone size={13} aria-hidden="true" /> {employee.phone}
                </a>
              )}
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 shrink-0">{actions}</div>
        </div>
        <div className="sm:hidden flex gap-2 mt-4 pt-4 border-t border-slate-100">{actions}</div>
      </div>

      {isInactive && (
        <div role="status" className="flex items-start gap-2.5 px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-700">
          <Info size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
          <p>
            Deaktiviran {formatDay(employee.deactivated_at!)} – ne može se prijaviti. Povijest sati je sačuvana i ulazi u izvješća.
          </p>
        </div>
      )}

      {/* ── Period ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 sm:px-5 flex flex-wrap items-center gap-2 sm:gap-3">
        <ViewToggle period={period} views={['week', 'month', 'custom']} />
        {period.view === 'custom' ? (
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-end">
            <Field label="Od" className="[&_label]:text-xs [&_label]:mb-0.5">
              {p => <DatePicker {...p} size="sm" value={period.start} max={period.end} onChange={v => period.setCustomRange(v, period.end)} />}
            </Field>
            <Field label="Do" className="[&_label]:text-xs [&_label]:mb-0.5">
              {p => <DatePicker {...p} size="sm" value={period.end} min={period.start} max={today} onChange={v => period.setCustomRange(period.start, v)} />}
            </Field>
          </div>
        ) : (
          <PeriodStepper period={period} className="w-full sm:w-auto sm:ml-auto" />
        )}
      </div>

      {/* ── Statistika ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <MiniStat icon={Clock} label="Danas" value={formatHours(todayHours)} note={isActiveToday ? 'Aktivan danas' : 'Nema unosa danas'} />
        <MiniStat
          icon={TrendingUp}
          label={`Sati · ${periodNoun}`}
          value={formatHours(periodHours)}
          note={`${formatHours(avgPerDay)} po radnom danu`}
          accent
          isLoading={logsLoading}
          className="col-span-2 sm:col-span-1 order-first sm:order-none"
        />
        <MiniStat
          icon={ClipboardList}
          label={`Unosi · ${periodNoun}`}
          value={String(logs.length)}
          note={period.label}
          isLoading={logsLoading}
        />
      </div>

      {/* ── Graf + povijest ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 sm:gap-5 items-start">
        <HoursChart
          logs={logs}
          days={period.days}
          groupBy={chartGroupBy}
          isLoading={logsLoading}
          mode="simple"
          title={`${chartGroupBy === 'day' ? 'Sati po danu' : 'Sati po tjednu'} · ${period.label}`}
          onBucketClick={setOpenBucket}
        />

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" aria-labelledby="history-title">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 id="history-title" className="text-sm font-semibold text-slate-800">Povijest radnih sati</h2>
              <p className="text-xs text-slate-600 mt-0.5">{period.label}</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 shrink-0">
              {logs.length} {pluralHr(logs.length, 'unos', 'unosa', 'unosa')}
            </span>
          </div>
          <div className="p-4 sm:p-5">
            {logsLoading ? (
              <div className="space-y-3" aria-busy="true">
                {[0, 1, 2].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}
              </div>
            ) : (
              <EmployeeTimeline logs={logs} canEdit pageSize={7} />
            )}
          </div>
        </section>
      </div>

      {showForm && <WorkLogForm onClose={() => setShowForm(false)} employeeId={id} />}
      {openBucket && <BucketEntriesDialog bucket={openBucket} logs={logs} onClose={() => setOpenBucket(null)} />}
      {showChanges && id && (
        <EmployeeChangesDialog employeeId={id} employeeName={employee.full_name} onClose={() => setShowChanges(false)} />
      )}

      <ConfirmDialog
        open={showDeactivate}
        onOpenChange={setShowDeactivate}
        tone="neutral"
        title={`Deaktivirati zaposlenika ${employee.full_name}?`}
        description="Zaposlenik se više neće moći prijaviti i neće se brojati u „Aktivni danas”. Svi dosadašnji unosi ostaju sačuvani i vidljivi u izvješćima. Deaktivaciju možete poništiti u bilo kojem trenutku."
        confirmLabel="Deaktiviraj"
        pendingLabel="Deaktiviranje…"
        onConfirm={() => handleSetActive(false)}
        error={setActive.error ? errorMessage(setActive.error) : null}
      />

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title={`Obrisati zaposlenika ${employee.full_name}?`}
        description={
          <>
            Trajno se brišu korisnički račun i{' '}
            <strong className="font-semibold text-slate-800">
              {totalLogCount ?? '…'} {pluralHr(totalLogCount ?? 0, 'radni unos', 'radna unosa', 'radnih unosa')}
            </strong>
            . Ova se radnja ne može poništiti. Ako želite sačuvati evidenciju sati, umjesto brisanja odaberite „Deaktiviraj”.
          </>
        }
        confirmText={employee.full_name}
        confirmLabel="Trajno obriši"
        onConfirm={handleDelete}
        error={deleteEmployee.error ? errorMessage(deleteEmployee.error) : null}
      />
    </div>
  );
}

function MiniStat({
  icon: Icon, label, value, note, accent, isLoading, className,
}: {
  icon: typeof Clock; label: string; value: string; note?: string; accent?: boolean; isLoading?: boolean; className?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 ${accent ? 'border-t-4 border-t-blue-600' : ''} ${className ?? ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <Icon size={16} className="text-slate-400" aria-hidden="true" />
      </div>
      {isLoading ? (
        <div className="mt-2 h-7 w-20 bg-slate-200 rounded animate-pulse" />
      ) : (
        <p className="mt-2 text-xl sm:text-2xl font-bold text-slate-900 leading-none tabular-nums">{value}</p>
      )}
      {note && <p className="text-xs text-slate-600 mt-1.5 truncate">{note}</p>}
    </div>
  );
}
