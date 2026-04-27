import React, { useState, useCallback } from 'react';
import { Loader2, AlertCircle, ChevronLeft, Save, CheckCircle2, Search, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { validateCPF, validateCNPJ, maskCPF, maskCNPJ, maskPhone, maskCEP } from '../../utils/validators';
import DependentesSection from './DependentesSection';

// ─── Tipos Exportados ─────────────────────────────────────────────────────────
export interface Pessoa {
  id: string;
  person_type: 'Pessoa' | 'Autoridade' | 'Entidade' | 'Empresa';
  full_name: string;
  pronoun: string | null;
  address: string | null;
  address_number: string | null;
  cep: string | null;
  neighborhood: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  housing_type: string | null;
  phone: string | null;
  destino: string | null;
  birth_date: string | null;
  email: string | null;
  cpf: string | null;
  cnpj: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  reference: string | null;
  notes: string | null;
  atendimento_humano: boolean;
  created_at: string;
  updated_at?: string;
}

export const PRONOMES = ['Sr.', 'Sra.', 'Dr.', 'Dra.', 'Prof.', 'Profa.', 'Vereador', 'Prefeito', 'Exmo', 'Exma', 'Ilmo', 'Ilma'];
export const HOUSING_TYPES = ['Própria', 'Alugada', 'Cedida', 'Financiada'];
export const PERSON_TYPES = ['Pessoa', 'Autoridade', 'Entidade', 'Empresa'];

export const DEFAULT_FORM: Partial<Pessoa> = {
  person_type: 'Pessoa', full_name: '', pronoun: 'Sr.', address: '', address_number: '', cep: '', neighborhood: '', city: '',
  latitude: null, longitude: null,
  housing_type: 'Própria', phone: '', destino: '', birth_date: '', email: '',
  cpf: '', cnpj: '', facebook_url: '', instagram_url: '', reference: '', notes: '',
  atendimento_humano: false
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface PeopleFormProps {
  initialData?: Partial<Pessoa> | null;
  mode: 'create' | 'edit';
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

// ─── Componente ───────────────────────────────────────────────────────────────
const PeopleForm: React.FC<PeopleFormProps> = ({ initialData, mode, onClose, onSuccess }) => {
  const [form, setForm] = useState<Partial<Pessoa>>(initialData || DEFAULT_FORM);
  const [formType, setFormType] = useState<'PF' | 'PJ'>(initialData?.cnpj ? 'PJ' : 'PF');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);

  // Controla se a pessoa já foi salva na sessão atual (novo cadastro)
  // No modo edit, já temos o ID. No modo create, ficamos aguardando o retorno do insert.
  const [savedPersonId, setSavedPersonId] = useState<string | null>(
    mode === 'edit' && initialData?.id ? initialData.id : null
  );
  const [personSavedBanner, setPersonSavedBanner] = useState(false);

  // Dependentes estão liberados quando: modo edit (já tem ID) OU pessoa foi salva agora
  const dependentesEnabled = !!savedPersonId;
  const pessoaId = savedPersonId || '';

  // ── Busca CEP ───────────────────────────────────────────────────────────────
  const fetchCEP = useCallback(async (cepValue: string) => {
    const digits = cepValue.replace(/\D/g, '');
    if (digits.length !== 8) return;

    setCepLoading(true);
    setCepError(null);
    try {
      // 1. Busca na BrasilAPI
      const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${digits}`);
      if (!res.ok) throw new Error('CEP não encontrado');
      const data = await res.json();

      let lat = data.location?.coordinates?.latitude ? parseFloat(data.location.coordinates.latitude) : null;
      let lng = data.location?.coordinates?.longitude ? parseFloat(data.location.coordinates.longitude) : null;

      // 2. Consulta Google Maps Geocoding se a chave estiver configurada
      const googleApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      if (googleApiKey) {
        try {
          const addressQuery = `${data.street}, ${data.neighborhood}, ${data.city} - ${data.state}, Brasil, CEP: ${data.cep}`;
          const googleRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressQuery)}&key=${googleApiKey}`);
          const googleData = await googleRes.json();
          if (googleData.status === 'OK' && googleData.results.length > 0) {
            lat = googleData.results[0].geometry.location.lat;
            lng = googleData.results[0].geometry.location.lng;
          }
        } catch (e) {
          console.warn("Falha no Google Maps", e);
        }
      }

      // 3. Fallback: A BrasilAPI v2 frequentemente retorna coordenadas vazias.
      // Neste caso (e caso o Google falhe/não exista), usamos a AwesomeAPI silenciosamente apenas para pegar a Lat/Lng.
      if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
        try {
          const fallbackRes = await fetch(`https://cep.awesomeapi.com.br/json/${digits}`);
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            if (fallbackData.lat && fallbackData.lng) {
              lat = parseFloat(fallbackData.lat);
              lng = parseFloat(fallbackData.lng);
            }
          }
        } catch (e) {
          console.warn("Falha no fallback de coordenadas", e);
        }
      }

      setForm(prev => ({
        ...prev,
        address: data.street || prev.address,
        neighborhood: data.neighborhood || prev.neighborhood,
        city: data.city && data.state ? `${data.city} - ${data.state}` : prev.city,
        latitude: lat,
        longitude: lng,
      }));
    } catch {
      setCepError('CEP não encontrado. Verifique e tente novamente.');
    } finally {
      setCepLoading(false);
    }
  }, []);

  const handleCepChange = (value: string) => {
    const masked = maskCEP(value);
    setForm(prev => ({ ...prev, cep: masked }));
    setCepError(null);

    const digits = masked.replace(/\D/g, '');
    if (digits.length === 8) {
      fetchCEP(digits);
    }
  };

  // ── Handle Save ──────────────────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.full_name?.trim()) { setError('Nome completo é obrigatório.'); return; }

    let cleanedCpf = form.cpf?.replace(/\D/g, '') || null;
    let cleanedCnpj = form.cnpj?.replace(/\D/g, '') || null;

    if (formType === 'PF') {
      cleanedCnpj = null;
      if (cleanedCpf && !validateCPF(cleanedCpf)) { setError('O CPF informado é inválido.'); return; }
    } else {
      cleanedCpf = null;
      if (cleanedCnpj && !validateCNPJ(cleanedCnpj)) { setError('O CNPJ informado é inválido.'); return; }
    }

    setSaving(true);

    if (mode !== 'edit') {
      // Verifica se já existe alguém com o exato mesmo nome (case-insensitive)
      const { data: existingName } = await supabase
        .from('pessoa')
        .select('id')
        .ilike('full_name', form.full_name.trim())
        .limit(1);

      if (existingName && existingName.length > 0) {
        setSaving(false);
        setError('Já existe um registro cadastrado com este exato nome.');
        return;
      }
    }

    const payload = {
      ...form,
      cpf: cleanedCpf,
      cnpj: cleanedCnpj,
      birth_date: form.birth_date ? form.birth_date : null,
      updated_at: new Date().toISOString()
    };
    delete payload.id;
    delete payload.created_at;

    if (mode === 'edit' && initialData?.id) {
      // ── Edição: salva e chama onSuccess normalmente ──────────────────────────
      const { error: e } = await supabase.from('pessoa').update(payload).eq('id', initialData.id);
      setSaving(false);
      if (e) {
        setError(e.code === '23505' ? 'Já existe um cadastro com este CPF/CNPJ.' : e.message);
      } else {
        onSuccess('Cadastro atualizado com sucesso!');
      }
    } else {
      // ── Novo cadastro: salva, captura o ID, FICA na tela para dependentes ───
      const { data, error: e } = await supabase
        .from('pessoa')
        .insert(payload)
        .select('id')
        .single();

      setSaving(false);
      if (e) {
        setError(e.code === '23505' ? 'Já existe um cadastro com este CPF/CNPJ.' : e.message);
      } else {
        setSavedPersonId(data.id);
        setPersonSavedBanner(true);
        setTimeout(() => setPersonSavedBanner(false), 5000);
      }
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => dependentesEnabled && mode !== 'edit' ? onSuccess('Cadastro concluído!') : onClose()}
            className="p-2 -ml-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {mode === 'edit' ? 'Editar Cadastro' : (savedPersonId ? 'Cadastro Salvo — Adicionar Dependentes' : 'Novo Cadastro')}
            </h2>
            <p className="text-sm font-sans text-slate-500 dark:text-slate-400 mt-1">
              {mode === 'edit'
                ? 'Atualize as informações do contato'
                : (savedPersonId
                    ? 'Adicione dependentes abaixo ou clique em "Concluir" para voltar'
                    : 'Preencha as informações do novo contato'
                  )
              }
            </p>
          </div>
        </div>
      </div>

      {/* ── Banner de pessoa salva ──────────────────────────────────────────────── */}
      {personSavedBanner && (
        <div className="mx-6 mt-4 flex items-center gap-3 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-400 rounded-xl text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Pessoa salva com sucesso!</p>
            <p className="text-xs font-normal mt-0.5 text-green-600 dark:text-green-500">
              A seção de dependentes abaixo está liberada. Adicione quantos dependentes quiser e clique em "Concluir" para fechar.
            </p>
          </div>
        </div>
      )}

      {/* ── Body: Formulário Principal ─────────────────────────────────────────── */}
      <div className="p-6 overflow-y-auto flex-1">
        <form id="pessoa-form" onSubmit={handleSave} className="space-y-6 max-w-4xl">

          {/* Tipo PF / PJ */}
          <div className="flex gap-4 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-max">
            <button type="button" onClick={() => setFormType('PF')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${formType === 'PF' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500'}`}>
              Pessoa Física
            </button>
            <button type="button" onClick={() => setFormType('PJ')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${formType === 'PJ' ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500'}`}>
              Pessoa Jurídica
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

            {/* Categoria */}
            <div className="col-span-1 md:col-span-12 lg:col-span-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Categoria</label>
              <select value={form.person_type || 'Pessoa'} onChange={e => setForm({ ...form, person_type: e.target.value as any })}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500">
                {PERSON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Nome */}
            <div className="col-span-1 md:col-span-12 lg:col-span-8">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nome Completo / Razão Social <span className="text-red-500">*</span></label>
              <input required type="text" value={form.full_name || ''} onChange={e => setForm({ ...form, full_name: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="col-span-1 md:col-span-12 lg:col-span-12">
              <hr className="border-slate-100 dark:border-slate-800" />
            </div>

            {/* Pronome */}
            <div className="col-span-1 md:col-span-12 lg:col-span-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tratamento</label>
              <select value={form.pronoun || ''} onChange={e => setForm({ ...form, pronoun: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500">
                {PRONOMES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* CPF / CNPJ */}
            {formType === 'PF' ? (
              <>
                <div className="col-span-1 md:col-span-6 lg:col-span-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">CPF</label>
                  <input type="text" placeholder="Apenas números" value={form.cpf || ''} maxLength={14}
                    onChange={e => setForm({ ...form, cpf: maskCPF(e.target.value) })}
                    className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-1 md:col-span-6 lg:col-span-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nascimento</label>
                  <input type="date" value={form.birth_date || ''} onChange={e => setForm({ ...form, birth_date: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
              </>
            ) : (
              <div className="col-span-1 md:col-span-12 lg:col-span-8">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">CNPJ</label>
                <input type="text" placeholder="Apenas números" value={form.cnpj || ''} maxLength={18}
                  onChange={e => setForm({ ...form, cnpj: maskCNPJ(e.target.value) })}
                  className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
            )}

            {/* Telefone / Destino / E-mail */}
            <div className="col-span-1 md:col-span-6 lg:col-span-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Telefone</label>
              <input type="text" value={form.phone || ''} maxLength={15}
                onChange={e => setForm({ ...form, phone: maskPhone(e.target.value) })}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-1 md:col-span-6 lg:col-span-8">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">E-mail</label>
              <input type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-1 md:col-span-12">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Destino</label>
              <input type="text" value={form.destino || ''} onChange={e => setForm({ ...form, destino: e.target.value })}
                placeholder="Ex: Secretaria de Saúde, Câmara Municipal..."
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Seção Endereço */}
            <div className="col-span-1 md:col-span-12">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mt-4 border-b border-slate-100 dark:border-slate-800 pb-2">Endereço & Localidade</h4>
            </div>

            {/* CEP com busca */}
            <div className="col-span-1 md:col-span-12 lg:col-span-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">CEP</label>
              <div className="relative">
                <input
                  type="text"
                  value={form.cep || ''}
                  onChange={e => handleCepChange(e.target.value)}
                  placeholder="00000-000"
                  maxLength={9}
                  className={`w-full pl-3.5 pr-10 py-2.5 border rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 ${
                    cepError ? 'border-red-400 dark:border-red-500' : 'border-slate-300 dark:border-slate-600'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => fetchCEP(form.cep || '')}
                  disabled={cepLoading || (form.cep?.replace(/\D/g, '')?.length || 0) < 8}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-30 transition-colors rounded-md hover:bg-slate-100 dark:hover:bg-slate-700"
                  title="Buscar CEP"
                >
                  {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </button>
              </div>
              {cepError && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {cepError}
                </p>
              )}
            </div>

            {/* Logradouro */}
            <div className="col-span-1 md:col-span-12 lg:col-span-7">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Logradouro / Endereço</label>
              <input type="text" value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Número */}
            <div className="col-span-1 md:col-span-12 lg:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Número</label>
              <input type="text" value={form.address_number || ''} onChange={e => setForm({ ...form, address_number: e.target.value })}
                placeholder="S/N"
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Bairro / Cidade / Tipo Casa */}
            <div className="col-span-1 md:col-span-6 lg:col-span-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Bairro</label>
              <input type="text" value={form.neighborhood || ''} onChange={e => setForm({ ...form, neighborhood: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-1 md:col-span-6 lg:col-span-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Cidade (UF)</label>
              <input type="text" value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })}
                placeholder="Ex: Pelotas - RS"
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-1 md:col-span-6 lg:col-span-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Tipo de Casa</label>
              <select value={form.housing_type || ''} onChange={e => setForm({ ...form, housing_type: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500">
                {HOUSING_TYPES.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            {/* Ponto de Referência */}
            <div className="col-span-1 md:col-span-12">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Ponto de Referência</label>
              <input type="text" value={form.reference || ''} onChange={e => setForm({ ...form, reference: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Latitude / Longitude (editáveis) */}
            <div className="col-span-1 md:col-span-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Latitude
              </label>
              <input
                type="text"
                value={form.latitude != null ? String(form.latitude) : ''}
                onChange={e => {
                  const val = parseFloat(e.target.value.replace(',', '.'));
                  setForm({ ...form, latitude: isNaN(val) ? null : val });
                }}
                placeholder="Preenchido via CEP"
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="col-span-1 md:col-span-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Longitude
              </label>
              <input
                type="text"
                value={form.longitude != null ? String(form.longitude) : ''}
                onChange={e => {
                  const val = parseFloat(e.target.value.replace(',', '.'));
                  setForm({ ...form, longitude: isNaN(val) ? null : val });
                }}
                placeholder="Preenchido via CEP"
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Seção Redes & Observações */}
            <div className="col-span-1 md:col-span-12">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mt-4 border-b border-slate-100 dark:border-slate-800 pb-2">Redes & Observações</h4>
            </div>
            <div className="col-span-1 md:col-span-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Facebook (Link)</label>
              <input type="text" value={form.facebook_url || ''} onChange={e => setForm({ ...form, facebook_url: e.target.value })}
                placeholder="https://..."
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-1 md:col-span-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Instagram (Link)</label>
              <input type="text" value={form.instagram_url || ''} onChange={e => setForm({ ...form, instagram_url: e.target.value })}
                placeholder="https://..."
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-1 md:col-span-12">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Observações Gerais</label>
              <textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Toggle — Atendimento Humano */}
            <div className="col-span-1 md:col-span-12">
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Atendimento Humano</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Indica se esta pessoa está sendo atendida por um humano (desativa a IA)
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!form.atendimento_humano}
                  onClick={() => setForm(prev => ({ ...prev, atendimento_humano: !prev.atendimento_humano }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                    form.atendimento_humano
                      ? 'bg-blue-600'
                      : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out ${
                      form.atendimento_humano ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Erro do formulário principal */}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </p>
          )}
        </form>

        {/* ── Seção de Dependentes (fora do <form> para não conflitar com submit) ── */}
        <div className="max-w-4xl mt-2">
          <hr className="border-slate-100 dark:border-slate-800 mb-0" />
          <DependentesSection
            pessoaId={pessoaId}
            disabled={!dependentesEnabled}
          />
        </div>
      </div>

      {/* ── Footer fixo com Botões de Ação ─────────────────────────────────────── */}
      <div className="p-6 border-t border-slate-200 dark:border-slate-800 shrink-0 flex items-center justify-end gap-3 bg-slate-50/50 dark:bg-slate-800/30 rounded-b-2xl">

        {/* Botão Cancelar / Concluir */}
        {dependentesEnabled && mode === 'create' ? (
          <button
            type="button"
            onClick={() => onSuccess('Cadastro concluído com sucesso!')}
            className="px-5 py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors text-sm border border-slate-200 dark:border-slate-700"
          >
            Concluir e Voltar
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors text-sm border border-slate-200 dark:border-slate-700"
          >
            Cancelar
          </button>
        )}

        {/* Botão Salvar — fica oculto após novo cadastro ser salvo (dependentes em foco) */}
        {!(dependentesEnabled && mode === 'create') && (
          <button
            form="pessoa-form"
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60 shadow-sm shadow-blue-500/20 min-w-[150px]"
          >
            {saving
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><Save className="h-4 w-4" /> {mode === 'edit' ? 'Salvar Alterações' : 'Salvar Cadastro'}</>
            }
          </button>
        )}
      </div>
    </div>
  );
};

export default PeopleForm;
