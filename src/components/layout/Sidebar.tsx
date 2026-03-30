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
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useEmployee } from '../../hooks/useEmployees';
import { useCompany } from '../../hooks/useCompany';
import { EditProfileModal } from '../EditProfileModal';
import { cn } from '../../lib/utils';

interface SidebarProps {
  onClose?: () => void;
}

const adminLinks = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Nadzorna ploča' },
  { to: '/admin/employees', icon: Users, label: 'Zaposlenici' },
];

const employeeLinks = [
  { to: '/my/dashboard', icon: LayoutDashboard, label: 'Moja nadzorna ploča' },
  { to: '/my/log', icon: PlusCircle, label: 'Unos rada' },
  { to: '/my/history', icon: History, label: 'Moja povijest' },
];

export function Sidebar({ onClose }: SidebarProps) {
  const { role, user, signOut, isSuperAdmin } = useAuth();
  const { data: profile } = useEmployee(isSuperAdmin ? undefined : user?.id);
  const { data: company } = useCompany();
  const [showProfile, setShowProfile] = useState(false);
  const links = role === 'admin' ? adminLinks : employeeLinks;

  return (
    <aside className="flex flex-col h-full bg-slate-900 text-slate-100 w-64">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700">
        <div className="flex items-center justify-center w-9 h-9 bg-blue-600 rounded-lg">
          <Wind size={20} className="text-white" />
        </div>
        <div>
          <p className="font-semibold text-white leading-tight">{company?.name ?? 'HVAC'}</p>
          <p className="text-xs text-slate-400 capitalize">{role ?? 'loading...'}</p>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        <p className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {role === 'admin' ? 'Upravljanje' : 'Moj rad'}
        </p>
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
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
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
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
            <p className="font-medium text-white truncate leading-tight">
              {profile?.full_name ?? user?.email}
            </p>
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
