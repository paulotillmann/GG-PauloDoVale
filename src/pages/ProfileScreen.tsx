import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Phone, Calendar, Shield, Camera, Edit2, Loader2, Check, Bell } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const ProfileScreen: React.FC = () => {
  const { profile, user, refreshProfile } = useAuth();
  
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    telefone: '',
  });
  
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maskTelefone = (digits: string) => {
    if (!digits) return '';
    const cleanNum = digits.replace(/\D/g, '');
    if (cleanNum.length <= 2) return cleanNum;
    if (cleanNum.length <= 7) return `(${cleanNum.slice(0, 2)}) ${cleanNum.slice(2)}`;
    return `(${cleanNum.slice(0, 2)}) ${cleanNum.slice(2, 7)}-${cleanNum.slice(7, 11)}`;
  };

  const handleEditClick = () => {
    setFormData({
      full_name: profile?.full_name ?? '',
      telefone: profile?.telefone ? maskTelefone(profile.telefone) : '',
    });
    setAvatarFile(null);
    setAvatarPreview(null);
    setIsEditing(true);
  };

  const handleCancelClick = () => {
    setIsEditing(false);
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  const handleTelefoneChange = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    setFormData(prev => ({ ...prev, telefone: maskTelefone(digits) }));
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!user?.id || !profile?.id) return;
    setLoading(true);

    try {
      let finalAvatarUrl = profile.avatar_url;

      // Se há um novo logo/foto
      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop();
        const filename = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filename, avatarFile, { upsert: true });

        if (uploadError) {
          throw uploadError;
        }

        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filename);
        finalAvatarUrl = urlData.publicUrl;
      }

      // Atualiza o profile
      const cleanTelefone = formData.telefone.replace(/\D/g, '');
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          telefone: cleanTelefone,
          avatar_url: finalAvatarUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id);

      if (error) throw error;

      // Recarrega perfil global
      await refreshProfile();
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update profile', err);
      alert('Erro ao atualizar o perfil. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadgeColor = (roleSlug?: string) => {
    switch (roleSlug) {
      case 'admin':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800';
      case 'colaborador':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800';
      default:
        return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-700';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Data desconhecida';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }).format(new Date(dateString));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Meu Perfil</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Gerencie suas informações pessoais e preferências</p>
        </div>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <button 
              onClick={handleCancelClick}
              disabled={loading}
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm disabled:opacity-50"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSave}
              disabled={loading}
              className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Salvar
            </button>
          </div>
        ) : (
          <button 
            onClick={handleEditClick}
            className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
          >
            <Edit2 className="h-4 w-4 mr-2" />
            Editar Perfil
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Avatar & Basic Info */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-1"
        >
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            {/* Cover photo */}
            <div className="h-32 bg-gradient-to-r from-blue-600 to-indigo-600"></div>
            
            <div className="px-6 pb-6 relative">
              {/* Avatar */}
              <div className="flex justify-center -mt-16 mb-4">
                <div className="relative group">
                  <img
                    src={avatarPreview || profile?.avatar_url || `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${profile?.full_name || 'User'}`}
                    alt={profile?.full_name ?? 'Usuário'}
                    className={`h-32 w-32 rounded-full border-4 border-white dark:border-slate-900 bg-slate-100 dark:bg-slate-800 object-cover ${isEditing ? 'opacity-80 group-hover:opacity-50 transition-opacity' : ''}`}
                  />
                  {isEditing && (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                    >
                      <Camera className="h-8 w-8 text-white" />
                    </div>
                  )}
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
                </div>
              </div>

              <div className="text-center">
                {isEditing ? (
                  <input 
                    type="text" 
                    value={formData.full_name}
                    onChange={(e) => setFormData(pr => ({ ...pr, full_name: e.target.value }))}
                    className="text-xl font-bold text-center bg-transparent border-b-2 border-blue-500 focus:outline-none w-full max-w-[250px] mx-auto text-slate-900 dark:text-white"
                  />
                ) : (
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    {profile?.full_name ?? 'Usuário'}
                  </h2>
                )}
                <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full border text-xs font-medium capitalize shadow-sm mt-3 ${getRoleBadgeColor(profile?.roles?.slug)}">
                  <Shield className="h-3.5 w-3.5 mr-1.5" />
                  {profile?.roles?.name ?? 'Visitante'}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right Column: Details */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 space-y-6"
        >
          {/* Contact Information */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Informações de Contato</h3>
            </div>
            <div className="p-6 space-y-6">
              
              <div className="flex items-start">
                <div className="mt-1 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg text-blue-600 dark:text-blue-400 mr-4">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Endereço de E-mail</p>
                  <p className="text-base text-slate-900 dark:text-white mt-1 font-medium">{profile?.email ?? user?.email}</p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="mt-1 bg-green-50 dark:bg-green-900/20 p-2 rounded-lg text-green-600 dark:text-green-400 mr-4">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Telefone Celular</p>
                  {isEditing ? (
                    <input 
                      type="tel"
                      value={formData.telefone}
                      onChange={(e) => handleTelefoneChange(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="text-base text-slate-900 dark:text-white mt-1 font-medium bg-transparent border-b border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:outline-none w-full max-w-[200px]"
                    />
                  ) : (
                    <p className="text-base text-slate-900 dark:text-white mt-1 font-medium">
                      {profile?.telefone ? maskTelefone(profile.telefone) : <span className="text-slate-400 italic">Não informado</span>}
                    </p>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Account Settings */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Detalhes da Conta</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-start">
                <div className="mt-1 bg-purple-50 dark:bg-purple-900/20 p-2 rounded-lg text-purple-600 dark:text-purple-400 mr-4">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Membro desde</p>
                  <p className="text-base text-slate-900 dark:text-white mt-1 font-medium capitalize">
                    {formatDate(profile?.created_at ?? user?.created_at)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Notificações */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Notificações</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-4">
                  <div className={`mt-0.5 p-2 rounded-lg ${profile?.receber_lembrete_agenda ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-600'}`}>
                    <Bell className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Lembretes de Agenda</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Receber lembretes via WhatsApp 30 min antes dos compromissos
                    </p>
                  </div>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  profile?.receber_lembrete_agenda
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}>
                  {profile?.receber_lembrete_agenda ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              {!profile?.receber_lembrete_agenda && (
                <p className="text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 rounded-lg">
                  💡 Entre em contato com o administrador para ativar os lembretes de agenda.
                </p>
              )}
            </div>
          </div>

        </motion.div>
      </div>
    </div>
  );
};

export default ProfileScreen;
