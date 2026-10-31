import React, { useState } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Smartphone,
  Lock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { AuthSession } from '../types';

interface AuthPortalViewProps {
  currentSession: AuthSession | null;
  onSessionAuthenticated: (session: AuthSession) => void;
  onNavigateToAdmin: () => void;
  onLogout?: () => void;
}

export const AuthPortalView: React.FC<AuthPortalViewProps> = ({
  currentSession,
  onSessionAuthenticated,
  onNavigateToAdmin,
  onLogout,
}) => {
  const [authTab, setAuthTab] = useState<'password' | 'whatsapp_otp'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [otpCodeInput, setOtpCodeInput] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const resp = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
        }),
      });
      const data = await resp.json();

      if (!resp.ok || !data.success) {
        setFeedback({ type: 'error', message: data.error || 'Credenciais inválidas. Verifique seu e-mail e senha.' });
      } else {
        const newSession: AuthSession = {
          token: data.token,
          user: data.user,
          claims: data.claims,
          authMethod: 'password',
          authenticatedAt: data.authenticatedAt,
        };
        onSessionAuthenticated(newSession);
        setFeedback({
          type: 'success',
          message: `Bem-vindo, ${data.user.name}! Acesso liberado.`,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro de conexão com o servidor.' });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestWhatsappOtp = async () => {
    if (!whatsappPhone.trim() || !email.trim()) {
      setFeedback({ type: 'error', message: 'Informe seu e-mail cadastrado e número de WhatsApp.' });
      return;
    }
    setLoading(true);
    setFeedback(null);

    try {
      const resp = await fetch('/api/v1/auth/whatsapp-otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          phone: whatsappPhone,
        }),
      });
      const data = await resp.json();

      if (!resp.ok || !data.success) {
        setFeedback({ type: 'error', message: data.error || 'Não foi possível enviar o código no WhatsApp.' });
      } else {
        setOtpRequested(true);
        setFeedback({
          type: 'success',
          message: data.message || `Código de 6 dígitos enviado para o seu WhatsApp.`,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao solicitar código via WhatsApp.' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyWhatsappOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const resp = await fetch('/api/v1/auth/whatsapp-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code: otpCodeInput,
        }),
      });
      const data = await resp.json();

      if (!resp.ok || !data.success) {
        setFeedback({ type: 'error', message: data.error || 'Código inválido ou expirado.' });
      } else {
        const newSession: AuthSession = {
          token: data.token,
          user: data.user,
          claims: data.claims,
          authMethod: 'whatsapp_otp',
          authenticatedAt: data.authenticatedAt,
        };
        onSessionAuthenticated(newSession);
        setOtpRequested(false);
        setFeedback({
          type: 'success',
          message: `Autenticado com sucesso! Bem-vindo, ${data.user.name}.`,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao validar código.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto py-8 space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-2xs space-y-6">
        <div className="space-y-1.5 text-center">
          <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-3 shadow-sm shadow-blue-600/25">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-950">Acesso ao Painel do Restaurante</h1>
          <p className="text-xs text-slate-500">
            Entre com suas credenciais ou receba um código de acesso diretamente no seu WhatsApp.
          </p>
        </div>

        {/* Method Tabs */}
        <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
          <button
            type="button"
            onClick={() => {
              setAuthTab('password');
              setFeedback(null);
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              authTab === 'password'
                ? 'bg-white text-blue-600 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>E-mail e Senha</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthTab('whatsapp_otp');
              setFeedback(null);
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              authTab === 'whatsapp_otp'
                ? 'bg-white text-blue-600 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-blue-600" />
            <span>Código via WhatsApp</span>
          </button>
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-blue-50 border-blue-200 text-blue-900'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <p className="font-medium">{feedback.message}</p>
          </div>
        )}

        {authTab === 'password' ? (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                E-mail de Acesso
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="seuemail@restaurante.com.br"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs shadow-blue-600/20"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{loading ? 'Entrando...' : 'Entrar no Painel'}</span>
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Seu E-mail Cadastrado
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="seuemail@restaurante.com.br"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Seu WhatsApp (Com DDD)
              </label>
              <input
                type="text"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="5511999999999"
                required
              />
            </div>

            {!otpRequested ? (
              <button
                type="button"
                onClick={handleRequestWhatsappOtp}
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs shadow-blue-600/20"
              >
                <Smartphone className="w-4 h-4" />
                <span>{loading ? 'Enviando código...' : 'Receber Código de 6 Dígitos no WhatsApp'}</span>
              </button>
            ) : (
              <form onSubmit={handleVerifyWhatsappOtp} className="space-y-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                    Digite o código de 6 dígitos enviado para seu WhatsApp
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otpCodeInput}
                    onChange={(e) => setOtpCodeInput(e.target.value)}
                    className="w-full p-3 bg-white border-2 border-blue-600 rounded-xl text-base font-mono font-bold tracking-widest text-center"
                    placeholder="000000"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Confirmar Código e Entrar
                </button>
              </form>
            )}
          </div>
        )}

        {/* Current active session shortcut */}
        {currentSession?.user && (
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <div className="text-slate-500">
              Conectado como <strong className="text-slate-800">{currentSession.user.name}</strong> ({currentSession.user.role})
            </div>
            <div className="flex items-center gap-3">
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="text-rose-600 hover:text-rose-700 font-medium cursor-pointer"
                >
                  Sair
                </button>
              )}
              <button
                type="button"
                onClick={onNavigateToAdmin}
                className="text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Ir para o Painel</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
