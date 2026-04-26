import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Plus, Pencil, Trash2, Save, X, Loader2,
  Upload, Mail, Eye, CheckCircle, XCircle, Lock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Role {
  id: string;
  name: string;
  slug: string;
  can_upload: boolean;
  can_send_email: boolean;
  can_view_all: boolean;
  is_system: boolean;
  created_at: string;
  _user_count?: number;
}

const DEFAULT_FORM = { name: '', slug: '', can_upload: false, can_send_email: false, can_view_all: false };

// ─── Permission Toggle ────────────────────────────────────────────────────────
const PermToggle: React.FC<{
  label: string; icon: React.ReactNode; checked: boolean;
  onChange: (v: boolean) => void; disabled?: boolean;
}> = ({ label, icon, checked, onChange, disabled }) => (
  <button
    type="button"
    onClick={() => !disabled && onChange(!checked)}
    disabled={disabled}
    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
      checked
        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-400'}`}
  >
    {icon}
    {label}
    {checked
      ? <CheckCircle className="h-4 w-4 text-blue-500 ml-auto" />
      : <XCircle className="h-4 w-4 text-slate-300 ml-auto" />
    }
  </button>
);

// ─── Component ────────────────────────────────────────────────────────────────
const AccessProfiles: React.FC = () => {
  const [roles, setRoles]         = useState<Role[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const [form, setForm]           = useState(DEFAULT_FORM);
  const [error, setError]         = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchRoles = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('roles')
      .select('*')
      .order('name');
    if (data) {
      // Contar usuários por role
      const counts = await Promise.all(
        data.map(async (r) => {
          const { count } = await supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('role_id', r.id);
          return { ...r, _user_count: count ?? 0 };
        })
      );
      setRoles(counts);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  // ── Open form ──────────────────────────────────────────────────────────────
  const openCreate = () => {
    setForm(DEFAULT_FORM);
    setEditId(null);
    setError(null);
    setShowForm(true);
  };

  const openEdit = (r: Role) => {
    setForm({ name: r.name, slug: r.slug, can_upload: r.can_upload, can_send_email: r.can_send_email, can_view_all: r.can_view_all });
    setEditId(r.id);
    setError(null);
    setShowForm(true);
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) { setError('O nome do perfil é obrigatório.'); return; }
    setSaving(true);
    setError(null);

    const slug = form.slug || form.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    if (editId) {
      const { error: e } = await supabase.from('roles').update({
        name: form.name, slug, can_upload: form.can_upload,
        can_send_email: form.can_send_email, can_view_all: form.can_view_all,
        updated_at: new Date().toISOString(),
      }).eq('id', editId);
      if (e) { setError(e.message); setSaving(false); return; }
    } else {
      const { error: e } = await supabase.from('roles').insert({
        name: form.name, slug, can_upload: form.can_upload,
        can_send_email: form.can_send_email, can_view_all: form.can_view_all,
        is_system: false,
      });
      if (e) { setError(e.message); setSaving(false); return; }
    }

    setSaving(false);
    setShowForm(false);
    fetchRoles();
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    const { error: e } = await supabase.from('roles').delete().eq('id', id);
    if (!e) { setDeleteId(null); fetchRoles(); }
  };

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Shield className="h-7 w-7 text-blue-600" /> Perfis de Acesso
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gerencie os perfis de permissão e seus privilégios
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4 mr-2" /> Novo Perfil
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                {['Perfil', 'Slug', 'Upload', 'E-mail', 'Ver Todos', 'Usuários', ''].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {roles.map((role) => (
                <motion.tr
                  key={role.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 dark:text-white">{role.name}</span>
                      {role.is_system && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-xs text-slate-500 dark:text-slate-400">
                          <Lock className="h-3 w-3" /> Sistema
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 font-mono">{role.slug}</td>
                  <td className="px-6 py-4">
                    {role.can_upload
                      ? <CheckCircle className="h-5 w-5 text-green-500" />
                      : <XCircle className="h-5 w-5 text-slate-300 dark:text-slate-600" />}
                  </td>
                  <td className="px-6 py-4">
                    {role.can_send_email
                      ? <CheckCircle className="h-5 w-5 text-green-500" />
                      : <XCircle className="h-5 w-5 text-slate-300 dark:text-slate-600" />}
                  </td>
                  <td className="px-6 py-4">
                    {role.can_view_all
                      ? <CheckCircle className="h-5 w-5 text-green-500" />
                      : <XCircle className="h-5 w-5 text-slate-300 dark:text-slate-600" />}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                      {role._user_count} usuário{role._user_count !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(role)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {!role.is_system && (
                        <button
                          onClick={() => setDeleteId(role.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl"
            >
              <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {editId ? 'Editar Perfil' : 'Novo Perfil de Acesso'}
                </h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ex: Assessor Parlamentar"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Permissões</label>
                  <div className="space-y-2">
                    <PermToggle
                      label="Pode fazer upload"
                      icon={<Upload className="h-4 w-4" />}
                      checked={form.can_upload}
                      onChange={(v) => setForm(f => ({ ...f, can_upload: v }))}
                    />
                    <PermToggle
                      label="Pode enviar e-mails"
                      icon={<Mail className="h-4 w-4" />}
                      checked={form.can_send_email}
                      onChange={(v) => setForm(f => ({ ...f, can_send_email: v }))}
                    />
                    <PermToggle
                      label="Pode ver todos os registros"
                      icon={<Eye className="h-4 w-4" />}
                      checked={form.can_view_all}
                      onChange={(v) => setForm(f => ({ ...f, can_view_all: v }))}
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{error}</p>
                )}
              </div>

              <div className="flex justify-end gap-3 px-6 pb-6">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Salvar Perfil
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 text-center"
            >
              <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="h-7 w-7 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Excluir perfil?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Usuários com este perfil perderão o vínculo. Esta ação não pode ser desfeita.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  Cancelar
                </button>
                <button onClick={() => handleDelete(deleteId)} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
                  Sim, excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AccessProfiles;
