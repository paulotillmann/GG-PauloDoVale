import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock, Mail, ArrowRight, AlertCircle, Loader2,
  User, Phone, Eye, EyeOff, Camera, CheckCircle2, ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { TEMPLATE_CONFIG } from '../config/template.config';
import { supabase } from '../lib/supabase';

interface RegisterScreenProps {
  onBack: () => void;
}

// ─── Password strength indicator ─────────────────────────────────────────────
const getPasswordStrength = (pwd: string) => {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score;
};

const strengthLabel = ['', 'Fraca', 'Razoável', 'Boa', 'Forte'];
const strengthColors = ['', 'bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-green-500'];

// ─── Component ────────────────────────────────────────────────────────────────
const RegisterScreen: React.FC<RegisterScreenProps> = ({ onBack }) => {
  const { signUp } = useAuth();

  const [fullName, setFullName]     = useState('');
  const [email, setEmail]           = useState('');
  const [telefone, setTelefone]     = useState('');
  const [password, setPassword]     = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [success, setSuccess]       = useState(false);
  const fileInputRef                = useRef<HTMLInputElement>(null);

  const strength = getPasswordStrength(password);

  // ── Avatar picker ────────────────────────────────────────────────────────
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('Avatar deve ter menos de 2MB.');
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  // ── Telefone mask ────────────────────────────────────────────────────────
  const handleTelefone = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 11);
    let masked = digits;
    if (digits.length > 2)  masked = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length > 7)  masked = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    setTelefone(masked);
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) return setError('O nome completo é obrigatório.');
    if (password.length < 6) return setError('A senha deve ter pelo menos 6 caracteres.');
    if (password !== confirmPwd) return setError('As senhas não coincidem.');

    setLoading(true);

    try {
      // Upload do avatar se fornecido
      let avatarUrl = '';
      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop();
        const filename = `avatars/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filename, avatarFile, { upsert: true });

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filename);
          avatarUrl = urlData.publicUrl;
        }
      }

      const { error: signUpError } = await signUp({
        email,
        password,
        fullName: fullName.trim(),
        telefone: telefone.replace(/\D/g, ''),
        avatarUrl,
      });

      if (signUpError) {
        setError(signUpError);
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError('Erro inesperado. Tente novamente.');
      setLoading(false);
    }
  };

  // ── Success state ────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-10 text-center"
        >
          <div className="flex justify-center mb-6">
            <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
            Cadastro realizado!
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-2">
            Sua conta foi criada com sucesso.
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mb-8">
            Você já pode acessar o sistema com o perfil <span className="font-medium text-slate-600 dark:text-slate-300">Visitante</span>. Um administrador pode ampliar suas permissões a qualquer momento.
          </p>
          <button
            onClick={onBack}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Ir para o Login
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex w-full bg-slate-50 dark:bg-slate-900">

      {/* Left side: Branding */}
      <div className="hidden lg:flex flex-col justify-center w-2/5 bg-blue-600 p-12 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-700 to-blue-900 opacity-90" />
        <div className="relative z-10">
          <img
            src={TEMPLATE_CONFIG.logos.sidebarDark}
            alt={`Logo ${TEMPLATE_CONFIG.vereadorName}`}
            className="h-[160px] w-auto object-contain drop-shadow-lg mb-8"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <h1 className="text-3xl font-bold mb-4">Junte-se à equipe</h1>
          <p className="text-blue-100 text-base leading-relaxed">
            Crie sua conta para acessar o portal de gestão do gabinete. Após o cadastro, um administrador irá liberar seu acesso.
          </p>

          {/* Steps */}
          <div className="mt-10 space-y-4">
            {[
              { n: '1', label: 'Preencha o formulário' },
              { n: '2', label: 'Aguarde ativação do admin' },
              { n: '3', label: 'Acesse o sistema' },
            ].map((step) => (
              <div key={step.n} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold shrink-0">
                  {step.n}
                </div>
                <span className="text-blue-100">{step.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-white opacity-10 rounded-full blur-3xl" />
      </div>

      {/* Right side: Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-lg"
        >
          {/* Back button */}
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-6 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao login
          </button>

          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Criar conta</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">Preencha os dados abaixo para solicitar acesso</p>

          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">

            {/* Avatar */}
            <div className="flex flex-col items-center mb-2">
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="h-24 w-24 rounded-full border-4 border-dashed border-slate-300 dark:border-slate-600 group-hover:border-blue-500 transition-colors overflow-hidden bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-10 w-10 text-slate-400" />
                  )}
                </div>
                <div className="absolute bottom-0 right-0 h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center shadow-lg border-2 border-white dark:border-slate-900">
                  <Camera className="h-4 w-4 text-white" />
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2">Foto opcional (máx. 2MB)</p>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nome completo <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={loading}
                  placeholder="Seu nome completo"
                  autoComplete="off"
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-60 text-sm"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                E-mail <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  placeholder="seu@email.com"
                  autoComplete="new-password"
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-60 text-sm"
                />
              </div>
            </div>

            {/* Telefone */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Telefone
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="tel"
                  value={telefone}
                  onChange={(e) => handleTelefone(e.target.value)}
                  disabled={loading}
                  placeholder="(00) 00000-0000"
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-60 text-sm"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Senha <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  className="w-full pl-10 pr-10 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-60 text-sm"
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Password strength */}
              {password && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength ? strengthColors[strength] : 'bg-slate-200 dark:bg-slate-700'}`} />
                    ))}
                  </div>
                  <p className={`text-xs font-medium ${strength <= 1 ? 'text-red-500' : strength === 2 ? 'text-orange-400' : strength === 3 ? 'text-yellow-500' : 'text-green-500'}`}>
                    Senha {strengthLabel[strength]}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Confirmar senha <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  required
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  disabled={loading}
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                  className={`w-full pl-10 pr-10 py-2.5 border rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 transition-colors disabled:opacity-60 text-sm ${
                    confirmPwd && password !== confirmPwd
                      ? 'border-red-400 focus:ring-red-400'
                      : confirmPwd && password === confirmPwd
                      ? 'border-green-400 focus:ring-green-400'
                      : 'border-slate-300 dark:border-slate-600 focus:ring-blue-500'
                  }`}
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPwd && password !== confirmPwd && (
                <p className="text-xs text-red-500 mt-1">As senhas não coincidem</p>
              )}
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || (!!confirmPwd && password !== confirmPwd)}
              className="w-full flex justify-center items-center py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-blue-500/20"
            >
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando conta...</>
              ) : (
                <>Criar conta<ArrowRight className="ml-2 h-4 w-4" /></>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default RegisterScreen;
