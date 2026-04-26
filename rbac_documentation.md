# Documentação Técnica: Sistema de Permissões e Controle de Acesso (RBAC)

> **Stack:** Supabase (PostgreSQL) + React (TypeScript)
> **Última atualização:** Abril 2026

---

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Modelo de Dados](#2-modelo-de-dados)
3. [Funções Helper no PostgreSQL](#3-funções-helper-no-postgresql)
4. [Triggers e Automações](#4-triggers-e-automações)
5. [Row Level Security (RLS)](#5-row-level-security-rls)
6. [Dois Níveis de Permissão](#6-dois-níveis-de-permissão)
7. [Fluxo de Autenticação e Carregamento de Permissões](#7-fluxo-de-autenticação-e-carregamento-de-permissões)
8. [Camada Frontend — TypeScript/React](#8-camada-frontend--typescriptreact)
9. [Proteção de Rotas e Componentes](#9-proteção-de-rotas-e-componentes)
10. [Gestão Dinâmica de Módulos](#10-gestão-dinâmica-de-módulos)
11. [Como Adicionar Nova Tela com Permissão](#11-como-adicionar-nova-tela-com-permissão)
12. [Diagrama de Relacionamentos](#12-diagrama-de-relacionamentos)

---

## 1. Visão Geral

O sistema utiliza **RBAC (Role-Based Access Control)** com duas camadas complementares de controle de acesso:

| Camada | Responsabilidade |
|--------|-----------------|
| **Permissões de Ação** | O que o usuário **pode fazer** dentro de um módulo (ex.: upload, envio de e-mail, visualizar todos os registros) |
| **Permissões de Módulo** | Quais **telas/rotas** o usuário pode acessar |

A segurança é aplicada em dois ambientes independentes:

1. **Banco de dados (PostgreSQL via Supabase):** Via RLS — o banco bloqueia queries indevidas mesmo que o frontend falhe.
2. **Frontend (React):** Via guards de rota e componente — o usuário não vê menus nem acessa URLs sem permissão.

---

## 2. Modelo de Dados

### 2.1 `auth.users` — Gerenciada pelo Supabase Auth

Tabela interna do Supabase. Armazena credenciais (e-mail, hash de senha, tokens). **Nunca manipulada diretamente pelo desenvolvedor.**

---

### 2.2 `public.profiles` — Perfil do Usuário

Extensão do usuário autenticado. Criada automaticamente via trigger ao registrar um novo usuário em `auth.users`.

```sql
CREATE TABLE public.profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  text,
  email      text,
  avatar_url text,
  telefone   text,
  role       text        NOT NULL DEFAULT 'colaborador', -- 'admin' | 'colaborador'
  role_id    uuid        REFERENCES public.roles(id),   -- FK para o perfil RBAC
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Campos críticos:**

| Campo | Descrição |
|-------|-----------|
| `id` | Mesmo UUID do `auth.users` — chave de vínculo |
| `role` | Campo texto de compatibilidade. Valores: `'admin'` ou `'colaborador'`. Utilizado em políticas RLS que exigem verificação de administrador. Sincronizado automaticamente pelo trigger `sync_profile_role` |
| `role_id` | FK para `public.roles`. Define o perfil RBAC completo do usuário. Governa todas as permissões de ação e módulos |

> [!IMPORTANT]
> Um usuário com `role_id = NULL` não possui perfil RBAC e receberá apenas as permissões definidas pelo campo texto `role`. O campo `role` é o fallback de segurança.

---

### 2.3 `public.roles` — Perfis de Acesso

Define os **perfis** (grupos de permissão) disponíveis no sistema e suas **permissões de ação**.

```sql
CREATE TABLE public.roles (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL,        -- Ex: "Administrador", "Visitante"
  slug           text        NOT NULL UNIQUE, -- Ex: "admin", "visitante"
  -- Permissões de ação (o que o perfil pode FAZER)
  can_upload     boolean     NOT NULL DEFAULT false,
  can_send_email boolean     NOT NULL DEFAULT false,
  can_view_all   boolean     NOT NULL DEFAULT false,
  is_system      boolean     NOT NULL DEFAULT false, -- protegido contra exclusão
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
```

**Permissões de ação:**

| Coluna | Comportamento |
|--------|---------------|
| `can_upload` | Permite importar/subir arquivos no sistema |
| `can_send_email` | Permite disparar e-mails via sistema |
| `can_view_all` | Remove filtros de propriedade — vê registros de todos os usuários |

**`is_system = true`:** Perfis nativos protegidos que não podem ser excluídos via UI (ex.: `admin`, `colaborador`).

---

### 2.4 `public.modules` — Telas/Módulos do Sistema

Registra cada **tela navegável** da aplicação. Administradores cadastram novas telas aqui sem precisar alterar o código-fonte.

```sql
CREATE TABLE public.modules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,            -- Nome exibido no menu: "Relatórios"
  slug        text        NOT NULL UNIQUE,     -- Identificador da rota: "relatorios"
  icon        text        NOT NULL DEFAULT 'Layout', -- Nome do ícone (Lucide React)
  description text,                           -- Descrição opcional
  is_active   boolean     NOT NULL DEFAULT true,     -- false = invisível e bloqueado
  sort_order  integer     NOT NULL DEFAULT 0,         -- Ordem no menu lateral
  is_system   boolean     NOT NULL DEFAULT false,     -- módulo nativo não excluível
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

**Campos críticos:**

| Campo | Descrição |
|-------|-----------|
| `slug` | Deve coincidir exatamente com a chave no `pageRegistry` do frontend. É o identificador da rota URL |
| `is_active` | Quando `false`, o módulo é bloqueado no frontend mesmo que exista permissão cadastrada |
| `sort_order` | Controla a ordem dos itens no menu lateral — menor valor aparece primeiro |
| `is_system` | Módulos de sistema não podem ser excluídos via UI administrativa |

---

### 2.5 `public.role_module_permissions` — Matriz de Acesso

Tabela de junção que define **quais perfis** têm acesso a **quais módulos**. Cada linha representa um acesso concedido.

```sql
CREATE TABLE public.role_module_permissions (
  role_id   uuid NOT NULL REFERENCES public.roles(id)   ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, module_id)
);
```

**Como funciona:**
- Uma linha `(role_id, module_id)` = "o perfil X tem acesso ao módulo Y"
- Ausência de linha = acesso negado automaticamente
- `ON DELETE CASCADE` garante limpeza automática ao excluir perfis ou módulos

---

## 3. Funções Helper no PostgreSQL

Funções `SECURITY DEFINER` que encapsulam lógica de permissão utilizada pelas políticas RLS. Executam com privilégios elevados para consultar as tabelas `profiles` e `roles` com segurança e performance.

```sql
-- Retorna o campo 'role' (texto) do usuário logado
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Retorna permissão de upload do perfil do usuário logado
CREATE OR REPLACE FUNCTION get_my_can_upload()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COALESCE(r.can_upload, false)
  FROM profiles p
  LEFT JOIN roles r ON r.id = p.role_id
  WHERE p.id = auth.uid();
$$;

-- Retorna permissão de envio de e-mail
CREATE OR REPLACE FUNCTION get_my_can_send_email()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COALESCE(r.can_send_email, false)
  FROM profiles p
  LEFT JOIN roles r ON r.id = p.role_id
  WHERE p.id = auth.uid();
$$;

-- Retorna se o usuário pode ver todos os registros
CREATE OR REPLACE FUNCTION get_my_can_view_all()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COALESCE(r.can_view_all, false)
  FROM profiles p
  JOIN roles r ON r.id = p.role_id
  WHERE p.id = auth.uid();
$$;
```

> [!TIP]
> Use o padrão `SECURITY DEFINER` para todas as funções helper de permissão. Isso garante que os usuários não precisem de acesso direto à tabela `roles`, mas as políticas RLS ainda possam consultar os dados corretamente.

---

## 4. Triggers e Automações

### 4.1 Criação automática de perfil — `handle_new_user`

**Quando dispara:** `AFTER INSERT ON auth.users`

Cria automaticamente um registro em `public.profiles` para todo novo usuário autenticado. Os dados iniciais são lidos dos `raw_user_meta_data` passados no momento do `signUp`.

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url, telefone)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    NEW.raw_user_meta_data ->> 'avatar_url',
    NEW.raw_user_meta_data ->> 'telefone'
  );
  RETURN NEW;
END;
$$;
```

---

### 4.2 Sincronização do campo `role` — `sync_profile_role`

**Quando dispara:** `BEFORE UPDATE ON public.profiles`

Mantém o campo texto `role` sincronizado com o `role_id`. Garante que a verificação `role = 'admin'` nas políticas RLS seja sempre consistente com o perfil RBAC.

```sql
CREATE OR REPLACE FUNCTION sync_profile_role()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_slug TEXT;
BEGIN
  IF NEW.role_id IS NOT NULL THEN
    SELECT slug INTO v_slug FROM public.roles WHERE id = NEW.role_id;
    -- Apenas o slug 'admin' eleva o campo role para 'admin'
    -- Qualquer outro slug resulta em 'colaborador'
    NEW.role := CASE WHEN v_slug = 'admin' THEN 'admin' ELSE 'colaborador' END;
  END IF;
  RETURN NEW;
END;
$$;
```

> [!NOTE]
> A regra de mapeamento é: somente o perfil cujo `slug = 'admin'` define `role = 'admin'`. Todos os outros perfis, independentemente do nome, resultam em `role = 'colaborador'`. Isso permite criar perfis intermediários (ex.: "Supervisor", "Gerente") sem conceder privilégios de administrador.

---

### 4.3 Atualização automática de `updated_at`

Trigger padrão presente em todas as tabelas para manter o timestamp de última atualização:

```sql
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
-- Aplicar em cada tabela:
-- CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.[tabela]
-- FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
```

---

## 5. Row Level Security (RLS)

> [!IMPORTANT]
> RLS deve estar habilitado em **todas** as tabelas públicas. Nenhuma consulta é possível sem uma política que a autorize explicitamente. Habilitar: `ALTER TABLE public.[tabela] ENABLE ROW LEVEL SECURITY;`

### 5.1 Tabela `profiles`

| Política | Operação | Condição |
|----------|----------|----------|
| `profiles_select_own` | SELECT | `auth.uid() = id` — cada usuário vê apenas o próprio perfil |
| `profiles_admin_select_all` | SELECT | `get_my_role() = 'admin'` — admin vê todos os perfis |
| `profiles_update_own` | UPDATE | `auth.uid() = id` — cada usuário atualiza apenas o próprio |
| `profiles_admin_update_all` | UPDATE | `get_my_role() = 'admin'` — admin atualiza qualquer perfil |
| `profiles_insert_trigger` | INSERT | `auth.uid() = id OR auth.role() = 'service_role'` — apenas via trigger ou service role |

---

### 5.2 Tabela `roles`

| Política | Operação | Condição |
|----------|----------|----------|
| `roles_select` | SELECT | `true` — qualquer usuário autenticado pode ler os perfis disponíveis |
| `roles_admin_write` | ALL | `get_my_role() = 'admin'` — apenas admins criam/editam/excluem |

---

### 5.3 Tabela `modules`

| Política | Operação | Condição |
|----------|----------|----------|
| `modules_select_authenticated` | SELECT | `true` — qualquer usuário autenticado pode ler os módulos |
| `modules_write_admin` | ALL | `profiles.role = 'admin'` — apenas admins gerenciam módulos |

---

### 5.4 Tabela `role_module_permissions`

| Política | Operação | Condição |
|----------|----------|----------|
| `rmp_select_authenticated` | SELECT | `true` — qualquer usuário autenticado pode ler |
| `rmp_write_admin` | ALL | `profiles.role = 'admin'` — apenas admins gerenciam permissões |

> [!NOTE]
> `modules` e `role_module_permissions` são liberados para leitura a todos os usuários autenticados porque o frontend precisa dessas informações para montar o menu e verificar acessos. Não há dados sensíveis nessas tabelas — apenas metadados de configuração.

---

## 6. Dois Níveis de Permissão

### Nível 1 — Permissões de Ação

Controlam **o que o usuário pode fazer** dentro dos módulos que acessa. Armazenadas como colunas booleanas na tabela `roles`. Aplicadas no banco via RLS e no frontend via `can(permissionKey)`.

```
roles.can_upload       → pode importar/criar registros
roles.can_send_email   → pode disparar comunicações
roles.can_view_all     → vê dados de todos os usuários (sem filtro por dono)
```

**Exemple de aplicação no RLS de uma tabela de dados:**
```sql
-- Leitura: precisa ter permissão E só vê seus próprios dados (a menos que can_view_all)
-- Escrita: precisa ter can_upload
-- E-mail/atualização: precisa ter can_send_email ou can_upload
-- Exclusão: apenas admin
```

### Nível 2 — Permissões de Módulo

Controlam **quais telas** o usuário pode navegar. Gerenciadas pela tabela `role_module_permissions`. Aplicadas no frontend via `canAccess(slug)`.

```
role_module_permissions (role_id, module_id) → perfil X acessa módulo Y
modules.is_active = false                    → bloqueia acesso mesmo com permissão
```

**Combinação dos dois níveis:**
```
Usuário acessa /relatorios
  └─ canAccess('relatorios') = true?  → Nível 2: tem a tela liberada?
      └─ can('can_view_all') = true?  → Nível 1: dentro da tela, vê todos os dados?
```

---

## 7. Fluxo de Autenticação e Carregamento de Permissões

```
1. Usuário faz login (e-mail + senha)
          │
          ▼
2. supabase.auth.signInWithPassword()
          │
          ▼
3. onAuthStateChange() dispara  ← SÍNCRONO (nunca usar await aqui)
   → Salva: session, user
          │
          ▼
4. useEffect reage à mudança de user.id  ← separado para evitar deadlock
          │
          ▼
5. fetchProfile(userId):
   │
   ├─ Query 1: profiles com JOIN em roles
   │   SELECT *, roles(*) FROM profiles WHERE id = $userId
   │   → Salva: profile, permissions { can_upload, can_send_email, can_view_all }
   │
   └─ Query 2: módulos autorizados do perfil
       SELECT modules(*) FROM role_module_permissions WHERE role_id = $role_id
       → Filtra: apenas modules.is_active = true
       → Ordena: por modules.sort_order ASC
       → Salva: userModules[]
          │
          ▼
6. profileLoaded = true
   → Frontend libera renderização de rotas e menus
```

**Pontos críticos de implementação:**

| Regra | Motivo |
|-------|--------|
| Não usar `await` dentro do `onAuthStateChange` | Causa deadlock: o Supabase aguarda o callback antes de resolver o `signInWithPassword` |
| O `fetchProfile` roda em `useEffect` separado | É reativo ao `user.id` e não bloqueia o listener de auth |
| Verificar `profileLoaded` antes de avaliar permissões | Evita exibir "Acesso Negado" durante a inicialização do app |

---

## 8. Camada Frontend — TypeScript/React

### 8.1 Tipos TypeScript

```typescript
// src/types/permissions.ts

interface Module {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description?: string | null;
  is_active: boolean;
  sort_order: number;
  is_system: boolean;
}

interface Role {
  id: string;
  name: string;
  slug: string;
  can_upload: boolean;
  can_send_email: boolean;
  can_view_all: boolean;
  is_system: boolean;
}

type Permissions = {
  can_upload: boolean;
  can_send_email: boolean;
  can_view_all: boolean;
};
```

---

### 8.2 AuthContext — Contexto Global de Autenticação

Expõe para toda a aplicação:

```typescript
interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  permissions: Permissions | null;  // permissões de ação do perfil
  userModules: Module[];            // telas às quais o perfil tem acesso
  loading: boolean;
  profileLoaded: boolean;           // true quando fetchProfile concluiu
  isAdmin: boolean;                 // atalho: profile.role === 'admin'
  signIn: (email, password) => Promise<{ error: string | null }>;
  signUp: (email, password, fullName, phone, avatarUrl?) => Promise<...>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}
```

---

### 8.3 Hook `usePermissions`

Interface unificada para verificar permissões em qualquer componente React:

```typescript
// src/hooks/usePermissions.ts
const { can, canAccess, userModules, isAdmin } = usePermissions();

// Nível 1 — Permissão de ação
can('can_upload')      // boolean
can('can_send_email')  // boolean
can('can_view_all')    // boolean

// Nível 2 — Acesso a módulo/tela
canAccess('relatorios')    // boolean — verifica em userModules[]
canAccess('configuracoes') // boolean
```

**Implementação de `canAccess`:**
```typescript
const canAccess = (slug: string): boolean =>
  userModules.some(m => m.slug === slug && m.is_active);
```

---

## 9. Proteção de Rotas e Componentes

### 9.1 Estrutura de Rotas

```
/ (raiz)             → Página de Login (pública)
/perfil              → Perfil do usuário (requer sessão, qualquer perfil)
/:moduleSlug         → DynamicRoute (requer sessão + permissão de módulo)
*                    → Redireciona para /
```

### 9.2 `DynamicRoute` — Guarda de Módulo

Intercepta toda rota `/:moduleSlug` e executa a seguinte lógica em sequência:

```
1. profileLoaded = false?
   → Exibe spinner (aguarda permissões carregarem do banco)

2. canAccess(moduleSlug) = false?
   → Exibe tela "Acesso Restrito"

3. pageRegistry[moduleSlug] não existe?
   → Exibe tela "Módulo não implementado" (cadastrado no banco mas sem componente)

4. Tudo ok?
   → Renderiza o componente via React.Suspense (lazy loading / code splitting)
```

### 9.3 `PermissionGuard` — Guarda de Conteúdo Inline

Para proteger **blocos de conteúdo dentro de uma página** (botões, seções, formulários):

```tsx
// Oculta o conteúdo se não tiver permissão
<PermissionGuard permission="can_upload">
  <button>Importar arquivo</button>
</PermissionGuard>

// Com fallback customizado
<PermissionGuard permission="can_send_email" fallback={<p>Sem permissão para enviar e-mails.</p>}>
  <EmailButton />
</PermissionGuard>
```

---

## 10. Gestão Dinâmica de Módulos

### 10.1 Page Registry (Frontend)

Arquivo estático que mapeia `slug → componente React`. É o único ponto de código que o desenvolvedor edita ao criar uma nova tela.

```typescript
// src/registry/pageRegistry.tsx
export const pageRegistry = {
  'slug-da-tela': lazy(() => import('../pages/NomeDaTela')),
  // Ex:
  'relatorios': lazy(() => import('../pages/Relatorios')),
};
```

### 10.2 Módulos no Banco de Dados

O administrador gerencia telas via interface visual em **Configurações → Módulos**:

| Ação | Comportamento |
|------|---------------|
| Criar módulo | Cadastra no banco com nome, slug, ícone, descrição e ordem |
| Ativar/Desativar | Controla visibilidade sem excluir a configuração |
| Matriz de permissões | Marca/desmarca acesso por perfil com um clique |
| Excluir | Remove do banco (bloqueado para módulos de sistema) |

### 10.3 Menu Lateral Dinâmico

O menu é **100% gerado pelo banco** — renderiza somente os módulos que o perfil logado tem acesso:

```typescript
// Pseudocódigo do Sidebar
userModules
  .filter(m => m.slug !== 'configuracoes') // Configurações: posição especial no rodapé
  .map(module => (
    <NavLink to={`/${module.slug}`}>
      <Icon name={module.icon} />
      {module.name}
    </NavLink>
  ))
```

---

## 11. Como Adicionar Nova Tela com Permissão

### Passo 1 — Criar o componente (desenvolvedor)
```
src/pages/NomeDaTela.tsx
```

### Passo 2 — Registrar no página registry (desenvolvedor)
```typescript
// src/registry/pageRegistry.tsx
'slug-da-tela': lazy(() => import('../pages/NomeDaTela')),
```

### Passo 3 — Cadastrar o módulo (administrador via UI)
```
Configurações → Módulos → Novo Módulo
  Nome:       Nome da Tela
  Slug:       slug-da-tela    ← deve ser idêntico ao registro do passo 2
  Ícone:      NomeLucideIcon  ← nome exato do ícone da biblioteca Lucide React
  Ordem:      5               ← posição no menu
```

### Passo 4 — Atribuir acesso (administrador via UI)
```
Na matriz de permissões, marcar ✓ nos perfis que terão acesso
```

> [!TIP]
> Nenhuma outra alteração de código é necessária. O menu aparece automaticamente para os perfis com acesso, e o sistema trata redirecionamento, loading e tela de acesso negado de forma automática.

---

## 12. Diagrama de Relacionamentos

```
auth.users  (Supabase Auth — interno)
     │
     │ 1:1 — trigger handle_new_user
     ▼
public.profiles
  ├─ id          (= auth.users.id)
  ├─ role        (texto: 'admin' | 'colaborador')  ← sincronizado por trigger
  └─ role_id ──────────────────────────────────────────────────┐
                                                               │ N:1
                                                               ▼
                                                      public.roles
                                                        ├─ id
                                                        ├─ name, slug
                                                        ├─ can_upload
                                                        ├─ can_send_email
                                                        ├─ can_view_all
                                                        └─ is_system
                                                               │
                                                               │ 1:N
                                                               ▼
                                               public.role_module_permissions
                                                 ├─ role_id   (FK)
                                                 └─ module_id (FK)
                                                               │
                                                               │ N:1
                                                               ▼
                                                      public.modules
                                                        ├─ id
                                                        ├─ name
                                                        ├─ slug    ← chave do pageRegistry
                                                        ├─ icon
                                                        ├─ is_active
                                                        ├─ sort_order
                                                        └─ is_system
```

---

## Resumo dos Mecanismos de Segurança

| Verificação | Onde é aplicada | Mecanismo |
|-------------|----------------|-----------|
| Usuário está autenticado? | Backend + Frontend | `PrivateRoute` + Supabase RLS (`auth.uid()`) |
| Usuário acessa tela X? | Frontend | `canAccess(slug)` via `userModules[]` no `DynamicRoute` |
| Usuário pode fazer upload? | **Backend + Frontend** | RLS `get_my_can_upload()` + `can('can_upload')` |
| Usuário pode enviar comunicação? | **Backend + Frontend** | RLS `get_my_can_send_email()` + `can('can_send_email')` |
| Usuário vê todos os registros? | **Backend + Frontend** | RLS `get_my_can_view_all()` + filtro no serviço de dados |
| Usuário gerencia configurações? | Backend + Frontend | RLS `profiles.role = 'admin'` + verificação no frontend |

> [!CAUTION]
> O controle de acesso a **telas/módulos** (Nível 2) é aplicado **apenas no frontend**. Para tabelas de dados que armazenam informações sensíveis dos novos módulos, implemente obrigatoriamente políticas RLS no banco utilizando as funções helper existentes como referência.

---

*Documento técnico gerado com base na implementação atual do sistema RBAC — Abril 2026.*
