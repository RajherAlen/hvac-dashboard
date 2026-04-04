import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, X, Wind } from 'lucide-react';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full z-50 shadow-2xl">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Mobile topbar */}
        <header className="md:hidden flex items-center justify-between px-3 py-2.5 bg-white border-b border-slate-200 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 active:bg-slate-200 transition-colors"
            aria-label="Otvori izbornik"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 bg-blue-600 rounded-lg">
              <Wind size={14} className="text-white" />
            </div>
            <span className="font-bold text-slate-800 text-sm tracking-tight">HVAC Radni Sati</span>
          </div>

          {/* Right spacer to keep logo centered */}
          <div className="w-9" />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
