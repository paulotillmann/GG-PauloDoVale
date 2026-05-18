import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, Loader2, CheckCircle, MapPin,
  Pencil, Trash2, ChevronUp, ChevronDown, ChevronsUpDown,
  Users, ShieldCheck, Building2, Briefcase, Tag, FileText, Gift, Send, Printer
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { maskPhone, maskCPF, maskCNPJ } from '../utils/validators';
import PeopleForm, { Pessoa, PERSON_TYPES } from '../components/forms/PeopleForm';
import PeopleMapForm from '../components/forms/PeopleMapForm';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const LABEL_SIZES = [
  { id: '100x50', name: 'Padrão (100 x 50 mm)', width: 100, height: 50 },
  { id: '6080', name: 'Pimaco 6080 (66,7 x 25,4 mm)', width: 66.7, height: 25.4 },
  { id: '6283', name: 'Pimaco 6283 (101,6 x 50,8 mm)', width: 101.6, height: 50.8 },
  { id: '6081', name: 'Pimaco 6081 (101,6 x 25,4 mm)', width: 101.6, height: 25.4 },
  { id: '6187', name: 'Pimaco 6187 (44,45 x 12,7 mm)', width: 44.45, height: 12.7 },
];

const PeopleScreen: React.FC = () => {
  const [people, setPeople] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterNeighborhood, setFilterNeighborhood] = useState('');
  const [filterCity, setFilterCity] = useState('');
  
  const uniqueNeighborhoods = React.useMemo(() => {
    return Array.from(new Set(people.map(p => p.neighborhood).filter(Boolean))) as string[];
  }, [people]);

  const uniqueCities = React.useMemo(() => {
    return Array.from(new Set(people.map(p => p.city).filter(Boolean))) as string[];
  }, [people]);
  
  // Page mode state
  const [showForm, setShowForm] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Partial<Pessoa> | null>(null);

  // Map state
  const [showDemographicMap, setShowDemographicMap] = useState(false);

  // Label Modal state
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [labelConfig, setLabelConfig] = useState({
    size: '100x50',
    paper: 'a4',
    orientation: 'portrait' as 'portrait' | 'landscape',
  });

  // Birthday Modal state
  const [showBirthdayModal, setShowBirthdayModal] = useState(false);
  const [birthdays, setBirthdays] = useState<any[]>([]);
  const [loadingBirthdays, setLoadingBirthdays] = useState(false);
  const [wppStatus, setWppStatus] = useState<Record<string, 'loading' | 'success' | 'error'>>({});

  // Cron state
  const [isAutoEnabled, setIsAutoEnabled] = useState(false);
  const [autoTime, setAutoTime] = useState('09:00');
  const [loadingCron, setLoadingCron] = useState(false);

  const fetchBirthdays = async () => {
    setLoadingBirthdays(true);
    const { data, error } = await supabase.rpc('get_aniversariantes_hoje');
    if (!error && data) {
      setBirthdays(data);
    }
    setLoadingBirthdays(false);
  };

  const fetchCronStatus = async () => {
    setLoadingCron(true);
    const { data, error } = await supabase.rpc('get_birthday_cron_status');
    if (!error && data) {
      setIsAutoEnabled(data.is_enabled);
      if (data.schedule) {
        const parts = data.schedule.split(' ');
        if (parts.length >= 2) {
          const m = parts[0].padStart(2, '0');
          let h = parseInt(parts[1], 10);
          h = (h - 3 + 24) % 24; // Converte UTC para BRT
          setAutoTime(`${h.toString().padStart(2, '0')}:${m}`);
        }
      }
    }
    setLoadingCron(false);
  };

  const updateCron = async (enabled: boolean, timeStr: string) => {
    setLoadingCron(true);
    let schedule = '';
    if (enabled && timeStr) {
      const [hStr, mStr] = timeStr.split(':');
      let h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      h = (h + 3) % 24; // Converte BRT para UTC
      schedule = `${m} ${h} * * *`;
    }
    
    const { error } = await supabase.rpc('update_birthday_cron', {
      p_is_enabled: enabled,
      p_cron_schedule: schedule
    });
    
    if (!error) {
      setIsAutoEnabled(enabled);
      setAutoTime(timeStr);
    } else {
      console.error('Erro ao atualizar cron:', error);
      alert('Erro ao atualizar agendamento automático.');
      // Revert state if failed
      setIsAutoEnabled(!enabled);
    }
    setLoadingCron(false);
  };

  const openBirthdayModal = () => {
    setShowBirthdayModal(true);
    fetchBirthdays();
    fetchCronStatus();
  };

  const sendBirthdayWpp = async (personId: string) => {
    setWppStatus(prev => ({ ...prev, [personId]: 'loading' }));
    try {
      const { error } = await supabase.functions.invoke('send-birthday-wpp', {
        body: { targetId: personId }
      });
      if (error) throw error;
      setWppStatus(prev => ({ ...prev, [personId]: 'success' }));
    } catch (err) {
      console.error(err);
      setWppStatus(prev => ({ ...prev, [personId]: 'error' }));
      alert('Erro ao enviar mensagem via Evolution API.');
    }
  };

  // ─── Auto-open form check (Vindo do Dashboard) ──────────────────────────────
  useEffect(() => {
    const autoAction = sessionStorage.getItem('autoOpenForm_pessoas');
    if (autoAction === 'create') {
      sessionStorage.removeItem('autoOpenForm_pessoas');
      setEditingPerson(null);
      setShowForm(true);
    }
  }, []);
  
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Pessoa; direction: 'asc' | 'desc' } | null>({
    key: 'full_name',
    direction: 'asc'
  });


  // ── Fetch ──────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('pessoa').select('*').order('created_at', { ascending: false });
    setPeople((data ?? []) as Pessoa[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Realtime subscription ──────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('realtime:pessoa')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pessoa' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPeople((prev) => [payload.new as Pessoa, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setPeople((prev) =>
              prev.map((p) => (p.id === (payload.new as Pessoa).id ? (payload.new as Pessoa) : p))
            );
          } else if (payload.eventType === 'DELETE') {
            setPeople((prev) => prev.filter((p) => p.id !== (payload.old as Pessoa).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  
  // Reseta paginação na busca/filtro
  useEffect(() => { setCurrentPage(1); }, [search, filterType, filterNeighborhood, filterCity]);

  // Garante que ao mudar de "página" (abrir ou fechar form) o scroll volte ao topo automaticamente
  useEffect(() => {
    document.getElementById('main-scroll-container')?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [showForm]);
  
  // ── Filtro ─────────────────────────────────────────────────────────────
  const filtered = people.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = p.full_name.toLowerCase().includes(q) ||
      (p.email && p.email.toLowerCase().includes(q)) ||
      (p.cpf && p.cpf.includes(q)) ||
      (p.cnpj && p.cnpj.includes(q));
      
    const matchType = filterType ? p.person_type === filterType : true;
    const matchNeighb = filterNeighborhood ? p.neighborhood === filterNeighborhood : true;
    const matchCity = filterCity ? p.city === filterCity : true;

    return matchSearch && matchType && matchNeighb && matchCity;
  });

  // ── Ordenação ──────────────────────────────────────────────────────────
  const sorted = [...filtered].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    
    // Pegar valores e tratar nulls
    const valA = (a[key] || '').toString().toLowerCase();
    const valB = (b[key] || '').toString().toLowerCase();

    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sorted.length / itemsPerPage);
  const paginated = sorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // ── Handlers ─────────────────────────────────────────────
  const openCreate = () => {
    setEditingPerson(null);
    setShowForm(true);
  };

  const openEdit = (p: Pessoa) => {
    setEditingPerson(p);
    setShowForm(true);
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleDelete = async (id: string) => {
    const { error: e } = await supabase.from('pessoa').delete().eq('id', id);
    if (!e) { 
      setDeleteId(null); 
      // Remove da seleção se estava selecionado
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
      fetchData(); 
      showSuccess('Cadastro removido com sucesso!'); 
    }
  };

  const handleBulkDelete = async () => {
    const { error: e } = await supabase.from('pessoa').delete().in('id', selectedIds);
    if (!e) {
      setShowBulkDelete(false);
      setSelectedIds([]);
      fetchData();
      showSuccess(`${selectedIds.length} cadastros removidos com sucesso!`);
    }
  };

  const toggleSelectAll = () => {
    const paginatedIds = paginated.map(p => p.id);
    const allSelected = paginatedIds.length > 0 && paginatedIds.every(id => selectedIds.includes(id));

    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !paginatedIds.includes(id)));
    } else {
      const newIds = [...selectedIds];
      paginatedIds.forEach(id => {
        if (!newIds.includes(id)) newIds.push(id);
      });
      setSelectedIds(newIds);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSort = (key: keyof Pessoa) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };


  const renderSortIcon = (key: keyof Pessoa) => {
    if (sortConfig?.key !== key) return <ChevronsUpDown className="h-3 w-3 ml-1.5 opacity-30 group-hover:opacity-100 transition-opacity" />;
    return sortConfig.direction === 'asc' 
      ? <ChevronUp className="h-3 w-3 ml-1.5 text-blue-500" /> 
      : <ChevronDown className="h-3 w-3 ml-1.5 text-blue-500" />;
  };

  const formatDate = (ds?: string | null) => {
    if (!ds) return '—';
    const parts = ds.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return ds; // fallback
  };

  const renderPaginationInfo = () => {
    if (filtered.length === 0) return '0 registros';
    const start = (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(currentPage * itemsPerPage, filtered.length);
    return `Página ${currentPage} de ${totalPages} · Mostrar ${start}-${end} de ${filtered.length} registros`;
  };

  const generateLabels = () => {
    if (sorted.length === 0) {
      alert("Nenhum registro encontrado para gerar etiquetas.");
      return;
    }

    const doc = new jsPDF({
      orientation: labelConfig.orientation,
      unit: 'mm',
      format: labelConfig.paper
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const selectedSize = LABEL_SIZES.find(s => s.id === labelConfig.size) || LABEL_SIZES[0];
    const labelWidth = selectedSize.width;
    const labelHeight = selectedSize.height;

    const columns = Math.floor(pageWidth / labelWidth);
    const rows = Math.floor(pageHeight / labelHeight);

    if (columns === 0 || rows === 0) {
      alert("O tamanho da etiqueta é maior que a página selecionada.");
      return;
    }

    const labelsPerPage = columns * rows;
    
    const marginLeft = (pageWidth - (labelWidth * columns)) / 2;
    const marginTop = (pageHeight - (labelHeight * rows)) / 2;
    
    sorted.forEach((person, index) => {
      if (index > 0 && index % labelsPerPage === 0) {
        doc.addPage();
      }
      
      const pageIndex = index % labelsPerPage;
      const col = pageIndex % columns;
      const row = Math.floor(pageIndex / columns);
      
      const x = marginLeft + (col * labelWidth);
      const y = marginTop + (row * labelHeight);
      
      const padding = 3;
      const innerX = x + padding;
      let currentY = y + padding + 4;
      
      // Se tiver setor (destino), imprime na primeira linha
      if (person.destino) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        const destinoText = doc.splitTextToSize(person.destino.toUpperCase(), labelWidth - 2 * padding);
        doc.text(destinoText, innerX, currentY);
        currentY += (destinoText.length * 3.5);
      }

      if (person.pronoun) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        const pronounText = doc.splitTextToSize(person.pronoun, labelWidth - 2 * padding);
        doc.text(pronounText, innerX, currentY);
        currentY += (pronounText.length * 3.5);
      }

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      const nameText = doc.splitTextToSize((person.full_name || '').toUpperCase(), labelWidth - 2 * padding);
      doc.text(nameText, innerX, currentY);
      currentY += (nameText.length * 4.0);
      
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      
      let addressLine = person.address || '';
      if (person.address_number) addressLine += `, ${person.address_number}`;
      if (person.neighborhood) addressLine += ` - ${person.neighborhood}`;
      if (addressLine) {
         const addressWrapped = doc.splitTextToSize(addressLine, labelWidth - 2 * padding);
         doc.text(addressWrapped, innerX, currentY);
         currentY += (addressWrapped.length * 3.0);
      }
      
      let cityLine = person.city || '';
      if (person.cep) cityLine += ` | CEP: ${person.cep}`;
      if (cityLine) {
         const cityWrapped = doc.splitTextToSize(cityLine, labelWidth - 2 * padding);
         doc.text(cityWrapped, innerX, currentY);
      }
    });

    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl, '_blank');
    setShowLabelModal(false);
  };

  const printFicha = async (person: Pessoa) => {
    const formatDate = (ds?: string | null) => {
      if (!ds) return '';
      const parts = ds.split('-');
      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : ds;
    };

    const telefones = [person.phone ? maskPhone(person.phone) : null, person.telefone_extra ? maskPhone(person.telefone_extra) : null].filter(Boolean).join(' / ');
    
    let addressLine = person.address || '';
    if (person.address_number) addressLine += `, ${person.address_number}`;
    if (person.neighborhood) addressLine += ` - ${person.neighborhood}`;
    if (person.city) addressLine += ` - ${person.city}`;
    if (person.cep) addressLine += ` (CEP: ${person.cep})`;

    // Buscar dependentes e serviços
    const [{ data: dependentesData }, { data: servicosData }] = await Promise.all([
      supabase.from('dependentes').select('*').eq('pessoa_id', person.id).order('created_at', { ascending: true }),
      supabase.from('servicos').select('*').eq('pessoa_id', person.id).order('service_date', { ascending: false })
    ]);

    const dependentes = dependentesData || [];
    const servicos = servicosData || [];

    let dependentesHtml = '';
    if (dependentes.length > 0) {
      dependentesHtml = `
        <div class="section">
          <div class="section-title">Dependentes</div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Nome Completo</th>
                <th>Data Nasc.</th>
                <th>Parentesco</th>
                <th>Telefone</th>
              </tr>
            </thead>
            <tbody>
              ${dependentes.map(dep => `
                <tr>
                  <td>${dep.full_name}</td>
                  <td>${formatDate(dep.birth_date) || '—'}</td>
                  <td>${dep.kinship || '—'}</td>
                  <td>${dep.phone ? maskPhone(dep.phone) : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    let servicosHtml = '';
    if (servicos.length > 0) {
      servicosHtml = `
        <div class="section">
          <div class="section-title">Serviços e Atendimentos</div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Atendido?</th>
              </tr>
            </thead>
            <tbody>
              ${servicos.map(serv => `
                <tr>
                  <td>${formatDate(serv.service_date) || '—'}</td>
                  <td>${serv.description || '—'}</td>
                  <td>${serv.is_attended ? 'Sim' : 'Não'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>Ficha Cadastral - ${person.full_name}</title>
          <style>
            @page { margin: 15mm; }
            body { 
              font-family: Arial, sans-serif; 
              color: #333; 
              margin: 0; 
              padding: 0; 
              font-size: 12px;
            }
            .container {
              border: 2px solid #000;
              padding: 20px;
              border-radius: 8px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 15px;
              margin-bottom: 20px;
            }
            .header h1 {
              margin: 0;
              font-size: 20px;
              text-transform: uppercase;
            }
            .header p {
              margin: 5px 0 0;
              font-size: 12px;
              color: #555;
            }
            .section {
              margin-bottom: 15px;
            }
            .section-title {
              background: #f4f4f4;
              font-weight: bold;
              padding: 6px 10px;
              border: 1px solid #000;
              border-radius: 4px;
              margin-bottom: 10px;
              text-transform: uppercase;
              font-size: 11px;
            }
            .row {
              display: flex;
              flex-wrap: wrap;
              gap: 15px;
              margin-bottom: 10px;
            }
            .field {
              flex: 1;
              min-width: 200px;
            }
            .label {
              font-weight: bold;
              font-size: 10px;
              color: #666;
              text-transform: uppercase;
              margin-bottom: 2px;
            }
            .value {
              font-size: 13px;
              border-bottom: 1px solid #ccc;
              padding-bottom: 2px;
              min-height: 18px;
            }
            .full-width {
              flex: 1 1 100%;
            }
            .data-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 5px;
            }
            .data-table th, .data-table td {
              border: 1px solid #ccc;
              padding: 6px 8px;
              text-align: left;
              font-size: 12px;
            }
            .data-table th {
              background-color: #f9f9f9;
              font-weight: bold;
            }
            @media print {
              .container { border: none; padding: 0; max-width: 100%; }
            }
          </style>
        </head>
        <body onload="window.print()">
          <div class="container">
            <div class="header">
              <h1>Ficha Cadastral</h1>
              <p>Gabinete - Cadastro Geral</p>
            </div>
            
            <div class="section">
              <div class="section-title">Dados Principais</div>
              <div class="row">
                <div class="field full-width">
                  <div class="label">Nome Completo / Razão Social</div>
                  <div class="value">${person.full_name || ''}</div>
                </div>
              </div>
              <div class="row">
                <div class="field">
                  <div class="label">Tipo</div>
                  <div class="value">${person.person_type || 'Pessoa'}</div>
                </div>
                <div class="field">
                  <div class="label">Tratamento</div>
                  <div class="value">${person.pronoun || ''}</div>
                </div>
                <div class="field">
                  <div class="label">Nascimento</div>
                  <div class="value">${formatDate(person.birth_date) || ''}</div>
                </div>
              </div>
              <div class="row">
                <div class="field">
                  <div class="label">CPF</div>
                  <div class="value">${person.cpf ? maskCPF(person.cpf) : ''}</div>
                </div>
                <div class="field">
                  <div class="label">CNPJ</div>
                  <div class="value">${person.cnpj ? maskCNPJ(person.cnpj) : ''}</div>
                </div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Contato e Localidade</div>
              <div class="row">
                <div class="field full-width">
                  <div class="label">Endereço Completo</div>
                  <div class="value">${addressLine || ''}</div>
                </div>
              </div>
              <div class="row">
                <div class="field">
                  <div class="label">Telefones</div>
                  <div class="value">${telefones || ''}</div>
                </div>
                <div class="field">
                  <div class="label">E-mail</div>
                  <div class="value">${person.email || ''}</div>
                </div>
              </div>
              <div class="row">
                <div class="field">
                  <div class="label">Destino</div>
                  <div class="value">${person.destino || ''}</div>
                </div>
                <div class="field">
                  <div class="label">Ponto de Referência</div>
                  <div class="value">${person.reference || ''}</div>
                </div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Redes Sociais e Observações</div>
              <div class="row">
                <div class="field">
                  <div class="label">Instagram</div>
                  <div class="value">${person.instagram_url || ''}</div>
                </div>
                <div class="field">
                  <div class="label">Facebook</div>
                  <div class="value">${person.facebook_url || ''}</div>
                </div>
              </div>
              <div class="row">
                <div class="field full-width">
                  <div class="label">Observações</div>
                  <div class="value" style="min-height: 50px;">${person.notes || ''}</div>
                </div>
              </div>
              <div class="row">
                <div class="field">
                  <div class="label">Cadastrado Por</div>
                  <div class="value">${person.profiles?.full_name || ''}</div>
                </div>
                <div class="field">
                  <div class="label">Data de Cadastro</div>
                  <div class="value">${formatDate(person.created_at?.split('T')[0]) || ''}</div>
                </div>
              </div>
            </div>
            
            ${dependentesHtml}
            ${servicosHtml}

          </div>
        </body>
      </html>
    `;
    
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const [printingSelected, setPrintingSelected] = useState(false);

  const printSelectedFichas = async () => {
    if (selectedIds.length === 0) return;
    setPrintingSelected(true);
    
    // Pegar as pessoas selecionadas da lista 'people'
    const selectedPeople = people.filter(p => selectedIds.includes(p.id));
    
    // Para cada pessoa selecionada, buscar dependentes e serviços
    const fullPeopleData = await Promise.all(selectedPeople.map(async (person) => {
      const [{ data: dependentesData }, { data: servicosData }] = await Promise.all([
        supabase.from('dependentes').select('*').eq('pessoa_id', person.id).order('created_at', { ascending: true }),
        supabase.from('servicos').select('*').eq('pessoa_id', person.id).order('service_date', { ascending: false })
      ]);
      return { person, dependentes: dependentesData || [], servicos: servicosData || [] };
    }));

    const formatDate = (ds?: string | null) => {
      if (!ds) return '';
      const parts = ds.split('-');
      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : ds;
    };

    let allFichasHtml = '';

    fullPeopleData.forEach(({ person, dependentes, servicos }, index) => {
      const telefones = [person.phone ? maskPhone(person.phone) : null, person.telefone_extra ? maskPhone(person.telefone_extra) : null].filter(Boolean).join(' / ');
      
      let addressLine = person.address || '';
      if (person.address_number) addressLine += `, ${person.address_number}`;
      if (person.neighborhood) addressLine += ` - ${person.neighborhood}`;
      if (person.city) addressLine += ` - ${person.city}`;
      if (person.cep) addressLine += ` (CEP: ${person.cep})`;

      let dependentesHtml = '';
      if (dependentes.length > 0) {
        dependentesHtml = `
          <div class="section">
            <div class="section-title">Dependentes</div>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Nome Completo</th>
                  <th>Data Nasc.</th>
                  <th>Parentesco</th>
                  <th>Telefone</th>
                </tr>
              </thead>
              <tbody>
                ${dependentes.map((dep: any) => `
                  <tr>
                    <td>${dep.full_name}</td>
                    <td>${formatDate(dep.birth_date) || '—'}</td>
                    <td>${dep.kinship || '—'}</td>
                    <td>${dep.phone ? maskPhone(dep.phone) : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      let servicosHtml = '';
      if (servicos.length > 0) {
        servicosHtml = `
          <div class="section">
            <div class="section-title">Serviços e Atendimentos</div>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Atendido?</th>
                </tr>
              </thead>
              <tbody>
                ${servicos.map((serv: any) => `
                  <tr>
                    <td>${formatDate(serv.service_date) || '—'}</td>
                    <td>${serv.description || '—'}</td>
                    <td>${serv.is_attended ? 'Sim' : 'Não'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      const pageBreak = index < fullPeopleData.length - 1 ? '<div class="page-break"></div>' : '';

      allFichasHtml += `
        <div class="ficha-container">
          <div class="header">
            <h1>Ficha Cadastral</h1>
            <p>Gabinete - Cadastro Geral</p>
          </div>
          
          <div class="section">
            <div class="section-title">Dados Principais</div>
            <div class="row">
              <div class="field full-width">
                <div class="label">Nome Completo / Razão Social</div>
                <div class="value">${person.full_name || ''}</div>
              </div>
            </div>
            <div class="row">
              <div class="field">
                <div class="label">Tipo</div>
                <div class="value">${person.person_type || 'Pessoa'}</div>
              </div>
              <div class="field">
                <div class="label">Tratamento</div>
                <div class="value">${person.pronoun || ''}</div>
              </div>
              <div class="field">
                <div class="label">Nascimento</div>
                <div class="value">${formatDate(person.birth_date) || ''}</div>
              </div>
            </div>
            <div class="row">
              <div class="field">
                <div class="label">CPF</div>
                <div class="value">${person.cpf ? maskCPF(person.cpf) : ''}</div>
              </div>
              <div class="field">
                <div class="label">CNPJ</div>
                <div class="value">${person.cnpj ? maskCNPJ(person.cnpj) : ''}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Contato e Localidade</div>
            <div class="row">
              <div class="field full-width">
                <div class="label">Endereço Completo</div>
                <div class="value">${addressLine || ''}</div>
              </div>
            </div>
            <div class="row">
              <div class="field">
                <div class="label">Telefones</div>
                <div class="value">${telefones || ''}</div>
              </div>
              <div class="field">
                <div class="label">E-mail</div>
                <div class="value">${person.email || ''}</div>
              </div>
            </div>
            <div class="row">
              <div class="field">
                <div class="label">Destino</div>
                <div class="value">${person.destino || ''}</div>
              </div>
              <div class="field">
                <div class="label">Ponto de Referência</div>
                <div class="value">${person.reference || ''}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Redes Sociais e Observações</div>
            <div class="row">
              <div class="field">
                <div class="label">Instagram</div>
                <div class="value">${person.instagram_url || ''}</div>
              </div>
              <div class="field">
                <div class="label">Facebook</div>
                <div class="value">${person.facebook_url || ''}</div>
              </div>
            </div>
            <div class="row">
              <div class="field full-width">
                <div class="label">Observações</div>
                <div class="value" style="min-height: 50px;">${person.notes || ''}</div>
              </div>
            </div>
            <div class="row">
              <div class="field">
                <div class="label">Cadastrado Por</div>
                <div class="value">${person.profiles?.full_name || ''}</div>
              </div>
              <div class="field">
                <div class="label">Data de Cadastro</div>
                <div class="value">${formatDate(person.created_at?.split('T')[0]) || ''}</div>
              </div>
            </div>
          </div>
          
          ${dependentesHtml}
          ${servicosHtml}
        </div>
        ${pageBreak}
      `;
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>Fichas Cadastrais - Lote</title>
          <style>
            @page { margin: 15mm; }
            body { 
              font-family: Arial, sans-serif; 
              color: #333; 
              margin: 0; 
              padding: 0; 
              font-size: 12px;
              background-color: #f0f0f0;
            }
            .ficha-container {
              border: 2px solid #000;
              padding: 20px;
              border-radius: 8px;
              max-width: 800px;
              margin: 20px auto;
              background-color: #fff;
              box-sizing: border-box;
            }
            .page-break {
              page-break-after: always;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 15px;
              margin-bottom: 20px;
            }
            .header h1 {
              margin: 0;
              font-size: 20px;
              text-transform: uppercase;
            }
            .header p {
              margin: 5px 0 0;
              font-size: 12px;
              color: #555;
            }
            .section {
              margin-bottom: 15px;
            }
            .section-title {
              background: #f4f4f4;
              font-weight: bold;
              padding: 6px 10px;
              border: 1px solid #000;
              border-radius: 4px;
              margin-bottom: 10px;
              text-transform: uppercase;
              font-size: 11px;
            }
            .row {
              display: flex;
              flex-wrap: wrap;
              gap: 15px;
              margin-bottom: 10px;
            }
            .field {
              flex: 1;
              min-width: 200px;
            }
            .label {
              font-weight: bold;
              font-size: 10px;
              color: #666;
              text-transform: uppercase;
              margin-bottom: 2px;
            }
            .value {
              font-size: 13px;
              border-bottom: 1px solid #ccc;
              padding-bottom: 2px;
              min-height: 18px;
            }
            .full-width {
              flex: 1 1 100%;
            }
            .data-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 5px;
            }
            .data-table th, .data-table td {
              border: 1px solid #ccc;
              padding: 6px 8px;
              text-align: left;
              font-size: 12px;
            }
            .data-table th {
              background-color: #f9f9f9;
              font-weight: bold;
            }
            @media print {
              body { background-color: #fff; margin: 0; }
              .ficha-container { border: none; padding: 0; margin: 0; max-width: 100%; }
              .page-break { margin-bottom: 0; }
            }
          </style>
        </head>
        <body onload="window.print()">
          ${allFichasHtml}
        </body>
      </html>
    `;
    
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setPrintingSelected(false);
  };

  const generateReport = () => {
    if (sorted.length === 0) {
      alert("Nenhum registro encontrado para gerar o relatório.");
      return;
    }

    const doc = new jsPDF('landscape', 'mm', 'a4');
    
    // Filters Info
    const filterTexts = [];
    if (search) filterTexts.push(`Busca: "${search}"`);
    if (filterType) filterTexts.push(`Tipo: ${filterType}`);
    if (filterCity) filterTexts.push(`Cidade: ${filterCity}`);
    if (filterNeighborhood) filterTexts.push(`Bairro: ${filterNeighborhood}`);
    const filterString = filterTexts.length > 0 ? `Filtros aplicados - ${filterTexts.join(' | ')}` : 'Nenhum filtro aplicado (Todos os registros)';
    
    // Table
    const tableData = sorted.map(p => [
      p.full_name || '',
      p.person_type || '',
      p.phone ? maskPhone(p.phone) : '',
      p.address || '',
      p.neighborhood || '',
      p.city || '',
      formatDate(p.birth_date) || ''
    ]);

    autoTable(doc, {
      startY: 32,
      head: [['Nome / Razão Social', 'Tipo', 'Telefone', 'Endereço', 'Bairro', 'Cidade', 'Nascimento']],
      body: tableData,
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { top: 32, right: 14, bottom: 20, left: 14 },
      didDrawPage: (data) => {
        // Header on every page
        doc.setTextColor(0);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("RELAÇÃO DE PESSOAS E ENTIDADES", 14, 15);
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text("GABINETE VEREADOR NEGO", 14, 21);
        
        doc.setFontSize(8);
        doc.text(filterString, 14, 27);

        // Footer on every page
        let str = `Página ${doc.internal.getNumberOfPages()}`;
        if (typeof doc.putTotalPages === 'function') {
          str = str + ' de {total_pages_count_string}';
        }
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150);
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        doc.text(str, 14, pageHeight - 10);
      }
    });

    if (typeof doc.putTotalPages === 'function') {
      doc.putTotalPages('{total_pages_count_string}');
    }

    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl, '_blank');
  };

  // ── Stats ──────────────────────────────────────────────────────────────
  const stats = {
    pessoa: filtered.filter(p => p.person_type === 'Pessoa').length,
    autoridade: filtered.filter(p => p.person_type === 'Autoridade').length,
    entidade: filtered.filter(p => p.person_type === 'Entidade').length,
    empresa: filtered.filter(p => p.person_type === 'Empresa').length,
  };

  // Se o mapa demográfico estiver ativo
  if (showDemographicMap) {
    return <PeopleMapForm people={filtered} onClose={() => setShowDemographicMap(false)} />;
  }

  // Se o formulário estiver ativo, renderizamos ele (Modo Página).
  if (showForm) {
    return (
      <div className="h-full">
        <PeopleForm
          initialData={editingPerson}
          mode={editingPerson ? 'edit' : 'create'}
          onClose={() => setShowForm(false)}
          onSuccess={(msg) => {
            setShowForm(false);
            fetchData();
            showSuccess(msg);
          }}
        />
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
      {/* Page Heading matching the reference UI */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <Users className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            Pessoas e Entidades
          </h1>
          <p className="text-sm font-sans text-slate-500 dark:text-slate-400 mt-1">
            Gestão de contatos, lideranças e instituições
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {selectedIds.length > 0 && (
            <button
              onClick={printSelectedFichas}
              disabled={printingSelected}
              className="flex items-center px-4 py-2.5 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-800/40 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium transition-colors border border-blue-200 dark:border-blue-800 shadow-sm"
            >
              {printingSelected ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Printer className="h-4 w-4 mr-2" />
              )}
              {printingSelected ? 'Gerando Fichas...' : `Imprimir Selecionados (${selectedIds.length})`}
            </button>
          )}

          <button
            onClick={generateReport}
            className="flex items-center px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-200 dark:border-slate-700 shadow-sm"
          >
            <FileText className="h-4 w-4 mr-2" /> Relatório
          </button>
          <button
            onClick={() => setShowLabelModal(true)}
            className="flex items-center px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-200 dark:border-slate-700 shadow-sm"
          >
            <Tag className="h-4 w-4 mr-2" /> Etiquetas
          </button>
          <button
            onClick={() => setShowDemographicMap(true)}
            className="flex items-center px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-200 dark:border-slate-700 shadow-sm"
          >
            <MapPin className="h-4 w-4 mr-2" /> Mapa Demográfico
          </button>
          <button
            onClick={openBirthdayModal}
            className="flex items-center px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm font-medium transition-colors border border-indigo-200 dark:border-indigo-800/50 shadow-sm"
          >
            <Gift className="h-4 w-4 mr-2 text-indigo-600 dark:text-indigo-400" /> Aniversariantes do Dia
          </button>

          <button
            onClick={openCreate}
            className="flex items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4 mr-2" /> Novo Cadastro
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Pessoas', type: 'Pessoa', value: stats.pessoa, color: 'text-blue-600 dark:text-blue-400', icon: Users },
          { label: 'Autoridades', type: 'Autoridade', value: stats.autoridade, color: 'text-purple-600 dark:text-purple-400', icon: ShieldCheck },
          { label: 'Entidades', type: 'Entidade', value: stats.entidade, color: 'text-emerald-600 dark:text-emerald-400', icon: Building2 },
          { label: 'Empresas', type: 'Empresa', value: stats.empresa, color: 'text-amber-600 dark:text-amber-400', icon: Briefcase },
        ].map((stat, i) => (
          <div 
            key={i} 
            onClick={() => setFilterType(filterType === stat.type ? '' : stat.type)}
            className={`bg-white dark:bg-[#1C2434] rounded-2xl p-5 border shadow-sm flex flex-col justify-between transition-colors relative overflow-hidden group cursor-pointer
              ${filterType === stat.type ? 'border-blue-500 dark:border-blue-500 ring-1 ring-blue-500' : 'border-slate-200 dark:border-slate-800 hover:border-blue-500/50'}
            `}
          >
            <div className="absolute top-1/2 -translate-y-1/2 -right-4 opacity-5 dark:opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-300">
              <stat.icon size={80} />
            </div>
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400 relative z-10">{stat.label}</span>
            <div className={`mt-2 text-3xl font-heading font-bold ${stat.color} relative z-10`}>
              {stat.value}
            </div>
          </div>
        ))}
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
            <CheckCircle className="h-4 w-4 shrink-0" />
            {successMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabela Unificada Modelo Escuro */}
      <div className="bg-white dark:bg-[#1C2434] border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden flex flex-col">
        
        {/* Table Top Header (Filters & Count) */}
        <div className="p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/60">
          <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto flex-wrap">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar..."
                className="w-full pl-9 pr-4 py-2 border border-slate-300 dark:border-[#2C354A] rounded-lg bg-slate-50 dark:bg-[#243046] text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-400"
              />
            </div>
            
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full sm:w-36 px-3 py-2 border border-slate-300 dark:border-[#2C354A] rounded-lg bg-slate-50 dark:bg-[#243046] text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Todos os Tipos</option>
              {PERSON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <select
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              className="w-full sm:w-40 px-3 py-2 border border-slate-300 dark:border-[#2C354A] rounded-lg bg-slate-50 dark:bg-[#243046] text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Todas Cidades</option>
              {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select
              value={filterNeighborhood}
              onChange={(e) => setFilterNeighborhood(e.target.value)}
              className="w-full sm:w-40 px-3 py-2 border border-slate-300 dark:border-[#2C354A] rounded-lg bg-slate-50 dark:bg-[#243046] text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Todos os Bairros</option>
              {uniqueNeighborhoods.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
              {filtered.length} de {people.length} registros
            </div>
            {selectedIds.length > 0 && (
              <button
                onClick={() => setShowBulkDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-500/30 rounded-lg text-sm font-medium transition-colors border border-red-200 dark:border-red-800/50"
                title="Excluir selecionados"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Excluir ({selectedIds.length})</span>
                <span className="sm:hidden">{selectedIds.length}</span>
              </button>
            )}
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800/60">
                <th className="py-4 px-6 w-10">
                  <input
                    type="checkbox"
                    checked={paginated.length > 0 && paginated.every(p => selectedIds.includes(p.id))}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-blue-600 text-blue-600 focus:ring-blue-500 dark:bg-slate-800 cursor-pointer"
                  />
                </th>
                <th 
                  className="py-4 px-6 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer group hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                  onClick={() => handleSort('full_name')}
                >
                  <div className="flex items-center">
                    Nome Completo {renderSortIcon('full_name')}
                  </div>
                </th>
                <th className="py-4 px-6 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Endereço</th>
                <th 
                  className="py-4 px-6 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer group hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                  onClick={() => handleSort('neighborhood')}
                >
                  <div className="flex items-center">
                    Bairro {renderSortIcon('neighborhood')}
                  </div>
                </th>
                <th 
                  className="py-4 px-6 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer group hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                  onClick={() => handleSort('city')}
                >
                  <div className="flex items-center">
                    Cidade {renderSortIcon('city')}
                  </div>
                </th>
                <th className="py-4 px-6 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Telefone</th>
                <th className="py-4 px-6 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nascimento</th>
                <th className="py-4 px-6 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-20 text-center">
                    <Loader2 className="h-8 w-8 text-blue-600 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 dark:text-slate-400 text-sm">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                paginated.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50 dark:hover:bg-[#243046]/50 transition-colors group">
                    <td className="py-4 px-6">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-blue-600 text-blue-600 focus:ring-blue-500 dark:bg-slate-800 cursor-pointer"
                      />
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 uppercase">
                          {p.full_name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium tracking-wide bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50">
                          {p.person_type || 'Pessoa'}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-600 dark:text-slate-400 truncate max-w-[200px]">
                      {p.address ? `${p.address}${p.address_number ? `, ${p.address_number}` : ''}` : '—'}
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-600 dark:text-slate-400">
                      {p.neighborhood || '—'}
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-600 dark:text-slate-400">
                      {p.city || '—'}
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-600 dark:text-slate-400">
                      {p.phone ? maskPhone(p.phone) : '—'}
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-600 dark:text-slate-400">
                      {formatDate(p.birth_date)}
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                       <button
                         onClick={() => printFicha(p)}
                         className="inline-flex items-center justify-center px-3 py-1.5 h-8 border border-slate-200 dark:border-slate-700/60 rounded text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors mr-1"
                         title="Imprimir Ficha"
                       >
                         <Printer className="h-3.5 w-3.5 mr-1.5" /> Ficha
                       </button>
                       <button
                         onClick={() => openEdit(p)}
                         className="inline-flex items-center justify-center px-3 py-1.5 h-8 border border-slate-200 dark:border-slate-700/60 rounded text-xs font-semibold text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors mr-1"
                       >
                         <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                       </button>
                       <button
                         onClick={() => setDeleteId(p.id)}
                         className="inline-flex items-center justify-center h-8 w-8 border border-slate-200 dark:border-slate-700/60 rounded text-slate-500 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                         title="Excluir"
                       >
                         <Trash2 className="h-4 w-4" />
                       </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 bg-slate-50 dark:bg-[#1A2234] border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between">
          <div className="text-sm text-slate-500 dark:text-slate-400 hidden sm:block">
            {renderPaginationInfo()}
          </div>
          <div className="flex items-center space-x-1">
            <button 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="h-8 w-8 flex items-center justify-center rounded border border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              &lt;
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let page = i + 1;
              if (totalPages > 5 && currentPage > 3) {
                 page = currentPage - 2 + i;
                 if (page > totalPages) page = totalPages - (4 - i);
              }
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`h-8 w-8 flex items-center justify-center rounded text-sm font-semibold transition-colors ${
                    currentPage === page
                      ? 'bg-blue-600 text-white'
                      : 'border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button 
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="h-8 w-8 flex items-center justify-center rounded border border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              &gt;
            </button>
          </div>
        </div>
      </div>

      {/* Exclusão Modal */}
      <AnimatePresence>
        {deleteId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 text-center"
            >
              <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="h-7 w-7 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Excluir Cadastro?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Esta ação não pode ser desfeita. Todos os dados desta pessoa/entidade serão perdidos.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">Cancelar</button>
                <button onClick={() => handleDelete(deleteId)} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium">Sim, excluir</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Exclusão em Massa Modal */}
      <AnimatePresence>
        {showBulkDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 text-center"
            >
              <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="h-7 w-7 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Excluir {selectedIds.length} Cadastros?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Esta ação não pode ser desfeita. Todos os dados das pessoas selecionadas, bem como seus eventuais dependentes, serão perdidos.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setShowBulkDelete(false)} className="px-4 py-2 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
                <button onClick={handleBulkDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">Sim, excluir todos</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Configuração de Etiquetas */}
      <AnimatePresence>
        {showLabelModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Tag className="h-5 w-5 text-blue-600" />
                  Configurar Etiquetas
                </h3>
                <button onClick={() => setShowLabelModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  <Plus className="h-5 w-5 rotate-45" />
                </button>
              </div>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Tamanho da Etiqueta
                  </label>
                  <select
                    value={labelConfig.size}
                    onChange={(e) => setLabelConfig({ ...labelConfig, size: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {LABEL_SIZES.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Tamanho do Papel
                    </label>
                    <select
                      value={labelConfig.paper}
                      onChange={(e) => setLabelConfig({ ...labelConfig, paper: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="a4">A4</option>
                      <option value="letter">Carta (Letter)</option>
                      <option value="legal">Ofício (Legal)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Orientação
                    </label>
                    <select
                      value={labelConfig.orientation}
                      onChange={(e) => setLabelConfig({ ...labelConfig, orientation: e.target.value as 'portrait' | 'landscape' })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="portrait">Retrato</option>
                      <option value="landscape">Paisagem</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                <button onClick={() => setShowLabelModal(false)} className="px-4 py-2 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
                <button onClick={generateLabels} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Imprimir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Aniversariantes */}
      <AnimatePresence>
        {showBirthdayModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Gift className="h-5 w-5 text-indigo-600" />
                  Aniversariantes do Dia
                </h3>
                <button onClick={() => setShowBirthdayModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  <Plus className="h-5 w-5 rotate-45" />
                </button>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 mb-6 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-slate-900 dark:text-white">Envio Automático</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Dispara todos os dias no horário configurado</p>
                </div>
                <div className="flex items-center gap-3">
                  <input 
                    type="time" 
                    value={autoTime}
                    disabled={loadingCron || !isAutoEnabled}
                    onChange={(e) => {
                      setAutoTime(e.target.value);
                      updateCron(isAutoEnabled, e.target.value);
                    }}
                    className={`px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-opacity ${
                      !isAutoEnabled ? 'opacity-50 cursor-not-allowed text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'
                    }`}
                  />
                  <button
                    onClick={() => updateCron(!isAutoEnabled, autoTime)}
                    disabled={loadingCron}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      isAutoEnabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'
                    } ${loadingCron ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isAutoEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="space-y-4 mb-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {loadingBirthdays ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
                  </div>
                ) : birthdays.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                    Nenhum aniversariante encontrado hoje.
                  </div>
                ) : (
                  birthdays.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">{p.full_name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-1">
                          <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-slate-700 dark:text-slate-300 font-medium">
                            {p.tipo}
                          </span>
                          {p.phone ? maskPhone(p.phone) : 'Sem número'}
                        </div>
                      </div>
                      <button
                        onClick={() => sendBirthdayWpp(p.id)}
                        disabled={wppStatus[p.id] === 'loading' || wppStatus[p.id] === 'success' || !p.phone}
                        className={`flex items-center justify-center px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          wppStatus[p.id] === 'success'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 cursor-default'
                            : !p.phone
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800'
                            : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700 dark:bg-indigo-900/40 dark:hover:bg-indigo-900/60 dark:text-indigo-300'
                        }`}
                      >
                        {wppStatus[p.id] === 'loading' ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : wppStatus[p.id] === 'success' ? (
                          <>
                            <CheckCircle className="h-4 w-4 mr-1.5" /> Enviado
                          </>
                        ) : (
                          <>
                            <Send className="h-3.5 w-3.5 mr-1.5" /> Enviar
                          </>
                        )}
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                <button onClick={() => setShowBirthdayModal(false)} className="px-4 py-2 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default PeopleScreen;
