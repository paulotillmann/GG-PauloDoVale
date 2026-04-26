import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays, Plus, Loader2, CheckCircle,
  Pencil, Trash2, ChevronUp, ChevronDown, ChevronsUpDown,
  Users, MapPin, MoreHorizontal, ChevronLeft, ChevronRight,
  Bell, Clock, AlertCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import AgendaForm, { AgendaItem, TIPO_COLORS } from '../components/forms/AgendaForm';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

// Retorna a data local (fuso do navegador) no formato YYYY-MM-DD
const localDateStr = (offset = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const todayStr    = () => localDateStr(0);
const tomorrowStr = () => localDateStr(1);

const fmtTime = (t?: string | null) => (t ? t.slice(0, 5) : '');

const fmtDate = (d: string) => {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const TIPO_BADGE: Record<string, { color: string; dot: string }> = {
  'Reunião': { color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400', dot: 'bg-purple-500' },
  'Visita':  { color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  'Outros':  { color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
};

// ─── Componente ───────────────────────────────────────────────────────────────
const AgendaScreen: React.FC = () => {
  const [items, setItems]           = useState<AgendaItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<AgendaItem> | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  // Filtros
  const [filterTipo, setFilterTipo]     = useState('');
  const [filterDay, setFilterDay]       = useState(todayStr());
  const [filterInicio, setFilterInicio] = useState('');
  const [filterFim, setFilterFim]       = useState('');
  const [search, setSearch]             = useState('');

  // Calendário
  const [calYear, setCalYear]   = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  // Listagem
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;
  const [sortConfig, setSortConfig] = useState<{ key: keyof AgendaItem; direction: 'asc'|'desc' }>({
    key: 'data', direction: 'desc',
  });

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const { data } = await supabase
      .from('agenda')
      .select('*, pessoa(full_name)')
      .order('data', { ascending: false })
      .order('horario_inicio', { ascending: false });
    setItems((data ?? []) as AgendaItem[]);
    if (showLoading) setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    // Inscreve no Realtime do Supabase para atualizar em tempo real quando o n8n alterar o banco
    const subscription = supabase
      .channel('agenda_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda' }, () => {
        fetchData(false);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [fetchData]);
  useEffect(() => { setCurrentPage(1); }, [search, filterTipo, filterDay, filterInicio, filterFim]);

  // ─── Auto-open form check (Vindo do Dashboard) ──────────────────────────────
  useEffect(() => {
    const autoAction = sessionStorage.getItem('autoOpenForm_agenda');
    if (autoAction === 'create') {
      sessionStorage.removeItem('autoOpenForm_agenda');
      setEditingItem(null);
      setShowForm(true);
    }
  }, []);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:   items.length,
    reuniao: items.filter(i => i.tipo === 'Reunião').length,
    visita:  items.filter(i => i.tipo === 'Visita').length,
    outros:  items.filter(i => i.tipo === 'Outros').length,
  }), [items]);

  // ── Agenda de Hoje ────────────────────────────────────────────────────────
  const today = todayStr();
  const now = new Date();
  const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const todayItems = useMemo(() => {
    return items
      .filter(i => i.data === today)
      .sort((a, b) => (a.horario_inicio < b.horario_inicio ? 1 : -1));
  }, [items, today]);

  // ── Calendário ────────────────────────────────────────────────────────────
  const calDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const grid: (number | null)[] = [
      ...Array(firstDay).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    // Pad to full weeks
    while (grid.length % 7 !== 0) grid.push(null);
    return grid;
  }, [calYear, calMonth]);

  const itemsByDay = useMemo(() => {
    const map: Record<string, AgendaItem[]> = {};
    items.forEach(item => {
      (map[item.data] ??= []).push(item);
    });
    return map;
  }, [items]);

  const calDayStr = (day: number) =>
    `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  // ── Filtros + Ordenação + Paginação ───────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i => {
      const matchSearch =
        i.titulo_compromisso.toLowerCase().includes(q) ||
        (i.local ?? '').toLowerCase().includes(q) ||
        ((i.pessoa as any)?.full_name ?? '').toLowerCase().includes(q);
      const matchTipo = filterTipo ? i.tipo === filterTipo : true;
      const matchDay  = filterDay  ? i.data === filterDay  : true;
      const matchInicio = filterInicio ? i.data >= filterInicio : true;
      const matchFim = filterFim ? i.data <= filterFim : true;
      return matchSearch && matchTipo && matchDay && matchInicio && matchFim;
    });
  }, [items, search, filterTipo, filterDay, filterInicio, filterFim]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const { key, direction } = sortConfig;
      const vA = (a[key] ?? '').toString();
      const vB = (b[key] ?? '').toString();
      if (vA < vB) return direction === 'asc' ? -1 : 1;
      if (vA > vB) return direction === 'asc' ? 1 : -1;
      
      // Desempate por horário de início
      const tA = (a.horario_inicio ?? '').toString();
      const tB = (b.horario_inicio ?? '').toString();
      if (tA < tB) return direction === 'asc' ? -1 : 1;
      if (tA > tB) return direction === 'asc' ? 1 : -1;

      return 0;
    });
  }, [filtered, sortConfig]);

  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
  const paginated  = sorted.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleSort = (key: keyof AgendaItem) =>
    setSortConfig(prev => prev.key === key
      ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' });

  const renderSortIcon = (key: keyof AgendaItem) => {
    if (sortConfig.key !== key) return <ChevronsUpDown className="h-3 w-3 ml-1.5 opacity-30" />;
    return sortConfig.direction === 'asc'
      ? <ChevronUp className="h-3 w-3 ml-1.5 text-blue-500" />
      : <ChevronDown className="h-3 w-3 ml-1.5 text-blue-500" />;
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const openCreate = () => { setEditingItem(null); setShowForm(true); };
  const openEdit   = (item: AgendaItem) => { setEditingItem(item); setShowForm(true); };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('agenda').delete().eq('id', id);
    if (!error) {
      setDeleteId(null);
      setSelectedIds(prev => prev.filter(s => s !== id));
      fetchData(false);
      showSuccess('Compromisso removido!');
    } else {
      console.error('Erro ao excluir:', error);
      showSuccess(`Erro ao excluir: ${error.message}`);
      setDeleteId(null);
    }
  };

  const handleBulkDelete = async () => {
    const count = selectedIds.length;
    const { error } = await supabase.from('agenda').delete().in('id', selectedIds);
    if (!error) {
      setShowBulkDelete(false);
      setSelectedIds([]);
      fetchData(false);
      showSuccess(`${count} compromissos removidos!`);
    } else {
      console.error('Erro ao excluir em massa:', error);
      showSuccess(`Erro ao excluir: ${error.message}`);
      setShowBulkDelete(false);
    }
  };

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  const toggleSelectAll = () => {
    const ids = paginated.map(i => i.id);
    const allSel = ids.length > 0 && ids.every(id => selectedIds.includes(id));
    if (allSel) setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
    else setSelectedIds(prev => [...new Set([...prev, ...ids])]);
  };

  // ── Form mode ─────────────────────────────────────────────────────────────
  useEffect(() => {
    document.getElementById('main-scroll-container')?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [showForm]);

  if (showForm) {
    return (
      <div className="h-full">
        <AgendaForm
          initialData={editingItem}
          mode={editingItem ? 'edit' : 'create'}
          onClose={() => setShowForm(false)}
          onSuccess={msg => { setShowForm(false); fetchData(); showSuccess(msg); }}
        />
      </div>
    );
  }

  // ── Render principal ──────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <CalendarDays className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            Agenda
          </h1>
          <p className="text-sm font-sans text-slate-500 dark:text-slate-400 mt-1">
            Gestão de compromissos e reuniões
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4 mr-2" /> Novo Compromisso
        </button>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 rounded-xl text-sm"
          >
            <CheckCircle className="h-4 w-4 shrink-0" /> {successMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', tipo: '', value: stats.total,   icon: CalendarDays, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Reuniões', tipo: 'Reunião', value: stats.reuniao, icon: Users, color: 'text-purple-600 dark:text-purple-400' },
          { label: 'Visitas',  tipo: 'Visita',  value: stats.visita,  icon: MapPin, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Outros',   tipo: 'Outros',  value: stats.outros,  icon: MoreHorizontal, color: 'text-amber-600 dark:text-amber-400' },
        ].map((stat, i) => (
          <div
            key={i}
            onClick={() => setFilterTipo(filterTipo === stat.tipo && stat.tipo !== '' ? '' : stat.tipo)}
            className={`bg-white dark:bg-[#1C2434] rounded-2xl p-5 border shadow-sm flex flex-col justify-between relative overflow-hidden group cursor-pointer transition-all
              ${filterTipo === stat.tipo && stat.tipo !== '' ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200 dark:border-slate-800 hover:border-blue-400/50'}
            `}
          >
            <div className="absolute top-1/2 -translate-y-1/2 -right-4 opacity-5 dark:opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-300">
              <stat.icon size={80} />
            </div>
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400 relative z-10">{stat.label}</span>
            <div className={`mt-2 text-3xl font-heading font-bold ${stat.color} relative z-10`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Calendário + Agenda de Hoje */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Calendário */}
        <div className="lg:col-span-3 bg-white dark:bg-[#1C2434] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
          {/* Nav */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h3 className="font-heading font-bold text-slate-900 dark:text-white text-lg">
              {MONTHS[calMonth]} {calYear}
            </h3>
            <button
              onClick={nextMonth}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Weekdays header */}
          <div className="grid grid-cols-7 mb-2">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wide py-1">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {calDays.map((day, i) => {
              if (!day) return <div key={i} />;
              const dayStr = calDayStr(day);
              const dayItems = itemsByDay[dayStr] ?? [];
              const isToday = dayStr === today;
              const isSelected = dayStr === filterDay;

              return (
                <div
                  key={i}
                  onClick={() => setFilterDay(prev => prev === dayStr ? '' : dayStr)}
                  className={`min-h-[64px] rounded-xl p-1.5 cursor-pointer border transition-all
                    ${isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'}
                    ${isToday && !isSelected ? 'ring-2 ring-blue-400/60' : ''}
                  `}
                >
                  <span className={`text-xs font-semibold block text-right mb-1 w-5 h-5 rounded-full flex items-center justify-center ml-auto
                    ${isToday ? 'bg-blue-600 text-white' : 'text-slate-700 dark:text-slate-300'}
                  `}>
                    {day}
                  </span>
                  <div className="space-y-0.5">
                    {dayItems.slice(0, 2).map(item => {
                      const dot = TIPO_BADGE[item.tipo ?? '']?.dot ?? 'bg-slate-400';
                      return (
                        <div key={item.id} className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-400 truncate">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                          <span className="truncate">{fmtTime(item.horario_inicio)} {item.tipo ?? ''}</span>
                        </div>
                      );
                    })}
                    {dayItems.length > 2 && (
                      <span className="text-[10px] text-slate-400">+{dayItems.length - 2} mais</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Agenda de Hoje */}
        <div className="lg:col-span-2 bg-white dark:bg-[#1C2434] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="font-heading font-bold text-slate-900 dark:text-white">
              Agenda de Hoje
            </h3>
            <span className="ml-auto text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-semibold">
              {fmtDate(today)}
            </span>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : todayItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 text-slate-400">
              <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhum compromisso hoje</p>
              <button onClick={openCreate} className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                + Adicionar compromisso
              </button>
            </div>
          ) : (
            <div className="flex-1 space-y-3 overflow-hidden">
              {todayItems.slice(0, 4).map(item => {
                const meta = TIPO_BADGE[item.tipo ?? ''] ?? { color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };
                const isPast = item.horario_inicio && item.horario_inicio.slice(0, 5) < currentTimeStr;
                return (
                  <div key={item.id} className={`flex gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 transition-all ${isPast ? 'opacity-50' : ''}`}>
                    <div className={`w-1 rounded-full shrink-0 ${meta.dot} ${isPast ? 'bg-slate-300 dark:bg-slate-600' : ''}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">
                          {fmtTime(item.horario_inicio)}{item.horario_fim ? ` – ${fmtTime(item.horario_fim)}` : ''}
                        </span>
                        {item.tipo && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${isPast ? 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400' : meta.color}`}>
                            {item.tipo}
                          </span>
                        )}
                        {item.lembrar && <Bell className="h-3 w-3 text-red-500" />}
                      </div>
                      <p className={`text-sm font-semibold truncate ${isPast ? 'text-slate-500 dark:text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}>
                        {item.titulo_compromisso}
                      </p>
                      {item.local && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" /> {item.local}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => openEdit(item)}
                      className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shrink-0 self-start"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
              {todayItems.length > 4 && (
                <div className="mt-3 text-center">
                  <span className="inline-block text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full">
                    + {todayItems.length - 4} compromisso(s) hoje
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Filtros ativos */}
      {(filterTipo || filterDay) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500 dark:text-slate-400">Filtros ativos:</span>
          {filterTipo && (
            <span
              onClick={() => setFilterTipo('')}
              className="cursor-pointer flex items-center gap-1 px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
            >
              Tipo: {filterTipo} ×
            </span>
          )}
          {filterDay && (
            <span
              onClick={() => setFilterDay('')}
              className="cursor-pointer flex items-center gap-1 px-2.5 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-full text-xs font-medium hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
            >
              Dia: {fmtDate(filterDay)} ×
            </span>
          )}
        </div>
      )}

      {/* Listagem */}
      <div className="bg-white dark:bg-[#1C2434] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* Barra de Busca + Filtros + Bulk Delete */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-4">
          
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <CalendarDays className="h-4 w-4" />
            </span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar compromisso..."
              className="w-full pl-9 pr-4 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Botões Rápidos */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              onClick={() => { setFilterDay(todayStr()); setFilterInicio(''); setFilterFim(''); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${filterDay === todayStr() ? 'bg-blue-100 border-blue-200 text-blue-700 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-300' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`}
            >
              Hoje
            </button>
            <button
              onClick={() => { setFilterDay(tomorrowStr()); setFilterInicio(''); setFilterFim(''); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${filterDay === tomorrowStr() ? 'bg-blue-100 border-blue-200 text-blue-700 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-300' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`}
            >
              Amanhã
            </button>
            <button
              onClick={() => { setFilterDay(''); setFilterInicio(''); setFilterFim(''); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${!filterDay && !filterInicio && !filterFim ? 'bg-slate-800 border-slate-900 text-white dark:bg-white dark:border-white dark:text-slate-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`}
            >
              Todos
            </button>
          </div>

          {/* Spacer automático para empurrar o resto para a direita em telas largas */}
          <div className="hidden lg:block lg:flex-1"></div>

          {/* Filtro Período */}
          <div className="flex items-center gap-2 text-sm flex-wrap ml-auto">
            <span className="text-slate-500 text-xs font-medium uppercase tracking-wide hidden md:inline-block">Período:</span>
            <input
              type="date"
              value={filterInicio}
              onChange={e => { setFilterInicio(e.target.value); setFilterDay(''); }}
              className="px-2 py-1.5 w-[120px] border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-xs"
            />
            <span className="text-slate-400 text-xs font-medium">até</span>
            <input
              type="date"
              value={filterFim}
              onChange={e => { setFilterFim(e.target.value); setFilterDay(''); }}
              className="px-2 py-1.5 w-[120px] border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-xs"
            />
          </div>

          {/* Bulk Delete (Muda de posição dependendo da tela, mas fica no fim) */}
          {selectedIds.length > 0 && (
            <button
              onClick={() => setShowBulkDelete(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors ml-auto sm:ml-0"
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir {selectedIds.length}
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-3" /> Carregando compromissos...
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <AlertCircle className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Nenhum compromisso encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={paginated.length > 0 && paginated.every(i => selectedIds.includes(i.id))}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 accent-blue-600 rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => handleSort('data')} className="flex items-center group text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                      Data / Hora {renderSortIcon('data')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => handleSort('titulo_compromisso')} className="flex items-center group text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                      Título {renderSortIcon('titulo_compromisso')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => handleSort('tipo')} className="flex items-center group text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                      Tipo {renderSortIcon('tipo')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                    Local / Pessoa
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                    Lembrar
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginated.map((item, i) => {
                  const meta = TIPO_BADGE[item.tipo ?? ''] ?? { color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };
                  return (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)}
                          className="w-4 h-4 accent-blue-600 rounded" />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">{fmtDate(item.data)}</p>
                        <p className="text-xs text-slate-400 font-mono">{fmtTime(item.horario_inicio)}{item.horario_fim ? ` – ${fmtTime(item.horario_fim)}` : ''}</p>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="font-medium text-slate-800 dark:text-slate-200 text-sm truncate">{item.titulo_compromisso}</p>
                      </td>
                      <td className="px-4 py-3">
                        {item.tipo ? (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${meta.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                            {item.tipo}
                          </span>
                        ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                          {item.local || ((item.pessoa as any)?.full_name) || <span className="text-slate-300 dark:text-slate-600">—</span>}
                        </p>
                        {item.local && (item.pessoa as any)?.full_name && (
                          <p className="text-xs text-slate-400">{(item.pessoa as any).full_name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.lembrar
                          ? <Bell className="h-4 w-4 text-red-500 mx-auto" />
                          : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => setDeleteId(item.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {!loading && totalPages > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {sorted.length === 0 ? '0 registros' : `Página ${currentPage} de ${totalPages} · ${sorted.length} compromisso(s)`}
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

      {/* Modal: Confirmar delete individual */}
      <AnimatePresence>
        {deleteId && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setDeleteId(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-heading font-bold text-slate-900 dark:text-white">Excluir compromisso?</h3>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setDeleteId(null)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  Cancelar
                </button>
                <button onClick={() => handleDelete(deleteId)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
                  Excluir
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Confirmar bulk delete */}
      <AnimatePresence>
        {showBulkDelete && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowBulkDelete(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-heading font-bold text-slate-900 dark:text-white">
                  Excluir {selectedIds.length} compromisso(s)?
                </h3>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowBulkDelete(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleBulkDelete}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
                  Excluir tudo
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AgendaScreen;
