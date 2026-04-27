-- ==========================================
-- GESTÃO GABINETE - DATABASE SCHEMA
-- Extraído do GG-Nego em 2026-04-25
-- ==========================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- ENUM TYPES
-- ==========================================

CREATE TYPE public.anotacao_status AS ENUM (
  'recebido',
  'lido',
  'resolvendo',
  'concluído'
);

-- ==========================================
-- FUNÇÕES AUXILIARES
-- ==========================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_can_upload()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(r.can_upload, false)
  FROM public.profiles p
  LEFT JOIN public.roles r ON r.id = p.role_id
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_can_send_email()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(r.can_send_email, false)
  FROM public.profiles p
  LEFT JOIN public.roles r ON r.id = p.role_id
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_can_view_all()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(r.can_view_all, false)
  FROM public.profiles p
  JOIN public.roles r ON r.id = p.role_id
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_anotacoes_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_role()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_slug TEXT;
BEGIN
  IF NEW.role_id IS NOT NULL THEN
    SELECT slug INTO v_slug FROM public.roles WHERE id = NEW.role_id;
    NEW.role := CASE WHEN v_slug = 'admin' THEN 'admin' ELSE 'colaborador' END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_log_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id    uuid;
  v_user_email text;
  v_user_name  text;
  v_action     text;
  v_record_id  text;
  v_description text;
  v_metadata   jsonb := '{}';
BEGIN
  v_user_id := auth.uid();
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  SELECT full_name INTO v_user_name FROM public.profiles WHERE id = v_user_id;
  v_action := TG_OP;

  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id::text;
    v_description := 'Excluiu registro em ' || TG_TABLE_NAME;
    v_metadata := to_jsonb(OLD);
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := NEW.id::text;
    v_description := 'Alterou registro em ' || TG_TABLE_NAME;
    v_metadata := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSE
    v_record_id := NEW.id::text;
    v_description := 'Incluiu registro em ' || TG_TABLE_NAME;
    v_metadata := to_jsonb(NEW);
  END IF;

  IF TG_TABLE_NAME = 'pessoa' THEN
    IF TG_OP = 'DELETE' THEN v_description := 'Excluiu pessoa: ' || COALESCE(OLD.full_name, 'sem nome');
    ELSIF TG_OP = 'UPDATE' THEN v_description := 'Alterou pessoa: ' || COALESCE(NEW.full_name, 'sem nome');
    ELSE v_description := 'Incluiu pessoa: ' || COALESCE(NEW.full_name, 'sem nome'); END IF;
  ELSIF TG_TABLE_NAME = 'dependentes' THEN
    IF TG_OP = 'DELETE' THEN v_description := 'Excluiu dependente: ' || COALESCE(OLD.full_name, 'sem nome');
    ELSIF TG_OP = 'UPDATE' THEN v_description := 'Alterou dependente: ' || COALESCE(NEW.full_name, 'sem nome');
    ELSE v_description := 'Incluiu dependente: ' || COALESCE(NEW.full_name, 'sem nome'); END IF;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    IF TG_OP = 'DELETE' THEN v_description := 'Excluiu perfil: ' || COALESCE(OLD.full_name, OLD.email);
    ELSIF TG_OP = 'UPDATE' THEN v_description := 'Alterou perfil: ' || COALESCE(NEW.full_name, NEW.email);
    ELSE v_description := 'Incluiu perfil: ' || COALESCE(NEW.full_name, NEW.email); END IF;
  END IF;

  INSERT INTO public.activity_logs (user_id, user_email, user_name, action, table_name, record_id, description, metadata)
  VALUES (v_user_id, v_user_email, v_user_name, v_action, TG_TABLE_NAME, v_record_id, v_description, v_metadata);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_set_user_id_from_whatsapp()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NEW.user_id IS NULL AND NEW.whatsapp IS NOT NULL THEN
    SELECT p.id INTO v_user_id
    FROM public.profiles p
    WHERE p.telefone = NEW.whatsapp
    LIMIT 1;
    IF v_user_id IS NOT NULL THEN
      NEW.user_id := v_user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_anotacoes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id    uuid;
  v_user_email text;
  v_user_name  text;
  v_action     text;
  v_record_id  text;
  v_description text;
  v_metadata   jsonb;
BEGIN
  v_user_id := auth.uid();
  SELECT email, COALESCE(raw_user_meta_data->>'full_name', email)
    INTO v_user_email, v_user_name
    FROM auth.users WHERE id = v_user_id;

  IF TG_OP = 'INSERT' THEN
    v_action := 'INSERT'; v_record_id := NEW.id::text;
    v_description := format('Nova anotação criada para o WhatsApp %s [status: %s]', NEW.whatsapp, NEW.status);
    v_metadata := jsonb_build_object('new', jsonb_build_object('id', NEW.id, 'whatsapp', NEW.whatsapp, 'descricao_anotacao', NEW.descricao_anotacao, 'status', NEW.status, 'user_id', NEW.user_id));
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE'; v_record_id := NEW.id::text;
    v_description := format('Anotação %s atualizada [WhatsApp: %s | status: %s → %s]', NEW.id, NEW.whatsapp, OLD.status, NEW.status);
    v_metadata := jsonb_build_object('old', jsonb_build_object('whatsapp', OLD.whatsapp, 'status', OLD.status), 'new', jsonb_build_object('whatsapp', NEW.whatsapp, 'status', NEW.status));
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE'; v_record_id := OLD.id::text;
    v_description := format('Anotação %s excluída [WhatsApp: %s | status: %s]', OLD.id, OLD.whatsapp, OLD.status);
    v_metadata := jsonb_build_object('deleted', jsonb_build_object('id', OLD.id, 'whatsapp', OLD.whatsapp, 'status', OLD.status));
  END IF;

  INSERT INTO public.activity_logs (user_id, user_email, user_name, action, table_name, record_id, description, metadata)
  VALUES (v_user_id, v_user_email, v_user_name, v_action, 'anotacoes', v_record_id, v_description, v_metadata);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_visitante_role_id uuid;
BEGIN
  SELECT id INTO v_visitante_role_id FROM public.roles WHERE slug = 'visitante' LIMIT 1;
  INSERT INTO public.profiles (id, full_name, email, avatar_url, telefone, role, role_id)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'telefone',
    'colaborador',
    v_visitante_role_id
  );
  RETURN NEW;
END;
$$;

-- ==========================================
-- TABELAS
-- ==========================================

-- roles
CREATE TABLE IF NOT EXISTS public.roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  can_upload    boolean NOT NULL DEFAULT false,
  can_send_email boolean NOT NULL DEFAULT false,
  can_view_all  boolean NOT NULL DEFAULT false,
  is_system     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  email       text,
  avatar_url  text,
  telefone    text,
  role        text NOT NULL DEFAULT 'colaborador',
  role_id     uuid REFERENCES public.roles(id),
  theme       text DEFAULT 'light' CHECK (theme = ANY (ARRAY['light', 'dark'])),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- modules
CREATE TABLE IF NOT EXISTS public.modules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  icon        text NOT NULL DEFAULT 'Layout',
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  is_system   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

-- role_module_permissions
CREATE TABLE IF NOT EXISTS public.role_module_permissions (
  role_id   uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, module_id)
);
ALTER TABLE public.role_module_permissions ENABLE ROW LEVEL SECURITY;

-- activity_logs
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id),
  user_email  text,
  user_name   text,
  action      text NOT NULL,
  table_name  text,
  record_id   text,
  description text,
  metadata    jsonb DEFAULT '{}',
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- pessoa
CREATE TABLE IF NOT EXISTS public.pessoa (
  id                  uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  full_name           text NOT NULL,
  pronoun             text DEFAULT 'Sr.',
  address             text,
  address_number      text,
  neighborhood        text,
  city                text,
  cep                 text,
  latitude            numeric,
  longitude           numeric,
  housing_type        text,
  phone               text,
  birth_date          date,
  email               text,
  cpf                 text UNIQUE,
  cnpj                text UNIQUE,
  facebook_url        text,
  instagram_url       text,
  reference           text,
  notes               text,
  destino             text,
  person_type         text DEFAULT 'Pessoa' CHECK (person_type = ANY (ARRAY['Pessoa','Autoridade','Entidade','Empresa'])),
  atendimento_humano  boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at          timestamptz NOT NULL DEFAULT timezone('utc', now())
);
COMMENT ON COLUMN public.pessoa.atendimento_humano IS 'Indica se a pessoa está em atendimento humano (true) ou apenas na IA (false). Nasce sempre false.';
ALTER TABLE public.pessoa ENABLE ROW LEVEL SECURITY;

-- dependentes
CREATE TABLE IF NOT EXISTS public.dependentes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id   uuid NOT NULL REFERENCES public.pessoa(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  birth_date  date,
  cpf         text,
  kinship     text,
  phone       text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at  timestamptz NOT NULL DEFAULT timezone('utc', now())
);
ALTER TABLE public.dependentes ENABLE ROW LEVEL SECURITY;

-- agenda
CREATE TABLE IF NOT EXISTS public.agenda (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo_compromisso  text NOT NULL,
  tipo                text CHECK (tipo = ANY (ARRAY['Reunião','Visita','Outros'])),
  data                date NOT NULL,
  horario_inicio      time NOT NULL,
  horario_fim         time,
  local               text,
  pessoa_id           uuid REFERENCES public.pessoa(id),
  descricao           text,
  lembrar             boolean DEFAULT false,
  user_id             uuid REFERENCES auth.users(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
ALTER TABLE public.agenda ENABLE ROW LEVEL SECURITY;

-- requerimento
CREATE TABLE IF NOT EXISTS public.requerimento (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_requerimento     text NOT NULL,
  data_sessao             date NOT NULL,
  titulo                  text NOT NULL,
  pessoa_id               uuid REFERENCES public.pessoa(id),
  resposta_recebida       text CHECK (resposta_recebida = ANY (ARRAY['Sim','Não','Novo Requerimento','Delação de Prazo'])),
  status                  text NOT NULL DEFAULT 'Apresentado' CHECK (status = ANY (ARRAY['Apresentado','Aguardando Resposta','Respondido','Não Respondido'])),
  numero_oficio           text,
  data_protocolo          date,
  informacoes_adicionais  text,
  arquivo_pdf_url         text,
  user_id                 uuid REFERENCES auth.users(id),
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);
ALTER TABLE public.requerimento ENABLE ROW LEVEL SECURITY;

-- requerimento_arquivos
CREATE TABLE IF NOT EXISTS public.requerimento_arquivos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requerimento_id   uuid NOT NULL REFERENCES public.requerimento(id) ON DELETE CASCADE,
  nome_arquivo      text NOT NULL,
  arquivo_url       text NOT NULL,
  tamanho_bytes     bigint,
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.requerimento_arquivos ENABLE ROW LEVEL SECURITY;

-- atendimento
CREATE TABLE IF NOT EXISTS public.atendimento (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id),
  conversa_ia     text,
  conversa_pessoa text,
  whatsapp        text,
  status          text NOT NULL DEFAULT 'recebido' CHECK (status = ANY (ARRAY['recebido','verificado','em atendimento','concluído'])),
  data_conversa   timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.atendimento ENABLE ROW LEVEL SECURITY;

-- anotacoes
CREATE TABLE IF NOT EXISTS public.anotacoes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp            text NOT NULL,
  descricao_anotacao  text NOT NULL,
  data_hora           timestamptz NOT NULL DEFAULT now(),
  status              public.anotacao_status NOT NULL DEFAULT 'recebido',
  user_id             uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.anotacoes IS 'Anotações vinculadas a contatos via número de WhatsApp';
ALTER TABLE public.anotacoes ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- TRIGGERS
-- ==========================================

-- auth.users → profiles
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- roles
CREATE TRIGGER set_updated_at_roles BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_log_roles AFTER INSERT OR UPDATE OR DELETE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.fn_log_activity();

-- profiles
CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_sync_profile_role BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_profile_role();
CREATE TRIGGER trg_log_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.fn_log_activity();

-- modules
CREATE TRIGGER set_updated_at_modules BEFORE UPDATE ON public.modules FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_log_modules AFTER INSERT OR UPDATE OR DELETE ON public.modules FOR EACH ROW EXECUTE FUNCTION public.fn_log_activity();

-- role_module_permissions
CREATE TRIGGER trg_log_role_module_permissions AFTER INSERT OR UPDATE OR DELETE ON public.role_module_permissions FOR EACH ROW EXECUTE FUNCTION public.fn_log_activity();

-- pessoa
CREATE TRIGGER handle_updated_at_pessoa BEFORE UPDATE ON public.pessoa FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_log_pessoa AFTER INSERT OR UPDATE OR DELETE ON public.pessoa FOR EACH ROW EXECUTE FUNCTION public.fn_log_activity();

-- dependentes
CREATE TRIGGER trg_log_dependentes AFTER INSERT OR UPDATE OR DELETE ON public.dependentes FOR EACH ROW EXECUTE FUNCTION public.fn_log_activity();

-- agenda
CREATE TRIGGER trg_agenda_updated_at BEFORE UPDATE ON public.agenda FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_agenda_log AFTER INSERT OR UPDATE OR DELETE ON public.agenda FOR EACH ROW EXECUTE FUNCTION public.fn_log_activity();

-- requerimento
CREATE TRIGGER trg_requerimento_updated_at BEFORE UPDATE ON public.requerimento FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_requerimento_log AFTER INSERT OR UPDATE OR DELETE ON public.requerimento FOR EACH ROW EXECUTE FUNCTION public.fn_log_activity();

-- atendimento
CREATE TRIGGER trg_atendimento_updated_at BEFORE UPDATE ON public.atendimento FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- anotacoes
CREATE TRIGGER trg_anotacoes_updated_at BEFORE UPDATE ON public.anotacoes FOR EACH ROW EXECUTE FUNCTION public.update_anotacoes_updated_at();
CREATE TRIGGER trg_set_user_id_from_whatsapp BEFORE INSERT ON public.anotacoes FOR EACH ROW EXECUTE FUNCTION public.fn_set_user_id_from_whatsapp();
CREATE TRIGGER trg_audit_anotacoes AFTER INSERT OR UPDATE OR DELETE ON public.anotacoes FOR EACH ROW EXECUTE FUNCTION public.audit_anotacoes();

-- ==========================================
-- RLS POLICIES
-- ==========================================

-- activity_logs
CREATE POLICY "Admins podem ver logs" ON public.activity_logs FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE POLICY "Usuários autenticados podem inserir logs" ON public.activity_logs FOR INSERT TO public
  WITH CHECK (auth.uid() IS NOT NULL);

-- roles
CREATE POLICY "roles_select" ON public.roles FOR SELECT TO public USING (true);
CREATE POLICY "roles_admin_select" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_admin_insert" ON public.roles FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "roles_admin_update" ON public.roles FOR UPDATE TO authenticated USING (get_my_role() = 'admin');
CREATE POLICY "roles_admin_delete" ON public.roles FOR DELETE TO authenticated USING ((get_my_role() = 'admin') AND (is_system = false));
CREATE POLICY "roles_admin_write" ON public.roles FOR ALL TO public USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');

-- profiles
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO public USING (auth.uid() = id);
CREATE POLICY "profiles_admin_select_all" ON public.profiles FOR SELECT TO public USING (get_my_role() = 'admin');
CREATE POLICY "profiles_insert_trigger" ON public.profiles FOR INSERT TO public WITH CHECK ((auth.uid() = id) OR (auth.role() = 'service_role'));
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO public USING (auth.uid() = id);
CREATE POLICY "profiles_admin_update_all" ON public.profiles FOR UPDATE TO public USING (get_my_role() = 'admin');

-- modules
CREATE POLICY "modules_select_authenticated" ON public.modules FOR SELECT TO public USING (true);
CREATE POLICY "modules_authenticated_select" ON public.modules FOR SELECT TO authenticated USING (true);
CREATE POLICY "modules_admin_insert" ON public.modules FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "modules_admin_update" ON public.modules FOR UPDATE TO authenticated USING (get_my_role() = 'admin');
CREATE POLICY "modules_admin_delete" ON public.modules FOR DELETE TO authenticated USING ((get_my_role() = 'admin') AND (is_system = false));
CREATE POLICY "modules_write_admin" ON public.modules FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- role_module_permissions
CREATE POLICY "rmp_select_authenticated" ON public.role_module_permissions FOR SELECT TO public USING (true);
CREATE POLICY "rmp_authenticated_select" ON public.role_module_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "rmp_admin_insert" ON public.role_module_permissions FOR INSERT TO authenticated WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "rmp_admin_delete" ON public.role_module_permissions FOR DELETE TO authenticated USING (get_my_role() = 'admin');
CREATE POLICY "rmp_write_admin" ON public.role_module_permissions FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- pessoa
CREATE POLICY "Pessoa read access" ON public.pessoa FOR SELECT TO authenticated USING (true);
CREATE POLICY "Pessoa insert access" ON public.pessoa FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Pessoa update access" ON public.pessoa FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Pessoa delete access" ON public.pessoa FOR DELETE TO authenticated USING (true);

-- dependentes
CREATE POLICY "Authenticated users can manage dependentes" ON public.dependentes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- agenda
CREATE POLICY "agenda_select_authenticated" ON public.agenda FOR SELECT TO authenticated USING (true);
CREATE POLICY "agenda_insert_authenticated" ON public.agenda FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "agenda_update_authenticated" ON public.agenda FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "agenda_delete_authenticated" ON public.agenda FOR DELETE TO authenticated USING (true);

-- requerimento
CREATE POLICY "req_select_authenticated" ON public.requerimento FOR SELECT TO authenticated USING (true);
CREATE POLICY "req_insert_own" ON public.requerimento FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "req_update_policy" ON public.requerimento FOR UPDATE TO authenticated USING ((auth.uid() = user_id) OR (get_my_role() = 'admin'));
CREATE POLICY "req_delete_own" ON public.requerimento FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- requerimento_arquivos
CREATE POLICY "req_arquivos_select" ON public.requerimento_arquivos FOR SELECT TO authenticated USING (true);
CREATE POLICY "req_arquivos_insert" ON public.requerimento_arquivos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "req_arquivos_delete" ON public.requerimento_arquivos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM requerimento r WHERE r.id = requerimento_arquivos.requerimento_id AND ((r.user_id = auth.uid()) OR (get_my_role() = 'admin'))));

-- atendimento
CREATE POLICY "Usuários autenticados podem ver todos os atendimentos" ON public.atendimento FOR SELECT TO authenticated USING (true);
CREATE POLICY "Usuários autenticados podem inserir atendimentos" ON public.atendimento FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Usuários autenticados podem atualizar atendimentos" ON public.atendimento FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Usuários autenticados podem deletar atendimentos" ON public.atendimento FOR DELETE TO authenticated USING (true);

-- anotacoes
CREATE POLICY "anotacoes_select_authenticated" ON public.anotacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "anotacoes_insert_authenticated" ON public.anotacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "anotacoes_update_authenticated" ON public.anotacoes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "anotacoes_delete_authenticated" ON public.anotacoes FOR DELETE TO authenticated USING (true);

-- ==========================================
-- STORAGE BUCKET
-- ==========================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- REALTIME
-- ==========================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.pessoa;
ALTER PUBLICATION supabase_realtime ADD TABLE public.requerimento;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda;
ALTER PUBLICATION supabase_realtime ADD TABLE public.atendimento;
ALTER PUBLICATION supabase_realtime ADD TABLE public.anotacoes;
