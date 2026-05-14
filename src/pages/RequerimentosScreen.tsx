import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Plus, Loader2, CheckCircle,
  Pencil, Trash2, ChevronUp, ChevronDown, ChevronsUpDown,
  CheckCircle2, XCircle, FilePlus2, Clock3, AlertCircle,
  Search, Filter, X, RefreshCw, Printer, Upload, Paperclip, ExternalLink, CloudDownload
} from 'lucide-react';


type ArquivoReq = { id: string; nome_arquivo: string; arquivo_url: string; tamanho_bytes: number | null; created_at: string; };
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import RequerimentoForm, {
  Requerimento, STATUSES, RESPOSTAS, STATUS_STYLES, RESPOSTA_STYLES,
} from '../components/forms/RequerimentoForm';
import {
  fetchAllBubbleRequerimentos, mapBubbleRequerimento, downloadAndUploadPdf, SyncResult,
} from '../services/bubbleApi';
import {
  fetchAllSaplRequerimentos, mapSaplToRequerimento, fetchSaplDocumentosAcessorios,
} from '../services/saplApi';


// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  const [y, m, day] = d.split('T')[0].split('-');
  return `${day}/${m}/${y}`;
};

const calcDiasProtocolo = (d?: string | null) => {
  if (!d) return 0;
  const [y, m, day] = d.split('T')[0].split('-');
  const dataRef = new Date(Number(y), Number(m) - 1, Number(day));
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  
  const diffTime = hoje.getTime() - dataRef.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays >= 0 ? diffDays : 0;
};

// ─── Componente ───────────────────────────────────────────────────────────────
const RequerimentosScreen: React.FC = () => {
  const [items, setItems]         = useState<Requerimento[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<Requerimento> | null>(null);
  const [successMsg, setSuccessMsg]   = useState<string | null>(null);
  const [deleteId, setDeleteId]       = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  // Upload PDF (múltiplos)
  const [uploadItem, setUploadItem]     = useState<Requerimento | null>(null);
  const [uploadFiles, setUploadFiles]   = useState<File[]>([]);
  const [uploading, setUploading]       = useState(false);
  const [uploadError, setUploadError]   = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>('');

  // Visualizar arquivos
  const [viewArquivosItem, setViewArquivosItem]   = useState<Requerimento | null>(null);
  const [viewArquivos, setViewArquivos]           = useState<ArquivoReq[]>([]);
  const [loadingArquivos, setLoadingArquivos]     = useState(false);
  const [deletingArquivoId, setDeletingArquivoId] = useState<string | null>(null);
  const [viewArquivosFilter, setViewArquivosFilter] = useState<'all' | 'anexos' | 'oficios'>('all');
  
  // Visualizar titulo
  const [viewTituloItem, setViewTituloItem]   = useState<Requerimento | null>(null);

  // Mapa de contagem de arquivos por requerimento_id
  const [arquivosCount, setArquivosCount] = useState<Record<string, { anexos: number; oficios: number }>>({});

  // ── SAPL Sync State ─────────────────────────────────────────────────────
  const [showSaplModal, setShowSaplModal] = useState(false);
  const [saplLoading, setSaplLoading] = useState(false);
  const [saplProgress, setSaplProgress] = useState<{ fetched: number; total: number; acessorios: number }>({ fetched: 0, total: 0, acessorios: 0 });
  const [saplResult, setSaplResult] = useState<{ total: number; inserted: number; skipped: number; errors: number; oficios: number } | null>(null);
  const [saplError, setSaplError] = useState<string | null>(null);
  const [saplPhase, setSaplPhase] = useState<'idle' | 'fetching' | 'acessorios' | 'done'>('idle');

  // ── Bubble Sync State ─────────────────────────────────────────────────────
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ fetched: number; pdfs: number }>({ fetched: 0, pdfs: 0 });
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncPhase, setSyncPhase] = useState<'idle' | 'fetching' | 'pdfs' | 'done'>('idle');


  // Filtros
  const [search, setSearch]         = useState('');
  const [filterResposta, setFilterResposta] = useState('');
  const [filterStatus, setFilterStatus]     = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd]     = useState('');

  // Listagem
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;
  const [sortConfig, setSortConfig] = useState<{ key: keyof Requerimento; direction: 'asc'|'desc' }>({
    key: 'data_sessao', direction: 'desc',
  });

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: files }] = await Promise.all([
      supabase.from('requerimento').select('*, pessoa(full_name)').order('data_sessao', { ascending: false }),
      supabase.from('requerimento_arquivos').select('requerimento_id, nome_arquivo'),
    ]);
    setItems((data ?? []) as Requerimento[]);
    // montar mapa de contagem
    const cmap: Record<string, { anexos: number; oficios: number }> = {};
    for (const row of (files ?? [])) {
      if (!cmap[row.requerimento_id]) cmap[row.requerimento_id] = { anexos: 0, oficios: 0 };
      const nome = (row.nome_arquivo || '').toLowerCase();
      if (nome.includes('ofício') || nome.includes('oficio')) {
        cmap[row.requerimento_id].oficios++;
      } else {
        cmap[row.requerimento_id].anexos++;
      }
    }
    setArquivosCount(cmap);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('realtime:requerimento')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'requerimento' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // Re-fetch para trazer o join com pessoa(full_name)
            fetchData();
          } else if (payload.eventType === 'UPDATE') {
            fetchData();
          } else if (payload.eventType === 'DELETE') {
            setItems((prev) => prev.filter((i) => i.id !== (payload.old as Requerimento).id));
            setArquivosCount((prev) => {
              const copy = { ...prev };
              delete copy[(payload.old as Requerimento).id];
              return copy;
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  useEffect(() => { setCurrentPage(1); }, [search, filterResposta, filterStatus, filterDateStart, filterDateEnd]);

  // ─── Auto-open form check (Vindo do Dashboard) ──────────────────────────────
  useEffect(() => {
    const autoAction = sessionStorage.getItem('autoOpenForm_requerimentos');
    if (autoAction === 'create') {
      sessionStorage.removeItem('autoOpenForm_requerimentos');
      setEditingItem(null);
      setShowForm(true);
    }
  }, []);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:    items.length,
    sim:      items.filter(i => i.resposta_recebida === 'Sim').length,
    nao:      items.filter(i => i.resposta_recebida === 'Não').length,
    novoReq:  items.filter(i => i.resposta_recebida === 'Novo Requerimento').length,
    delacao:  items.filter(i => i.resposta_recebida === 'Delação de Prazo').length,
  }), [items]);

  // ── Filtros + Ordenação + Paginação ─────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i => {
      const matchSearch = i.titulo.toLowerCase().includes(q) ||
        i.numero_requerimento.toLowerCase().includes(q) ||
        ((i.pessoa as any)?.full_name ?? '').toLowerCase().includes(q);
      const matchResposta = filterResposta ? i.resposta_recebida === filterResposta : true;
      const matchStatus   = filterStatus   ? i.status === filterStatus : true;
      const matchStart    = filterDateStart ? i.data_sessao >= filterDateStart : true;
      const matchEnd      = filterDateEnd   ? i.data_sessao <= filterDateEnd   : true;
      return matchSearch && matchResposta && matchStatus && matchStart && matchEnd;
    });
  }, [items, search, filterResposta, filterStatus, filterDateStart, filterDateEnd]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const { key, direction } = sortConfig;
      const vA = (a[key] ?? '').toString();
      const vB = (b[key] ?? '').toString();
      if (vA < vB) return direction === 'asc' ? -1 : 1;
      if (vA > vB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortConfig]);

  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
  const paginated  = sorted.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleSort = (key: keyof Requerimento) =>
    setSortConfig(prev => prev.key === key
      ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' });

  const SortIcon: React.FC<{ k: keyof Requerimento }> = ({ k }) => {
    if (sortConfig.key !== k) return <ChevronsUpDown className="h-3 w-3 ml-1.5 opacity-30" />;
    return sortConfig.direction === 'asc'
      ? <ChevronUp className="h-3 w-3 ml-1.5 text-blue-500" />
      : <ChevronDown className="h-3 w-3 ml-1.5 text-blue-500" />;
  };

  // ── Handlers ────────────────────────────────────────────────────────────────
  const showSuccess = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 3000); };
  const openCreate  = () => { setEditingItem(null); setShowForm(true); };
  const openEdit    = (item: Requerimento) => { setEditingItem(item); setShowForm(true); };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('requerimento').delete().eq('id', id);
    if (!error) { setDeleteId(null); setSelectedIds(p => p.filter(s => s !== id)); fetchData(); showSuccess('Requerimento removido!'); }
  };

  const handleBulkDelete = async () => {
    const { error } = await supabase.from('requerimento').delete().in('id', selectedIds);
    if (!error) { setShowBulkDelete(false); setSelectedIds([]); fetchData(); showSuccess(`${selectedIds.length} requerimentos removidos!`); }
  };

  const toggleSelect    = (id: string) => setSelectedIds(p => p.includes(id) ? p.filter(s => s !== id) : [...p, id]);
  const toggleSelectAll = () => {
    const ids = paginated.map(i => i.id);
    const all = ids.every(id => selectedIds.includes(id));
    if (all) setSelectedIds(p => p.filter(id => !ids.includes(id)));
    else setSelectedIds(p => [...new Set([...p, ...ids])]);
  };

  const hasActiveFilters = filterResposta || filterStatus || filterDateStart || filterDateEnd || search;
  const clearFilters = () => { setSearch(''); setFilterResposta(''); setFilterStatus(''); setFilterDateStart(''); setFilterDateEnd(''); };

  const openUpload = (item: Requerimento) => {
    setUploadItem(item);
    setUploadFiles([]);
    setUploadError(null);
    setUploadProgress('');
  };

  const openViewArquivos = async (item: Requerimento, filter: 'all' | 'anexos' | 'oficios' = 'all') => {
    setViewArquivosItem(item);
    setViewArquivosFilter(filter);
    setLoadingArquivos(true);
    const { data } = await supabase
      .from('requerimento_arquivos')
      .select('*')
      .eq('requerimento_id', item.id)
      .order('created_at', { ascending: false });
    setViewArquivos((data ?? []) as ArquivoReq[]);
    setLoadingArquivos(false);
  };

  const handleDeleteArquivo = async (arquivoId: string, arquivoUrl: string, nomeArquivo: string) => {
    setDeletingArquivoId(arquivoId);
    // Extrair path relativo da URL pública
    const url = new URL(arquivoUrl);
    const pathParts = url.pathname.split('/requerimentos-pdf/');
    const storagePath = pathParts[1] ?? '';
    await supabase.storage.from('requerimentos-pdf').remove([storagePath]);
    await supabase.from('requerimento_arquivos').delete().eq('id', arquivoId);
    setDeletingArquivoId(null);
    // atualizar a lista no modal
    setViewArquivos(prev => prev.filter(a => a.id !== arquivoId));
    // atualizar contador no grid
    if (viewArquivosItem) {
      const isOficio = (nomeArquivo || '').toLowerCase().includes('ofício') || (nomeArquivo || '').toLowerCase().includes('oficio');
      setArquivosCount(prev => {
        const current = prev[viewArquivosItem.id] ?? { anexos: 0, oficios: 0 };
        return {
          ...prev,
          [viewArquivosItem.id]: {
            anexos: isOficio ? current.anexos : Math.max(0, current.anexos - 1),
            oficios: isOficio ? Math.max(0, current.oficios - 1) : current.oficios,
          }
        };
      });
    }
  };

  const handleUploadPDF = async () => {
    if (uploadFiles.length === 0 || !uploadItem) return;
    const invalid = uploadFiles.filter(f => f.type !== 'application/pdf');
    if (invalid.length > 0) {
      setUploadError(`Arquivo(s) inválido(s): ${invalid.map(f => f.name).join(', ')}. Apenas PDF é aceito.`);
      return;
    }
    setUploading(true);
    setUploadError(null);
    const errors: string[] = [];
    const inserted: ArquivoReq[] = [];
    for (let i = 0; i < uploadFiles.length; i++) {
      const file = uploadFiles[i];
      setUploadProgress(`Enviando ${i + 1} de ${uploadFiles.length}: ${file.name}`);
      const filePath = `${uploadItem.id}/${Date.now()}_${file.name}`;
      const { error: storageErr } = await supabase.storage
        .from('requerimentos-pdf')
        .upload(filePath, file, { upsert: true });
      if (storageErr) { errors.push(`${file.name}: ${storageErr.message}`); continue; }
      const { data: { publicUrl } } = supabase.storage.from('requerimentos-pdf').getPublicUrl(filePath);
      const { data: row, error: dbErr } = await supabase
        .from('requerimento_arquivos')
        .insert({ requerimento_id: uploadItem.id, nome_arquivo: file.name, arquivo_url: publicUrl, tamanho_bytes: file.size })
        .select()
        .single();
      if (dbErr) { errors.push(`${file.name}: ${dbErr.message}`); continue; }
      if (row) inserted.push(row as ArquivoReq);
    }
    setUploading(false);
    setUploadProgress('');
    if (errors.length > 0) {
      setUploadError(`Erros: ${errors.join(' | ')}`);
    } else {
      setUploadItem(null);
    }
    // atualizar contagem
    if (inserted.length > 0) {
      const reqId = uploadItem.id;
      setArquivosCount(prev => {
        const current = prev[reqId] ?? { anexos: 0, oficios: 0 };
        return {
          ...prev,
          [reqId]: { ...current, anexos: current.anexos + inserted.length }
        };
      });
      showSuccess(`${inserted.length} arquivo(s) importado(s) com sucesso!`);
    }
  };

  // ── Bubble Sync Handler ──────────────────────────────────────────────────
  const syncFromBubble = async () => {
    setSyncLoading(true);
    setSyncResult(null);
    setSyncError(null);
    setSyncProgress({ fetched: 0, pdfs: 0 });
    setSyncPhase('fetching');

    try {
      // 0. Obter user_id da sessão atual (necessário para a RLS policy req_insert_own)
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? null;
      if (!userId) throw new Error('Usuário não autenticado. Faça login e tente novamente.');

      // 1. Buscar bubble_ids já existentes
      const { data: existing } = await supabase
        .from('requerimento')
        .select('bubble_id')
        .not('bubble_id', 'is', null);
      const existingIds = new Set((existing ?? []).map((r: { bubble_id: string }) => r.bubble_id));

      // 2. Buscar todos os requerimentos do Bubble
      const bubbleRecords = await fetchAllBubbleRequerimentos((fetched) => {
        setSyncProgress(p => ({ ...p, fetched }));
      });

      // 3. Filtrar novos
      const toInsert = bubbleRecords.filter(b => b._id && !existingIds.has(b._id));

      const result: SyncResult = {
        total: bubbleRecords.length,
        inserted: 0,
        skipped: bubbleRecords.length - toInsert.length,
        errors: 0,
        pdfUploaded: 0,
      };

      setSyncPhase('pdfs');

      // 4. Inserir um a um (para poder obter o ID gerado e fazer upload do PDF)
      for (const b of toInsert) {
        const mapped = mapBubbleRequerimento(b);

        // Insert com user_id explícito para satisfazer a RLS policy req_insert_own
        const payload = {
          ...mapped,
          arquivo_pdf_url: null,
          user_id: userId,
          pessoa_id: null,
        };

        const { data: inserted, error: insertErr } = await supabase
          .from('requerimento')
          .insert(payload)
          .select('id')
          .single();

        if (insertErr || !inserted) {
          console.error('[Bubble Sync] Erro ao inserir:', insertErr?.message, JSON.stringify(payload).slice(0, 200));
          result.errors++;
          continue;
        }
        result.inserted++;

        const requerimentoId = inserted.id;
        const anexos = b.anexos ?? [];

        // 5. Upload do primeiro PDF como arquivo_pdf_url
        if (anexos.length > 0) {
          const firstUrl = anexos[0];
          const firstName = firstUrl.split('/').pop() ?? `req_${mapped.numero_requerimento}.pdf`;
          const publicUrl = await downloadAndUploadPdf(firstUrl, firstName, requerimentoId);

          if (publicUrl) {
            await supabase.from('requerimento').update({ arquivo_pdf_url: publicUrl }).eq('id', requerimentoId);
            // Também regista em requerimento_arquivos
            await supabase.from('requerimento_arquivos').insert({
              requerimento_id: requerimentoId,
              nome_arquivo: firstName,
              arquivo_url: publicUrl,
              tamanho_bytes: null,
            });
            result.pdfUploaded = (result.pdfUploaded ?? 0) + 1;
          }

          // 6. PDFs adicionais só em requerimento_arquivos
          for (let i = 1; i < anexos.length; i++) {
            const url = anexos[i];
            const name = url.split('/').pop() ?? `anexo_${i}.pdf`;
            const pub = await downloadAndUploadPdf(url, name, requerimentoId);
            if (pub) {
              await supabase.from('requerimento_arquivos').insert({
                requerimento_id: requerimentoId,
                nome_arquivo: name,
                arquivo_url: pub,
                tamanho_bytes: null,
              });
              result.pdfUploaded = (result.pdfUploaded ?? 0) + 1;
            }
          }

          setSyncProgress(p => ({ ...p, pdfs: (result.pdfUploaded ?? 0) }));
        }
      }

      setSyncPhase('done');
      setSyncResult(result);
      if (result.inserted > 0) fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido ao sincronizar.';
      setSyncError(msg);
    } finally {
      setSyncLoading(false);
    }
  };

  const syncFromSapl = async () => {
    setSaplLoading(true);
    setSaplResult(null);
    setSaplError(null);
    setSaplProgress({ fetched: 0, total: 0, acessorios: 0 });
    setSaplPhase('fetching');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? null;
      if (!userId) throw new Error('Usuário não autenticado. Faça login e tente novamente.');

      const { data: existing } = await supabase
        .from('requerimento')
        .select('numero_requerimento, id')
        .like('informacoes_adicionais', 'Importado do SAPL%');
      
      const existingMap = new Map((existing ?? []).map((r: any) => [r.numero_requerimento, r.id]));

      const saplMaterias = await fetchAllSaplRequerimentos((fetched, total) => {
        setSaplProgress(p => ({ ...p, fetched, total }));
      });

      const result = {
        total: saplMaterias.length,
        inserted: 0,
        skipped: 0,
        errors: 0,
        oficios: 0,
      };

      setSaplPhase('acessorios');
      let acessoriosCount = 0;

      for (const sapl of saplMaterias) {
        const numFormatado = `${String(sapl.numero).padStart(3, '0')}/${sapl.ano}`;
        let reqId = existingMap.get(numFormatado);

        if (!reqId) {
          const mapped = mapSaplToRequerimento(sapl, userId);
          const { data: insertedReq, error: insertErr } = await supabase
            .from('requerimento')
            .insert(mapped)
            .select('id')
            .single();

          if (insertErr || !insertedReq) {
            console.error('[SAPL Sync] Erro ao inserir matéria:', insertErr?.message);
            result.errors++;
            continue;
          }
          reqId = insertedReq.id;
          result.inserted++;
        } else {
          result.skipped++;
        }

        // Buscar arquivos já existentes para este requerimento
        const { data: existingFiles } = await supabase
          .from('requerimento_arquivos')
          .select('arquivo_url')
          .eq('requerimento_id', reqId);
          
        const existingUrls = new Set((existingFiles ?? []).map(f => f.arquivo_url));

        // 1) Importar o texto_original (PDF do requerimento) como Anexo
        if (sapl.texto_original && !existingUrls.has(sapl.texto_original)) {
          const nomeAnexo = `Requerimento ${String(sapl.numero).padStart(3, '0')}-${sapl.ano}.pdf`;
          await supabase.from('requerimento_arquivos').insert({
            requerimento_id: reqId,
            nome_arquivo: nomeAnexo,
            arquivo_url: sapl.texto_original,
            tamanho_bytes: null,
          });
          acessoriosCount++;
          setSaplProgress(p => ({ ...p, acessorios: acessoriosCount }));
          existingUrls.add(sapl.texto_original);
        }

        // 2) Buscar documentos acessórios (ofícios, respostas, etc.)
        const docs = await fetchSaplDocumentosAcessorios(sapl.id);

        let hasResposta = false;

        for (const doc of docs) {
          const nomeLower = doc.nome.toLowerCase();
          const isOficioExecutivo = nomeLower.includes('oficio executivo') || nomeLower.includes('ofício executivo') || nomeLower.includes('prefeito') || nomeLower.includes('resposta');
          
          if (isOficioExecutivo) hasResposta = true;
          
          if ((isOficioExecutivo || doc.arquivo) && !existingUrls.has(doc.arquivo)) {
            await supabase.from('requerimento_arquivos').insert({
              requerimento_id: reqId,
              nome_arquivo: doc.nome + '.pdf',
              arquivo_url: doc.arquivo,
              tamanho_bytes: null,
            });
            if (isOficioExecutivo) result.oficios++;
            acessoriosCount++;
            setSaplProgress(p => ({ ...p, acessorios: acessoriosCount }));
            existingUrls.add(doc.arquivo);
          }
        }

        if (hasResposta) {
          await supabase.from('requerimento').update({
            status: 'Respondido',
            resposta_recebida: 'Sim'
          }).eq('id', reqId);
        }
      }

      setSaplPhase('done');
      setSaplResult(result);
      if (result.inserted > 0 || result.oficios > 0) fetchData();
    } catch (err: unknown) {
      setSaplError(err instanceof Error ? err.message : 'Erro ao sincronizar SAPL.');
    } finally {
      setSaplLoading(false);
    }
  };

  const generatePDF = () => {

    const doc = new jsPDF('landscape');
    
    // Header do PDF
    doc.setFontSize(16);
    doc.setTextColor(40);
    doc.text('Relatório de Requerimentos', 14, 15);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 22);
    
    const tableData = sorted.map(item => [
      item.numero_requerimento,
      fmtDate(item.data_sessao),
      item.titulo,
      item.resposta_recebida || '-',
      item.status,
      fmtDate(item.data_protocolo)
    ]);

    autoTable(doc, {
      startY: 28,
      head: [['Nº', 'Data Sessão', 'Título', 'Resposta', 'Status', 'Data Protocolo']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [40, 100, 200] },
      styles: { fontSize: 8 },
      columnStyles: {
        2: { cellWidth: 80 } // titulo mais largo
      }
    });

    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl, '_blank');
  };

  if (showForm) {
    return (
      <div className="h-full">
        <RequerimentoForm
          initialData={editingItem}
          mode={editingItem ? 'edit' : 'create'}
          onClose={() => setShowForm(false)}
          onSuccess={msg => { setShowForm(false); fetchData(); showSuccess(msg); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">

      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            Requerimentos
          </h1>
          <p className="text-sm font-sans text-slate-500 dark:text-slate-400 mt-1">
            Gestão de requerimentos legislativos
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={generatePDF}
            className="flex items-center px-4 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors shadow-sm"
            title="Gerar PDF"
          >
            <Printer className="h-4 w-4 sm:mr-2 text-slate-500" /> 
            <span className="hidden sm:inline">PDF</span>
          </button>
          <button
            onClick={() => setShowSaplModal(true)}
            className="flex items-center px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <CloudDownload className="h-4 w-4 sm:mr-2" /> 
            <span className="hidden sm:inline">Importar SAPL</span>
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center px-4 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-70"
            title="Atualizar registros"
          >
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${loading ? 'animate-spin text-blue-500' : ''}`} /> 
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          <button
            onClick={openCreate}
            className="flex items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4 sm:mr-2" /> 
            <span className="hidden sm:inline">Novo Requerimento</span>
          </button>
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 rounded-xl text-sm"
          >
            <CheckCircle className="h-4 w-4 shrink-0" /> {successMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total',             resposta: '',                  value: stats.total,   icon: FileText,    color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Respondido (Sim)',   resposta: 'Sim',              value: stats.sim,     icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Não Respondido',     resposta: 'Não',             value: stats.nao,     icon: XCircle,     color: 'text-red-600 dark:text-red-400' },
          { label: 'Novo Requerimento',  resposta: 'Novo Requerimento',value: stats.novoReq, icon: FilePlus2,   color: 'text-purple-600 dark:text-purple-400' },
          { label: 'Delação de Prazo',   resposta: 'Delação de Prazo', value: stats.delacao, icon: Clock3,      color: 'text-orange-600 dark:text-orange-400' },
        ].map((stat, i) => (
          <div
            key={i}
            onClick={() => setFilterResposta(filterResposta === stat.resposta && stat.resposta !== '' ? '' : stat.resposta)}
            className={`bg-white dark:bg-[#1C2434] rounded-2xl p-5 border shadow-sm flex flex-col justify-between relative overflow-hidden group cursor-pointer transition-all
              ${filterResposta === stat.resposta && stat.resposta !== '' ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200 dark:border-slate-800 hover:border-blue-400/50'}
            `}
          >
            <div className="absolute top-1/2 -translate-y-1/2 -right-4 opacity-5 dark:opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-300">
              <stat.icon size={80} />
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 relative z-10 leading-tight">{stat.label}</span>
            <div className={`mt-2 text-3xl font-heading font-bold ${stat.color} relative z-10`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-[#1C2434] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[360px_auto_190px_190px_auto] gap-3 items-end">

          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar Título..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Período */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filterDateStart}
              onChange={e => setFilterDateStart(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-slate-400 text-xs">até</span>
            <input
              type="date"
              value={filterDateEnd}
              onChange={e => setFilterDateEnd(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Resposta */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <select
              value={filterResposta}
              onChange={e => setFilterResposta(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 appearance-none"
            >
              <option value="">Todas as respostas</option>
              {RESPOSTAS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Status */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 appearance-none"
            >
              <option value="">Todos os status</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Limpar */}
          <div>
            {hasActiveFilters ? (
              <button
                onClick={clearFilters}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <X className="h-4 w-4" /> Limpar filtros
              </button>
            ) : <div className="h-[38px] w-0 lg:w-32" />}
          </div>
        </div>
      </div>

      {/* Bulk delete bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <span className="text-sm text-red-700 dark:text-red-400 flex-1">
            {selectedIds.length} requerimento(s) selecionado(s)
          </span>
          <button
            onClick={() => setShowBulkDelete(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir selecionados
          </button>
          <button onClick={() => setSelectedIds([])} className="text-red-500 hover:text-red-700 text-xs">
            Cancelar
          </button>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white dark:bg-[#1C2434] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mr-3" /> Carregando requerimentos...
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <AlertCircle className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Nenhum requerimento encontrado.</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                Limpar filtros
              </button>
            )}
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
                  {[
                    { label: 'Nº', key: 'numero_requerimento' as keyof Requerimento },
                    { label: 'Data Sessão', key: 'data_sessao' as keyof Requerimento },
                    { label: 'Título', key: 'titulo' as keyof Requerimento },
                    { label: 'Resposta', key: 'resposta_recebida' as keyof Requerimento },
                    { label: 'Status', key: 'status' as keyof Requerimento },
                    { label: 'Data Protocolo', key: 'data_protocolo' as keyof Requerimento },
                    { label: 'Data Cadastro', key: 'created_at' as keyof Requerimento },
                  ].map(col => (
                    <th key={col.label} className="px-4 py-3 text-left">
                      {col.key ? (
                        <button
                          onClick={() => handleSort(col.key!)}
                          className="flex items-center group text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide"
                        >
                          {col.label} <SortIcon k={col.key!} />
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                          {col.label}
                        </span>
                      )}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide w-16">
                    Anexos
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide w-16">
                    Ofícios
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginated.map((item, i) => (
                  <motion.tr
                    key={item.id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)}
                        className="w-4 h-4 accent-blue-600 rounded" />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">{item.numero_requerimento}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">
                      {fmtDate(item.data_sessao)}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p 
                        className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        onClick={() => setViewTituloItem(item)}
                        title="Clique para ver o título completo"
                      >
                        {item.titulo}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {item.resposta_recebida ? (
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${RESPOSTA_STYLES[item.resposta_recebida] ?? ''}`}>
                          {item.resposta_recebida}
                        </span>
                      ) : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[item.status] ?? ''}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col items-center justify-center w-max">
                        <span className="text-[#3282B8] dark:text-[#4FB0E1] text-[15px] leading-tight mb-0.5">
                          {fmtDate(item.data_protocolo)}
                        </span>
                        {item.data_protocolo && (() => {
                          const dias = calcDiasProtocolo(item.data_protocolo);
                          const colorClass = dias >= 15 
                            ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                            : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400";
                          return (
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold mt-0.5 ${colorClass}`}>
                              Dias: {dias}
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">
                      {fmtDate(item.created_at?.split('T')[0])}
                    </td>
                    {/* Colunas de Arquivos */}
                    <td className="px-4 py-3 text-center">
                      {(arquivosCount[item.id]?.anexos ?? 0) > 0 ? (
                        <button
                          onClick={() => openViewArquivos(item, 'anexos')}
                          title={`${arquivosCount[item.id].anexos} anexo(s)`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        >
                          <Paperclip className="h-4 w-4" />
                          <span className="text-xs font-bold">{arquivosCount[item.id].anexos}</span>
                        </button>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-700 text-xs select-none">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(arquivosCount[item.id]?.oficios ?? 0) > 0 ? (
                        <button
                          onClick={() => openViewArquivos(item, 'oficios')}
                          title={`${arquivosCount[item.id].oficios} ofício(s)`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                        >
                          <FileText className="h-4 w-4" />
                          <span className="text-xs font-bold">{arquivosCount[item.id].oficios}</span>
                        </button>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-700 text-xs select-none">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {/* Importar PDF(s) */}
                        <button
                          onClick={() => openUpload(item)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                          title="Importar PDF(s)"
                        >
                          <Upload className="h-4 w-4" />
                        </button>
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
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {!loading && totalPages > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {sorted.length === 0 ? '0 registros' : `Página ${currentPage} de ${totalPages} · ${sorted.length} requerimento(s)`}
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

      {/* Modal: delete individual */}
      <AnimatePresence>
        {deleteId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setDeleteId(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-xl"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-heading font-bold text-slate-900 dark:text-white">Excluir requerimento?</h3>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Esta ação não pode ser desfeita.</p>
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

      {/* Modal: Visualizar Título Inteiro */}
      <AnimatePresence>
        {viewTituloItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setViewTituloItem(null)}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-w-md w-full"
              onClick={e => e.stopPropagation()}>
              
              {/* Header estilo popup do sininho */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Detalhes do Título
                </h3>
                <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-bold uppercase">
                  Nº {viewTituloItem.numero_requerimento}
                </span>
              </div>
              
              {/* Conteúdo */}
              <div className="p-5 max-h-[400px] overflow-y-auto">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {viewTituloItem.titulo}
                </p>
              </div>
              
              {/* Rodapé/Botão */}
              <div className="border-t border-slate-100 dark:border-slate-800">
                <button 
                  onClick={() => setViewTituloItem(null)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800/50 text-center text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Visualizar Arquivos */}
      <AnimatePresence>
        {viewArquivosItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setViewArquivosItem(null)}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-xl"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
                  <Paperclip className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-heading font-bold text-slate-900 dark:text-white">Arquivos Anexados</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Requerimento: <span className="font-semibold">{viewArquivosItem.numero_requerimento}</span></p>
                </div>
                <button onClick={() => setViewArquivosItem(null)} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {loadingArquivos ? (
                <div className="flex items-center justify-center py-8 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
                </div>
              ) : viewArquivos.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Nenhum arquivo encontrado.</p>
              ) : (
                <>
                  {/* Tabs */}
                  <div className="flex items-center gap-2 mb-4 p-1 bg-slate-100 dark:bg-slate-900/50 rounded-lg">
                    <button
                      onClick={() => setViewArquivosFilter('all')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${viewArquivosFilter === 'all' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => setViewArquivosFilter('anexos')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${viewArquivosFilter === 'anexos' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      Anexos
                    </button>
                    <button
                      onClick={() => setViewArquivosFilter('oficios')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${viewArquivosFilter === 'oficios' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      Ofícios
                    </button>
                  </div>

                  <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {viewArquivos.filter(arq => {
                      const isOficio = (arq.nome_arquivo || '').toLowerCase().includes('ofício') || (arq.nome_arquivo || '').toLowerCase().includes('oficio');
                      if (viewArquivosFilter === 'anexos') return !isOficio;
                      if (viewArquivosFilter === 'oficios') return isOficio;
                      return true;
                    }).map(arq => {
                      const isOficio = (arq.nome_arquivo || '').toLowerCase().includes('ofício') || (arq.nome_arquivo || '').toLowerCase().includes('oficio');
                      return (
                    <li key={arq.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                      {isOficio ? (
                        <FileText className="h-5 w-5 text-blue-500 shrink-0" />
                      ) : (
                        <FileText className="h-5 w-5 text-red-500 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{arq.nome_arquivo}</p>
                        {arq.tamanho_bytes && (
                          <p className="text-xs text-slate-400">{(arq.tamanho_bytes / 1024 / 1024).toFixed(2)} MB · {fmtDate(arq.created_at.split('T')[0])}</p>
                        )}
                      </div>
                      <a href={arq.arquivo_url} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="Abrir PDF">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <button
                        onClick={() => handleDeleteArquivo(arq.id, arq.arquivo_url, arq.nome_arquivo)}
                        disabled={deletingArquivoId === arq.id}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Remover arquivo"
                      >
                        {deletingArquivoId === arq.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </li>
                  )})}
                </ul>
                </>
              )}
              <div className="flex justify-end mt-5">
                <button
                  onClick={() => { setViewArquivosItem(null); openUpload(viewArquivosItem!); }}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Upload className="h-4 w-4" /> Adicionar mais arquivos
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Sincronização SAPL */}
      <AnimatePresence>
        {showSaplModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => !saplLoading && setShowSaplModal(false)}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-xl"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                  <CloudDownload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-heading font-bold text-slate-900 dark:text-white">Sincronização SAPL</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Importar requerimentos do portal legislativo</p>
                </div>
              </div>

              {!saplResult && !saplLoading && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-xl space-y-2">
                    <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">Esta ação irá:</p>
                    <ul className="text-sm text-slate-500 dark:text-slate-400 space-y-1.5 list-disc pl-4">
                      <li>Buscar todos os requerimentos do seu perfil no SAPL.</li>
                      <li>Baixar os anexos e ofícios de cada matéria.</li>
                      <li>Ignorar requerimentos que já foram importados.</li>
                      <li>Requerimentos com ofícios do executivo serão marcados como Respondidos.</li>
                    </ul>
                  </div>
                  {saplError && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5" />
                      <p className="text-sm text-red-700 dark:text-red-400">{saplError}</p>
                    </div>
                  )}
                  <div className="flex justify-end gap-3 mt-6">
                    <button onClick={() => setShowSaplModal(false)}
                      className="px-4 py-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-sm font-medium transition-colors">
                      Cancelar
                    </button>
                    <button onClick={syncFromSapl}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm">
                      Iniciar Importação
                    </button>
                  </div>
                </div>
              )}

              {saplLoading && (
                <div className="py-6 flex flex-col items-center justify-center text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400 mb-4" />
                  <h4 className="text-slate-900 dark:text-white font-semibold">Sincronizando com SAPL...</h4>
                  {saplPhase === 'fetching' && (
                    <p className="text-sm text-slate-500 mt-1">
                      Buscando página... ({saplProgress.fetched} de {saplProgress.total || '?'})
                    </p>
                  )}
                  {saplPhase === 'acessorios' && (
                    <p className="text-sm text-slate-500 mt-1">
                      Baixando anexos e ofícios... ({saplProgress.acessorios} encontrados)
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-4 max-w-xs">
                    Por favor, não feche esta janela. Esta operação pode demorar alguns minutos.
                  </p>
                </div>
              )}

              {saplResult && (
                <div className="space-y-4">
                  <div className="flex flex-col items-center text-center p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl mb-4">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
                    <h4 className="text-emerald-800 dark:text-emerald-400 font-bold">Sincronização Concluída!</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-center">
                      <span className="block text-2xl font-bold text-slate-700 dark:text-slate-300">{saplResult.total}</span>
                      <span className="text-xs text-slate-500 uppercase tracking-wide">Lidos no SAPL</span>
                    </div>
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-center">
                      <span className="block text-2xl font-bold text-blue-600 dark:text-blue-400">{saplResult.inserted}</span>
                      <span className="text-xs text-blue-600/70 uppercase tracking-wide">Novos</span>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-center">
                      <span className="block text-2xl font-bold text-slate-500">{saplResult.skipped}</span>
                      <span className="text-xs text-slate-400 uppercase tracking-wide">Já Existentes</span>
                    </div>
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-center">
                      <span className="block text-2xl font-bold text-emerald-600 dark:text-emerald-400">{saplResult.oficios}</span>
                      <span className="text-xs text-emerald-600/70 uppercase tracking-wide">Ofícios PDF</span>
                    </div>
                  </div>
                  {saplResult.errors > 0 && (
                    <p className="text-xs text-red-500 text-center flex items-center justify-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" /> {saplResult.errors} registro(s) com erro.
                    </p>
                  )}
                  <div className="flex justify-end mt-4">
                    <button onClick={() => setShowSaplModal(false)}
                      className="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors">
                      Fechar
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Upload PDF (múltiplos) */}
      <AnimatePresence>
        {uploadItem && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => !uploading && setUploadItem(null)}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-xl"
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
                  <Upload className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="text-lg font-heading font-bold text-slate-900 dark:text-white">Importar PDF(s)</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Requerimento: <span className="font-semibold">{uploadItem.numero_requerimento}</span></p>
                </div>
              </div>

              {/* Aviso */}
              <div className="flex items-start gap-2 p-3 mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <span className="font-semibold">Atenção:</span> Apenas arquivos no formato <span className="font-semibold">PDF</span> são aceitos. Tamanho máximo por arquivo: <span className="font-semibold">10 MB</span>. Você pode selecionar <span className="font-semibold">múltiplos arquivos</span> de uma vez.
                </p>
              </div>

              {/* Área de seleção */}
              <label
                htmlFor="pdf-upload-input"
                className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all
                  ${ uploadFiles.length > 0
                    ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 bg-slate-50 dark:bg-slate-800/60'
                  }`}
              >
                <Upload className="h-7 w-7 text-slate-300 dark:text-slate-600 mb-1" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Clique para selecionar PDF(s)</span>
                <span className="text-xs text-slate-400">Seleção múltipla permitida</span>
                <input
                  id="pdf-upload-input"
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files ?? []) as File[];
                    setUploadFiles(prev => {
                      const names = new Set(prev.map(f => f.name));
                      return [...prev, ...files.filter(f => !names.has(f.name))];
                    });
                    setUploadError(null);
                    e.target.value = '';
                  }}
                />
              </label>

              {/* Lista de arquivos selecionados */}
              {uploadFiles.length > 0 && (
                <ul className="mt-3 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {uploadFiles.map((f, idx) => (
                    <li key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                      <FileText className="h-4 w-4 text-red-500 shrink-0" />
                      <span className="text-xs text-slate-700 dark:text-slate-300 flex-1 truncate">{f.name}</span>
                      <span className="text-xs text-slate-400 shrink-0">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                      <button onClick={() => setUploadFiles(prev => prev.filter((_, i) => i !== idx))}
                        className="p-0.5 rounded text-slate-300 hover:text-red-500 transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Progresso */}
              {uploading && uploadProgress && (
                <div className="flex items-center gap-2 mt-3 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                  <Loader2 className="h-4 w-4 text-purple-500 animate-spin shrink-0" />
                  <p className="text-xs text-purple-700 dark:text-purple-400">{uploadProgress}</p>
                </div>
              )}

              {/* Erro */}
              {uploadError && (
                <div className="flex items-center gap-2 mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  <p className="text-xs text-red-700 dark:text-red-400">{uploadError}</p>
                </div>
              )}

              {/* Ações */}
              <div className="flex gap-3 justify-end mt-5">
                <button onClick={() => setUploadItem(null)} disabled={uploading}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40">
                  Cancelar
                </button>
                <button
                  onClick={handleUploadPDF}
                  disabled={uploadFiles.length === 0 || uploading}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? 'Enviando...' : `Importar ${uploadFiles.length > 0 ? uploadFiles.length + ' arquivo(s)' : ''}`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: bulk delete */}
      <AnimatePresence>
        {showBulkDelete && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowBulkDelete(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-xl"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-heading font-bold text-slate-900 dark:text-white">
                  Excluir {selectedIds.length} requerimento(s)?
                </h3>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Esta ação não pode ser desfeita.</p>
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

      {/* Modal: Sincronização Bubble */}
      <AnimatePresence>
        {showSyncModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6"
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <div className="h-11 w-11 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                  <CloudDownload className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Sincronizar com Bubble.io</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Importa novos requerimentos e faz o download dos PDFs</p>
                </div>
              </div>

              {/* Idle */}
              {!syncLoading && !syncResult && !syncError && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 space-y-1.5">
                    <p>• Apenas <strong>novos registros</strong> serão importados.</p>
                    <p>• Registros já existentes <strong>não serão duplicados</strong>.</p>
                    <p>• PDFs serão baixados e salvos no <strong>Supabase Storage</strong>.</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowSyncModal(false)}
                      className="flex-1 px-4 py-2.5 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={syncFromBubble}
                      className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="h-4 w-4" /> Iniciar Sincronização
                    </button>
                  </div>
                </div>
              )}

              {/* Loading */}
              {syncLoading && (
                <div className="text-center space-y-4 py-4">
                  <Loader2 className="h-10 w-10 text-emerald-500 animate-spin mx-auto" />
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {syncPhase === 'fetching' ? 'Buscando registros no Bubble...' : 'Baixando e salvando PDFs...'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {syncPhase === 'fetching'
                        ? `${syncProgress.fetched} registros lidos`
                        : `${syncProgress.pdfs} PDF(s) processados`
                      }
                    </p>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-2 bg-emerald-500 rounded-full animate-pulse w-2/3" />
                  </div>
                </div>
              )}

              {/* Error */}
              {syncError && !syncLoading && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
                    <p className="font-semibold mb-1">Erro na sincronização</p>
                    <p className="text-xs">{syncError}</p>
                  </div>
                  <button
                    onClick={() => setShowSyncModal(false)}
                    className="w-full px-4 py-2.5 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              )}

              {/* Success */}
              {syncResult && !syncLoading && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                      <p className="text-2xl font-bold text-slate-800 dark:text-slate-200">{syncResult.total}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Total Bubble</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                      <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{syncResult.inserted}</p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">Importados</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{syncResult.skipped}</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Já existiam</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{syncResult.pdfUploaded ?? 0}</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">PDFs salvos</p>
                    </div>
                  </div>
                  {syncResult.errors > 0 && (
                    <p className="text-xs text-red-500 text-center">{syncResult.errors} registro(s) com erro ao inserir.</p>
                  )}
                  <button
                    onClick={() => setShowSyncModal(false)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    <CheckCircle className="h-4 w-4" /> Concluído
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default RequerimentosScreen;
