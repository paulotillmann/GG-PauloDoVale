import React, { useState, useEffect, useMemo } from 'react';
import { Users, CalendarDays, StickyNote, TrendingUp, Calendar, ChevronRight, Loader2, PlusCircle, FileText, ChevronLeft, Clock, MapPin, Bell, MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { AgendaItem } from '../components/forms/AgendaForm';

interface DashboardStats {
  total: number;
  thisMonth: number;
  messagesToday: number;
  reqCount: number;
}

interface MonthlyData {
  month: string;
  count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const isThisWeek = (date: Date) => {
  const now = new Date();
  const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
  startOfWeek.setHours(0, 0, 0, 0);
  return date >= startOfWeek;
};

const isThisMonth = (date: Date) => {
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
};

const fmtTime = (t?: string | null) => (t ? t.slice(0, 5) : '');

const TIPO_BADGE: Record<string, { color: string; dot: string }> = {
  'Reunião': { color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400', dot: 'bg-purple-500' },
  'Visita':  { color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  'Outros':  { color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
};

const todayStr = () => new Date().toISOString().slice(0, 10);

type ChartView = 'month' | 'week';

const Dashboard: React.FC = () => {
  const { profile, userModules, isAdmin } = useAuth();
  const firstName = profile?.full_name?.split(' ')[0] || 'Assessor';

  const hasModule = (slug: string) => isAdmin || userModules.some(m => m.slug === slug);
  const canPessoas = hasModule('pessoas');
  const canReq = hasModule('requerimentos');
  const canAgenda = hasModule('agenda');

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({ total: 0, thisMonth: 0, messagesToday: 0, reqCount: 0 });
  const [chartData, setChartData] = useState<MonthlyData[]>([]);
  const [weeklyData, setWeeklyData] = useState<MonthlyData[]>([]);
  const [chartView, setChartView] = useState<ChartView>('week');

  // Calendar State
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // Person Data
        const { data: pessoaData, error: pessoaError } = await supabase.from('pessoa').select('created_at');
        if (pessoaError) throw pessoaError;
        
        // Requerimentos Count
        const { count: reqCount, error: reqError } = await supabase.from('requerimento').select('*', { count: 'exact', head: true });
        if (reqError) throw reqError;

        // Mensagens Hoje Count
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const { count: msgsToday, error: msgsError } = await supabase
          .from('atendimento')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', startOfToday.toISOString());
        if (msgsError) throw msgsError;

        // Agenda Items for the month view
        const firstDayOfMonth = new Date(calYear, calMonth, 1).toISOString();
        const lastDayOfMonth = new Date(calYear, calMonth + 1, 0, 23, 59, 59).toISOString();
        const { data: agendaData, error: agendaError } = await supabase
          .from('agenda')
          .select('*, pessoa(full_name)')
          .gte('data', firstDayOfMonth)
          .lte('data', lastDayOfMonth)
          .order('data', { ascending: true })
          .order('horario_inicio', { ascending: true });
        if (agendaError) throw agendaError;
        
        const rows = pessoaData || [];
        let total = 0;
        let monthCount = 0;

        // Inicia array com os meses do ano zerados
        const monthMap = new Array(12).fill(0);
        
        // Inicia array para os ultimos 7 dias
        const now = new Date();
        const last7Days = [];
        const WEEKDAYS_S = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
        
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          last7Days.push({
            label: `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}(${WEEKDAYS_S[d.getDay()]})`,
            dateString: dateStr,
            count: 0
          });
        }

        rows.forEach(p => {
          total++;
          const d = new Date(p.created_at);
          
          if (isThisMonth(d)) monthCount++;
          
          // Verifica se encaixa nos ultimos 7 dias usando string ISO local
          const pDateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          const dayIndex = last7Days.findIndex(day => day.dateString === pDateStr);
          if (dayIndex !== -1) {
            last7Days[dayIndex].count++;
          }
          
          // Verifica se é deste ano para o gráfico mensal
          if (d.getFullYear() === now.getFullYear()) {
            monthMap[d.getMonth()]++;
          }
        });

        const aggregatedChart = MONTHS.map((m, i) => ({
          month: m,
          count: monthMap[i]
        }));

        const aggregatedWeekly = last7Days.map(d => ({
          month: d.label,
          count: d.count
        }));

        setStats({ total, thisMonth: monthCount, messagesToday: msgsToday || 0, reqCount: reqCount || 0 });
        setChartData(aggregatedChart);
        setWeeklyData(aggregatedWeekly);
        setAgendaItems((agendaData ?? []) as AgendaItem[]);

      } catch (err) {
        console.error('Erro ao carregar dados do dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();

    // Inscreve no Realtime do Supabase para atualizar Dashboard em tempo real 
    const subscription = supabase
      .channel('dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda' }, () => {
        fetchDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pessoa' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [calYear, calMonth]);
  // ─── Navigation ─────────────────────────────────────────────────────────────
  const navigateTo = (menuId: string, action?: string) => {
    if (action) {
      sessionStorage.setItem(`autoOpenForm_${menuId}`, action);
    }
    window.dispatchEvent(new CustomEvent('navigate', { detail: menuId }));
  };

  const activeChartArray = chartView === 'month' ? chartData : weeklyData;
  const maxChartValue = Math.max(...activeChartArray.map(d => d.count), 10);

  // ─── Calendário Computations ────────────────────────────────────────────────
  const calDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const grid: (number | null)[] = [
      ...Array(firstDay).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (grid.length % 7 !== 0) grid.push(null);
    return grid;
  }, [calYear, calMonth]);

  const itemsByDay = useMemo(() => {
    const map: Record<string, AgendaItem[]> = {};
    agendaItems.forEach(item => {
      (map[item.data] ??= []).push(item);
    });
    return map;
  }, [agendaItems]);

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

  const isToday = (dayStr: string) => dayStr === todayStr();

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (loading && stats.total === 0) {
    return (
      <div className="h-full flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-200">
      {/* Greeting */}
      <div>
        <h1 className="text-3xl font-heading font-semibold text-slate-900 dark:text-white">
          Olá, {firstName}
        </h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400 font-sans">
          Panorama da base de dados do gabinete.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white dark:bg-[#1C2434] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
        >
          <div className="absolute top-1/2 -translate-y-1/2 -right-4 opacity-5 dark:opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-300">
            <Users size={80} />
          </div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 relative z-10">Total de Pessoas</p>
          <h3 className="text-4xl font-heading font-bold text-slate-900 dark:text-white mb-2 relative z-10">{stats.total}</h3>
          <div className="flex items-center text-[11px] xl:text-xs font-medium text-blue-600 dark:text-blue-400 relative z-10">
            <TrendingUp className="h-3 w-3 mr-1.5" />
            <span className="opacity-90">Registrados no sistema</span>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white dark:bg-[#1C2434] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
        >
          <div className="absolute top-1/2 -translate-y-1/2 -right-4 opacity-5 dark:opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-300">
            <Calendar size={80} />
          </div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 relative z-10">Pessoas neste Mês</p>
          <h3 className="text-4xl font-heading font-bold text-slate-900 dark:text-white mb-2 relative z-10">{stats.thisMonth}</h3>
          <div className="flex items-center text-[11px] xl:text-xs font-medium text-emerald-600 dark:text-emerald-400 relative z-10">
            <Calendar className="h-3 w-3 mr-1.5" />
            <span className="opacity-90">Novas inclusões no mês</span>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="bg-white dark:bg-[#1C2434] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
        >
          <div className="absolute top-1/2 -translate-y-1/2 -right-4 opacity-5 dark:opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-300">
            <FileText size={80} />
          </div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 relative z-10">Requerimentos</p>
          <h3 className="text-4xl font-heading font-bold text-slate-900 dark:text-white mb-2 relative z-10">{stats.reqCount}</h3>
          <div className="flex items-center text-[11px] xl:text-xs font-medium text-purple-600 dark:text-purple-400 relative z-10">
            <FileText className="h-3 w-3 mr-1.5" />
            <span className="opacity-90">Total de requerimentos listados</span>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="bg-white dark:bg-[#1C2434] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-orange-300 dark:hover:border-orange-700 transition-colors"
        >
          <div className="absolute top-1/2 -translate-y-1/2 -right-4 opacity-5 dark:opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-300">
            <MessageSquare size={80} />
          </div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 relative z-10">Mensagens Hoje</p>
          <h3 className="text-4xl font-heading font-bold text-slate-900 dark:text-white mb-2 relative z-10">{stats.messagesToday}</h3>
          <div className="flex items-center text-[11px] xl:text-xs font-medium text-orange-600 dark:text-orange-400 relative z-10">
            <MessageSquare className="h-3 w-3 mr-1.5" />
            <span className="opacity-90">Interações via IA (hoje)</span>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Seção Agenda do Mês (Lado Esquerdo - 2/3) */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-[#1C2434] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 overflow-hidden h-full">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-heading font-semibold text-slate-900 dark:text-white">Agenda do Mês</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Visão geral dos compromissos registrados.</p>
              </div>
            </div>

            <div className="max-w-4xl mx-auto">
              {/* Nav do Calendário */}
              <div className="flex items-center justify-between mb-4 bg-slate-50 dark:bg-slate-800/40 p-2 rounded-xl">
                <button
                  onClick={prevMonth}
                  className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <h3 className="font-heading font-bold text-slate-900 dark:text-white text-lg">
                  {MONTHS_FULL[calMonth]} {calYear}
                </h3>
                <button
                  onClick={nextMonth}
                  className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              <div className={loading ? 'opacity-50 pointer-events-none' : ''}>
                {/* Weekdays header */}
                <div className="grid grid-cols-7 mb-2">
                  {WEEKDAYS_SHORT.map(d => (
                    <div key={d} className="text-center text-xs font-bold text-slate-400 uppercase tracking-wide py-1">{d}</div>
                  ))}
                </div>

                {/* Days grid */}
                <div className="grid grid-cols-7 gap-2">
                  {calDays.map((day, i) => {
                    if (!day) return <div key={i} className="min-h-[80px]" />;
                    const dayStr = calDayStr(day);
                    const dayItems = itemsByDay[dayStr] ?? [];
                    const isTodayDay = isToday(dayStr);

                    return (
                      <div
                        key={i}
                        onClick={() => canAgenda && navigateTo('agenda')}
                        className={`min-h-[80px] rounded-xl p-2 border transition-all
                          ${canAgenda ? 'cursor-pointer hover:shadow-md' : 'cursor-default'}
                          ${isTodayDay ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-900/10' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/50'}
                          ${!isTodayDay && canAgenda ? 'hover:border-slate-300 dark:hover:border-slate-600' : ''}
                        `}
                      >
                        <span className={`text-xs font-bold block text-center mb-1.5 w-6 h-6 mx-auto rounded-full flex items-center justify-center
                          ${isTodayDay ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}
                        `}>
                          {day}
                        </span>
                        <div className="space-y-1">
                          {dayItems.slice(0, 2).map(item => {
                            const dot = TIPO_BADGE[item.tipo ?? '']?.dot ?? 'bg-slate-400';
                            return (
                              <div key={item.id} className="flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded px-1 py-0.5 truncate">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                                <span className="truncate max-w-[40px] sm:max-w-[80px]">{fmtTime(item.horario_inicio)} {item.tipo ?? ''}</span>
                              </div>
                            );
                          })}
                          {dayItems.length > 2 && (
                            <div className="text-[10px] text-center text-blue-500 font-semibold bg-blue-50 dark:bg-blue-900/20 rounded py-0.5">
                              +{dayItems.length - 2} mais
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar Widgets - Ações Rápidas (Lado Direito - 1/3) */}
        <div className="space-y-6 flex flex-col">
          <div className="bg-white dark:bg-[#1C2434] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex-1">
            <h2 className="text-xl font-heading font-semibold text-slate-900 dark:text-white mb-2">Ações Rápidas</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Inicie suas operações pelos atalhos abaixo.</p>
            
            <div className="space-y-3">
              <button 
                onClick={() => canPessoas && navigateTo('pessoas', 'create')}
                disabled={!canPessoas}
                className={`w-full flex items-center p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 transition-all text-left group relative overflow-hidden
                  ${canPessoas ? 'hover:border-blue-400 dark:hover:border-blue-600 hover:bg-slate-50 dark:hover:bg-slate-800/40' : 'opacity-50 cursor-not-allowed bg-slate-50/50 dark:bg-slate-800/20 grayscale-[50%]'}
                `}
              >
                <div className={`h-10 w-10 flex items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 mr-3 ${canPessoas ? 'group-hover:scale-105 transition-transform' : ''}`}>
                  <Users className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <span className={`block text-sm font-semibold text-slate-800 dark:text-slate-200 transition-colors ${canPessoas ? 'group-hover:text-blue-600 dark:group-hover:text-blue-400' : ''}`}>
                    Nova Pessoa/Entidade
                  </span>
                  <span className="block text-xs text-slate-500">Abrir o formulário de cadastro</span>
                </div>
                <ChevronRight className={`h-4 w-4 text-slate-400 transition-all ${canPessoas ? 'group-hover:text-blue-500 group-hover:translate-x-0.5' : ''}`} />
              </button>

              <button 
                onClick={() => canReq && navigateTo('requerimentos', 'create')}
                disabled={!canReq}
                className={`w-full flex items-center p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 transition-all text-left group overflow-hidden relative
                  ${canReq ? 'hover:border-purple-400 dark:hover:border-purple-600 hover:bg-slate-50 dark:hover:bg-slate-800/40' : 'opacity-50 cursor-not-allowed bg-slate-50/50 dark:bg-slate-800/20 grayscale-[50%]'}
                `}
              >
                <div className={`h-10 w-10 flex items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 mr-3 ${canReq ? 'group-hover:scale-105 transition-transform' : ''}`}>
                  <FileText className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <span className={`block text-sm font-semibold text-slate-800 dark:text-slate-200 transition-colors ${canReq ? 'group-hover:text-purple-600 dark:group-hover:text-purple-400' : ''}`}>
                    Novo Requerimento
                  </span>
                  <span className="block text-xs text-slate-500">Adicionar à lista</span>
                </div>
                <ChevronRight className={`h-4 w-4 text-slate-400 transition-all ${canReq ? 'group-hover:text-purple-500 group-hover:translate-x-0.5' : ''}`} />
              </button>

              <button 
                onClick={() => canAgenda && navigateTo('agenda', 'create')}
                disabled={!canAgenda}
                className={`w-full flex items-center p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 transition-all text-left group overflow-hidden relative
                  ${canAgenda ? 'hover:border-violet-400 dark:hover:border-violet-600 hover:bg-slate-50 dark:hover:bg-slate-800/40' : 'opacity-50 cursor-not-allowed bg-slate-50/50 dark:bg-slate-800/20 grayscale-[50%]'}
                `}
              >
                <div className={`h-10 w-10 flex items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 mr-3 ${canAgenda ? 'group-hover:scale-105 transition-transform' : ''}`}>
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <span className={`block text-sm font-semibold text-slate-800 dark:text-slate-200 transition-colors ${canAgenda ? 'group-hover:text-violet-600 dark:group-hover:text-violet-400' : ''}`}>
                    Nova Agenda
                  </span>
                  <span className="block text-xs text-slate-500">Marcar compromisso</span>
                </div>
                <ChevronRight className={`h-4 w-4 text-slate-400 transition-all ${canAgenda ? 'group-hover:text-violet-500 group-hover:translate-x-0.5' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Gráfico Section (Parte Inferior) */}
      <div className="bg-white dark:bg-[#1C2434] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm min-h-[400px] flex flex-col">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-heading font-semibold text-slate-900 dark:text-white">Crescimento da Base</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Total de cadastros de pessoas no período selecionado.</p>
          </div>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg self-start">
            <button
              onClick={() => setChartView('week')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                chartView === 'week' 
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Últimos 7 dias
            </button>
            <button
              onClick={() => setChartView('month')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                chartView === 'month' 
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Meses do Ano
            </button>
          </div>
        </div>
        
        {/* CSS Bar Chart */}
        <div className="mt-6">
          <div className="relative h-48">
            {/* Grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="border-b border-dashed border-slate-100 dark:border-slate-800/60 w-full" />
              ))}
            </div>

            {/* Bars */}
            <div className="absolute inset-0 flex items-end justify-around gap-1 px-2">
              {activeChartArray.map((data, idx) => {
                const heightPercent = data.count > 0 ? Math.max((data.count / maxChartValue) * 100, 6) : 0;
                return (
                  <div key={idx} className="flex flex-col items-center justify-end h-full flex-1 relative group">
                    {/* Tooltip */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-white text-xs font-semibold rounded whitespace-nowrap pointer-events-none z-20">
                      {data.count} cadastros
                    </div>
                    <div
                      className="w-full max-w-[32px] bg-gradient-to-t from-blue-600 to-blue-400 dark:from-blue-700 dark:to-blue-500 rounded-t-md transition-all duration-500 hover:from-blue-500 hover:to-blue-300"
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* X-axis labels */}
          <div className="flex justify-around gap-1 px-2 mt-2">
            {activeChartArray.map((data, idx) => (
              <div key={idx} className="flex-1 text-center">
                <span className="text-[9px] sm:text-[10px] font-medium text-slate-400 dark:text-slate-500 whitespace-pre-wrap break-words leading-tight">
                  {data.month}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      
    </div>
  );
};

export default Dashboard;
