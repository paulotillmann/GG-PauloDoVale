import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, Save, Loader2, AlertCircle,
  Calendar, Clock, MapPin, Users, FileText, Bell, Tag, Phone,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface AgendaItem {
  id: string;
  titulo_compromisso: string;
  tipo: string | null;
  data: string;
  horario_inicio: string;
  horario_fim: string | null;
  local: string | null;
  pessoa_id: string | null;
  descricao: string | null;
  lembrar: boolean;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  celular_agendado?: string | null;
  // join
  pessoa?: { full_name: string } | null;
}

interface PessoaOption {
  id: string;
  full_name: string;
  person_type: string;
}

interface AgendaFormProps {
  initialData?: Partial<AgendaItem> | null;
  mode: 'create' | 'edit';
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export const AGENDA_TIPOS = ['Reunião', 'Visita', 'Outros'] as const;

const TIPO_COLORS: Record<string, string> = {
  'Reunião': 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  'Visita':  'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  'Outros':  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
};

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> =
  ({ checked, onChange, label }) => (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
    </label>
  );

// ─── Componente ───────────────────────────────────────────────────────────────
const AgendaForm: React.FC<AgendaFormProps> = ({ initialData, mode, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [pessoas, setPessoas] = useState<PessoaOption[]>([]);
  const [pessoaSearch, setPessoaSearch] = useState('');

  // Form state
  const [titulo, setTitulo]             = useState(initialData?.titulo_compromisso ?? '');
  const [tipo, setTipo]                 = useState(initialData?.tipo ?? '');
  const [data, setData]                 = useState(initialData?.data ?? '');
  const [horarioInicio, setHorarioInicio] = useState(initialData?.horario_inicio ?? '');
  const [horarioFim, setHorarioFim]     = useState(initialData?.horario_fim ?? '');
  const [local, setLocal]               = useState(initialData?.local ?? '');
  const [celularAgendado, setCelularAgendado] = useState(initialData?.celular_agendado ?? '');
  const [pessoaId, setPessoaId]         = useState(initialData?.pessoa_id ?? '');
  const [descricao, setDescricao]       = useState(initialData?.descricao ?? '');
  const [lembrar, setLembrar]           = useState(initialData?.lembrar ?? false);

  useEffect(() => {
    supabase.from('pessoa').select('id, full_name, person_type').order('full_name').then(({ data }) => {
      setPessoas((data ?? []) as PessoaOption[]);
    });
  }, []);

  const filteredPessoas = pessoas.filter(p =>
    p.full_name.toLowerCase().includes(pessoaSearch.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!titulo.trim()) { setError('O título do compromisso é obrigatório.'); return; }
    if (!data)          { setError('A data é obrigatória.'); return; }
    if (!horarioInicio) { setError('O horário de início é obrigatório.'); return; }

    setSaving(true);

    const payload = {
      titulo_compromisso: titulo.trim(),
      tipo:         tipo    || null,
      data,
      horario_inicio: horarioInicio,
      horario_fim:  horarioFim  || null,
      local:        local.trim() || null,
      pessoa_id:    pessoaId    || null,
      descricao:    descricao.trim() || null,
      lembrar,
      user_id:      user?.id ?? null,
    };

    let err;
    if (mode === 'create') {
      ({ error: err } = await supabase.from('agenda').insert(payload));
    } else {
      ({ error: err } = await supabase.from('agenda').update(payload).eq('id', initialData!.id!));
    }

    setSaving(false);
    if (err) { setError(err.message); return; }
    onSuccess(mode === 'create' ? 'Compromisso criado com sucesso!' : 'Compromisso atualizado!');
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
            {mode === 'create' ? 'Novo Compromisso' : 'Editar Compromisso'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Preencha as informações do compromisso
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-5">
          {/* Título */}
          <div className="bg-white dark:bg-[#1C2434] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              Informações Principais
            </h3>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Título do Compromisso <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={titulo}
                  onChange={e => setTitulo(e.target.value)}
                  placeholder="Ex: Reunião com lideranças do bairro X"
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tipo
              </label>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <select
                  value={tipo}
                  onChange={e => setTipo(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm appearance-none"
                >
                  <option value="">Selecione o tipo</option>
                  {AGENDA_TIPOS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {tipo && (
                <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-semibold ${TIPO_COLORS[tipo] ?? ''}`}>
                  {tipo}
                </span>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Local
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={local}
                  onChange={e => setLocal(e.target.value)}
                  placeholder="Ex: Câmara Municipal, Sala 3"
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Celular que Agendou
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={celularAgendado}
                  readOnly
                  disabled
                  placeholder="Não informado"
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 focus:outline-none cursor-not-allowed text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Descrição Detalhada
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <textarea
                  value={descricao}
                  onChange={e => setDescricao(e.target.value)}
                  rows={4}
                  placeholder="Descreva o objetivo, participantes e pauta do compromisso..."
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
                />
              </div>
            </div>
          </div>

          {/* Pessoa / Entidade */}
          <div className="bg-white dark:bg-[#1C2434] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              Pessoa / Entidade Vinculada
            </h3>
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
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
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
              <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
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

        {/* Coluna lateral */}
        <div className="space-y-5">
          {/* Data e horário */}
          <div className="bg-white dark:bg-[#1C2434] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              Data e Horário
            </h3>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Data <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={data}
                onChange={e => setData(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Horário de Início <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="time"
                  value={horarioInicio}
                  onChange={e => setHorarioInicio(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Horário de Fim
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="time"
                  value={horarioFim}
                  onChange={e => setHorarioFim(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            </div>
          </div>

          {/* Lembrete */}
          <div className="bg-white dark:bg-[#1C2434] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4">
              Lembrete
            </h3>
            <div className="flex items-center gap-3">
              <Bell className={`h-5 w-5 ${lembrar ? 'text-blue-500' : 'text-slate-400'}`} />
              <Toggle checked={lembrar} onChange={setLembrar} label="Ativar lembrete" />
            </div>
            {lembrar && (
              <p className="mt-3 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg">
                🔔 Este compromisso aparecerá destacado na agenda e no menu lateral.
              </p>
            )}
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
              {saving ? 'Salvando...' : mode === 'create' ? 'Criar Compromisso' : 'Salvar Alterações'}
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

export { TIPO_COLORS };
export default AgendaForm;
