// src/types/auth.ts

export interface Role {
  id: string;
  name: string;
  slug: string;
  can_upload: boolean;
  can_send_email: boolean;
  can_view_all: boolean;
  is_system: boolean;
}

export interface Module {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description?: string | null;
  is_active: boolean;
  sort_order: number;
  is_system: boolean;
}

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  telefone: string | null;
  role: 'admin' | 'colaborador';
  role_id: string | null;
  created_at: string;
  updated_at: string;
  theme?: 'light' | 'dark';
  roles?: Role | null;
}

export type Permissions = {
  can_upload: boolean;
  can_send_email: boolean;
  can_view_all: boolean;
};
