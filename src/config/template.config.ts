// ─── Template Configuration ──────────────────────────────────────────────────
// Este é o ÚNICO arquivo que você precisa editar para personalizar o portal.
// Altere os valores abaixo para cada novo vereador/gabinete.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Logos ───────────────────────────────────────────────────────────────────
// Substitua os arquivos em src/assets/logos/ pelos logos do novo vereador.
// Os nomes dos arquivos devem corresponder aos imports abaixo.
import logoOficial from '../assets/logos/logo_oficial.png';
import logoSplash from '../assets/logos/logo_splash.png';

export const TEMPLATE_CONFIG = {
  // ─── Identidade do Gabinete ─────────────────────────────────────────────
  appName: 'Gabinete Paulo do Vale',
  vereadorName: 'Paulo do Vale',
  vereadorTitle: 'Vereador',
  gabineteSubtitle: 'Portal de Gestão do Gabinete Parlamentar',

  // ─── Textos da Tela de Login ────────────────────────────────────────────
  login: {
    heroTitle: 'Gestão de Gabinete Eficiente',
    heroSubtitle: 'Portal do Gabinete do Vereador Paulo do Vale. Gerencie Pessoas, Requerimentos, Ocorrências e Agendas de forma centralizada e ágil.',
    formTitle: 'Acesso ao Sistema',
    formSubtitle: 'Insira suas credenciais para continuar',
    emailPlaceholder: 'assessor@paulodovale.com.br',
  },

  // ─── Textos do Dashboard ────────────────────────────────────────────────
  dashboard: {
    greeting: 'Olá',
    subtitle: 'Panorama da base de dados do Gabinete Paulo do Vale.',
  },

  // ─── Splash Screen ─────────────────────────────────────────────────────
  splash: {
    loadingText: 'Carregando Gabinete Paulo do Vale...',
  },

  // ─── Cores da Sidebar (classes Tailwind ou HEX) ─────────────────────────
  // Paleta: Azul Royal (#0033a0) + Dourado (#c9a227)
  colors: {
    // Sidebar
    sidebarBg: 'bg-[#0033a0]',                 // Azul real parlamentar (light)
    sidebarBgDark: 'dark:bg-slate-900',         // Background da sidebar (dark)
    sidebarBorder: 'border-white/10',
    sidebarBorderDark: 'dark:border-slate-800',

    // Login left panel gradient
    loginGradientFrom: 'from-[#0033a0]',
    loginGradientTo: 'to-[#001f60]',
    loginPanelBg: 'bg-[#0033a0]',

    // Splash progress bar (dourado — contrasta com azul royal)
    splashProgressBar: 'bg-[#c9a227]',

    // Accent / botões principais
    accentBg: 'bg-[#0033a0]',
    accentHover: 'hover:bg-[#001f60]',
    accentRing: 'focus:ring-[#0033a0]',
  },

  // ─── Logos (importados acima) ───────────────────────────────────────────
  logos: {
    /** Logo da sidebar no light mode */
    sidebarLight: logoOficial,
    /** Logo da sidebar no dark mode */
    sidebarDark: logoOficial,
    /** Logo grande na tela de login (painel esquerdo) */
    loginHero: logoOficial,
    /** Logo na splash screen */
    splash: logoSplash,
    /** Texto de fallback caso a imagem não carregue */
    fallbackText: 'Gabinete Paulo do Vale',
  },

  // ─── Page Title & SEO ──────────────────────────────────────────────────
  pageTitle: 'Gabinete Paulo do Vale — Portal Parlamentar',
  metaDescription: 'Portal de gestão parlamentar do Vereador Paulo do Vale. Gerencie pessoas, requerimentos, agenda e atendimentos do gabinete de forma centralizada.',
} as const;

export type TemplateConfig = typeof TEMPLATE_CONFIG;
