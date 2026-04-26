import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile, Permissions, Module } from '../types/auth';

// ─── Context Shape ────────────────────────────────────────────────────────────

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  permissions: Permissions | null;
  userModules: Module[];
  loading: boolean;
  profileLoaded: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (params: SignUpParams) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateTheme: (theme: 'light' | 'dark') => Promise<void>;
  refreshProfile: () => Promise<void>;
}

interface SignUpParams {
  email: string;
  password: string;
  fullName: string;
  telefone?: string;
  avatarUrl?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession]           = useState<Session | null>(null);
  const [user, setUser]                 = useState<User | null>(null);
  const [profile, setProfile]           = useState<Profile | null>(null);
  const [permissions, setPermissions]   = useState<Permissions | null>(null);
  const [userModules, setUserModules]   = useState<Module[]>([]);
  const [loading, setLoading]           = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // ── Fetch profile + permissions + modules ──────────────────────────────────
  const fetchProfile = useCallback(async (userId: string) => {
    setProfileLoaded(false);
    try {
      // Query 1: profile com join em roles
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*, roles(*)')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;

      const fetchedProfile = profileData as Profile;
      setProfile(fetchedProfile);

      // Applica o theme que vier do DB, sobrescrevendo ou confirmando o LocalStorage
      if (fetchedProfile.theme) {
        localStorage.setItem('theme', fetchedProfile.theme);
        document.documentElement.classList.toggle('dark', fetchedProfile.theme === 'dark');
      }

      // Extrai permissões do perfil
      const role = fetchedProfile.roles;
      setPermissions(
        role
          ? {
              can_upload: role.can_upload,
              can_send_email: role.can_send_email,
              can_view_all: role.can_view_all,
            }
          : { can_upload: false, can_send_email: false, can_view_all: false }
      );

      // Query 2: módulos autorizados para o role_id
      if (fetchedProfile.role_id) {
        const { data: modulesData, error: modulesError } = await supabase
          .from('role_module_permissions')
          .select('modules(*)')
          .eq('role_id', fetchedProfile.role_id);

        if (modulesError) throw modulesError;

        const modules = (modulesData ?? [])
          .map((row: any) => row.modules as Module)
          .filter((m: Module) => m && m.is_active)
          .sort((a: Module, b: Module) => a.sort_order - b.sort_order);

        setUserModules(modules);
      } else {
        setUserModules([]);
      }
    } catch (err) {
      console.error('[AuthContext] fetchProfile error:', err);
      setProfile(null);
      setPermissions(null);
      setUserModules([]);
    } finally {
      setProfileLoaded(true);
    }
  }, []);

  // ── Inicialização e listener de auth ──────────────────────────────────────
  useEffect(() => {
    // Obtém sessão ativa existente
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    // Listener de mudança de estado — NÃO usar await aqui (causa deadlock)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    // Inicia ouvindo também o próprio profile pós fetch
    // pra gente aplicar o thema que vier do DB se não for o do storage
    
    return () => subscription.unsubscribe();
  }, []);

  // ── Reage à mudança de user.id — separado para evitar deadlock ──────────
  useEffect(() => {
    if (user?.id) {
      fetchProfile(user.id);
    } else {
      setProfile(null);
      setPermissions(null);
      setUserModules([]);
      setProfileLoaded(false);
      // Garante que o modo claro é o padrão quando deslogado
      localStorage.removeItem('theme');
      document.documentElement.classList.remove('dark');
    }
  }, [user?.id, fetchProfile]);

  // ── logActivity ─────────────────────────────────────────────────────────
  const logActivity = async (
    action: string,
    description: string,
    userId?: string,
    userName?: string,
    userEmail?: string
  ) => {
    try {
      await supabase.from('activity_logs').insert({
        user_id: userId ?? null,
        user_email: userEmail ?? null,
        user_name: userName ?? userEmail ?? null,
        action,
        description,
      });
    } catch {
      // Falha silenciosa — não interrompe o fluxo principal
    }
  };

  // ── signIn ──────────────────────────────────────────────────────────────
  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        return { error: 'E-mail ou senha incorretos.' };
      }
      if (error.message.includes('Email not confirmed')) {
        return { error: 'Confirme seu e-mail antes de acessar.' };
      }
      return { error: error.message };
    }
    // Registra o login com sucesso
    if (data.user) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', data.user.id)
        .single();
      await logActivity(
        'LOGIN',
        `Usuário fez login no sistema`,
        data.user.id,
        profileData?.full_name ?? data.user.email,
        data.user.email
      );
    }
    return { error: null };
  };

  // ── signUp ──────────────────────────────────────────────────────────────
  const signUp = async ({ email, password, fullName, telefone, avatarUrl }: SignUpParams): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          telefone: telefone ?? '',
          avatar_url: avatarUrl ?? '',
        },
      },
    });
    if (error) {
      if (error.message.includes('already registered')) {
        return { error: 'Este e-mail já está cadastrado.' };
      }
      if (error.message.includes('Password should be')) {
        return { error: 'A senha deve ter pelo menos 6 caracteres.' };
      }
      return { error: error.message };
    }
    return { error: null };
  };

  // ── signOut ─────────────────────────────────────────────────────────────
  const signOut = async () => {
    // Registra o logout antes de destruir a sessão
    if (user) {
      await logActivity(
        'LOGOUT',
        `Usuário saiu do sistema`,
        user.id,
        profile?.full_name ?? user.email,
        user.email
      );
    }
    await supabase.auth.signOut();
    localStorage.removeItem('theme');
    document.documentElement.classList.remove('dark');
  };

  // ── refreshProfile ───────────────────────────────────────────────────────
  const refreshProfile = async () => {
    if (user?.id) await fetchProfile(user.id);
  };

  // ── updateTheme ─────────────────────────────────────────────────────────
  const updateTheme = async (theme: 'light' | 'dark') => {
    if (!user || (!profile && user)) return;
    
    // Otimista
    setProfile(p => p ? { ...p, theme } : null);
    localStorage.setItem('theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');

    // DB Sync
    await supabase.from('profiles').update({ theme }).eq('id', user.id);
  };

  const isAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        permissions,
        userModules,
        loading,
        profileLoaded,
        isAdmin,
        signIn,
        signUp,
        signOut,
        updateTheme,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
};
