import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, Save, Loader2, AlertCircle,
  FileText, Calendar, Hash, Users, MessageSquare, ClipboardList,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface Requerimento {
  id: string;
  numero_requerimento: string;
  data_sessao: string;
  titulo: string;
  pessoa_id: string | null;
  resposta_recebida: string | null;
  status: string;
  numero_oficio: string | null;
  data_protocolo: string | null;
  informacoes_adicionais: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  pessoa?: { full_name: string } | null;
}

interface PessoaOption {
  id: string;
  full_name: string;
  person_type: string;
}

interface RequerimentoFormProps {
  initialData?: Partial<Requerimento> | null;
  mode: 'create' | 'edit';
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export const RESPOSTAS = ['Sim', 'Não', 'Novo Requerimento', 'Delação de Prazo'] as const;
export const STATUSES  = ['Apresentado', 'Aguardando Resposta', 'Respondido', 'Não Respondido'] as const;

export const STATUS_STYLES: Record<string, string> = {
  'Apresentado':        'bg-blue-100   dark:bg-blue-900/30   text-blue-700   dark:text-blue-400',
  'Aguardando Resposta':'bg-amber-100  dark:bg-amber-900/30  text-amber-700  dark:text-amber-400',
  'Respondido':         'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  'Não Respondido':     'bg-red-100    dark:bg-red-900/30    text-red-700    dark:text-red-400',
};

export const RESPOSTA_STYLES: Record<string, string> = {
  'Sim':                'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  'Não':                'bg-red-100    dark:bg-red-900/30    text-red-700    dark:text-red-400',
  'Novo Requerimento':  'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  'Delação de Prazo':   'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
};

// ─── Componente ───────────────────────────────────────────────────────────────
const RequerimentoForm: React.FC<RequerimentoFormProps> = ({ initialData, mode, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [pessoas, setPessoas] = useState<PessoaOption[]>([]);
  const [pessoaSearch, setPessoaSearch] = useState(
    (initialData?.pessoa as any)?.full_name ?? ''
  );

  // Form state
  const [numero, setNumero]           = useState(initialData?.numero_requerimento ?? '');
  const [dataSessao, setDataSessao]   = useState(initialData?.data_sessao ?? '');
  const [titulo, setTitulo]           = useState(initialData?.titulo ?? '');
  const [pessoaId, setPessoaId]       = useState(initialData?.pessoa_id ?? '');
  const [resposta, setResposta]       = useState(initialData?.resposta_recebida ?? '');
  const [status, setStatus]           = useState(initialData?.status ?? 'Apresentado');
  const [numeroOficio, setNumeroOficio] = useState(initialData?.numero_oficio ?? '');
  const [dataProtocolo, setDataProtocolo] = useState(initialData?.data_protocolo ?? '');
  const [info, setInfo]               = useState(initialData?.informacoes_adicionais ?? '');

  useEffect(() => {
    supabase.from('pessoa').select('id, full_name, person_type').order('full_name')
      .then(({ data }) => setPessoas((data ?? []) as PessoaOption[]));
  }, []);

  const filteredPessoas = pessoas.filter(p =>
    p.full_name.toLowerCase().includes(pessoaSearch.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!numero.trim())    { setError('O número do requerimento é obrigatório.'); return; }
    if (!dataSessao)       { setError('A data da sessão é obrigatória.'); return; }
    if (!titulo.trim())    { setError('O título é obrigatório.'); return; }
    if (!status)           { setError('O status é obrigatório.'); return; }

    setSaving(true);
    const payload = {
      numero_requerimento:   numero.trim(),
      data_sessao:           dataSessao,
      titulo:                titulo.trim(),
      pessoa_id:             pessoaId || null,
      resposta_recebida:     resposta || null,
      status,
      numero_oficio:         numeroOficio.trim() || null,
      data_protocolo:        dataProtocolo || null,
      informacoes_adicionais: info.trim() || null,
      user_id:               user?.id ?? null,
    };

    let err;
    if (mode === 'create') {
      ({ error: err } = await supabase.from('requerimento').insert(payload));
    } else {
      ({ error: err } = await supabase.from('requerimento').update(payload).eq('id', initialData!.id!));
    }

    setSaving(false);
    if (err) { setError(err.message); return; }
    onSuccess(mode === 'create' ? 'Requerimento criado com sucesso!' : 'Requerimento atualizado!');
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          title="Voltar"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900 dark:text-white">
            {mode === 'create' ? 'Novo Requerimento' : 'Editar Requerimento'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Preencha as informações do requerimento
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Coluna principal ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Quadro: IDENTIFICAÇÃO */}
          <div className="bg-white dark:bg-[#1C2434] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-5">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              IDENTIFICAÇÃO
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nº do Requerimento <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={numero}
                    onChange={e => setNumero(e.target.value)}
                    placeholder="Ex: 001/2025"
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Data da Sessão <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="date"
                    value={dataSessao}
                    onChange={e => setDataSessao(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Título do Requerimento <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <textarea
                  value={titulo}
                  onChange={e => setTitulo(e.target.value)}
                  rows={4}
                  placeholder="Descreva o objeto do requerimento..."
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Pessoa Solicitante
              </label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={pessoaSearch}
                  onChange={e => { setPessoaSearch(e.target.value); if (!e.target.value) setPessoaId(''); }}
                  placeholder="Buscar pessoa ou entidade..."
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
              {pessoaSearch && filteredPessoas.length > 0 && !pessoaId && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-48 overflow-y-auto mt-2">
                  {filteredPessoas.slice(0, 8).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setPessoaId(p.id); setPessoaSearch(p.full_name); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 text-left border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm font-bold shrink-0">
                        {p.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{p.full_name}</p>
                        <p className="text-xs text-slate-400">{p.person_type}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {pessoaId && (
                <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mt-2">
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-300">{pessoaSearch}</span>
                  <button
                    type="button"
                    onClick={() => { setPessoaId(''); setPessoaSearch(''); }}
                    className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                  >
                    Remover
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Quadro: INFORMAÇÕES ADICIONAIS */}
          <div className="bg-white dark:bg-[#1C2434] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              INFORMAÇÕES ADICIONAIS
            </h3>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Informações Adicionais
              </label>
              <div className="relative">
                <ClipboardList className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <textarea
                  value={info}
                  onChange={e => setInfo(e.target.value)}
                  rows={4}
                  placeholder="Observações, contexto ou histórico do requerimento..."
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Coluna lateral ── */}
        <div className="space-y-5">

          {/* Quadro: SITUAÇÃO */}
          <div className="bg-white dark:bg-[#1C2434] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              SITUAÇÃO
            </h3>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Resposta Recebida
              </label>
              <div className="relative">
                <ClipboardList className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <select
                  value={resposta}
                  onChange={e => setResposta(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm appearance-none"
                >
                  <option value="">Nenhuma</option>
                  {RESPOSTAS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {resposta && (
                <div className="mt-2">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${RESPOSTA_STYLES[resposta] ?? ''}`}>
                    {resposta}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Status <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm appearance-none"
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {status && (
                <div className="mt-2">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status] ?? ''}`}>
                    {status}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nº de Ofício
              </label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={numeroOficio}
                  onChange={e => setNumeroOficio(e.target.value)}
                  placeholder="Ex: OF-123/2025"
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Data do Protocolo
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  value={dataProtocolo}
                  onChange={e => setDataProtocolo(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Ações */}
          <div className="flex flex-col gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Salvando...' : mode === 'create' ? 'Criar Requerimento' : 'Salvar Alterações'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center px-4 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default RequerimentoForm;
