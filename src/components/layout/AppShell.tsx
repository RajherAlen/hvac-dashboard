import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Dialog } from 'radix-ui';
import { Menu, X, Wind } from 'lucide-react';
import { toast } from 'sonner';
import { Sidebar } from './Sidebar';
import { WhatsNewDialog } from '../whats-new/WhatsNewDialog';
import { useAuth } from '../../hooks/useAuth';
import { useCrews } from '../../hooks/useCrews';
import { FEATURE_EKIPE, dismissForSession, hasSeenFeature, isDismissedThisSession, markFeatureSeen } from '../../lib/features';

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // "Što je novo" – najava Ekipa, samo za admina i samo kad je modul ekipa uključen (migracija pokrenuta)
  const { role, user } = useAuth();
  const isAdmin = role === 'admin';
  const crews = useCrews(isAdmin);
  const whatsNewAvailable = isAdmin && crews.data != null;
  const [whatsNewManual, setWhatsNewManual] = useState(false);
  const [whatsNewClosed, setWhatsNewClosed] = useState(false);
  const whatsNewAuto = whatsNewAvailable && !whatsNewClosed
    && !hasSeenFeature(user, FEATURE_EKIPE) && !isDismissedThisSession(FEATURE_EKIPE);
  const showWhatsNew = whatsNewManual || whatsNewAuto;

  const dismissWhatsNew = (permanent: boolean) => {
    setWhatsNewManual(false);
    setWhatsNewClosed(true);
    if (permanent) {
      markFeatureSeen(user, FEATURE_EKIPE).catch(() => toast.error('Nije spremljeno – najava će se možda ponovno prikazati.'));
    } else {
      dismissForSession(FEATURE_EKIPE);
    }
  };
  const openWhatsNew = whatsNewAvailable ? () => { setSidebarOpen(false); setWhatsNewManual(true); } : undefined;

  return (
    <div className="flex h-screen h-dvh overflow-hidden bg-slate-50">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-2 focus:bg-white focus:text-blue-700 focus:rounded-lg focus:shadow"
      >
        Preskoči na sadržaj
      </a>

      {/* Desktop sidebar */}
      <div className="hidden md:flex md:shrink-0">
        <Sidebar onWhatsNew={openWhatsNew} />
      </div>

      {/* Mobilni izbornik – Radix Dialog: Escape, focus trap, vraćanje fokusa */}
      <Dialog.Root open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 md:hidden" />
          <Dialog.Content className="fixed left-0 top-0 h-full z-50 shadow-2xl md:hidden focus:outline-none" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">Glavni izbornik</Dialog.Title>
            <Dialog.Close
              className="absolute top-4 -right-12 p-2.5 rounded-xl bg-slate-900 text-white"
              aria-label="Zatvori izbornik"
            >
              <X size={18} aria-hidden="true" />
            </Dialog.Close>
            <Sidebar onClose={() => setSidebarOpen(false)} onWhatsNew={openWhatsNew} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Mobile topbar */}
        <header className="md:hidden flex items-center justify-between px-3 py-2 bg-white border-b border-slate-200 shadow-sm">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2.5 rounded-xl text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors"
            aria-label="Otvori izbornik"
            aria-expanded={sidebarOpen}
          >
            <Menu size={20} aria-hidden="true" />
          </button>

          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 bg-blue-600 rounded-lg" aria-hidden="true">
              <Wind size={14} className="text-white" />
            </div>
            <span className="font-bold text-slate-800 text-sm tracking-tight">HVAC Admin</span>
          </div>

          <div className="w-10" aria-hidden="true" />
        </header>

        <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none">
          <Outlet />
        </main>
      </div>

      {showWhatsNew && <WhatsNewDialog onDismiss={dismissWhatsNew} />}
    </div>
  );
}
