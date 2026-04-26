import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Puzzle, Loader2, ToggleLeft, ToggleRight, Lock, ChevronDown, ChevronUp, Check, X,
  LayoutDashboard, Settings, Users, CalendarDays, Laptop, FileText, StickyNote, Box, Plus, Pencil, Trash2, Save
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Module {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  is_system: boolean;
}

interface Role {
  id: string;
  name: string;
  slug: string;
}

// ─── Icon map (lucide name → emoji fallback) ──────────────────────────────────
const ICON_COLORS: Record<string, string> = {
  dashboard:   'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  configuracoes: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
};

const DYNAMIC_ICONS: Record<string, React.ElementType> = {
  LayoutDashboard,
  Settings,
  Users,
  CalendarDays,
  Laptop,
  FileText,
  StickyNote,
};

const getColor = (slug: string) => ICON_COLORS[slug] ?? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400';

// ─── Component ────────────────────────────────────────────────────────────────
const ModulesScreen: React.FC = () => {
  const [modules, setModules] = useState<Module[]>([]);
  const [roles, setRoles]     = useState<Role[]>([]);
  const [perms, setPerms]     = useState<Record<string, Set<string>>>({}); // roleId → Set<moduleId>
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const DEFAULT_FORM = { name: '', slug: '', description: '', icon: 'Box', sort_order: 0 };
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(DEFAULT_FORM);
  const [editId, setEditId]       = useState<string | null>(null);
  const [deleteId, setDeleteId]   = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [isSavingForm, setIsSavingForm] = useState(false);
  
  const AVAILABLE_ICONS = Object.keys(DYNAMIC_ICONS);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: mods }, { data: rls }, { data: rmp }] = await Promise.all([
      supabase.from('modules').select('*').order('sort_order'),
      supabase.from('roles').select('id, name, slug').order('name'),
      supabase.from('role_module_permissions').select('role_id, module_id'),
    ]);
    setModules(mods ?? []);
    setRoles(rls ?? []);

    // Mapear permissões: roleId → Set<moduleId>
    const map: Record<string, Set<string>> = {};
    (rmp ?? []).forEach(({ role_id, module_id }) => {
      if (!map[role_id]) map[role_id] = new Set();
      map[role_id].add(module_id);
    });
    setPerms(map);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Toggle module active ───────────────────────────────────────────────────
  const toggleActive = async (mod: Module) => {
    setSaving(mod.id);
    await supabase.from('modules').update({ is_active: !mod.is_active, updated_at: new Date().toISOString() }).eq('id', mod.id);
    setModules(prev => prev.map(m => m.id === mod.id ? { ...m, is_active: !m.is_active } : m));
    setSaving(null);
  };

  // ── Toggle role-module permission ─────────────────────────────────────────
  const togglePerm = async (roleId: string, moduleId: string) => {
    const hasPerm = perms[roleId]?.has(moduleId);

    if (hasPerm) {
      await supabase.from('role_module_permissions').delete()
        .eq('role_id', roleId).eq('module_id', moduleId);
    } else {
      await supabase.from('role_module_permissions').insert({ role_id: roleId, module_id: moduleId });
    }

    setPerms(prev => {
      const next = { ...prev };
      if (!next[roleId]) next[roleId] = new Set();
      const updated = new Set(next[roleId]);
      hasPerm ? updated.delete(moduleId) : updated.add(moduleId);
      next[roleId] = updated;
      return next;
    });
  };

  // ── Modals logic ────────────────────────────────────────────────────────────
  const openCreate = () => {
    setForm(DEFAULT_FORM);
    setEditId(null);
    setError(null);
    setShowForm(true);
  };

  const openEdit = (m: Module) => {
    setForm({ name: m.name, slug: m.slug, description: m.description || '', icon: m.icon, sort_order: m.sort_order });
    setEditId(m.id);
    setError(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.icon) { setError('Nome e ícone são obrigatórios.'); return; }
    setIsSavingForm(true);
    setError(null);

    const slug = form.slug || form.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const payload = {
      name: form.name, slug, description: form.description, icon: form.icon, sort_order: form.sort_order, updated_at: new Date().toISOString()
    };

    let opError = null;
    if (editId) {
      const { error: e } = await supabase.from('modules').update(payload).eq('id', editId);
      opError = e;
    } else {
      const { error: e } = await supabase.from('modules').insert({ ...payload, is_system: false, is_active: true });
      opError = e;
    }

    setIsSavingForm(false);
    if (opError) {
      setError(opError.message);
    } else {
      setShowForm(false);
      fetchAll();
    }
  };

  const handleDelete = async (id: string) => {
    const { error: e } = await supabase.from('modules').delete().eq('id', id);
    if (!e) { setDeleteId(null); fetchAll(); }
  };

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Puzzle className="h-7 w-7 text-blue-600" /> Módulos do Sistema
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Ative/desative módulos e defina quais perfis têm acesso a cada um
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4 mr-2" /> Novo Módulo
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {modules.map((mod) => {
            const IconComp = DYNAMIC_ICONS[mod.icon] || Box;
            
            return (
            <motion.div
              key={mod.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
            >
              {/* Module Row */}
              <div className="flex items-center gap-4 px-6 py-4">
                <div className={`h-10 w-10 rounded-xl ${getColor(mod.slug)} flex items-center justify-center shrink-0`}>
                  <IconComp className="h-5 w-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">{mod.name}</span>
                    {mod.is_system && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-xs text-slate-500">
                        <Lock className="h-3 w-3" /> Sistema
                      </span>
                    )}
                  </div>
                  {mod.description && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{mod.description}</p>
                  )}
                </div>

                {/* Status badge */}
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${mod.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                  {mod.is_active ? 'Ativo' : 'Inativo'}
                </span>

                {/* Toggle active */}
                <button
                  onClick={() => toggleActive(mod)}
                  disabled={saving === mod.id}
                  className="transition-colors text-slate-400 hover:text-blue-600 disabled:opacity-50"
                  title={mod.is_active ? 'Desativar' : 'Ativar'}
                >
                  {saving === mod.id
                    ? <Loader2 className="h-6 w-6 animate-spin" />
                    : mod.is_active
                    ? <ToggleRight className="h-7 w-7 text-blue-600" />
                    : <ToggleLeft className="h-7 w-7" />
                  }
                </button>

                {/* Expand permissions */}
                <div className="flex items-center gap-2 ml-2 pl-4 border-l border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => openEdit(mod)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    title="Editar módulo"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {!mod.is_system && (
                    <button
                      onClick={() => setDeleteId(mod.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="Excluir módulo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  
                  <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>
                  
                  <button
                    onClick={() => setExpanded(expanded === mod.id ? null : mod.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Ver permissões"
                  >
                    {expanded === mod.id ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Permissions accordion */}
              {expanded === mod.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-slate-100 dark:border-slate-800 px-6 py-4"
                >
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                    Perfis com acesso a este módulo
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {roles.map((role) => {
                      const hasAccess = perms[role.id]?.has(mod.id);
                      return (
                        <button
                          key={role.id}
                          onClick={() => togglePerm(role.id, mod.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${
                            hasAccess
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-400'
                          }`}
                        >
                          {hasAccess ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                          {role.name}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )})}
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
                  {editId ? 'Editar Módulo' : 'Novo Módulo'}
                </h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Descrição</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Ícone</label>
                    <select
                      value={form.icon}
                      onChange={(e) => setForm(f => ({ ...f, icon: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {AVAILABLE_ICONS.map(i => <option key={i} value={i}>{i}</option>)}
                      <option value="Box">Box (padrão)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Ordem (Sort)</label>
                    <input
                      type="number"
                      value={form.sort_order}
                      onChange={(e) => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{error}</p>
                )}
              </div>

              <div className="flex justify-end gap-3 px-6 pb-6 pt-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSavingForm}
                  className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {isSavingForm ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Salvar
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
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Excluir módulo?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">As permissões associadas também serão perdidas. Deseja continuar?</p>
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

export default ModulesScreen;
