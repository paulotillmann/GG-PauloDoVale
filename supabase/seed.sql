-- ==========================================
-- GESTÃO GABINETE - SEED DATA
-- Dados iniciais do RBAC
-- ==========================================

-- Roles
INSERT INTO public.roles (name, slug, can_upload, can_send_email, can_view_all, is_system) VALUES
  ('Administrador', 'admin',       true,  true,  true,  true),
  ('Colaborador',   'colaborador', false, false, false, false),
  ('Visitante',     'visitante',   false, false, false, true)
ON CONFLICT (slug) DO NOTHING;

-- Modules
INSERT INTO public.modules (name, slug, icon, sort_order, is_active, is_system) VALUES
  ('Dashboard',     'dashboard',    'LayoutDashboard', 0, true, true),
  ('Pessoas',       'pessoas',      'Users',           1, true, false),
  ('Agenda',        'agenda',       'Calendar',        2, true, false),
  ('Requerimentos', 'requerimentos','FileText',        3, true, false),
  ('Atendimentos',  'atendimentos', 'MessageSquare',   4, true, false),
  ('Anotações',     'anotacoes',    'NotebookPen',     5, true, false)
ON CONFLICT (slug) DO NOTHING;

-- Permissões do Admin (acesso total)
INSERT INTO public.role_module_permissions (role_id, module_id)
SELECT r.id, m.id
FROM public.roles r, public.modules m
WHERE r.slug = 'admin'
ON CONFLICT DO NOTHING;

-- Permissões do Colaborador (sem admin)
INSERT INTO public.role_module_permissions (role_id, module_id)
SELECT r.id, m.id
FROM public.roles r, public.modules m
WHERE r.slug = 'colaborador'
  AND m.slug IN ('dashboard', 'pessoas', 'agenda', 'requerimentos', 'atendimentos', 'anotacoes')
ON CONFLICT DO NOTHING;
