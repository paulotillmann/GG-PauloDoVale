import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Edit2, Trash2, X, Save, AlertCircle, Loader2, Calendar, User, AlignLeft, CheckSquare, MessageSquare, Clock, CheckCircle2, PlayCircle, Layers, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Helper nativo para formatar YYYY-MM-DD para DD/MM/YYYY
const formatDate = (dateString: string) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('T')[0].split('-');
  return `${day}/${month}/${year}`;
};

type Demanda = {
  id: string;
  data_demanda: string;
  solicitante: string;
  descricao: string;
  assessor: string | null;
  status: 'ABERTA' | 'EM ATENDIMENTO' | 'AGUARDANDO RETORNO' | 'CONCLUÍDA';
  motivo_retorno: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  'ABERTA': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'EM ATENDIMENTO': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'AGUARDANDO RETORNO': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'CONCLUÍDA': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
};

const DEFAULT_FORM = {
  data_demanda: new Date().toISOString().split('T')[0],
  solicitante: '',
  descricao: '',
  assessor: '',
  status: 'ABERTA' as Demanda['status'],
  motivo_retorno: ''
};

export default function DemandasScreen() {
  const [demandas, setDemandas] = useState<Demanda[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('TODOS');
  
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingStatusChange, setPendingStatusChange] = useState<{ id: string; status: Demanda['status'] } | null>(null);
  const [motivoPrompt, setMotivoPrompt] = useState('');

  // Autocomplete Pessoas
  const [pessoasQuery, setPessoasQuery] = useState('');
  const [pessoasResult, setPessoasResult] = useState<{full_name: string}[]>([]);
  const [showPessoasDropdown, setShowPessoasDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDemandas();
  }, []);

  useEffect(() => {
    // Click outside to close dropdown
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowPessoasDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchDemandas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('demandas')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDemandas(data || []);
    } catch (e: any) {
      console.error('Erro ao buscar demandas:', e);
    } finally {
      setLoading(false);
    }
  };

  const handlePessoasSearch = async (query: string) => {
    setPessoasQuery(query);
    setForm({ ...form, solicitante: query });
    
    if (query.trim().length < 2) {
      setPessoasResult([]);
      setShowPessoasDropdown(false);
      return;
    }

    try {
      const { data } = await supabase
        .from('pessoa')
        .select('full_name')
        .ilike('full_name', `%${query}%`)
        .limit(5);

      if (data && data.length > 0) {
        setPessoasResult(data);
        setShowPessoasDropdown(true);
      } else {
        setPessoasResult([]);
        setShowPessoasDropdown(false);
      }
    } catch (error) {
      console.error('Erro ao buscar pessoas:', error);
    }
  };

  const selectPessoa = (nome: string) => {
    setPessoasQuery(nome);
    setForm({ ...form, solicitante: nome });
    setShowPessoasDropdown(false);
  };

  const handleOpenModal = (demanda?: Demanda) => {
    if (demanda) {
      setEditingId(demanda.id);
      setForm({
        data_demanda: demanda.data_demanda,
        solicitante: demanda.solicitante,
        descricao: demanda.descricao,
        assessor: demanda.assessor || '',
        status: demanda.status,
        motivo_retorno: demanda.motivo_retorno || ''
      });
      setPessoasQuery(demanda.solicitante);
    } else {
      setEditingId(null);
      setForm(DEFAULT_FORM);
      setPessoasQuery('');
    }
    setError(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta demanda?')) return;
    
    try {
      const { error } = await supabase.from('demandas').delete().eq('id', id);
      if (error) throw error;
      setDemandas(prev => prev.filter(d => d.id !== id));
    } catch (e: any) {
      alert('Erro ao excluir: ' + e.message);
    }
  };

  const handleStatusChange = async (id: string, newStatus: Demanda['status']) => {
    if (newStatus === 'AGUARDANDO RETORNO') {
      setMotivoPrompt('');
      setPendingStatusChange({ id, status: newStatus });
      return;
    }

    try {
      const { error } = await supabase
        .from('demandas')
        .update({ status: newStatus, motivo_retorno: null })
        .eq('id', id);

      if (error) throw error;
      
      setDemandas(prev => prev.map(d => 
        d.id === id ? { ...d, status: newStatus, motivo_retorno: null } : d
      ));
    } catch (e: any) {
      alert('Erro ao atualizar status: ' + e.message);
    }
  };

  const confirmStatusChange = async () => {
    if (!pendingStatusChange) return;
    const { id, status } = pendingStatusChange;
    
    if (status === 'AGUARDANDO RETORNO' && !motivoPrompt.trim()) {
      alert('O motivo é obrigatório.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('demandas')
        .update({ status, motivo_retorno: motivoPrompt.trim() })
        .eq('id', id);

      if (error) throw error;
      
      setDemandas(prev => prev.map(d => 
        d.id === id ? { ...d, status, motivo_retorno: motivoPrompt.trim() } : d
      ));
      setPendingStatusChange(null);
    } catch (e: any) {
      alert('Erro ao atualizar status: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.data_demanda || !form.solicitante || !form.descricao || !form.status) {
      setError('Preencha todos os campos obrigatórios (*).');
      return;
    }

    if (form.status === 'AGUARDANDO RETORNO' && !form.motivo_retorno?.trim()) {
      setError('O Motivo do Retorno é obrigatório para este status.');
      return;
    }

    const payload = {
      data_demanda: form.data_demanda,
      solicitante: form.solicitante.trim(),
      descricao: form.descricao.trim(),
      assessor: form.assessor?.trim() || null,
      status: form.status,
      motivo_retorno: form.status === 'AGUARDANDO RETORNO' ? form.motivo_retorno?.trim() : null,
    };

    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase.from('demandas').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('demandas').insert(payload);
        if (error) throw error;
      }
      
      await fetchDemandas();
      setIsModalOpen(false);
    } catch (e: any) {
      setError('Erro ao salvar demanda: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredDemandas = demandas.filter(d => {
    const matchesSearch = 
      d.solicitante.toLowerCase().includes(searchTerm.toLowerCase()) || 
      d.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.assessor?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'TODOS' || d.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredDemandas.length / ITEMS_PER_PAGE);
  const paginatedDemandas = filteredDemandas.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const stats = {
    total: demandas.length,
    abertas: demandas.filter(d => d.status === 'ABERTA').length,
    emAtendimento: demandas.filter(d => d.status === 'EM ATENDIMENTO').length,
    aguardando: demandas.filter(d => d.status === 'AGUARDANDO RETORNO').length,
    concluidas: demandas.filter(d => d.status === 'CONCLUÍDA').length,
  };

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in zoom-in-95 duration-300">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-900 dark:text-white flex items-center gap-2">
            <CheckSquare className="h-7 w-7 text-blue-600 dark:text-blue-400" />
            Demandas
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Gerencie as demandas e solicitações do gabinete</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all shadow-sm shadow-blue-500/20 active:scale-95"
        >
          <Plus className="h-5 w-5" /> Nova Demanda
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { id: 'TODOS', label: 'Total de Demandas', value: stats.total, icon: Layers, color: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-500 border-blue-500', hover: 'hover:border-blue-400/50', desc: 'Registradas no sistema', descIcon: TrendingUp },
          { id: 'ABERTA', label: 'Demandas Abertas', value: stats.abertas, icon: AlertCircle, color: 'text-slate-500 dark:text-slate-400', ring: 'ring-slate-500 border-slate-500', hover: 'hover:border-slate-400/50', desc: 'Aguardando início', descIcon: AlertCircle },
          { id: 'EM ATENDIMENTO', label: 'Em Atendimento', value: stats.emAtendimento, icon: PlayCircle, color: 'text-green-600 dark:text-green-400', ring: 'ring-green-500 border-green-500', hover: 'hover:border-green-400/50', desc: 'Em progresso', descIcon: PlayCircle },
          { id: 'AGUARDANDO RETORNO', label: 'Aguardando Retorno', value: stats.aguardando, icon: Clock, color: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-500 border-amber-500', hover: 'hover:border-amber-400/50', desc: 'Ações pendentes', descIcon: Clock },
          { id: 'CONCLUÍDA', label: 'Demandas Concluídas', value: stats.concluidas, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500 border-emerald-500', hover: 'hover:border-emerald-400/50', desc: 'Finalizadas com sucesso', descIcon: CheckCircle2 },
        ].map((stat, i) => (
          <div
            key={i}
            onClick={() => setStatusFilter(statusFilter === stat.id ? 'TODOS' : stat.id)}
            className={`group relative bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border overflow-hidden cursor-pointer transition-all ${statusFilter === stat.id ? `ring-1 ${stat.ring}` : `border-slate-200 dark:border-slate-800 ${stat.hover}`}`}
          >
            <div className="relative z-10">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{stat.label}</p>
              <p className="text-3xl font-bold font-heading text-slate-900 dark:text-white mb-2">{stat.value}</p>
              <div className={`flex items-center gap-1.5 text-xs font-medium ${stat.color}`}>
                <stat.descIcon className="h-3.5 w-3.5" />
                <span>{stat.desc}</span>
              </div>
            </div>
            <stat.icon className="absolute -bottom-4 -right-4 h-24 w-24 text-slate-100 dark:text-slate-800/50 pointer-events-none transition-transform duration-300 group-hover:scale-110" />
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por solicitante, descrição ou assessor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 min-w-[200px]"
        >
          <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white" value="TODOS">Todos os Status</option>
          <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white" value="ABERTA">Abertas</option>
          <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white" value="EM ATENDIMENTO">Em Atendimento</option>
          <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white" value="AGUARDANDO RETORNO">Aguardando Retorno</option>
          <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white" value="CONCLUÍDA">Concluídas</option>
        </select>
      </div>

      {/* List */}
      <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin mb-4" />
            <p>Carregando demandas...</p>
          </div>
        ) : filteredDemandas.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <CheckSquare className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Nenhuma demanda encontrada</h3>
            <p className="text-slate-500 dark:text-slate-400">Tente ajustar seus filtros ou cadastre uma nova demanda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Data</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Solicitante</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Descrição</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Assessor</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {paginatedDemandas.map((demanda) => (
                  <tr key={demanda.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-300">
                      {formatDate(demanda.data_demanda)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-slate-900 dark:text-white">{demanda.solicitante}</div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2" title={demanda.descricao}>
                        {demanda.descricao}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-300">
                      {demanda.assessor || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <select
                        value={demanda.status}
                        onChange={(e) => handleStatusChange(demanda.id, e.target.value as Demanda['status'])}
                        className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider outline-none cursor-pointer appearance-none text-center border-r-8 border-transparent transition-colors ${STATUS_COLORS[demanda.status]}`}
                      >
                        <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium" value="ABERTA">ABERTA</option>
                        <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium" value="EM ATENDIMENTO">EM ATENDIMENTO</option>
                        <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium" value="AGUARDANDO RETORNO">AGUARDANDO RETORNO</option>
                        <option className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium" value="CONCLUÍDA">CONCLUÍDA</option>
                      </select>
                      {demanda.status === 'AGUARDANDO RETORNO' && demanda.motivo_retorno && (
                        <div className="mt-1 flex justify-center cursor-help group relative">
                          <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
                          <div className="absolute bottom-full mb-2 hidden group-hover:block w-64 bg-slate-800 text-white text-xs p-2 rounded shadow-xl z-10 whitespace-normal text-left">
                            {demanda.motivo_retorno}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenModal(demanda)}
                          className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(demanda.id)}
                          className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {!loading && totalPages > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {filteredDemandas.length === 0 ? '0 registros' : `Página ${currentPage} de ${totalPages} · ${filteredDemandas.length} demanda(s)`}
            </span>
            <div className="flex items-center gap-1">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-700 dark:text-slate-300">
                Anterior
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                return (
                  <button key={page} onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${page === currentPage ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                    {page}
                  </button>
                );
              })}
              <button disabled={currentPage === totalPages || totalPages === 0} onClick={() => setCurrentPage(p => p + 1)}
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-700 dark:text-slate-300">
                Próximo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal / Sidebar Form */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !saving && setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {editingId ? 'Editar Demanda' : 'Nova Demanda'}
                </h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <form id="demanda-form" onSubmit={handleSave} className="space-y-5">
                  
                  {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                      <Calendar className="h-4 w-4" /> Data da Demanda <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={form.data_demanda}
                      onChange={(e) => setForm({ ...form, data_demanda: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="relative" ref={dropdownRef}>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                      <User className="h-4 w-4" /> Solicitante <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Nome do solicitante"
                      value={pessoasQuery}
                      onChange={(e) => handlePessoasSearch(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                    />
                    {/* Autocomplete Dropdown */}
                    <AnimatePresence>
                      {showPessoasDropdown && pessoasResult.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                          className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden"
                        >
                          {pessoasResult.map((p, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => selectPessoa(p.full_name)}
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300 transition-colors"
                            >
                              {p.full_name}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                      <AlignLeft className="h-4 w-4" /> Descrição <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required
                      rows={4}
                      placeholder="Descreva a demanda em detalhes"
                      value={form.descricao}
                      onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                      <User className="h-4 w-4" /> Assessor
                    </label>
                    <input
                      type="text"
                      placeholder="Nome do assessor responsável"
                      value={form.assessor}
                      onChange={(e) => setForm({ ...form, assessor: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Status <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as Demanda['status'] })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 dark:text-white"
                    >
                      <option value="ABERTA">ABERTA</option>
                      <option value="EM ATENDIMENTO">EM ATENDIMENTO</option>
                      <option value="AGUARDANDO RETORNO">AGUARDANDO RETORNO</option>
                      <option value="CONCLUÍDA">CONCLUÍDA</option>
                    </select>
                  </div>

                  {form.status === 'AGUARDANDO RETORNO' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="pt-2"
                    >
                      <label className="block text-sm font-medium text-amber-700 dark:text-amber-500 mb-1.5 flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" /> Motivo do Retorno <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        required={form.status === 'AGUARDANDO RETORNO'}
                        rows={3}
                        placeholder="Por que está aguardando retorno?"
                        value={form.motivo_retorno}
                        onChange={(e) => setForm({ ...form, motivo_retorno: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/50 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-slate-900 dark:text-white resize-none"
                      />
                    </motion.div>
                  )}

                </form>
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  form="demanda-form"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                  Salvar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Motivo Retorno */}
      <AnimatePresence>
        {pendingStatusChange && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !saving && setPendingStatusChange(null)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Aguardando Retorno</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Por favor, informe o motivo do retorno.</p>
                </div>
              </div>
              <div className="p-6">
                <textarea
                  autoFocus
                  rows={4}
                  placeholder="Descreva o motivo detalhadamente..."
                  value={motivoPrompt}
                  onChange={(e) => setMotivoPrompt(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-slate-900 dark:text-white resize-none"
                />
              </div>
              <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPendingStatusChange(null)}
                  disabled={saving}
                  className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors border border-slate-200 dark:border-slate-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmStatusChange}
                  disabled={saving || !motivoPrompt.trim()}
                  className="px-5 py-2.5 text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm shadow-amber-500/20"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
