import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UsersRound, Search, ChevronDown, Loader2, X, CheckCircle,
  Mail, Phone, Calendar, Shield,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────
interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  telefone: string | null;
  role: string;
  role_id: string | null;
  created_at: string;
  roles: { id: string; name: string; slug: string } | null;
}

interface Role {
  id: string;
  name: string;
  slug: string;
}

const ROLE_COLORS: Record<string, string> = {
  admin:       'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  colaborador: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  visitante:   'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
};

const formatDate = (d: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d));

const maskPhone = (p: string) => {
  if (!p) return '';
  const d = p.replace(/\D/g, '');
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
};

// ─── Component ────────────────────────────────────────────────────────────────
const UsersManagement: React.FC = () => {
  const { user: me } = useAuth();
  const [users, setUsers]       = useState<UserProfile[]>([]);
  const [roles, setRoles]       = useState<Role[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<UserProfile | null>(null);
  const [newRoleId, setNewRoleId] = useState('');
  const [saving, setSaving]     = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: profiles }, { data: rls }] = await Promise.all([
      supabase.from('profiles').select('*, roles(id, name, slug)').order('full_name'),
      supabase.from('roles').select('id, name, slug').order('name'),
    ]);
    setUsers((profiles ?? []) as UserProfile[]);
    setRoles(rls ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.roles?.name?.toLowerCase().includes(q)
    );
  });

  // ── Open detail / change role ─────────────────────────────────────────────
  const openUser = (u: UserProfile) => {
    setSelected(u);
    setNewRoleId(u.role_id ?? '');
  };

  const handleSaveRole = async () => {
    if (!selected) return;
    setSaving(true);
    const role = roles.find(r => r.id === newRoleId);
    await supabase.from('profiles').update({
      role_id: newRoleId || null,
      role: role?.slug === 'admin' ? 'admin' : 'colaborador',
      updated_at: new Date().toISOString(),
    }).eq('id', selected.id);

    setUsers(prev => prev.map(u =>
      u.id === selected.id
        ? { ...u, role_id: newRoleId, role: role?.slug === 'admin' ? 'admin' : 'colaborador', roles: role ?? null }
        : u
    ));
    setSaving(false);
    setSuccessId(selected.id);
    setSelected(null);
    setTimeout(() => setSuccessId(null), 3000);
  };

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <UsersRound className="h-7 w-7 text-blue-600" /> Gestão de Usuários
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou perfil..."
            className="w-full pl-9 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-400"
          />
        </div>
      </div>

      {/* Success toast */}
      <AnimatePresence>
        {successId && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 rounded-xl text-sm"
          >
            <CheckCircle className="h-4 w-4 shrink-0" />
            Perfil do usuário atualizado com sucesso!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                {['Usuário', 'E-mail', 'Telefone', 'Perfil', 'Cadastrado em', ''].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((u) => (
                <motion.tr
                  key={u.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${u.id === me?.id ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={u.avatar_url || `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${u.full_name || u.id}`}
                        alt={u.full_name ?? 'User'}
                        className="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-700 object-cover shrink-0"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {u.full_name ?? 'Sem nome'}
                          {u.id === me?.id && (
                            <span className="ml-2 text-xs text-blue-500">(você)</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{u.email ?? '—'}</td>
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                    {u.telefone ? maskPhone(u.telefone) : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[u.roles?.slug ?? 'visitante'] ?? ROLE_COLORS.visitante}`}>
                      <Shield className="h-3 w-3" />
                      {u.roles?.name ?? 'Sem perfil'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                    {formatDate(u.created_at)}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => openUser(u)}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
                    >
                      Gerenciar <ChevronDown className="h-4 w-4" />
                    </button>
                  </td>
                </motion.tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-slate-400 text-sm">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* User Detail Modal */}
      <AnimatePresence>
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Header com Título */}
              <div className="h-32 bg-gradient-to-r from-blue-600 to-indigo-600 relative flex flex-col items-center justify-center pb-8">
                <h2 className="text-white font-semibold text-lg tracking-tight">Detalhes do Usuário</h2>
                <button
                  onClick={() => setSelected(null)}
                  className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-md"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="px-6 flex justify-center -mt-10 mb-4 relative z-10">
                <div className="h-24 w-24 rounded-full border-4 border-white dark:border-slate-900 bg-slate-100 shadow-xl overflow-hidden">
                  <img
                    src={selected.avatar_url || `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${selected.full_name || selected.id}`}
                    alt={selected.full_name ?? 'Avatar'}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>

              <div className="px-6 pb-8 space-y-6">
                <div className="text-center">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{selected.full_name ?? 'Sem nome'}</h3>
                  <div className="flex justify-center mt-2">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shadow-sm ${ROLE_COLORS[selected.roles?.slug ?? 'visitante'] ?? ROLE_COLORS.visitante}`}>
                      <Shield className="h-3.5 w-3.5" />
                      {selected.roles?.name ?? 'Sem perfil'}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                    <Mail className="h-4 w-4 shrink-0" /> {selected.email ?? '—'}
                  </div>
                  <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                    <Phone className="h-4 w-4 shrink-0" /> {selected.telefone ? maskPhone(selected.telefone) : 'Não informado'}
                  </div>
                  <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                    <Calendar className="h-4 w-4 shrink-0" /> Membro desde {formatDate(selected.created_at)}
                  </div>
                </div>

                {/* Change role */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Alterar Perfil de Acesso
                  </label>
                  <select
                    value={newRoleId}
                    onChange={(e) => setNewRoleId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Sem perfil —</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setSelected(null)}
                    className="flex-1 px-4 py-2 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Fechar
                  </button>
                  <button
                    onClick={handleSaveRole}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar Alterações'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UsersManagement;
