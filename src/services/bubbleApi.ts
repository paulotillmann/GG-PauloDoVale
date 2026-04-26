/**
 * bubbleApi.ts
 * Serviço de integração com a API do Bubble.io
 *
 * Endpoint: https://paulodovale.com.br/version-test/api/1.1/obj
 * Paginação: cursor + limit
 * Deduplicação: baseada no campo bubble_id (campo _id do Bubble)
 */

import { supabase } from '../lib/supabase';

const BUBBLE_BASE_URL = 'https://paulodovale.com.br/version-test/api/1.1/obj';
const BUBBLE_API_TOKEN = import.meta.env.VITE_BUBBLE_API_TOKEN as string;
const PAGE_SIZE = 100;

// ─── Tipos e helpers compartilhados ──────────────────────────────────────────

function getBubbleHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (BUBBLE_API_TOKEN) headers['Authorization'] = `Bearer ${BUBBLE_API_TOKEN}`;
  return headers;
}

/** Converte data ISO 8601 do Bubble para formato YYYY-MM-DD do Supabase */
function mapDate(isoDate?: string): string | undefined {
  if (!isoDate) return undefined;
  try {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return undefined;
    return date.toISOString().split('T')[0];
  } catch {
    return undefined;
  }
}

// ─── Resultado de sincronização ───────────────────────────────────────────────

/** Resultado da operação de sincronização */
export interface SyncResult {
  total: number;
  inserted: number;
  skipped: number;
  errors: number;
  pdfUploaded?: number;
}

// ════════════════════════════════════════════════════════════════════════════
// PESSOAS
// ════════════════════════════════════════════════════════════════════════════

/** Shape do registro como vem da API do Bubble — Pessoas */
export interface BubblePessoa {
  _id: string;
  nomePessoa?: string;
  celularWhatsapp?: string;
  email?: string;
  CPF?: string;
  endereco?: string;
  numeroEndereco?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  UF?: string;
  CEP?: string;
  dataNascimento?: string;
  observacao?: string;
  Categoria?: string;
  nomeContato?: string;
  ativo?: boolean;
  'Created Date'?: string;
}

/** Shape do registro mapeado para o Supabase (tabela pessoa) */
export interface MappedPessoa {
  bubble_id: string;
  full_name: string;
  phone?: string;
  email?: string;
  cpf?: string;
  address?: string;
  address_number?: string;
  neighborhood?: string;
  city?: string;
  cep?: string;
  birth_date?: string;
  notes?: string;
  person_type?: string;
}

/** Mapeia a categoria do Bubble para o person_type do Supabase */
function mapCategoria(categoria?: string): string {
  if (!categoria) return 'Pessoa';
  const map: Record<string, string> = {
    PESSOA: 'Pessoa',
    ENTIDADE: 'Entidade',
    EMPRESA: 'Empresa',
    AUTORIDADE: 'Autoridade',
  };
  return map[categoria.toUpperCase()] ?? 'Pessoa';
}

/** Mapeia um registro Bubble para o formato da tabela `pessoa` no Supabase */
export function mapBubblePessoa(b: BubblePessoa): MappedPessoa {
  return {
    bubble_id: b._id,
    full_name: (b.nomePessoa ?? '').trim(),
    phone: b.celularWhatsapp?.trim() || undefined,
    email: b.email?.trim() || undefined,
    cpf: b.CPF?.trim() || undefined,
    address: b.endereco?.trim() || undefined,
    address_number: b.numeroEndereco?.trim() || undefined,
    neighborhood: b.bairro?.trim() || undefined,
    city: b.cidade?.trim() || undefined,
    cep: b.CEP?.trim() || undefined,
    birth_date: mapDate(b.dataNascimento),
    notes: b.observacao?.trim() || undefined,
    person_type: mapCategoria(b.Categoria),
  };
}

/**
 * Busca todos os registros da tabela Pessoas no Bubble com paginação automática.
 */
export async function fetchAllBubblePessoas(
  onProgress?: (fetched: number) => void
): Promise<BubblePessoa[]> {
  const all: BubblePessoa[] = [];
  let cursor = 0;
  let hasMore = true;
  const headers = getBubbleHeaders();

  while (hasMore) {
    const url = `${BUBBLE_BASE_URL}/Pessoas?limit=${PAGE_SIZE}&cursor=${cursor}`;
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Erro na API do Bubble: ${response.status} ${response.statusText}`);
    const data = await response.json();
    const results: BubblePessoa[] = data?.response?.results ?? [];
    const remaining: number = data?.response?.remaining ?? 0;
    all.push(...results);
    cursor += results.length;
    hasMore = remaining > 0 && results.length > 0;
    if (onProgress) onProgress(all.length);
  }

  return all;
}

// ════════════════════════════════════════════════════════════════════════════
// REQUERIMENTOS
// ════════════════════════════════════════════════════════════════════════════

/** Shape do registro como vem da API do Bubble — Requerimentos */
export interface BubbleRequerimento {
  _id: string;
  numeroRequerimento?: string;
  tituloRequerimento?: string;
  dataSessao?: string;
  dataProtocolo?: string;
  numeroOficio?: string;
  resposta?: string;
  status?: string;
  observacao?: string;
  anexos?: string[];
  'Created Date'?: string;
  'Modified Date'?: string;
}

/** Shape do registro mapeado para a tabela `requerimento` no Supabase */
export interface MappedRequerimento {
  bubble_id: string;
  numero_requerimento: string;
  titulo: string;
  data_sessao: string;
  data_protocolo?: string;
  numero_oficio?: string;
  resposta_recebida?: string | null;
  status: string;
  informacoes_adicionais?: string;
  arquivo_pdf_url?: string;
  created_at?: string;
  updated_at?: string;
}

/** Normaliza o campo `status` do Bubble para os valores aceitos pelo Supabase */
function mapStatus(s?: string): string {
  if (!s) return 'Apresentado';
  const normalized = s.trim().toLowerCase();
  if (normalized.includes('aguardando')) return 'Aguardando Resposta';
  if (normalized.includes('respondido')) return 'Respondido';
  if (normalized.includes('apresentado')) return 'Apresentado';
  if (normalized.includes('não respondido') || normalized.includes('nao respondido')) return 'Não Respondido';
  return 'Apresentado';
}

/** Normaliza o campo `resposta` do Bubble para os valores aceitos pelo Supabase */
function mapResposta(r?: string): string | null {
  if (!r) return null;
  const u = r.trim().toUpperCase();
  if (u === 'SIM') return 'Sim';
  if (u === 'NÃO' || u === 'NAO') return 'Não';
  return null;
}

/** Mapeia um registro Bubble Requerimento para o formato da tabela `requerimento` no Supabase */
export function mapBubbleRequerimento(b: BubbleRequerimento): MappedRequerimento {
  return {
    bubble_id: b._id,
    numero_requerimento: (b.numeroRequerimento ?? b._id).trim() || b._id,
    titulo: (b.tituloRequerimento ?? 'Sem título').trim() || 'Sem título',
    data_sessao: mapDate(b.dataSessao) ?? new Date().toISOString().split('T')[0],
    data_protocolo: mapDate(b.dataProtocolo),
    numero_oficio: b.numeroOficio?.trim() || undefined,
    resposta_recebida: mapResposta(b.resposta),
    status: mapStatus(b.status),
    informacoes_adicionais: b.observacao?.trim() || undefined,
    arquivo_pdf_url: undefined, // será preenchido após upload
    created_at: b['Created Date'] ?? undefined,
    updated_at: b['Modified Date'] ?? undefined,
  };
}

/**
 * Busca todos os registros da tabela Requerimento no Bubble com paginação automática.
 */
export async function fetchAllBubbleRequerimentos(
  onProgress?: (fetched: number) => void
): Promise<BubbleRequerimento[]> {
  const all: BubbleRequerimento[] = [];
  let cursor = 0;
  let hasMore = true;
  const headers = getBubbleHeaders();

  while (hasMore) {
    const url = `${BUBBLE_BASE_URL}/Requerimento?limit=${PAGE_SIZE}&cursor=${cursor}`;
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Erro na API do Bubble (Requerimentos): ${response.status} ${response.statusText}`);
    const data = await response.json();
    const results: BubbleRequerimento[] = data?.response?.results ?? [];
    const remaining: number = data?.response?.remaining ?? 0;
    all.push(...results);
    cursor += results.length;
    hasMore = remaining > 0 && results.length > 0;
    if (onProgress) onProgress(all.length);
  }

  return all;
}

/**
 * Faz download de um PDF do CDN do Bubble e faz upload para o Supabase Storage.
 * Retorna a URL pública do arquivo no Storage, ou null em caso de falha.
 */
export async function downloadAndUploadPdf(
  bubbleUrl: string,
  fileName: string,
  requerimentoId: string
): Promise<string | null> {
  try {
    // Garante que a URL tem protocolo HTTPS
    const fullUrl = bubbleUrl.startsWith('//') ? `https:${bubbleUrl}` : bubbleUrl;

    const response = await fetch(fullUrl);
    if (!response.ok) return null;

    const blob = await response.blob();
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const storagePath = `${requerimentoId}/${safeFileName}`;

    const { error } = await supabase.storage
      .from('requerimentos-pdfs')
      .upload(storagePath, blob, { contentType: 'application/pdf', upsert: true });

    if (error) return null;

    const { data: { publicUrl } } = supabase.storage
      .from('requerimentos-pdfs')
      .getPublicUrl(storagePath);

    return publicUrl;
  } catch {
    return null;
  }
}
