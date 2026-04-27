import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import {
  MessageSquare, Search, Clock, PlayCircle, CheckCircle, User, Phone,
  ChevronDown, ChevronUp, MessagesSquare, Loader2, Calendar, Laptop, Frown,
  MessageCircle, Send, X
} from 'lucide-react';

// ─── Tipos ──────────────────────────────────────────────────────────────────
export interface Atendimento {
  id: string;
  whatsapp: string;
  conversa_ia: string;
  conversa_pessoa: string;
  data_conversa: string;
  status: 'recebido' | 'verificado' | 'em atendimento' | 'concluído';
  created_at: string;
}

export interface PessoaMapInfo {
  id: string;
  full_name: string;
  phone: string;
  atendimento_humano: boolean;
}

const STATUS_CONFIG = {
  'recebido':       { label: 'Recebido',       color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300', dot: 'bg-slate-400', icon: Clock },
  'verificado':     { label: 'Verificado',     color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400', dot: 'bg-blue-500', icon: Search },
  'em atendimento': { label: 'Em Atendimento', color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400', dot: 'bg-amber-500', icon: PlayCircle },
  'concluído':      { label: 'Concluído',      color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500', icon: CheckCircle },
};

const formatDate = (isoStr: string) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${min}`;
};

// ─── Componente ─────────────────────────────────────────────────────────────
const AtendimentoScreen: React.FC = () => {
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWhatsapp, setSelectedWhatsapp] = useState<string | null>(null);
  const [searchContact, setSearchContact] = useState('');
  const [filterDate, setFilterDate] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showScrollArrow, setShowScrollArrow] = useState(false);
  const [showScrollUpArrow, setShowScrollUpArrow] = useState(false);
  
  // WhatsApp Modal States
  const [isResponseModalOpen, setIsResponseModalOpen] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [isSendingResponse, setIsSendingResponse] = useState(false);
  const [pessoasMap, setPessoasMap] = useState<Record<string, PessoaMapInfo>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Fetch ───────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    
    const [atendRes, pessoasRes] = await Promise.all([
      supabase.from('atendimento').select('*').order('created_at', { ascending: false }),
      supabase.from('pessoa').select('id, phone, full_name, atendimento_humano')
    ]);
    
    if (atendRes.error) {
      console.error("Erro ao buscar atendimentos:", atendRes.error);
    } else {
      setAtendimentos(atendRes.data as Atendimento[]);
    }

    if (!pessoasRes.error && pessoasRes.data) {
      const pMap: Record<string, PessoaMapInfo> = {};
      pessoasRes.data.forEach(p => {
        if (p.phone && p.full_name) {
          const clean = p.phone.replace(/\D/g, '');
          pMap[clean] = p as PessoaMapInfo;
          pMap[p.phone] = p as PessoaMapInfo;
        }
      });
      setPessoasMap(pMap);
    }

    if (showLoading) setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    // ── Realtime ──────────────────────────────────────────────────────────
    const subscription = supabase
      .channel('atendimento_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimento' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setAtendimentos(prev => [payload.new as Atendimento, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setAtendimentos(prev => prev.map(a => a.id === payload.new.id ? payload.new as Atendimento : a));
        } else if (payload.eventType === 'DELETE') {
          setAtendimentos(prev => prev.filter(a => a.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [fetchData]);

  // ── Global Filter ───────────────────────────────────────────────────────
  const filteredAtendimentos = useMemo(() => {
    if (!filterDate) return atendimentos;
    
    // Limits inside the user's local timezone (00:00:00 to 23:59:59)
    const [year, month, day] = filterDate.split('-').map(Number);
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();

    return atendimentos.filter(a => {
      if (!a.created_at) return false;
      const msgTime = new Date(a.created_at).getTime();
      return msgTime >= startOfDay && msgTime <= endOfDay;
    });
  }, [atendimentos, filterDate]);

  // ── Lógica de Contatos (Esquerda) ───────────────────────────────────────
  const contacts = useMemo(() => {
    const map = new Map<string, { whatsapp: string; lastMessage: Date; unreadCount: number }>();
    
    filteredAtendimentos.forEach(a => {
      if (!map.has(a.whatsapp)) {
        map.set(a.whatsapp, { 
          whatsapp: a.whatsapp, 
          lastMessage: new Date(a.created_at || new Date()),
          unreadCount: 0 
        });
      }
      
      const c = map.get(a.whatsapp)!;
      if (a.status === 'recebido') c.unreadCount++;
      
      const aDate = new Date(a.created_at || new Date());
      if (aDate > c.lastMessage) {
        c.lastMessage = aDate;
      }
    });

    return Array.from(map.values())
      .filter(c => c.whatsapp.includes(searchContact))
      .sort((a, b) => b.lastMessage.getTime() - a.lastMessage.getTime());
  }, [filteredAtendimentos, searchContact]);

  // Auto-seleciona primeiro contato
  useEffect(() => {
    if (!selectedWhatsapp && contacts.length > 0) {
      setSelectedWhatsapp(contacts[0].whatsapp);
    }
  }, [contacts, selectedWhatsapp]);

  // ── Lógica do Histórico (Direita) ───────────────────────────────────────
  const selectedHistory = useMemo(() => {
    if (!selectedWhatsapp) return [];
    return filteredAtendimentos
      .filter(a => a.whatsapp === selectedWhatsapp)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [filteredAtendimentos, selectedWhatsapp]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleStatusChange = async (id: string, newStatus: Atendimento['status']) => {
    setUpdatingId(id);
    const { error } = await supabase
      .from('atendimento')
      .update({ status: newStatus })
      .eq('id', id);
    
    if (error) {
      console.error("Erro ao atualizar status:", error);
      alert("Erro ao atualizar status. O banco pode ter rejeitado a alteração.");
    } else {
      setAtendimentos(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
    }
    setUpdatingId(null);
  };

  const handleSendMessage = async () => {
    if (!responseText.trim() || !selectedWhatsapp) return;
    
    setIsSendingResponse(true);
    try {
      const response = await fetch('https://n8n.technocode.site/webhook/PauloDoVale-enviarMSN', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsapp: selectedWhatsapp,
          message: responseText.trim()
        })
      });

      if (!response.ok) {
        throw new Error('Falha ao enviar mensagem');
      }

      setResponseText('');
      setIsResponseModalOpen(false);
    } catch (error) {
      console.error("Erro ao enviar mensagem via webhook:", error);
      alert('Ocorreu um erro ao enviar a resposta. Tente novamente.');
    } finally {
      setIsSendingResponse(false);
    }
  };

  // ── Scroll Indicator ────────────────────────────────────────────────────
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      setShowScrollArrow(scrollHeight - scrollTop - clientHeight > 50);
      setShowScrollUpArrow(scrollTop > 50);
    }
  };

  useEffect(() => {
    handleScroll();
  }, [selectedHistory]);

  // Rolar para o início dos registros ao trocar de contato
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [selectedWhatsapp]);

  // KPIs
  const total = selectedHistory.length;
  const emAndamentoCount = selectedHistory.filter(a => ['recebido', 'verificado', 'em atendimento'].includes(a.status)).length;
  const concluidosCount = selectedHistory.filter(a => a.status === 'concluído').length;

  return (
    <div className="flex h-[calc(100vh-140px)] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm animate-in fade-in zoom-in-95 duration-200">
      
      {/* ── PAINEL ESQUERDO: LISTA DE CONTATOS ── */}
      <div className="w-[400px] bg-white dark:bg-[#1C2434] border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 relative z-10">
        
        {/* Header Esquerda */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-heading font-bold text-slate-900 dark:text-white flex items-center mb-3">
            <MessagesSquare className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
            Contatos (IA)
          </h2>
          <div className="flex flex-col gap-2">
            <div className="relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
               <input
                 type="text"
                 placeholder="Buscar WhatsApp..."
                 value={searchContact}
                 onChange={(e) => setSearchContact(e.target.value)}
                 className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white rounded-lg pl-9 pr-3 py-2 shadow-sm focus:ring-2 focus:ring-blue-500"
               />
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1 min-w-[120px]">
                 <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                 <input
                   type="date"
                   value={filterDate}
                   onChange={(e) => setFilterDate(e.target.value)}
                   className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400 rounded-lg pl-9 pr-2 py-2 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                 />
              </div>
              <button 
                onClick={() => setFilterDate(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0])}
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold px-2.5 py-[9px] rounded-lg transition-colors whitespace-nowrap"
              >
                Hoje
              </button>
              <button 
                onClick={() => setFilterDate('')}
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold px-2.5 py-[9px] rounded-lg transition-colors whitespace-nowrap"
              >
                Ver todos
              </button>
            </div>
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {loading && contacts.length === 0 ? (
             <div className="flex flex-col items-center justify-center p-8 text-slate-400">
               <Loader2 className="h-6 w-6 animate-spin mb-2" />
               <p className="text-sm">Carregando contatos...</p>
             </div>
          ) : contacts.length === 0 ? (
             <div className="flex flex-col items-center justify-center p-8 text-slate-400 text-center">
               <User className="h-10 w-10 mb-2 opacity-50" />
               <p className="text-sm font-medium">Nenhum contato encontrado.</p>
             </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {contacts.map((contact) => {
                const cleanPhone = contact.whatsapp.replace(/\D/g, '');
                const personInfo = pessoasMap[cleanPhone] || pessoasMap[contact.whatsapp];
                const displayName = personInfo ? personInfo.full_name : contact.whatsapp;
                
                return (
                <div 
                  key={contact.whatsapp}
                  onClick={() => setSelectedWhatsapp(contact.whatsapp)}
                  className={`p-4 cursor-pointer transition-colors relative flex items-start gap-3
                    ${selectedWhatsapp === contact.whatsapp 
                        ? 'bg-blue-50/70 dark:bg-blue-900/20' 
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                    }
                  `}
                >
                  {selectedWhatsapp === contact.whatsapp && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 dark:bg-blue-500" />
                  )}
                  
                  {/* Avatar simples gerado */}
                  <div className="h-10 w-10 shrink-0 bg-slate-200/50 dark:bg-slate-800/80 rounded-full flex items-center justify-center border border-slate-300 dark:border-slate-700/80 overflow-hidden">
                    {personInfo ? (
                      <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${displayName}`} alt="Avatar" className="w-full h-full opacity-80" />
                    ) : (
                      <Frown className="h-5 w-5 text-slate-400 dark:text-slate-500 opacity-60" strokeWidth={1.5} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {displayName}
                      </p>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {contact.lastMessage.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5 font-medium">
                        <Phone className="h-3 w-3" /> {contact.whatsapp}
                      </p>
                      {contact.unreadCount > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                          {contact.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── PAINEL DIREITO: TIMELINE ── */}
      <div className="flex-1 flex flex-col bg-slate-50/50 dark:bg-[#1C2434]/50 relative z-0">
        
        {!selectedWhatsapp ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
             <MessageSquare className="h-12 w-12 mb-4 opacity-30" />
             <p className="text-lg font-medium text-slate-600 dark:text-slate-300">Selecione um contato</p>
             <p className="text-sm">Clique na lista à esquerda para visualizar o histórico de auto atendimento.</p>
          </div>
        ) : (
          <>
            {/* Header Direito (KPIs) */}
            <div className="p-6 bg-white dark:bg-[#1C2434] border-b border-slate-200 dark:border-slate-800">
               <div className="flex justify-between items-start mb-6">
                 <div>
                   <h1 className="text-2xl font-heading font-bold text-slate-900 dark:text-white flex items-center">
                     <Laptop className="h-6 w-6 mr-3 text-blue-600 dark:text-blue-400" />
                     Histórico de Atendimento
                   </h1>
                   <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                     <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold px-2 py-0.5 rounded-md truncate max-w-xs">
                        {selectedWhatsapp ? (pessoasMap[selectedWhatsapp.replace(/\D/g, '')]?.full_name || pessoasMap[selectedWhatsapp]?.full_name || selectedWhatsapp) : 'Nenhum selecionado'}
                      </span>
                     Acompanhe todas as interações e solicitações.
                   </p>
                 </div>
                 <button
                   onClick={() => setIsResponseModalOpen(true)}
                   className="flex items-center gap-2 bg-[#25D366] hover:bg-[#1DA851] text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                 >
                   <MessageCircle className="w-5 h-5" />
                   Enviar resposta
                 </button>
               </div>

               {/* Stats Row */}
               <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
                 {[
                   { label: 'Total de Mensagens', value: selectedHistory.length, lblColor: 'text-slate-500 dark:text-slate-400', icon: MessagesSquare },
                   { label: 'Recebido', value: selectedHistory.filter(a => a.status === 'recebido').length, lblColor: 'text-slate-500 dark:text-slate-400', icon: Clock },
                   { label: 'Verificado', value: selectedHistory.filter(a => a.status === 'verificado').length, lblColor: 'text-blue-600 dark:text-blue-400', icon: Search },
                   { label: 'Em Atendimento', value: selectedHistory.filter(a => a.status === 'em atendimento').length, lblColor: 'text-amber-600 dark:text-amber-400', icon: PlayCircle },
                   { label: 'Concluído', value: selectedHistory.filter(a => a.status === 'concluído').length, lblColor: 'text-emerald-600 dark:text-emerald-400', icon: CheckCircle },
                 ].map((stat, i) => {
                   const IconC = stat.icon;
                   return (
                     <div key={i} className="relative bg-white dark:bg-[#1A2234] border border-slate-200 dark:border-[#2A3447] rounded-xl py-3 px-4 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.1)] overflow-hidden flex flex-col justify-between min-h-[85px] group transition-all hover:bg-slate-50 dark:hover:bg-[#1f293f]">
                       {/* Marca d'água */}
                       <div className="absolute right-[-15px] top-1/2 -translate-y-1/2 text-slate-800 dark:text-white opacity-[0.03] dark:opacity-[0.04] pointer-events-none group-hover:opacity-[0.05] dark:group-hover:opacity-[0.06] transition-opacity">
                         <IconC strokeWidth={1} style={{ width: '80px', height: '80px' }} />
                       </div>
                       
                       <p className={`text-[12px] ${stat.lblColor} font-medium tracking-wider uppercase mb-0.5 relative z-10 tracking-wide`}>{stat.label}</p>
                       <p className={`text-4xl font-black font-heading relative z-10 text-slate-900 dark:text-white tracking-tight leading-none`}>{stat.value}</p>
                     </div>
                   );
                 })}
               </div>
            </div>

            {/* Timeline Scroll */}
            <div 
              ref={scrollRef} 
              onScroll={handleScroll} 
              className="flex-1 overflow-y-auto p-8 relative [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            >
               <div className="max-w-3xl mx-auto relative pb-10">
                 
                 {/* Traço vertical da timeline conectando os cards */}
                 <div className="absolute left-[29px] top-6 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700/50 z-0" />

                 <div className="space-y-8 relative z-10">
                   <AnimatePresence>
                     {selectedHistory.map((item, idx) => {
                       const conf = STATUS_CONFIG[item.status] || STATUS_CONFIG['recebido'];
                       const IconClass = conf.icon;

                       return (
                         <motion.div 
                           key={item.id}
                           initial={{ opacity: 0, y: 10 }}
                           animate={{ opacity: 1, y: 0 }}
                           transition={{ delay: idx * 0.05 }}
                           className="flex group"
                         >
                            {/* Ícone fixo da timeline */}
                            <div className="mr-4 sm:mr-6 relative">
                              <div className={`min-w-[70px] flex flex-col items-center`}>
                                <div className={`w-8 h-8 rounded-full border-4 border-white dark:border-[#1C2434] shadow-sm flex items-center justify-center shrink-0 relative z-10 mb-1 ${conf.color}`}>
                                  <IconClass className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-[12px] font-bold text-slate-400 dark:text-slate-500/80 text-center whitespace-nowrap bg-slate-50 dark:bg-slate-900 px-1 relative z-10">
                                  {formatDate(item.created_at)}
                                </span>
                              </div>
                            </div>

                            {/* Card Content */}
                            <div className="flex-1 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow">

                               {/* Card Body - Conversas */}
                               <div className="space-y-4">
                                 
                                 {/* Mensagem da Pessoa */}
                                 <div>
                                   <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
                                     {item.conversa_pessoa || 'Mensagem Vazia'}
                                   </h3>
                                 </div>

                                 {/* Resumo/Ação (IA) e Status */}
                                 <div className="flex flex-col gap-3">
                                   <div className="bg-slate-50 dark:bg-slate-900/40 border-l-2 border-slate-300 dark:border-slate-600 pl-4 py-2 text-sm text-slate-600 dark:text-slate-400 italic rounded-r-lg">
                                       <span className="font-semibold text-slate-500 dark:text-slate-500 not-italic mr-1 block text-[10px] uppercase mb-1 tracking-wider">
                                         Resumo / Ação da IA:
                                       </span>
                                       {item.conversa_ia || 'Interação Sem Retorno (IA)'}
                                   </div>

                                   {/* Status Dropdown Local */}
                                   <div className="flex justify-start sm:justify-end mt-1">
                                      <div className="relative inline-block border-t sm:border-t-0 border-slate-100 dark:border-slate-800 pt-2 sm:pt-0 w-full sm:w-auto mt-2">
                                        <select
                                          value={item.status}
                                          disabled={updatingId === item.id}
                                          onChange={(e) => handleStatusChange(item.id, e.target.value as any)}
                                          className={`appearance-none text-[10px] w-full sm:w-auto font-bold uppercase tracking-wider px-3 py-1.5 pr-7 rounded-full cursor-pointer outline-none border focus:ring-2 focus:ring-blue-500/50 transition-colors
                                            ${conf.color} border-transparent
                                          `}
                                        >
                                          {Object.entries(STATUS_CONFIG).map(([val, c]) => (
                                            <option key={val} value={val} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium">
                                              {c.label}
                                            </option>
                                          ))}
                                        </select>
                                        <ChevronDown className={`absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none opacity-60 mt-1 sm:mt-0`} />
                                      </div>
                                   </div>
                                 </div>

                               </div>

                            </div>
                         </motion.div>
                       );
                     })}
                   </AnimatePresence>
                 </div>
                </div>
             </div>
             
             {/* Seta para cima quando há registros ocultos acima (estática) */}
             <AnimatePresence>
               {showScrollUpArrow && (
                 <motion.div
                   initial={{ opacity: 0, y: -10 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: -10 }}
                   className="absolute top-[280px] right-8 text-blue-500 z-50 flex items-center justify-center pointer-events-none"
                 >
                   <ChevronUp className="w-8 h-8 animate-bounce opacity-80" />
                 </motion.div>
               )}
             </AnimatePresence>
             
             {/* Seta para baixo quando há registros ocultos (estática) */}
             <AnimatePresence>
               {showScrollArrow && (
                 <motion.div
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: 10 }}
                   className="absolute bottom-8 right-8 text-blue-500 z-50 flex items-center justify-center pointer-events-none"
                 >
                   <ChevronDown className="w-8 h-8 animate-bounce opacity-80" />
                 </motion.div>
               )}
             </AnimatePresence>

          </>
        )}
      </div>

      {/* Modal de Enviar Resposta (WhatsApp) */}
      {isResponseModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-[#25D366]" />
                Enviar resposta
              </h3>
              <button
                onClick={() => setIsResponseModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Mensagem para {selectedWhatsapp ? (pessoasMap[selectedWhatsapp.replace(/\D/g, '')]?.full_name || pessoasMap[selectedWhatsapp]?.full_name || selectedWhatsapp) : ''}
              </label>
              <textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                placeholder="Digite a mensagem..."
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#25D366] focus:border-transparent outline-none resize-none h-32 text-slate-900 dark:text-white"
              />
              
              {/* Toggle de Atendimento Humano (se cadastrado) */}
              {selectedWhatsapp && (pessoasMap[selectedWhatsapp.replace(/\D/g, '')] || pessoasMap[selectedWhatsapp]) && (() => {
                const person = pessoasMap[selectedWhatsapp.replace(/\D/g, '')] || pessoasMap[selectedWhatsapp];
                return (
                  <div className="mt-4 flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Atendimento Humano</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Pausar respostas da IA para este contato
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={person.atendimento_humano}
                      onClick={async () => {
                        const newValue = !person.atendimento_humano;
                        setPessoasMap(prev => {
                          const newMap = { ...prev };
                          const cleanPhone = person.phone.replace(/\D/g, '');
                          if (newMap[cleanPhone]) newMap[cleanPhone] = { ...newMap[cleanPhone], atendimento_humano: newValue };
                          if (newMap[person.phone]) newMap[person.phone] = { ...newMap[person.phone], atendimento_humano: newValue };
                          return newMap;
                        });
                        const { error } = await supabase.from('pessoa').update({ atendimento_humano: newValue }).eq('id', person.id);
                        if (error) {
                          console.error("Erro ao atualizar atendimento humano:", error);
                          alert("Não foi possível alterar o status.");
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                        person.atendimento_humano ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out ${ person.atendimento_humano ? 'translate-x-5' : 'translate-x-0' }`} />
                    </button>
                  </div>
                );
              })()}
            </div>
            
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
              <button
                onClick={() => setIsResponseModalOpen(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendMessage}
                disabled={!responseText.trim() || isSendingResponse}
                className="flex items-center gap-2 px-4 py-2 bg-[#25D366] hover:bg-[#1DA851] text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSendingResponse ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isSendingResponse ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AtendimentoScreen;
