import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  History,
  PlusCircle,
  LogOut,
  Wind,
  UserCircle,
  Building2,
  Wrench,
  CalendarRange,
  PieChart,
} from 'lucide-react';
import { useClientDirectory } from '../../hooks/useClients';
import { useAuth } from '../../hooks/useAuth';
import { useEmployee } from '../../hooks/useEmployees';
import { EditProfileModal } from '../EditProfileModal';
import { cn } from '../../lib/utils';

interface SidebarProps {
  onClose?: () => void;
}

type NavItem = { to: string; icon: typeof Users; label: string };
type NavSection = { title: string; links: NavItem[] };

/** Admin: grupirano po tome što se radi – pregled rada, planiranje posla, matični podaci. */
const adminSections: NavSection[] = [
  {
    title: 'Pregled',
    links: [
      { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Nadzorna ploča' },
      { to: '/sati', icon: PieChart, label: 'Sati i vrijednost' },
    ],
  },
  {
    title: 'Planiranje',
    links: [
      { to: '/raspored', icon: CalendarRange, label: 'Raspored' },
      { to: '/servisi', icon: Wrench, label: 'Servisi' },
    ],
  },
  {
    title: 'Evidencija',
    links: [
      { to: '/klijenti', icon: Building2, label: 'Klijenti' },
      { to: '/admin/employees', icon: Users, label: 'Zaposlenici' },
    ],
  },
];

const employeeSections: NavSection[] = [
  {
    title: 'Moj rad',
    links: [
      { to: '/my/dashboard', icon: LayoutDashboard, label: 'Moja nadzorna ploča' },
      { to: '/my/log', icon: PlusCircle, label: 'Unos rada' },
      { to: '/my/history', icon: History, label: 'Moja povijest' },
    ],
  },
  {
    title: 'Evidencija',
    links: [{ to: '/klijenti', icon: Building2, label: 'Klijenti' }],
  },
];

/** Stranice koje ovise o migraciji za klijente. */
const NEEDS_CLIENTS = ['/klijenti', '/servisi', '/raspored', '/sati'];

export function Sidebar({ onClose }: SidebarProps) {
  const { role, user, signOut } = useAuth();
  const { data: profile, isLoading: profileLoading } = useEmployee(user?.id);
  const [showProfile, setShowProfile] = useState(false);
  // Klijenti se prikazuju tek kad je migracija pokrenuta
  const { missingSchema } = useClientDirectory();
  const sections = (role === 'admin' ? adminSections : employeeSections)
    .map(s => ({ ...s, links: s.links.filter(l => !missingSchema || !NEEDS_CLIENTS.includes(l.to)) }))
    .filter(s => s.links.length > 0);

  return (
    <aside className="flex flex-col h-full bg-slate-900 text-slate-100 w-64">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700">
        <div className="flex items-center justify-center w-9 h-9 bg-blue-600 rounded-lg">
          <Wind size={20} className="text-white" />
        </div>
        <div>
          <p className="font-semibold text-white leading-tight">HVAC Admin</p>
          <p className="text-xs text-slate-400">{role === 'admin' ? 'Administrator' : role === 'employee' ? 'Zaposlenik' : 'Učitavanje…'}</p>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Glavna navigacija">
        {sections.map(section => {
          const headingId = `nav-${section.title.toLowerCase()}`;
          return (
            <div key={section.title}>
              <h2 id={headingId} className="px-3 mb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {section.title}
              </h2>
              <ul aria-labelledby={headingId} className="space-y-1">
                {section.links.map(({ to, icon: Icon, label }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        )
                      }
                    >
                      <Icon size={18} aria-hidden="true" />
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* User + sign out */}
      <div className="px-3 py-4 border-t border-slate-700 space-y-1">
        {/* Profile button */}
        <button
          onClick={() => setShowProfile(true)}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <UserCircle size={18} className="shrink-0" />
          <div className="text-left overflow-hidden">
            {profileLoading ? (
              <><span className="block h-4 w-28 my-0.5 rounded bg-slate-700 animate-pulse" aria-hidden="true" /><span className="sr-only">Učitavanje profila…</span></>
            ) : (
              <p className="font-medium text-white truncate leading-tight">
                {profile?.full_name ?? user?.email}
              </p>
            )}
            <p className="text-xs text-slate-400">Uredi profil</p>
          </div>
        </button>

        {/* Sign out */}
        <button
          onClick={signOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut size={18} />
          Odjava
        </button>
      </div>

      {showProfile && <EditProfileModal onClose={() => setShowProfile(false)} />}
    </aside>
  );
}
