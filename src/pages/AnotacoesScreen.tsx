import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, X, Search, Clock, CalendarDays, Edit2, Trash2, ChevronLeft, ChevronRight, StickyNote, AlertTriangle } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  'recebido': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  'lido': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  'resolvendo': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  'concluído': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
};

// (A geração estática foi substituída por useMemo dinâmico)

// Funções de formatação nativas para não depender de libs
const formatDateHeader = (date: Date) => {
  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const dayName = weekdays[date.getDay()];
  const dayNum = String(date.getDate()).padStart(2, '0');
  const monthNum = String(date.getMonth() + 1).padStart(2, '0');
  return `${dayNum}/${monthNum} ${dayName}`;
};

const formatTime = (isoString: string) => {
  const d = new Date(isoString);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

export default function AnotacoesScreen() {
  const { user } = useAuth();
  const [anotacoes, setAnotacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  });
  
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  });

  const columns = useMemo(() => {
    const days = [];
    if (!startDate || !endDate) return [];
    
    // Tratamento de timezone seguro
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    
    const [ey, em, ed] = endDate.split('-').map(Number);
    const end = new Date(ey, em - 1, ed);
    
    let current = start;
    let count = 0;
    while (current <= end && count < 30) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
      count++;
    }
    return days;
  }, [startDate, endDate]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  useEffect(() => {
    setTimeout(checkScroll, 100);
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [anotacoes]);

  const scrollByAmount = (offset: number) => {
    const el = scrollRef.current;
    if (!el) return;

    const start = el.scrollLeft;
    const duration = 600; // 600 milissegundos para extrema maciez
    let startTime: number | null = null;

    // Curva de Interpolação "easeOutQuart" (iniciar rápido, frear muito macio)
    const easeOutQuart = (x: number): number => 1 - Math.pow(1 - x, 4);

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const percentage = Math.min(progress / duration, 1);
      
      el.scrollLeft = start + offset * easeOutQuart(percentage);
      
      if (progress < duration) {
        window.requestAnimationFrame(step);
      }
    };
    
    window.requestAnimationFrame(step);
  };

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  
  // Forms
  const [waNum, setWaNum] = useState('');
  const [desc, setDesc] = useState('');
  const [dataHora, setDataHora] = useState('');
  const [status, setStatus] = useState('recebido');

  const openNewModal = (defaultDate?: Date) => {
    setEditItem(null);
    setWaNum('');
    setDesc('');
    
    // Default form time initialization
    const initialDate = defaultDate ? new Date(defaultDate) : new Date();
    if (defaultDate) {
      // Set to current time of today but on the specific target day
      const now = new Date();
      initialDate.setHours(now.getHours(), now.getMinutes());
    }
    
    const tzOffset = initialDate.getTimezoneOffset() * 60000; // offset em milisegundos
    const localISOTime = new Date(initialDate.getTime() - tzOffset).toISOString().slice(0, 16);
    setDataHora(localISOTime);
    setStatus('recebido');
    setIsModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setEditItem(item);
    setWaNum(item.whatsapp || '');
    setDesc(item.descricao_anotacao || '');
    const tzOffset = new Date(item.data_hora).getTimezoneOffset() * 60000;
    const localISOTime = new Date(new Date(item.data_hora).getTime() - tzOffset).toISOString().slice(0, 16);
    setDataHora(localISOTime);
    setStatus(item.status);
    setIsModalOpen(true);
  };

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    if (columns.length === 0) return;

    const startBoundary = new Date(columns[0]);
    startBoundary.setHours(0, 0, 0, 0);

    const endBoundary = new Date(columns[columns.length - 1]);
    endBoundary.setHours(23, 59, 59, 999);

    const { data } = await supabase
      .from('vw_anotacoes_com_contato')
      .select('*')
      .gte('data_hora', startBoundary.toISOString())
      .lte('data_hora', endBoundary.toISOString())
      .order('data_hora', { ascending: false });

    setAnotacoes(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [user, columns]);

  useEffect(() => {
    if (!user) return;
    // Setup Realtime
    const channel = supabase.channel('anotacoes_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'anotacoes'
        },
        () => {
          fetchData(); // Simplistic fast refetch on changes
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const payload = {
        whatsapp: waNum,
        descricao_anotacao: desc,
        data_hora: new Date(dataHora).toISOString(),
        status: status,
        user_id: user.id
      };

      if (editItem) {
        await supabase.from('anotacoes').update(payload).eq('id', editItem.id);
      } else {
        await supabase.from('anotacoes').insert([payload]);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = (id: string) => {
    setNoteToDelete(id);
  };

  const confirmDelete = async () => {
    if (!noteToDelete) return;
    try {
      await supabase.from('anotacoes').delete().eq('id', noteToDelete);
      setNoteToDelete(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await supabase.from('anotacoes').update({ status: newStatus }).eq('id', id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDragStart = (e: React.DragEvent, note: any) => {
    e.dataTransfer.setData('text/plain', note.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();
    const noteId = e.dataTransfer.getData('text/plain');
    if (!noteId) return;

    const note = anotacoes.find(n => n.id === noteId);
    if (!note) return;

    // Se estiver soltando no mesmo dia, ignora
    const originalDate = new Date(note.data_hora);
    if (
      originalDate.getDate() === targetDate.getDate() &&
      originalDate.getMonth() === targetDate.getMonth() &&
      originalDate.getFullYear() === targetDate.getFullYear()
    ) {
      return;
    }

    const newDate = new Date(targetDate);
    newDate.setHours(
      originalDate.getHours(),
      originalDate.getMinutes(),
      originalDate.getSeconds(),
      originalDate.getMilliseconds()
    );

    // Update state locally for immediate feedback
    setAnotacoes(prev => prev.map(n => 
      n.id === noteId ? { ...n, data_hora: newDate.toISOString() } : n
    ));

    try {
      await supabase.from('anotacoes').update({ data_hora: newDate.toISOString() }).eq('id', noteId);
    } catch (err) {
      console.error(err);
      fetchData(); // rollback in case of error
    }
  };

  return (
    <div className="h-full flex flex-col pt-4 px-[30px] pb-6 bg-[#f8fafc] dark:bg-[#0B1120] overflow-hidden">
      
      {/* Header Fixo */}
      <div className="flex justify-between items-center mb-6 mt-2 w-full max-w-[1846px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-800 dark:text-white flex items-center">
            <StickyNote className="h-6 w-6 mr-3 text-blue-600 dark:text-blue-400" />
            Anotações
          </h1>
          <p className="text-slate-500 dark:text-slate-400">Gerenciamento estilo Kanban</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-white dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
            <CalendarDays className="w-4 h-4 text-slate-400" />
            <input 
              type="date" 
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
            />
            <span className="text-slate-400 text-sm">até</span>
            <input 
              type="date" 
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-transparent text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
            />
          </div>
          <button 
            onClick={() => openNewModal()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center transition-colors font-medium"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Anotação
          </button>
        </div>
      </div>

      {/* Kanban Board Container (com setas de rolagem) */}
      <div className="relative flex-1 w-full max-w-[1846px] mx-auto overflow-hidden group">
        
        {canScrollLeft && (
          <button 
            onClick={() => scrollByAmount(-532)}
            className="absolute left-2 xl:left-4 top-[40%] -translate-y-1/2 z-20 p-2 bg-white dark:bg-slate-800 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.1)] border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all opacity-0 group-hover:opacity-100"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <div 
          ref={scrollRef} 
          onScroll={checkScroll} 
          className="flex-1 overflow-x-hidden overflow-y-hidden pb-4 w-full h-full scroll-smooth"
        >
          <div className="flex gap-4 h-full w-max mx-auto items-start">
          
          {columns.map((colDate, idx) => {
            const today = new Date();
            const isToday = colDate.getDate() === today.getDate() && 
                            colDate.getMonth() === today.getMonth() && 
                            colDate.getFullYear() === today.getFullYear();
            
            // Filtramos as notas que pertencem a este dia específico
            const colStart = new Date(colDate);
            const colEnd = new Date(colDate);
            colEnd.setHours(23, 59, 59, 999);
            
            const dayNotes = anotacoes.filter(a => {
              const dt = new Date(a.data_hora);
              return dt >= colStart && dt <= colEnd;
            });

            return (
              <div 
                key={idx} 
                className={`flex flex-col flex-shrink-0 w-[250px] h-full max-h-full rounded-2xl border ${
                  isToday 
                    ? 'bg-slate-100/80 dark:bg-slate-800/80 border-blue-200 dark:border-blue-700/50' 
                    : 'bg-white/80 dark:bg-slate-900/80 border-slate-200 dark:border-slate-800'
                }`}
              >
                {/* Board Column Header */}
                <div className={`p-4 border-b ${isToday ? 'border-blue-200 dark:border-blue-700/50' : 'border-slate-100 dark:border-slate-800'} flex items-center justify-between`}>
                  <div className="flex items-center space-x-2">
                    <h3 className={`font-bold font-heading ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      {formatDateHeader(colDate)}
                    </h3>
                    {isToday && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 uppercase tracking-wider">
                        Hoje
                      </span>
                    )}
                  </div>
                  <button 
                    onClick={() => openNewModal(colDate)}
                    className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                {/* Cards List */}
                <div 
                  className="flex-1 overflow-y-auto p-3 space-y-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, colDate)}
                >
                  {dayNotes.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 dark:text-slate-600 text-sm italic">
                      Nenhuma anotação
                    </div>
                  ) : (
                    dayNotes.map(note => (
                      <div 
                        key={note.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, note)}
                        className="group/card bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow relative cursor-grab active:cursor-grabbing"
                      >
                       <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 px-2 py-1 rounded">
                            <Clock className="w-3 h-3 mr-1" />
                            {formatTime(note.data_hora)}
                          </div>
                          
                          <div className="flex space-x-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                            <button onClick={() => openEditModal(note)} className="p-1 text-slate-400 hover:text-blue-600">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(note.id)} className="p-1 text-slate-400 hover:text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                       </div>

                       <div className="mt-1 mb-3 text-sm text-slate-700 dark:text-slate-200 font-medium">
                          {note.descricao_anotacao}
                       </div>

                       <div className="flex items-center mt-auto">
                          <select
                            value={note.status?.toLowerCase()}
                            onChange={(e) => handleStatusChange(note.id, e.target.value)}
                            className={`appearance-none cursor-pointer px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider focus:outline-none text-center ${STATUS_COLORS[note.status?.toLowerCase()] || STATUS_COLORS['recebido']}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="recebido" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">RECEBIDO</option>
                            <option value="lido" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">LIDO</option>
                            <option value="resolvendo" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">RESOLVENDO</option>
                            <option value="concluído" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">CONCLUÍDO</option>
                          </select>
                       </div>
                      </div>
                    ))
                  )}
                </div>

              </div>
            );
          })}
        </div>
      </div>

      {canScrollRight && (
          <button 
            onClick={() => scrollByAmount(532)}
            className="absolute right-2 xl:right-4 top-[40%] -translate-y-1/2 z-20 p-2 bg-white dark:bg-slate-800 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.1)] border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all opacity-0 group-hover:opacity-100"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
      )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-700/50">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white font-heading">
                {editItem ? 'Editar Anotação' : 'Nova Anotação'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">WhatsApp / Vínculo</label>
                <input 
                  type="text" 
                  autoFocus
                  required
                  placeholder="Ex: 53991100013"
                  value={waNum}
                  onChange={e => setWaNum(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data e Hora</label>
                <input 
                  type="datetime-local" 
                  required
                  value={dataHora}
                  onChange={e => setDataHora(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Descrição</label>
                <textarea 
                  required
                  rows={3}
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                <select 
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="recebido">Recebido</option>
                  <option value="lido">Lido</option>
                  <option value="resolvendo">Resolvendo</option>
                  <option value="concluído">Concluído</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end space-x-3">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {noteToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Excluir Anotação</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Tem certeza que deseja excluir esta anotação? Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 flex justify-center space-x-3">
              <button
                onClick={() => setNoteToDelete(null)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
