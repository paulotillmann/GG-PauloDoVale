import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { TEMPLATE_CONFIG } from '../config/template.config';
import { 
  LayoutDashboard, Users, CalendarDays, Laptop, FileText, StickyNote,
  Bell, Moon, Sun, LogOut, Settings,
  Shield, Puzzle, UsersRound, ChevronDown, ChevronRight, ScrollText, Clock,
  CheckSquare
} from 'lucide-react';
import ProfileScreen    from '../pages/ProfileScreen';
import AccessProfiles   from '../pages/admin/AccessProfiles';
import ModulesScreen    from '../pages/admin/ModulesScreen';
import UsersManagement  from '../pages/admin/UsersManagement';
import PeopleScreen     from '../pages/PeopleScreen';
import ActivityLogsScreen from '../pages/admin/ActivityLogsScreen';
import AgendaScreen     from '../pages/AgendaScreen';
import RequerimentosScreen from '../pages/RequerimentosScreen';
import DemandasScreen     from '../pages/DemandasScreen';
import AtendimentoScreen from '../pages/AtendimentoScreen';
import AnotacoesScreen    from '../pages/AnotacoesScreen';

// ─── Types ────────────────────────────────────────────────────────────────────
interface DashboardLayoutProps {
  children: React.ReactNode;
  onLogout?: () => void;
}

// ─── Sidebar Items ────────────────────────────────────────────────────────────
// Mapeamento de slug do banco → config do item de menu
const ALL_SIDEBAR_ITEMS = [
  { id: 'dashboard',        slug: 'dashboard',    label: 'Visão Geral',         icon: LayoutDashboard },
  { id: 'pessoas',          slug: 'pessoas',      label: 'Pessoas e Entidades',  icon: Users },
  { id: 'agenda',           slug: 'agenda',       label: 'Agenda',               icon: CalendarDays },
  { id: 'auto-atendimento', slug: 'atendimentos', label: 'Auto Atendimento',     icon: Laptop },
  { id: 'requerimentos',    slug: 'requerimentos',label: 'Requerimentos',        icon: FileText },
  { id: 'demandas',         slug: 'demandas',     label: 'Demandas',             icon: CheckSquare },
  { id: 'anotacoes',        slug: 'anotacoes',    label: 'Anotações',            icon: StickyNote },
];

const CONFIG_ITEMS = [
  { id: 'config/perfis',    label: 'Perfis de Acesso',     icon: Shield },
  { id: 'config/modulos',   label: 'Módulos',              icon: Puzzle },
  { id: 'config/usuarios',  label: 'Gestão de Usuários',   icon: UsersRound },
  { id: 'config/logs',      label: 'Logs de Atividade',    icon: ScrollText },
];

// ─── Error Boundary ─────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  render() { 
    if (this.state.hasError) return <div className="p-8 text-red-500 font-mono">Erro de Renderização: {String(this.state.error?.message ?? this.state.error)}</div>; 
    return this.props.children; 
  }
}

// ─── Content Router ───────────────────────────────────────────────────────────
const renderContent = (activeMenu: string, children: React.ReactNode) => {
  return (
    <ErrorBoundary>
      {(() => {
        if (activeMenu === 'perfil')           return <ProfileScreen />;
        if (activeMenu === 'pessoas')          return <PeopleScreen />;
        if (activeMenu === 'agenda')           return <AgendaScreen />;
        if (activeMenu === 'anotacoes')        return <AnotacoesScreen />;
        if (activeMenu === 'auto-atendimento') return <AtendimentoScreen />;
        if (activeMenu === 'requerimentos')    return <RequerimentosScreen />;
        if (activeMenu === 'demandas')         return <DemandasScreen />;
        if (activeMenu === 'config/perfis')    return <AccessProfiles />;
        if (activeMenu === 'config/modulos')   return <ModulesScreen />;
        if (activeMenu === 'config/usuarios')  return <UsersManagement />;
        if (activeMenu === 'config/logs')      return <ActivityLogsScreen />;
        if (activeMenu === 'no-access') {
          return (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <Shield className="w-16 h-16 mb-4 opacity-20" />
              <h2 className="text-xl font-semibold mb-2">Acesso Restrito</h2>
              <p>Seu perfil não possui acesso a nenhum módulo do sistema.</p>
            </div>
          );
        }
        if (activeMenu === 'dashboard')        return children;
        return children;
      })()}
    </ErrorBoundary>
  );
};

// ─── Sidebar Item ─────────────────────────────────────────────────────────────
const SidebarBtn: React.FC<{
  id: string; label: string; icon: React.ElementType;
  active: boolean; onClick: () => void; indent?: boolean; badge?: number;
}> = ({ id: _id, label, icon: Icon, active, onClick, indent, badge }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
      indent ? 'ml-3 w-[calc(100%-12px)]' : ''
    } ${
      active
        ? 'bg-white/10 text-white'
        : 'text-blue-100/70 hover:bg-white/5 hover:text-white'
    }`}
  >
    <Icon className={`mr-3 h-4 w-4 ${active ? 'text-white' : 'text-blue-100/50'}`} />
    <span className="flex-1 text-left">{label}</span>
    {badge != null && badge > 0 && (
      <span className="ml-2 flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
        {badge > 9 ? '9+' : badge}
      </span>
    )}
  </button>
);

// ─── Component ────────────────────────────────────────────────────────────────
const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, onLogout }) => {
  const { profile, signOut, isAdmin, updateTheme, userModules } = useAuth();
  const handleLogout = onLogout ?? signOut;

  const [activeMenu, setActiveMenu] = useState(() => {
    if (isAdmin) return 'dashboard'; // Admin sempre pode ver o dashboard (ou ao menos tem configs)
    if (userModules.length === 0) return 'no-access';
    const hasDashboard = userModules.some(m => m.slug === 'dashboard');
    if (hasDashboard) return 'dashboard';
    const firstItem = ALL_SIDEBAR_ITEMS.find(item => userModules.some(m => m.slug === item.slug));
    return firstItem ? firstItem.id : 'no-access';
  });
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });
  const [configOpen, setConfigOpen]       = useState(false);
  const [agendaBadge, setAgendaBadge]     = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isAdmin && userModules.length === 0 && !activeMenu.startsWith('config/') && activeMenu !== 'perfil') {
       setActiveMenu('no-access');
    }
  }, [userModules, isAdmin]);

  const isConfigActive = activeMenu.startsWith('config/');

  // Badge: compromissos de hoje com lembrar=true
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    supabase
      .from('agenda')
      .select('*, pessoa(full_name)')
      .eq('data', today)
      .eq('lembrar', true)
      .order('horario_inicio', { ascending: true })
      .then(({ data }) => {
        setNotifications(data ?? []);
        setAgendaBadge(data?.length ?? 0);
      });
  }, []);

  useEffect(() => {
    // Escuta mudanças de localStorage externas (caso existam) e inicial do sistema
    document.documentElement.classList.toggle('dark', isDarkMode);
    
    // Escuta eventos customizados de navegação (ex: vindo de botões no Dashboard)
    const handleNav = (e: any) => {
      if (e.detail && typeof e.detail === 'string') {
        setActiveMenu(e.detail);
      }
    };
    window.addEventListener('navigate', handleNav);
    return () => window.removeEventListener('navigate', handleNav);
  }, [isDarkMode]);

  // Se o profile já carregou e temos o setting dele na context (vem do DB), mantemos sincronizados:
  useEffect(() => {
    if (profile?.theme) {
      setIsDarkMode(profile.theme === 'dark');
    }
  }, [profile?.theme]);

  const toggleDarkMode = () => {
    const nextTheme = !isDarkMode ? 'dark' : 'light';
    setIsDarkMode(nextTheme === 'dark');
    if (updateTheme) {
      updateTheme(nextTheme);
    }
  };

  const handleConfigItem = (id: string) => {
    setActiveMenu(id);
    setConfigOpen(true);
  };

  return (
    <div className="flex h-screen bg-[#EDF1F4] dark:bg-slate-950 font-sans transition-colors duration-300">

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside className={`w-64 ${TEMPLATE_CONFIG.colors.sidebarBg} ${TEMPLATE_CONFIG.colors.sidebarBgDark} border-r ${TEMPLATE_CONFIG.colors.sidebarBorder} ${TEMPLATE_CONFIG.colors.sidebarBorderDark} flex flex-col transition-colors duration-300`}>

        {/* Logo */}
        <div className="p-4 flex items-center justify-center border-b border-white/10 dark:border-slate-800 shrink-0">
          <img
            src={TEMPLATE_CONFIG.logos.sidebarLight}
            alt={`Logo ${TEMPLATE_CONFIG.vereadorName}`}
            className="h-[80px] max-w-full w-auto object-contain drop-shadow-sm"
            onError={(e) => { (e.target as HTMLImageElement).src = `https://placehold.co/150x40?text=${encodeURIComponent(TEMPLATE_CONFIG.logos.fallbackText)}`; }}
          />
        </div>

        {/* Main Menu — filtrado pelos módulos autorizados do usuário */}
        <div className="flex-1 overflow-y-auto pt-7 pb-2 px-4 space-y-1">
          {ALL_SIDEBAR_ITEMS
            .filter(item => userModules.some(m => m.slug === item.slug))
            .map((item) => (
              <SidebarBtn
                key={item.id}
                id={item.id}
                label={item.label}
                icon={item.icon}
                active={activeMenu === item.id}
                onClick={() => setActiveMenu(item.id)}
                badge={item.id === 'agenda' ? agendaBadge : undefined}
              />
            ))
          }
        </div>

        {/* Bottom: Configurações + Sair */}
        <div className="p-4 border-t border-white/10 dark:border-slate-800 space-y-1">

          {/* Configurações — admin only */}
          {isAdmin && (
            <div>
              <button
                onClick={() => setConfigOpen(!configOpen)}
                className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isConfigActive
                    ? 'bg-white/10 text-white'
                    : 'text-blue-100/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Settings className={`mr-3 h-5 w-5 ${isConfigActive ? 'text-white' : 'text-blue-100/50'}`} />
                <span className="flex-1 text-left">Configurações</span>
                {configOpen
                  ? <ChevronDown className="h-4 w-4 text-blue-100/50" />
                  : <ChevronRight className="h-4 w-4 text-blue-100/50" />
                }
              </button>

              <AnimatePresence>
                {configOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden mt-1 space-y-0.5"
                  >
                    {CONFIG_ITEMS.map((item) => (
                      <SidebarBtn
                        key={item.id}
                        id={item.id}
                        label={item.label}
                        icon={item.icon}
                        active={activeMenu === item.id}
                        onClick={() => handleConfigItem(item.id)}
                        indent
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-blue-100/70 hover:bg-white/5 hover:text-white transition-colors"
          >
            <LogOut className="mr-3 h-5 w-5 text-blue-100/50" />
            Sair do Sistema
          </button>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header className="h-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 shrink-0 transition-colors duration-300">

          {/* Spacer para alinhar os itens à direita */}
          <div className="flex-1" />

          {/* Actions */}
          <div className="flex items-center space-x-4">

            {/* Relógio Digital */}
            <div className="hidden sm:flex items-center space-x-2 mr-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-lg">
              <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              <span className="text-sm font-bold font-heading text-slate-700 dark:text-slate-200 tracking-wider tabular-nums">
                {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            <button onClick={toggleDarkMode} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className={`p-2 relative rounded-full transition-colors ${
                  showNotifications 
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' 
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Bell className="h-5 w-5" />
                {agendaBadge > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowNotifications(false)} 
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl z-50 overflow-hidden"
                    >
                      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h3 className="font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <Bell className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          Lembretes
                        </h3>
                        {agendaBadge > 0 && (
                          <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-bold">
                            {agendaBadge} HOJE
                          </span>
                        )}
                      </div>

                      <div className="max-h-[350px] overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="p-8 text-center">
                            <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                              <Bell className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum lembrete para hoje.</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-50 dark:divide-slate-800">
                            {notifications.map((notif) => (
                              <div 
                                key={notif.id}
                                className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                                onClick={() => {
                                  setActiveMenu('agenda');
                                  setShowNotifications(false);
                                }}
                              >
                                <div className="flex items-start gap-3">
                                  <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
                                    notif.tipo === 'Reunião' ? 'bg-purple-500' :
                                    notif.tipo === 'Visita' ? 'bg-emerald-500' : 'bg-amber-500'
                                  }`} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400 uppercase">
                                        {notif.horario_inicio.slice(0, 5)}
                                      </span>
                                      <span className="text-[10px] text-slate-400">Hoje</span>
                                    </div>
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                      {notif.titulo_compromisso}
                                    </p>
                                    {notif.local && (
                                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                        📍 {notif.local}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <button 
                        onClick={() => {
                          setActiveMenu('agenda');
                          setShowNotifications(false);
                        }}
                        className="w-full p-3 bg-slate-50 dark:bg-slate-800/50 text-center text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors border-t border-slate-100 dark:border-slate-800"
                      >
                        Ver Agenda Completa
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Profile chip */}
            <div
              className="ml-2 pl-4 border-l border-slate-200 dark:border-slate-800 flex items-center space-x-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-2 rounded-lg transition-colors"
              onClick={() => setActiveMenu('perfil')}
            >
              <img
                src={profile?.avatar_url || `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${profile?.full_name || 'User'}`}
                alt={profile?.full_name ?? 'Usuário'}
                className="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 object-cover"
              />
              <div className="hidden xl:block">
                <p className="text-sm font-medium text-slate-900 dark:text-white leading-tight">{profile?.full_name ?? 'Usuário'}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                  {profile?.roles?.name ?? (profile?.role === 'admin' ? 'Administrador' : 'Colaborador')}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div id="main-scroll-container" className="flex-1 overflow-y-auto">
          <div className={
            activeMenu === 'anotacoes'
              ? 'h-full w-full'
              : 'p-8 max-w-[1600px] mx-auto'
          }>
            {renderContent(activeMenu, children)}
          </div>
        </div>

      </main>
    </div>
  );
};

export default DashboardLayout;
