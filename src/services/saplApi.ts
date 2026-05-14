const SAPL_BASE_URL = 'https://sapl.araguari.mg.leg.br';

export interface SaplMateria {
  id: number;
  tipo: number;
  numero: number;
  ano: number;
  ementa: string;
  data_apresentacao: string;
  texto_original: string | null;
  autores?: number[];
  tramitacao_set?: any[];
}

// Estrutura real da API do SAPL (diferente de APIs Django REST padrão)
export interface SaplApiResponse {
  pagination: {
    links: {
      next: string | null;
      previous: string | null;
    };
    previous_page: number | null;
    next_page: number | null;
    start_index: number;
    end_index: number;
    total_entries: number;
    total_pages: number;
    page: number;
  };
  results: SaplMateria[];
}

// Credenciais
const USERNAME = 'paulo';
const PASSWORD = 'Paulodovale11@';

/**
 * Busca todas as matérias legislativas do Vereador Paulo do Vale (autor 13)
 * que sejam do tipo Requerimento (tipo 1).
 */
export async function fetchAllSaplRequerimentos(
  onProgress?: (fetched: number, total: number) => void
): Promise<SaplMateria[]> {
  const allMaterias: SaplMateria[] = [];
  
  const headers = new Headers();
  headers.set('Authorization', 'Basic ' + btoa(`${USERNAME}:${PASSWORD}`));
  headers.set('Accept', 'application/json');

  const PAGE_SIZE = 100;
  let page = 1;
  let totalPages = 1;
  let totalEntries = 0;

  while (page <= totalPages) {
    try {
      // ID 13 = Paulo do Vale
      const url = `${SAPL_BASE_URL}/api/materia/materialegislativa/?autores=13&tipo=1&page_size=${PAGE_SIZE}&page=${page}`;

      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`Erro na API SAPL: ${response.status} ${response.statusText}`);
      }

      const data: SaplApiResponse = await response.json();
      
      // Extrair dados de paginação da estrutura real da API
      totalEntries = data.pagination.total_entries;
      totalPages = data.pagination.total_pages;

      if (data.results && Array.isArray(data.results)) {
        allMaterias.push(...data.results);
      }

      if (onProgress) {
        onProgress(allMaterias.length, totalEntries);
      }

      page++;
    } catch (err) {
      console.error(`Erro ao buscar página ${page} do SAPL:`, err);
      break;
    }
  }

  return allMaterias;
}

/**
 * Faz o mapeamento de um objeto vindo do SAPL para o formato do Supabase
 */
export function mapSaplToRequerimento(sapl: SaplMateria, userId: string) {
  const numero_requerimento = `${String(sapl.numero).padStart(3, '0')}/${sapl.ano}`;

  return {
    numero_requerimento,
    titulo: sapl.ementa || 'Sem ementa',
    data_sessao: sapl.data_apresentacao || new Date().toISOString().split('T')[0],
    status: 'Apresentado',
    resposta_recebida: null,
    pessoa_id: null,
    informacoes_adicionais: `Importado do SAPL (ID: ${sapl.id})`,
    user_id: userId,
  };
}

export interface SaplDocumentoAcessorio {
  id: number;
  nome: string;
  data: string;
  arquivo: string;
  materia: number;
  tipo: number;
}

/**
 * Busca os documentos acessórios de uma matéria específica.
 */
export async function fetchSaplDocumentosAcessorios(materiaId: number): Promise<SaplDocumentoAcessorio[]> {
  const headers = new Headers();
  headers.set('Authorization', 'Basic ' + btoa(`${USERNAME}:${PASSWORD}`));
  headers.set('Accept', 'application/json');

  try {
    const url = `${SAPL_BASE_URL}/api/materia/documentoacessorio/?materia=${materiaId}&page_size=100`;
    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.warn(`[SAPL] Erro ao buscar documentos da matéria ${materiaId}: ${response.statusText}`);
      return [];
    }
    const data = await response.json();
    return data.results || [];
  } catch (err) {
    console.error(`Erro na busca de docs da matéria ${materiaId}:`, err);
    return [];
  }
}
