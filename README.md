# Gestão Gabinete — Template Reutilizável

Template para portais de gestão de gabinete parlamentar.  
Stack: **React + TypeScript + Vite + TailwindCSS + Supabase**

---

## 🚀 Como Usar Este Template

### 1. Copie esta pasta para um novo diretório

```bash
xcopy /E /I "C:\TemplateVereadores" "C:\GestãoGabinete\GG-NomeDoVereador"
```

### 2. Configure a Identidade Visual

Edite o arquivo `src/config/template.config.ts`:

```typescript
export const TEMPLATE_CONFIG = {
  appName: 'Gestão Gabinete',
  vereadorName: 'Nome do Vereador',     // ← Altere aqui
  vereadorTitle: 'Vereador(a)',          // ← Altere aqui

  login: {
    heroTitle: 'Gestão de Gabinete Eficiente',  // ← Texto do login
    heroSubtitle: '...',                         // ← Descrição
    emailPlaceholder: 'assessor@gabinete.gov.br',
  },

  colors: {
    sidebarBg: 'bg-[#1e40af]',          // ← Cor da sidebar
    loginPanelBg: 'bg-blue-600',        // ← Cor do painel do login
    // ... mais cores
  },
  // ...
};
```

### 3. Substitua os Logos

Substitua os arquivos em `src/assets/logos/`:

| Arquivo | Uso |
|---------|-----|
| `logo_oficial.png` | Sidebar (light mode) + Login hero |
| `logo_branca.png` | Sidebar (dark mode) + Register |
| `logo_splash.png` | Splash screen |

### 4. Configure o Supabase

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://<SEU_PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<SUA_ANON_KEY>
```

### 5. Instale e Execute

```bash
npm install
npm run dev
```

---

## 📁 Estrutura de Arquivos

```
├── src/
│   ├── config/
│   │   └── template.config.ts   ← ARQUIVO DE CONFIGURAÇÃO PRINCIPAL
│   ├── assets/logos/             ← Logos do vereador
│   ├── components/               ← Componentes (SplashScreen, Forms)
│   ├── contexts/                 ← AuthContext (RBAC)
│   ├── layouts/                  ← DashboardLayout (sidebar + header)
│   ├── lib/                      ← Supabase client
│   ├── pages/                    ← Páginas do sistema
│   ├── types/                    ← TypeScript types
│   └── utils/                    ← Validadores (CPF, CNPJ, etc.)
├── rbac_documentation.md         ← Documentação completa do RBAC
├── .env.example                  ← Template das variáveis de ambiente
└── index.html                    ← Entry point
```

---

## 🔐 RBAC (Controle de Acesso)

O sistema inclui RBAC completo com:
- Perfis de acesso (roles) com permissões granulares
- Módulos dinâmicos gerenciados via banco
- Row Level Security (RLS) no PostgreSQL
- Documentação técnica detalhada em `rbac_documentation.md`

Para configurar o RBAC num novo projeto Supabase, siga os passos documentados em `rbac_documentation.md`.

---

## 📦 Módulos Incluídos

- ✅ Dashboard com KPIs e gráficos
- ✅ Pessoas e Entidades (CRUD completo)
- ✅ Agenda com calendário
- ✅ Requerimentos com upload de PDFs
- ✅ Perfil do usuário
- ✅ Administração (Perfis, Módulos, Usuários, Logs)
- ✅ Splash Screen e Login
- ✅ Dark Mode
