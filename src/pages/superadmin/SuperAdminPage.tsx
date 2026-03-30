import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Wind, Building2, Users, LogOut, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

interface CompanyStat {
  id: string;
  name: string;
  created_at: string;
  employee_count: number;
}

function useSuperAdminStats() {
  return useQuery({
    queryKey: ['superadmin-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('superadmin-stats');
      if (error) throw error;
      return data as { companies: CompanyStat[] };
    },
  });
}

const emptyForm = { company_name: '', admin_full_name: '', admin_email: '' };

export function SuperAdminPage() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useSuperAdminStats();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  const companies = data?.companies ?? [];
  const totalEmployees = companies.reduce((s, c) => s + c.employee_count, 0);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreateSuccess('');
    setCreating(true);

    const { data: result, error: fnErr } = await supabase.functions.invoke('create-company', {
      body: {
        company_name: form.company_name.trim(),
        admin_full_name: form.admin_full_name.trim(),
        admin_email: form.admin_email.trim(),
        redirect_to: `${window.location.origin}/accept-invite`,
      },
    });

    setCreating(false);

    if (fnErr || result?.error) {
      setCreateError(result?.error ?? fnErr?.message ?? 'Greška pri kreiranju tvrtke.');
      return;
    }

    setCreateSuccess(`Tvrtka "${form.company_name.trim()}" kreirana. Pozivnica poslana na ${form.admin_email.trim()}.`);
    setForm(emptyForm);
    queryClient.invalidateQueries({ queryKey: ['superadmin-stats'] });
  };

  const closeModal = () => {
    setShowCreate(false);
    setForm(emptyForm);
    setCreateError('');
    setCreateSuccess('');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 bg-blue-600 rounded-lg">
            <Wind size={18} className="text-white" />
          </div>
          <div>
            <p className="font-semibold text-white leading-tight text-sm">HVAC Dashboard</p>
            <p className="text-xs text-slate-400">Super Admin</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-400 hidden sm:block">{user?.email}</span>
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <LogOut size={16} />
            <span className="hidden sm:block">Odjava</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Title + New Company button */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-white">Pregled svih tvrtki</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
          >
            <Plus size={16} />
            <span>Nova tvrtka</span>
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Building2 size={18} className="text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Ukupno tvrtki</p>
                <p className="text-2xl font-bold text-white">{isLoading ? '—' : companies.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <Users size={18} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Ukupno korisnika</p>
                <p className="text-2xl font-bold text-white">{isLoading ? '—' : totalEmployees}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Companies table */}
        {isLoading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-400 text-sm">
            Greška pri učitavanju: {(error as Error).message}
          </div>
        )}

        {!isLoading && !error && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            {companies.length === 0 ? (
              <div className="text-center py-16">
                <Building2 size={32} className="text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Nema registriranih tvrtki.</p>
                <p className="text-slate-600 text-xs mt-1">Kliknite "Nova tvrtka" za dodavanje.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tvrtka</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Datum registracije</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Korisnici</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company, i) => (
                    <tr key={company.id} className={i < companies.length - 1 ? 'border-b border-slate-800' : ''}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center shrink-0">
                            <Building2 size={14} className="text-blue-400" />
                          </div>
                          <span className="font-medium text-white text-sm">{company.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-400 text-sm hidden sm:table-cell">
                        {format(parseISO(company.created_at), 'dd.MM.yyyy')}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="text-sm font-semibold text-emerald-400">{company.employee_count}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>

      {/* Create Company Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-blue-400" />
                <h2 className="text-sm font-semibold text-white">Nova tvrtka</h2>
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Naziv tvrtke</label>
                <input
                  type="text"
                  name="company_name"
                  required
                  value={form.company_name}
                  onChange={handleChange}
                  placeholder="npr. HVAC Servis d.o.o."
                  className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Ime i prezime admina</label>
                <input
                  type="text"
                  name="admin_full_name"
                  required
                  value={form.admin_full_name}
                  onChange={handleChange}
                  placeholder="Ivan Horvat"
                  className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Email admina</label>
                <input
                  type="email"
                  name="admin_email"
                  required
                  value={form.admin_email}
                  onChange={handleChange}
                  placeholder="ivan@tvrtka.hr"
                  className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {createError && (
                <p className="text-sm text-red-400 bg-red-900/30 border border-red-800 px-3 py-2 rounded-lg">
                  {createError}
                </p>
              )}

              {createSuccess && (
                <p className="text-sm text-emerald-400 bg-emerald-900/30 border border-emerald-800 px-3 py-2 rounded-lg">
                  {createSuccess}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
                >
                  Odustani
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-60 rounded-lg transition-colors"
                >
                  {creating ? 'Kreiranje...' : 'Kreiraj tvrtku'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
