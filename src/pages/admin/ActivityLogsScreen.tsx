import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Search, Filter, Download, RefreshCw, Loader2,
  LogIn, LogOut, Plus, Pencil, Trash2, ChevronUp, ChevronDown,
  ChevronsUpDown, AlertCircle, Shield,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface ActivityLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  description: string | null;
  created_at: string;
}

type SortKey = 'created_at' | 'user_name' | 'action' | 'table_name';

const ACTION_LABELS: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  LOGIN:  { label: 'Login',   color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',   Icon: LogIn },
  LOGOUT: { label: 'Logout',  color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',  Icon: LogOut },
  INSERT: { label: 'Inclusão',color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', Icon: Plus },
  UPDATE: { label: 'Alteração',color:'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',  Icon: Pencil },
  DELETE: { label: 'Exclusão',color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',       Icon: Trash2 },
};

const TABLE_LABELS: Record<string, string> = {
  pessoa: 'Pessoas',
  dependentes: 'Dependentes',
  profiles: 'Perfis de Usuário',
  roles: 'Perfis de Acesso',
  modules: 'Módulos',
  role_module_permissions: 'Permissões',
};

const ITEMS_PER_PAGE = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

// Exporta CSV com os logs filtrados
const exportCSV = (logs: ActivityLog[]) => {
  const headers = ['Data/Hora', 'Usuário', 'E-mail', 'Ação', 'Tabela', 'Descrição', 'ID Registro'];
  const rows = logs.map(l => [
    formatDateTime(l.created_at),
    l.user_name ?? '',
    l.user_email ?? '',
    ACTION_LABELS[l.action]?.label ?? l.action,
    TABLE_LABELS[l.table_name ?? ''] ?? l.table_name ?? '',
    l.description ?? '',
    l.record_id ?? '',
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `logs_atividades_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

// ─── Componente ───────────────────────────────────────────────────────────────
const ActivityLogsScreen: React.FC = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterTable, setFilterTable] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'created_at',
    direction: 'desc',
  });

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) setLogs((data ?? []) as ActivityLog[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Reseta página ao mudar filtros
  useEffect(() => { setCurrentPage(1); }, [search, filterAction, filterTable, filterUser]);

  // ── Filtros ───────────────────────────────────────────────────────────────
  const filtered = logs.filter(l => {
    const q = search.toLowerCase();
    const matchSearch =
      (l.description ?? '').toLowerCase().includes(q) ||
      (l.user_name ?? '').toLowerCase().includes(q) ||
      (l.user_email ?? '').toLowerCase().includes(q);
    const matchAction = filterAction ? l.action === filterAction : true;
    const matchTable = filterTable ? l.table_name === filterTable : true;
    const matchUser = filterUser ? (l.user_email === filterUser || l.user_name === filterUser) : true;
    return matchSearch && matchAction && matchTable && matchUser;
  });

  // ── Ordenação ─────────────────────────────────────────────────────────────
  const sorted = [...filtered].sort((a, b) => {
    const { key, direction } = sortConfig;
    const valA = (a[key] ?? '').toString().toLowerCase();
    const valB = (b[key] ?? '').toString().toLowerCase();
    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  // ── Paginação ────────────────────────────────────────────────────────────
  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
  const paginated = sorted.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Listas únicas para selects
  const uniqueUsers = Array.from(new Set(logs.map(l => l.user_email).filter(Boolean))) as string[];
  const uniqueTables = Array.from(new Set(logs.map(l => l.table_name).filter(Boolean))) as string[];

  const handleSort = (key: SortKey) => {
    setSortConfig(prev =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortConfig.key !== key) return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-30 group-hover:opacity-100 transition-opacity" />;
    return sortConfig.direction === 'asc'
      ? <ChevronUp className="h-3 w-3 ml-1 text-blue-500" />
      : <ChevronDown className="h-3 w-3 ml-1 text-blue-500" />;
  };

  const renderPaginationInfo = () => {
    if (filtered.length === 0) return '0 registros';
    const start = (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const end = Math.min(currentPage * ITEMS_PER_PAGE, filtered.length);
    return `Página ${currentPage} de ${totalPages} · Mostrando ${start}-${end} de ${filtered.length} registros`;
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            Logs de Atividade
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Auditoria completa de ações realizadas no sistema
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => exportCSV(sorted)}
            disabled={sorted.length === 0}
            className="flex items-center px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(ACTION_LABELS).map(([key, { label, color, Icon }]) => {
          const count = logs.filter(l => l.action === key).length;
          return (
            <motion.div key={key}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-[#1C2434] rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm cursor-pointer hover:border-blue-400/50 transition-colors"
              onClick={() => setFilterAction(prev => prev === key ? '' : key)}
            >
              <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold mb-2 ${color}`}>
                <Icon className="h-3 w-3" /> {label}
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{count}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-[#1C2434] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar na descrição ou usuário..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <select
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 appearance-none"
            >
              <option value="">Todas as ações</option>
              {Object.entries(ACTION_LABELS).map(([k, { label }]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <select
              value={filterTable}
              onChange={e => setFilterTable(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 appearance-none"
            >
              <option value="">Todas as tabelas</option>
              {uniqueTables.map(t => (
                <option key={t} value={t}>{TABLE_LABELS[t] ?? t}</option>
              ))}
            </select>
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <select
              value={filterUser}
              onChange={e => setFilterUser(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 appearance-none"
            >
              <option value="">Todos os usuários</option>
              {uniqueUsers.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white dark:bg-[#1C2434] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-3" /> Carregando logs...
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <AlertCircle className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Nenhum log encontrado para os filtros selecionados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => handleSort('created_at')} className="flex items-center group font-semibold text-slate-600 dark:text-slate-300 text-xs uppercase tracking-wide">
                      Data/Hora {renderSortIcon('created_at')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => handleSort('user_name')} className="flex items-center group font-semibold text-slate-600 dark:text-slate-300 text-xs uppercase tracking-wide">
                      Usuário {renderSortIcon('user_name')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => handleSort('action')} className="flex items-center group font-semibold text-slate-600 dark:text-slate-300 text-xs uppercase tracking-wide">
                      Ação {renderSortIcon('action')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button onClick={() => handleSort('table_name')} className="flex items-center group font-semibold text-slate-600 dark:text-slate-300 text-xs uppercase tracking-wide">
                      Tabela {renderSortIcon('table_name')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300 text-xs uppercase tracking-wide">
                    Descrição
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginated.map((log, i) => {
                  const actionMeta = ACTION_LABELS[log.action] ?? { label: log.action, color: 'bg-slate-100 text-slate-600', Icon: AlertCircle };
                  const ActionIcon = actionMeta.Icon;
                  return (
                    <motion.tr
                      key={log.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400 font-mono text-xs">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-slate-200 text-sm">{log.user_name ?? '—'}</p>
                        <p className="text-xs text-slate-400">{log.user_email ?? ''}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${actionMeta.color}`}>
                          <ActionIcon className="h-3 w-3" />
                          {actionMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-sm">
                        {log.table_name ? (TABLE_LABELS[log.table_name] ?? log.table_name) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300 text-sm max-w-sm truncate" title={log.description ?? ''}>
                        {log.description ?? '—'}
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
            <span className="text-xs text-slate-500 dark:text-slate-400">{renderPaginationInfo()}</span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-700 dark:text-slate-300"
              >
                Anterior
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      page === currentPage
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
              <button
                disabled={currentPage === totalPages || totalPages === 0}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-700 dark:text-slate-300"
              >
                Próximo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityLogsScreen;
