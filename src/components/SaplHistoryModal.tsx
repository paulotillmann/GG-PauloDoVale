import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, Loader2, FileText, DatabaseBackup } from 'lucide-react';
import { supabase } from '../lib/supabase';

export interface SaplHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  requerimentoId?: string | null; // Se fornecido, filtra; se null, mostra geral
}

interface HistoricoRow {
  id: string;
  entidade_tipo: string;
  entidade_identificador: string;
  acao: string;
  detalhes_alteracao: any;
  created_at: string;
  requerimento: {
    numero_requerimento: string;
  } | null;
}

const fmtDate = (d: string) => {
  return new Date(d).toLocaleString('pt-BR');
};

const SaplHistoryModal: React.FC<SaplHistoryModalProps> = ({ isOpen, onClose, requerimentoId }) => {
  const [historico, setHistorico] = useState<HistoricoRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchHistorico();
    }
  }, [isOpen, requerimentoId]);

  const fetchHistorico = async () => {
    setLoading(true);
    let query = supabase
      .from('sapl_sincronismo_historico')
      .select('*, requerimento(numero_requerimento)')
      .order('created_at', { ascending: false });

    if (requerimentoId) {
      query = query.eq('requerimento_id', requerimentoId);
    } else {
      query = query.limit(100); // Limita para não travar em caso de muitos logs gerais
    }

    const { data, error } = await query;
    if (!error && data) {
      setHistorico(data as any);
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, y: 10 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 10 }}
          className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-5 shrink-0">
            <div className="h-11 w-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              <DatabaseBackup className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Histórico de Sincronismo SAPL
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {requerimentoId
                  ? 'Mostrando alterações específicas deste requerimento.'
                  : 'Mostrando as últimas 100 alterações gerais.'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="ml-auto p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Listagem */}
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-slate-400">
                <Loader2 className="h-8 w-8 animate-spin mr-3" />
                <span>Carregando histórico...</span>
              </div>
            ) : historico.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-center">
                <Clock className="h-12 w-12 mb-3 opacity-20" />
                <p>Nenhuma alteração registrada.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {historico.map((log) => (
                  <div
                    key={log.id}
                    className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 flex gap-4"
                  >
                    <div className="shrink-0 mt-1">
                      {log.acao === 'CRIADO' ? (
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-full">
                          <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                      ) : (
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                        <div>
                          <span className="font-semibold text-slate-900 dark:text-white mr-2">
                            {log.acao === 'CRIADO' ? 'Novo' : 'Alteração em'}{' '}
                            {log.entidade_tipo}:
                          </span>
                          <span className="text-slate-700 dark:text-slate-300 font-medium">
                            {log.requerimento?.numero_requerimento || log.entidade_identificador}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 shrink-0">
                          {fmtDate(log.created_at)}
                        </span>
                      </div>

                      {/* Diff Box */}
                      {log.detalhes_alteracao && Object.keys(log.detalhes_alteracao).length > 0 && (
                        <div className="mt-2 space-y-1 bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                          {Object.entries(log.detalhes_alteracao).map(([campo, mudanca]: [string, any]) => (
                            <div key={campo} className="flex flex-col sm:flex-row sm:items-center gap-1 text-xs">
                              <span className="font-semibold text-slate-600 dark:text-slate-400 capitalize w-24">
                                {campo}:
                              </span>
                              <div className="flex items-center gap-2 flex-1">
                                {mudanca.antigo !== undefined && (
                                  <>
                                    <span className="text-red-500 dark:text-red-400 line-through truncate max-w-[200px]" title={String(mudanca.antigo)}>
                                      {String(mudanca.antigo) || '(vazio)'}
                                    </span>
                                    <span className="text-slate-400 text-[10px]">➔</span>
                                  </>
                                )}
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium truncate flex-1" title={String(mudanca.novo || mudanca)}>
                                  {mudanca.novo !== undefined ? String(mudanca.novo) : String(mudanca)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SaplHistoryModal;
