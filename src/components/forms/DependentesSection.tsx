import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Plus, Loader2, Trash2, Pencil,
  AlertCircle, X, CheckCircle, Lock
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { maskCPF, maskPhone, validateCPF } from '../../utils/validators';

// ─── Tipos ─────────────────────────────────────────────────────────────────────
interface Dependente {
  id: string;
  pessoa_id: string;
  full_name: string;
  birth_date: string | null;
  cpf: string | null;
  kinship: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

const DEFAULT_DEP: Omit<Dependente, 'id' | 'pessoa_id' | 'created_at'> = {
  full_name: '',
  birth_date: null,
  cpf: null,
  kinship: '',
  phone: null,
  notes: null,
};

const KINSHIPS = ['Filho(a)', 'Cônjuge', 'Pai', 'Mãe', 'Irmão/Irmã', 'Neto(a)', 'Avô/Avó', 'Outro'];

// ─── Props ──────────────────────────────────────────────────────────────────────
interface DependentesSectionProps {
  pessoaId: string;
  disabled?: boolean;
}

// ─── Componente ─────────────────────────────────────────────────────────────────
const DependentesSection: React.FC<DependentesSectionProps> = ({ pessoaId, disabled = false }) => {
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ ...DEFAULT_DEP });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchDependentes = useCallback(async () => {
    if (!pessoaId || disabled) return;
    setLoading(true);
    const { data } = await supabase
      .from('dependentes')
      .select('*')
      .eq('pessoa_id', pessoaId)
      .order('created_at', { ascending: true });
    setDependentes((data ?? []) as Dependente[]);
    setLoading(false);
  }, [pessoaId, disabled]);

  useEffect(() => { fetchDependentes(); }, [fetchDependentes]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const formatDate = (ds?: string | null) => {
    if (!ds) return '—';
    const parts = ds.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : ds;
  };

  const resetForm = () => {
    setFormData({ ...DEFAULT_DEP });
    setEditingId(null);
    setError(null);
    setShowForm(false);
  };

  const openEdit = (dep: Dependente) => {
    setFormData({
      full_name: dep.full_name,
      birth_date: dep.birth_date,
      cpf: dep.cpf,
      kinship: dep.kinship,
      phone: dep.phone,
      notes: dep.notes,
    });
    setEditingId(dep.id);
    setError(null);
    setShowForm(true);
  };

  // ── Salvar dependente ────────────────────────────────────────────────────────
  const handleSave = async (evt: React.FormEvent) => {
    evt.preventDefault();
    setError(null);
    if (!formData.full_name.trim()) { setError('O nome do dependente é obrigatório.'); return; }

    if (formData.cpf) {
      const cleanedCpf = formData.cpf.replace(/\D/g, '');
      if (cleanedCpf.length > 0 && !validateCPF(cleanedCpf)) {
        setError('O CPF informado é inválido.');
        return;
      }
    }

    setSaving(true);
    const payload = {
      ...formData,
      cpf: formData.cpf?.replace(/\D/g, '') || null,
      phone: formData.phone || null,
      birth_date: formData.birth_date || null,
      notes: formData.notes || null,
      kinship: formData.kinship || null,
      updated_at: new Date().toISOString(),
    };

    let saveError;
    if (editingId) {
      // Modo edição: update
      const { error: err } = await supabase
        .from('dependentes')
        .update(payload)
        .eq('id', editingId);
      saveError = err;
    } else {
      // Modo criação: insert
      const { error: err } = await supabase
        .from('dependentes')
        .insert({ ...payload, pessoa_id: pessoaId });
      saveError = err;
    }

    setSaving(false);

    if (saveError) {
      setError(saveError.message);
    } else {
      resetForm();
      fetchDependentes();
      showSuccess(editingId ? 'Dependente atualizado com sucesso!' : 'Dependente adicionado com sucesso!');
    }
  };

  // ── Excluir dependente ───────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    const { error: e } = await supabase.from('dependentes').delete().eq('id', id);
    if (!e) {
      setDeleteId(null);
      fetchDependentes();
      showSuccess('Dependente removido.');
    }
  };

  // ── Estado Bloqueado ─────────────────────────────────────────────────────────
  if (disabled) {
    return (
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-slate-400" />
          <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">
            Dependentes
          </h4>
          <Lock className="h-3.5 w-3.5 text-slate-400 ml-auto" />
        </div>
        <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center">
          <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
            <Lock className="h-5 w-5 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Salve o cadastro da pessoa primeiro
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Após salvar, o cadastro de dependentes será liberado automaticamente.
          </p>
        </div>
      </div>
    );
  }

  // ── Estado Habilitado ────────────────────────────────────────────────────────
  return (
    <div className="mt-8">
      {/* Header da seção */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-500" />
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Dependentes
          </h4>
          {dependentes.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 font-medium">
              {dependentes.length}
            </span>
          )}
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar Dependente
          </button>
        )}
      </div>

      {/* Toast de sucesso */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 px-3 py-2 mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 rounded-lg text-xs"
          >
            <CheckCircle className="h-3.5 w-3.5 shrink-0" /> {successMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mini-formulário de adição */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mb-4 border border-blue-200 dark:border-blue-800/60 bg-blue-50/50 dark:bg-blue-500/5 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {editingId ? 'Editar Dependente' : 'Novo Dependente'}
                </p>
                <button type="button" onClick={resetForm} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form id="dep-form" onSubmit={handleSave}>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">

                  <div className="col-span-1 md:col-span-8">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Nome Completo <span className="text-red-500">*</span></label>
                    <input
                      required type="text"
                      value={formData.full_name}
                      onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="col-span-1 md:col-span-4">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Parentesco</label>
                    <select
                      value={formData.kinship || ''}
                      onChange={e => setFormData({ ...formData, kinship: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Selecione...</option>
                      {KINSHIPS.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>

                  <div className="col-span-1 md:col-span-4">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">CPF</label>
                    <input
                      type="text" maxLength={14}
                      value={formData.cpf || ''}
                      onChange={e => setFormData({ ...formData, cpf: maskCPF(e.target.value) })}
                      placeholder="000.000.000-00"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="col-span-1 md:col-span-4">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Data de Nascimento</label>
                    <input
                      type="date"
                      value={formData.birth_date || ''}
                      onChange={e => setFormData({ ...formData, birth_date: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="col-span-1 md:col-span-4">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Telefone</label>
                    <input
                      type="text" maxLength={15}
                      value={formData.phone || ''}
                      onChange={e => setFormData({ ...formData, phone: maskPhone(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="col-span-1 md:col-span-12">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Observações</label>
                    <input
                      type="text"
                      value={formData.notes || ''}
                      onChange={e => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                </div>

                {error && (
                  <p className="mt-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg flex items-center gap-2">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
                  </p>
                )}

                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={resetForm} className="px-4 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors border border-slate-200 dark:border-slate-700">
                    Cancelar
                  </button>
                  <button
                    form="dep-form" type="submit" disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (editingId ? 'Salvar Alterações' : 'Salvar Dependente')}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lista de dependentes */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
        </div>
      ) : dependentes.length === 0 && !showForm ? (
        <div className="border border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center">
          <Users className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-400 dark:text-slate-500">Nenhum dependente cadastrado ainda.</p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            + Adicionar o primeiro dependente
          </button>
        </div>
      ) : dependentes.length > 0 ? (
        <div className="border border-slate-200 dark:border-slate-700/60 rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50">
                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nome</th>
                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Parentesco</th>
                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden md:table-cell">CPF</th>
                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden md:table-cell">Nascimento</th>
                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden lg:table-cell">Telefone</th>
                <th className="py-3 px-4 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {dependentes.map((dep, idx) => (
                <tr key={dep.id} className={`border-b border-slate-100 dark:border-slate-800/40 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/30 dark:bg-slate-800/10'}`}>
                  <td className="py-3 px-4">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{dep.full_name}</span>
                    {dep.notes && <p className="text-xs text-slate-400 truncate max-w-[200px]">{dep.notes}</p>}
                  </td>
                  <td className="py-3 px-4">
                    {dep.kinship ? (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400 font-medium">
                        {dep.kinship}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-500 dark:text-slate-400 hidden md:table-cell">
                    {dep.cpf ? maskCPF(dep.cpf) : '—'}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-500 dark:text-slate-400 hidden md:table-cell">
                    {formatDate(dep.birth_date)}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-500 dark:text-slate-400 hidden lg:table-cell">
                    {dep.phone || '—'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {deleteId === dep.id ? (
                      <div className="flex items-center gap-1 justify-end">
                        <span className="text-xs text-slate-500">Excluir?</span>
                        <button type="button" onClick={() => handleDelete(dep.id)} className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors">Sim</button>
                        <button type="button" onClick={() => setDeleteId(null)} className="text-xs px-2 py-1 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Não</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => openEdit(dep)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-colors"
                          title="Editar dependente"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setDeleteId(dep.id); setShowForm(false); setEditingId(null); }}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors"
                          title="Excluir dependente"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
};

export default DependentesSection;
