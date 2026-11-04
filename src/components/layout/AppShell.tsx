import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Dialog } from 'radix-ui';
import { Menu, X, Wind } from 'lucide-react';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        <Sidebar />
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
            <Sidebar onClose={() => setSidebarOpen(false)} />
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
    </div>
  );
}
