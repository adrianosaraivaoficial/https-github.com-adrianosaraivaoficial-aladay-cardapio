import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Smartphone,
  Lock,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  Terminal,
  Copy,
  RefreshCw,
  LogOut,
  ArrowRight,
  Building2,
  ChefHat,
  Crown,
} from 'lucide-react';
import { AuthAuditLog, AuthSession, JwtRole } from '../types';

interface AuthPortalViewProps {
  currentSession: AuthSession;
  onSessionAuthenticated: (session: AuthSession) => void;
  onNavigateToAdmin: () => void;
}

const DEMO_ACCOUNTS: Array<{
  label: string;
  role: JwtRole;
  email: string;
  password: string;
  tenantSlug: string;
  tenantName: string;
  badgeColor: string;
  description: string;
}> = [
  {
    label: 'CEO / Super Admin Aladay',
    role: 'SUPER_ADMIN',
    email: 'admin@aladay.com.br',
    password: 'aladay2026',
    tenantSlug: '*',
    tenantName: 'Visão Global (Todos os Restaurantes)',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    description: 'Acesso total a todos os tenants, faturamento SaaS Asaas (R$ 99/mês) e instâncias Evolution API.',
  },
  {
    label: 'Lojista • Brasas & Burger',
    role: 'TENANT_OWNER',
    email: 'lojista@brasasburger.com.br',
    password: 'brasas123',
    tenantSlug: 'brasas-burger',
    tenantName: 'Brasas & Burger Artesanal',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    description: 'Isolamento RLS no tenant brasas-burger: Cardápio, KDS, Chave Pix Direta e Assinatura Asaas.',
  },
  {
    label: 'Lojista • Pizzaria Di Fiori',
    role: 'TENANT_OWNER',
    email: 'lojista@difiori.com.br',
    password: 'difiori123',
    tenantSlug: 'pizzaria-difiori',
    tenantName: 'Pizzaria Di Fiori Forno a Lenha',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    description: 'Isolamento RLS no tenant pizzaria-difiori: Cardápio de pizzas, KDS e Chave Pix Direta.',
  },
  {
    label: 'Operador KDS (Cozinha & Expedição)',
    role: 'KITCHEN_STAFF',
    email: 'cozinha@brasasburger.com.br',
    password: 'cozinha123',
    tenantSlug: 'brasas-burger',
    tenantName: 'Brasas & Burger Artesanal (Apenas KDS)',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    description: 'Acesso restrito ao Kanban da Cozinha e disparo de status WhatsApp. Bloqueia dados financeiros/Pix.',
  },
];

export const AuthPortalView: React.FC<AuthPortalViewProps> = ({
  currentSession,
  onSessionAuthenticated,
  onNavigateToAdmin,
}) => {
  const [authTab, setAuthTab] = useState<'password' | 'whatsapp_otp'>('password');
  const [email, setEmail] = useState('lojista@brasasburger.com.br');
  const [password, setPassword] = useState('brasas123');
  const [whatsappPhone, setWhatsappPhone] = useState('559181214188');
  const [otpCodeInput, setOtpCodeInput] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [demoOtpHint, setDemoOtpHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuthAuditLog[]>([]);
  const [copiedToken, setCopiedToken] = useState(false);

  const fetchAuditLogs = async () => {
    try {
      const resp = await fetch('/api/v1/auth/audit-logs');
      if (resp.ok) {
        const data = await resp.json();
        setAuditLogs(data.logs || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [currentSession]);

  const handlePasswordLogin = async (e?: React.FormEvent, customEmail?: string, customPassword?: string) => {
    if (e) e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const resp = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: customEmail ?? email,
          password: customPassword ?? password,
        }),
      });
      const data = await resp.json();

      if (!resp.ok || !data.success) {
        setFeedback({ type: 'error', message: data.error || 'Falha na autenticação.' });
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
          message: `Autenticado com sucesso como ${data.user.name} (${data.user.role})! Escopo Tenant: ${data.user.tenantSlug}`,
        });
        fetchAuditLogs();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro de conexão com o servidor.' });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestWhatsappOtp = async () => {
    setLoading(true);
    setFeedback(null);
    setDemoOtpHint(null);

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
      if (resp.ok && data.success) {
        setOtpRequested(true);
        setDemoOtpHint(data.demoOtpHint || null);
        setOtpCodeInput(data.demoOtpHint || '');
        setFeedback({
          type: 'success',
          message: data.message,
        });
        fetchAuditLogs();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Erro ao enviar OTP via WhatsApp.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Falha ao comunicar com Evolution API.' });
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
        setFeedback({ type: 'error', message: data.error || 'Código OTP inválido.' });
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
          message: `2FA WhatsApp verificado! Sessão JWT iniciada para ${data.user.name} (${data.user.role}).`,
        });
        fetchAuditLogs();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao validar código OTP.' });
    } finally {
      setLoading(false);
    }
  };

  const getRoleIcon = (role: JwtRole) => {
    if (role === 'SUPER_ADMIN') return <Crown className="w-4 h-4 text-purple-700" />;
    if (role === 'TENANT_OWNER') return <Building2 className="w-4 h-4 text-emerald-700" />;
    return <ChefHat className="w-4 h-4 text-amber-700" />;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold">
              Passo 2 Concluído &bull; Auth &amp; RBAC
            </span>
            <span className="text-xs font-mono text-neutral-500">aladay.com.br &bull; HMAC-SHA256 JWT</span>
          </div>
          <h1 className="text-lg font-black text-neutral-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span>Autenticação JWT Multi-Tenant &amp; Magic OTP via WhatsApp</span>
          </h1>
          <p className="text-xs text-neutral-600 max-w-3xl">
            Isolamento de sessão criptográfico por restaurante (<code className="font-mono">tenant_slug</code>) com suporte a <strong>E-mail/Senha</strong> e <strong>Código 2FA de 6 dígitos enviado no WhatsApp real</strong> via Evolution API (instância <code className="font-mono">aladay</code>).
          </p>
        </div>

        {/* Active Session Summary Card */}
        <div className="bg-neutral-900 text-white rounded-xl p-3.5 min-w-[290px] flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                Sessão JWT Ativa ({currentSession.authMethod === 'whatsapp_otp' ? 'WhatsApp 2FA' : 'Senha'})
              </span>
            </div>
            <p className="text-xs font-bold text-white truncate">{currentSession.user.name}</p>
            <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-400">
              <span>Role: {currentSession.user.role}</span>
              <span>&bull;</span>
              <span>Tenant: {currentSession.user.tenantSlug}</span>
            </div>
          </div>
          <button
            onClick={onNavigateToAdmin}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0"
          >
            <span>Abrir Painel</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Grid: Left = Login & Role Switcher | Right = Live JWT Inspector & RLS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Quick Role Switcher + Real Auth Forms */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1-Click Role Profiles */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span>Simulador Rápido de Perfis RBAC (1-Clique)</span>
                </h2>
                <p className="text-xs text-neutral-500">
                  Clique em qualquer perfil abaixo para autenticar imediatamente e testar o isolamento Multi-Tenant na prática:
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DEMO_ACCOUNTS.map((acc) => {
                const isCurrent =
                  currentSession.user.email === acc.email && currentSession.user.role === acc.role;
                return (
                  <div
                    key={acc.email}
                    className={`border rounded-xl p-3.5 transition-all flex flex-col justify-between gap-3 ${
                      isCurrent
                        ? 'border-emerald-600 bg-emerald-50/40 ring-1 ring-emerald-600'
                        : 'border-neutral-200 hover:border-neutral-300 bg-white'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${acc.badgeColor}`}
                        >
                          {acc.role}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-semibold text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Logado
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                        {getRoleIcon(acc.role)}
                        <span>{acc.label}</span>
                      </p>
                      <p className="text-[11px] text-neutral-600 leading-relaxed">{acc.description}</p>
                    </div>

                    <div className="pt-2 border-t border-neutral-100 flex items-center justify-between gap-2">
                      <code className="text-[10px] font-mono text-neutral-500 truncate">{acc.email}</code>
                      <button
                        type="button"
                        onClick={() => {
                          setEmail(acc.email);
                          setPassword(acc.password);
                          handlePasswordLogin(undefined, acc.email, acc.password);
                        }}
                        disabled={loading}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors whitespace-nowrap ${
                          isCurrent
                            ? 'bg-emerald-700 text-white'
                            : 'bg-neutral-900 hover:bg-neutral-800 text-white'
                        }`}
                      >
                        {isCurrent ? 'Renovar JWT' : 'Entrar com Perfil'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Interactive Authentication Form (E-mail/Password + WhatsApp OTP Real) */}
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="border-b border-neutral-200 bg-neutral-50 p-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAuthTab('password');
                  setFeedback(null);
                }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                  authTab === 'password'
                    ? 'bg-white text-neutral-900 shadow-2xs border border-neutral-200'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5 text-neutral-700" />
                <span>Login com E-mail e Senha</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('whatsapp_otp');
                  setFeedback(null);
                }}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                  authTab === 'whatsapp_otp'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Magic Code OTP via WhatsApp Real (aladay)</span>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {feedback && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                    feedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-semibold">{feedback.message}</p>
                  </div>
                </div>
              )}

              {authTab === 'password' ? (
                <form onSubmit={(e) => handlePasswordLogin(e)} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 mb-1">
                        E-mail Corporativo / Lojista
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full p-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono"
                        placeholder="lojista@brasasburger.com.br"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 mb-1">
                        Senha de Acesso
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full p-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono"
                        placeholder="••••••••"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[11px] text-neutral-500">
                      Endpoint: <code className="font-mono">POST /api/v1/auth/login</code>
                    </span>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>{loading ? 'Autenticando...' : 'Autenticar e Gerar JWT'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-950 space-y-1">
                    <p className="font-bold">Autenticação Passwordless via Evolution API (Instância aladay)</p>
                    <p className="text-[11px] text-emerald-800">
                      Envia um código numérico único de 6 dígitos diretamente para o WhatsApp configurado abaixo usando sua instância real conectada.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 mb-1">
                        Conta que deseja autenticar
                      </label>
                      <select
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full p-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-medium"
                      >
                        {DEMO_ACCOUNTS.map((acc) => (
                          <option key={acc.email} value={acc.email}>
                            {acc.label} ({acc.role})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 mb-1">
                        WhatsApp Destino (Com DDI 55 + DDD)
                      </label>
                      <input
                        type="text"
                        value={whatsappPhone}
                        onChange={(e) => setWhatsappPhone(e.target.value)}
                        className="w-full p-2.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs font-mono"
                        placeholder="559181214188"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={handleRequestWhatsappOtp}
                      disabled={loading}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>
                        {loading ? 'Disparando no WhatsApp...' : '1. Receber Código de 6 Dígitos no WhatsApp'}
                      </span>
                    </button>

                    {demoOtpHint && (
                      <span className="text-[11px] font-mono bg-neutral-100 border border-neutral-300 px-2.5 py-1 rounded text-neutral-700">
                        Código Disparado: <strong>{demoOtpHint}</strong>
                      </span>
                    )}
                  </div>

                  {otpRequested && (
                    <form
                      onSubmit={handleVerifyWhatsappOtp}
                      className="pt-3 border-t border-neutral-200 flex flex-col sm:flex-row items-stretch sm:items-end gap-3"
                    >
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-neutral-800 mb-1">
                          Digite o Código de 6 Dígitos recebido no WhatsApp
                        </label>
                        <input
                          type="text"
                          maxLength={6}
                          value={otpCodeInput}
                          onChange={(e) => setOtpCodeInput(e.target.value)}
                          className="w-full p-2.5 bg-white border-2 border-emerald-500 rounded-lg text-sm font-mono font-bold tracking-widest text-center"
                          placeholder="000000"
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-lg transition-colors"
                      >
                        2. Confirmar Código &amp; Emitir JWT
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Live JWT Token & RLS Inspector */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-neutral-900 text-neutral-100 rounded-xl p-5 space-y-4 border border-neutral-800">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Inspetor de Token JWT (HMAC-SHA256)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(currentSession.token);
                  setCopiedToken(true);
                  setTimeout(() => setCopiedToken(false), 1800);
                }}
                className="text-[11px] font-mono bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-2.5 py-1 rounded flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedToken ? 'Copiado!' : 'Copiar Bearer'}</span>
              </button>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-mono text-neutral-400">Authorization: Bearer &lt;token&gt;</p>
              <div className="p-2.5 bg-black/60 border border-neutral-800 rounded-lg text-[10px] font-mono break-all text-emerald-400 leading-relaxed max-h-24 overflow-y-auto">
                {currentSession.token}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-mono text-neutral-400">
                Payload Decodificado (Claims Injetados no PostgreSQL RLS):
              </p>
              <pre className="p-3 bg-black/60 border border-neutral-800 rounded-lg text-[11px] font-mono text-amber-300 overflow-x-auto leading-relaxed">
                {JSON.stringify(currentSession.claims, null, 2)}
              </pre>
            </div>

            <div className="p-3 bg-emerald-950/50 border border-emerald-800/60 rounded-lg space-y-1">
              <p className="text-[11px] font-bold text-emerald-300">
                Isolamento Automático no Banco de Dados (Row-Level Security):
              </p>
              <code className="block text-[10px] font-mono text-emerald-200">
                SET LOCAL app.current_tenant_slug = &apos;{currentSession.claims.tenant_slug}&apos;;
              </code>
              <code className="block text-[10px] font-mono text-emerald-200">
                SET LOCAL app.current_user_role = &apos;{currentSession.claims.role}&apos;;
              </code>
            </div>
          </div>

          {/* RBAC Permissions Matrix */}
          <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-neutral-900">
              Matriz de Controle de Acesso (RBAC Multi-Tenant)
            </h3>
            <table className="w-full text-[11px]">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-bold">
                <tr>
                  <th className="p-2 text-left">Recurso / Módulo</th>
                  <th className="p-2 text-center">SUPER_ADMIN</th>
                  <th className="p-2 text-center">TENANT_OWNER</th>
                  <th className="p-2 text-center">KITCHEN_STAFF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                <tr>
                  <td className="p-2 font-medium text-neutral-800">Trocar de Restaurante (Todos Tenants)</td>
                  <td className="p-2 text-center text-emerald-600 font-bold">Sim</td>
                  <td className="p-2 text-center text-red-600">Bloqueado (RLS)</td>
                  <td className="p-2 text-center text-red-600">Bloqueado (RLS)</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium text-neutral-800">KDS Kanban &amp; Disparo WhatsApp</td>
                  <td className="p-2 text-center text-emerald-600 font-bold">Sim</td>
                  <td className="p-2 text-center text-emerald-600 font-bold">Sim</td>
                  <td className="p-2 text-center text-emerald-600 font-bold">Sim</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium text-neutral-800">Editar Cardápio, Bairros &amp; Cupons</td>
                  <td className="p-2 text-center text-emerald-600 font-bold">Sim</td>
                  <td className="p-2 text-center text-emerald-600 font-bold">Sim</td>
                  <td className="p-2 text-center text-red-600">Bloqueado</td>
                </tr>
                <tr>
                  <td className="p-2 font-medium text-neutral-800">Chave Pix Direta &amp; Fatura Asaas R$ 99</td>
                  <td className="p-2 text-center text-emerald-600 font-bold">Sim</td>
                  <td className="p-2 text-center text-emerald-600 font-bold">Sim</td>
                  <td className="p-2 text-center text-red-600">Bloqueado</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Security Audit Log Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-neutral-900">
              Trilha de Auditoria de Autenticação &amp; Sessões JWT (aladay.com.br)
            </h3>
            <p className="text-[11px] text-neutral-500">
              Registro em tempo real de emissões de tokens JWT, disparos de 2FA no WhatsApp e bloqueios RBAC.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchAuditLogs}
            className="px-2.5 py-1 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Atualizar</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
              <tr>
                <th className="p-3 text-left">Horário</th>
                <th className="p-3 text-left">Usuário</th>
                <th className="p-3 text-left">Escopo RBAC</th>
                <th className="p-3 text-left">Tenant RLS</th>
                <th className="p-3 text-left">Método</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-left">Detalhe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-neutral-50/70">
                  <td className="p-3 font-mono text-[11px] text-neutral-500">{log.timestamp}</td>
                  <td className="p-3 font-semibold text-neutral-900">
                    <div>{log.userName}</div>
                    <div className="text-[10px] font-mono text-neutral-500">{log.userEmail}</div>
                  </td>
                  <td className="p-3">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-neutral-100 text-neutral-800 border border-neutral-300">
                      {log.role}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-[11px] text-emerald-700 font-semibold">
                    {log.tenantSlug}
                  </td>
                  <td className="p-3 text-[11px] text-neutral-600">
                    {log.method === 'whatsapp_otp' ? 'WhatsApp 2FA (aladay)' : 'E-mail + Senha'}
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        log.status === 'SUCCESS'
                          ? 'bg-emerald-100 text-emerald-800'
                          : log.status === 'OTP_SENT'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="p-3 text-[11px] text-neutral-600">{log.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
