import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Mail, ArrowRight, AlertCircle, Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { TEMPLATE_CONFIG } from '../config/template.config';
import { useAuth } from '../contexts/AuthContext';
import logoTechnocode from '../assets/logos/logo_technocode.png';

interface LoginScreenProps {
  onRegister: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onRegister }) => {
  const { signIn } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      setError(signInError);
      setLoading(false);
    }
    // Se não há erro, o onAuthStateChange no AuthContext cuida do redirecionamento
  };

  return (
    <div className="min-h-screen flex w-full bg-slate-50 dark:bg-slate-900">
      {/* Left side: Branding / Visual */}
      <div className={`hidden lg:flex flex-col justify-center w-1/2 ${TEMPLATE_CONFIG.colors.loginPanelBg} p-12 text-white relative overflow-hidden`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${TEMPLATE_CONFIG.colors.loginGradientFrom} ${TEMPLATE_CONFIG.colors.loginGradientTo} opacity-90`} />
        <div className="relative z-10 max-w-xl">
          <div className="mb-8 block">
            <img
               src={TEMPLATE_CONFIG.logos.loginHero}
               alt={`Logo ${TEMPLATE_CONFIG.vereadorName}`}
               className="h-[220px] w-auto object-contain drop-shadow-lg"
               onError={(e) => { (e.target as HTMLImageElement).src = `https://placehold.co/300x200?text=${encodeURIComponent(TEMPLATE_CONFIG.logos.fallbackText)}`; }}
            />
          </div>
          <h1 className="text-4xl md:text-5xl font-heading font-bold mb-6">
            {TEMPLATE_CONFIG.login.heroTitle}
          </h1>
          <p className="text-blue-100 text-lg font-sans">
            {TEMPLATE_CONFIG.login.heroSubtitle}
          </p>
        </div>

        {/* Decorative elements */}
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-white opacity-10 rounded-full blur-3xl" />
        <div className="absolute top-1/4 -right-32 w-96 h-96 bg-blue-400 opacity-20 rounded-full blur-3xl" />
      </div>

      {/* Right side: Login Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[600px] space-y-8"
        >
          <div className="text-left md:text-center">
            <h2 className="text-3xl font-heading font-bold text-slate-900 dark:text-white">
              Acesso ao Sistema
            </h2>
            <p className="mt-2 text-slate-500 font-sans">
              Insira suas credenciais para continuar
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-8 items-start mt-8">
            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 space-y-6 w-full">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    E-mail institucional
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      className="block w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors disabled:opacity-60"
                      placeholder={TEMPLATE_CONFIG.login.emailPlaceholder}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Senha
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      className="block w-full pl-10 pr-10 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors disabled:opacity-60"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(!showPwd)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                      {showPwd ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Error feedback */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </motion.div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center items-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Autenticando...
                  </>
                ) : (
                  <>
                    Entrar
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              {/* Link para cadastro */}
              <div className="text-center pt-2">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Não tem acesso?{' '}
                  <button
                    type="button"
                    onClick={onRegister}
                    className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                  >
                    Registrar novo usuário
                  </button>
                </p>
              </div>
            </form>

            {/* Notice / Security Info Box */}
            <div className="w-full md:w-[240px] bg-indigo-50/80 dark:bg-indigo-900/20 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800/60 shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <div className="bg-indigo-600 dark:bg-indigo-500 rounded-full p-1 w-6 h-6 flex items-center justify-center">
                  <ShieldCheck className="text-white h-4 w-4" strokeWidth={3} />
                </div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">Aviso de Segurança</h4>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                Todos os acessos são protegidos por criptografia e monitorados continuamente por registros de auditoria.
              </p>
            </div>
          </div>
          
          <div className="flex flex-col items-center justify-center pt-8 md:pt-12 gap-1">
            <img 
              src={logoTechnocode} 
              alt="Technocode" 
              className="w-full max-w-[182px] object-contain opacity-70 hover:opacity-100 transition-opacity" 
            />
            <div className="text-[12px] text-black dark:text-white text-center leading-relaxed">
              <p>Versão 1.0</p>
              <p>by Tillmann Tech Soluções</p>
              <p>Janeiro, 2026</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginScreen;
