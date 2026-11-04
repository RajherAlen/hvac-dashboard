import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Copy, MessageSquare, Phone } from 'lucide-react';
import { useUpdateServiceCase, type ServiceItem } from '../../hooks/useServiceCases';
import { useStaffDirectory } from '../../hooks/useStaffDirectory';
import { siteAddress } from '../../lib/clients';
import { errorMessage } from '../../lib/errors';
import { normalizePhone, serviceMessage, smsHref, deviceDisplayName } from '../../lib/service';
import { cn, todayISO } from '../../lib/utils';
import { Dialog } from '../ui/Dialog';
import { Field, FormActions, FormError } from '../ui/form';
import { inputClass } from '../ui/styles';
import { DatePicker } from '../ui/DatePicker';

const actionBtn = 'flex-1 inline-flex items-center justify-center gap-2 min-h-12 px-4 text-sm font-semibold rounded-xl border transition-colors';

/** Poziv ili SMS s vlastitog mobitela; prva radnja označava slučaj kao "kontaktiran". */
export function ContactDialog({ item, onClose, onSchedule }: { item: ServiceItem; onClose: () => void; onSchedule: () => void }) {
  const update = useUpdateServiceCase();
  const phone = normalizePhone(item.client.phone);
  const [message, setMessage] = useState(() => serviceMessage({
    siteAddress: siteAddress(item.site),
    devices: item.devices,
    lastService: item.lastService,
  }));

  const markContacted = () => {
    if (item.sc.status !== 'due') return;
    update.mutate(
      { id: item.sc.id, patch: { status: 'contacted', contacted_at: new Date().toISOString() } },
      {
        onSuccess: () => toast.success('Označeno kao kontaktiran', {
          action: { label: 'Poništi', onClick: () => update.mutate({ id: item.sc.id, patch: { status: 'due', contacted_at: null } }) },
        }),
        onError: e => toast.error(errorMessage(e)),
      },
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success('Poruka kopirana');
      markContacted();
    } catch {
      toast.error('Kopiranje nije uspjelo. Označite tekst i kopirajte ručno.');
    }
  };

  return (
    <Dialog onClose={onClose} title="Kontaktiraj klijenta"
      description={`${item.client.name} · ${siteAddress(item.site)}`} className="sm:max-w-lg">
      <div className="px-5 sm:px-6 py-5 space-y-4">
        <ul className="text-sm text-slate-700 space-y-0.5">
          {item.devices.map(d => <li key={d.id}>{deviceDisplayName(d)}</li>)}
        </ul>

        {phone ? (
          <>
            <p className="text-sm text-slate-700">
              Telefon: <a href={`tel:${phone}`} className="font-semibold text-slate-900 tabular-nums hover:underline">{item.client.phone}</a>
            </p>
            <Field label="Poruka" hint="Možete je urediti prije slanja. Otvara se aplikacija za poruke na vašem mobitelu.">
              {p => (
                <textarea {...p} value={message} onChange={e => setMessage(e.target.value)} rows={5}
                  className={inputClass(false, 'resize-y text-sm leading-relaxed')} />
              )}
            </Field>
            <div className="flex flex-col sm:flex-row gap-2">
              <a href={smsHref(phone, message)} onClick={markContacted}
                className={cn(actionBtn, 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700')}>
                <MessageSquare size={17} aria-hidden="true" /> Pošalji SMS
              </a>
              <a href={`tel:${phone}`} onClick={markContacted}
                className={cn(actionBtn, 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50')}>
                <Phone size={17} aria-hidden="true" /> Nazovi
              </a>
              <button type="button" onClick={copy}
                className={cn(actionBtn, 'sm:flex-none bg-white border-slate-300 text-slate-800 hover:bg-slate-50')}>
                <Copy size={16} aria-hidden="true" /> Kopiraj
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
            Klijent nema upisan broj telefona.{' '}
            <Link to={`/klijenti/${item.client.id}`} className="font-medium underline">Dodajte ga na stranici klijenta</Link>.
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose}
            className="min-h-11 px-4 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg">Zatvori</button>
          <button type="button" onClick={onSchedule}
            className="min-h-11 px-4 text-sm font-semibold text-blue-700 border border-blue-200 hover:bg-blue-50 rounded-lg">
            Zakaži termin
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** Datum i tehničar za dogovoreni servis. */
export function ScheduleDialog({ item, onClose }: { item: ServiceItem; onClose: () => void }) {
  const update = useUpdateServiceCase();
  const { activeStaff } = useStaffDirectory();
  const [date, setDate] = useState(item.sc.scheduled_for ?? '');
  const [assignee, setAssignee] = useState(item.sc.assigned_to ?? '');
  const [note, setNote] = useState(item.sc.note ?? '');
  const [dateError, setDateError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) { setDateError('Odaberite datum'); return; }
    try {
      await update.mutateAsync({
        id: item.sc.id,
        patch: {
          status: 'scheduled', scheduled_for: date, assigned_to: assignee || null, note: note.trim() || null,
          contacted_at: item.sc.contacted_at ?? new Date().toISOString(),
        },
      });
      toast.success('Servis zakazan');
      onClose();
    } catch { /* FormError */ }
  };

  return (
    <Dialog onClose={onClose} title={item.sc.status === 'scheduled' ? 'Promijeni termin' : 'Zakaži servis'}
      description={`${item.client.name} · ${siteAddress(item.site)}`}>
      <form onSubmit={submit} noValidate className="px-5 sm:px-6 py-5 space-y-4">
        <Field label="Datum" required error={dateError ?? undefined}>
          {p => <DatePicker {...p} value={date} onChange={v => { setDate(v); setDateError(null); }} min={todayISO()} />}
        </Field>
        <Field label="Tehničar" optional hint="Bez odabira servis vide svi tehničari.">
          {p => (
            <select {...p} value={assignee} onChange={e => setAssignee(e.target.value)} className={inputClass(false)}>
              <option value="">Bilo tko</option>
              {activeStaff.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Napomena za tehničara" optional>
          {p => (
            <textarea {...p} value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="npr. nazvati pola sata prije dolaska" className={inputClass(false, 'resize-none')} />
          )}
        </Field>
        <FormError message={update.error ? errorMessage(update.error) : null} />
        <FormActions onCancel={onClose} isPending={update.isPending}
          submitLabel={item.sc.status === 'scheduled' ? 'Spremi termin' : 'Zakaži servis'} pendingLabel="Spremanje…" />
      </form>
    </Dialog>
  );
}
