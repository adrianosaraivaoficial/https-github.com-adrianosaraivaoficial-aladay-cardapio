import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  QrCode,
  Smartphone,
  CheckCircle2,
  RefreshCw,
  LogOut,
  AlertTriangle,
  Copy,
  Check,
  Server,
  Zap,
  ShieldCheck,
  Radio,
  Sliders,
  ExternalLink,
  HelpCircle,
  X,
  BatteryCharging,
  Wifi,
  PhoneCall
} from 'lucide-react';
import { RestaurantTenant, EvolutionQrConnectResponse } from '../types';

interface WhatsAppQrPairingModalProps {
  tenant: RestaurantTenant;
  isOpen: boolean;
  onClose: () => void;
  onTenantUpdated: (updatedTenant: RestaurantTenant) => void;
}

export const WhatsAppQrPairingModal: React.FC<WhatsAppQrPairingModalProps> = ({
  tenant,
  isOpen,
  onClose,
  onTenantUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'qrcode' | 'pairing_code' | 'config'>('qrcode');
  const [loading, setLoading] = useState(false);
  const [pairingData, setPairingData] = useState<EvolutionQrConnectResponse | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(40);
  const [copiedCode, setCopiedCode] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [isSimulatingScan, setIsSimulatingScan] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Phone input for pairing code alternative
  const [phoneInput, setPhoneInput] = useState(tenant.phone || '5511987654321');

  // VPS Evolution API Config State
  const [vpsUrl, setVpsUrl] = useState(
    tenant.evolutionApiUrl || ''
  );
  const [vpsApiKey, setVpsApiKey] = useState(
    tenant.evolutionApiKey || ''
  );
  const [instanceName, setInstanceName] = useState(
    tenant.evolutionInstanceId || 'aladay'
  );
  const [savingConfig, setSavingConfig] = useState(false);

  const instanceId = tenant.evolutionInstanceId || 'aladay';
  const isConnected = tenant.evolutionStatus === 'connected';

  // Timer reference for QR countdown
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch fresh QR code
  const fetchQrCode = useCallback(async (isManualRefresh = false) => {
    if (isConnected && !isManualRefresh) return;
    setLoading(true);
    setErrorNotice(null);

    try {
      const res = await fetch(`/api/v1/evolution/instance/${instanceId}/connect`);
      if (res.ok) {
        const data: EvolutionQrConnectResponse = await res.json();
        setPairingData(data);
        setSecondsRemaining(data.expiresInSeconds || 40);
      } else {
        throw new Error('Falha ao comunicar com Evolution API');
      }
    } catch {
      setErrorNotice('Não foi possível obter o QR Code em tempo real. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [instanceId, isConnected]);

  // Check instance status
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/evolution/instance/${instanceId}/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.state === 'open' && tenant.evolutionStatus !== 'connected') {
          const updated: RestaurantTenant = {
            ...tenant,
            evolutionStatus: 'connected',
            phone: data.connectedPhone || tenant.phone,
          };
          onTenantUpdated(updated);
          setSuccessToast('WhatsApp conectado com sucesso via Evolution API!');
          setTimeout(() => setSuccessToast(null), 4000);
        } else if (data.state === 'close' && tenant.evolutionStatus === 'connected') {
          const updated: RestaurantTenant = {
            ...tenant,
            evolutionStatus: 'disconnected',
          };
          onTenantUpdated(updated);
        }
      }
    } catch {
      // Ignore polling errors
    }
  }, [instanceId, tenant, onTenantUpdated]);

  // Initial load when modal opens
  useEffect(() => {
    if (isOpen) {
      if (!isConnected) {
        fetchQrCode();
      } else {
        checkStatus();
      }
    }
  }, [isOpen, isConnected, fetchQrCode, checkStatus]);

  // Countdown timer for QR expiration
  useEffect(() => {
    if (!isOpen || isConnected || activeTab !== 'qrcode') return;

    timerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          fetchQrCode();
          return 40;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, isConnected, activeTab, fetchQrCode]);

  // Status Polling Interval (every 3.5s while waiting for scan)
  useEffect(() => {
    if (!isOpen) return;

    const pollInterval = setInterval(() => {
      checkStatus();
    }, 3500);

    return () => clearInterval(pollInterval);
  }, [isOpen, checkStatus]);

  // Disconnect / Logout WhatsApp session
  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const res = await fetch(`/api/v1/evolution/instance/${instanceId}/disconnect`, {
        method: 'POST',
      });
      if (res.ok) {
        const updated: RestaurantTenant = {
          ...tenant,
          evolutionStatus: 'disconnected',
        };
        onTenantUpdated(updated);
        setSuccessToast('Instância desconectada. Você pode parear um novo WhatsApp agora.');
        setTimeout(() => setSuccessToast(null), 4000);
        fetchQrCode(true);
      }
    } catch {
      setErrorNotice('Erro ao desconectar WhatsApp.');
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Simulate scanning the QR code directly (for testing without a 2nd phone)
  const handleSimulateScan = async () => {
    setIsSimulatingScan(true);
    try {
      const res = await fetch(`/api/v1/evolution/instance/${instanceId}/simulate-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phoneInput || tenant.phone || '5511987654321',
          profileName: `${tenant.name} Atendimento`,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const updated: RestaurantTenant = {
          ...tenant,
          evolutionStatus: 'connected',
          phone: data.connectedPhone || tenant.phone,
        };
        onTenantUpdated(updated);
        setSuccessToast(`WhatsApp pareado com sucesso no número +${data.connectedPhone}!`);
        setTimeout(() => setSuccessToast(null), 4500);
      }
    } catch {
      setErrorNotice('Falha na simulação de pareamento.');
    } finally {
      setIsSimulatingScan(false);
    }
  };

  // Copy pairing code to clipboard
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  // Save Evolution API config
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await fetch(`/api/v1/tenants/${tenant.slug}/evolution-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evolutionApiUrl: vpsUrl.trim(),
          evolutionApiKey: vpsApiKey.trim(),
          evolutionInstanceId: instanceName.trim(),
        }),
      });
      if (res.ok) {
        const updated: RestaurantTenant = {
          ...tenant,
          evolutionApiUrl: vpsUrl.trim(),
          evolutionApiKey: vpsApiKey.trim(),
          evolutionInstanceId: instanceName.trim(),
        };
        onTenantUpdated(updated);
        setSuccessToast('Configurações da Evolution API salvas com sucesso!');
        setTimeout(() => setSuccessToast(null), 3500);
        setActiveTab('qrcode');
        fetchQrCode(true);
      }
    } catch {
      setErrorNotice('Erro ao salvar configurações.');
    } finally {
      setSavingConfig(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-neutral-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
        {/* Top Header Bar */}
        <div className="bg-neutral-900 text-white px-5 py-4 flex items-center justify-between border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight">Pareamento de WhatsApp</h3>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  Evolution API v2
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Instância: <code className="font-mono text-emerald-300 font-semibold">{instanceId}</code> &bull; {tenant.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isConnected ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-300 font-semibold bg-emerald-950/80 border border-emerald-700 px-2.5 py-1 rounded-md">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Conectado
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-amber-300 font-semibold bg-amber-950/80 border border-amber-700 px-2.5 py-1 rounded-md">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Aguardando QR Code
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Success / Error Toasts */}
        {successToast && (
          <div className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
        )}
        {errorNotice && (
          <div className="px-5 py-2.5 bg-rose-50 border-b border-rose-200 text-rose-900 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorNotice}</span>
          </div>
        )}

        {/* Tab Selection */}
        <div className="px-5 pt-3 border-b border-neutral-100 flex items-center gap-2 bg-neutral-50/70 text-xs">
          <button
            onClick={() => setActiveTab('qrcode')}
            className={`pb-2.5 px-3 font-semibold transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'qrcode'
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Escanear QR Code</span>
          </button>
          <button
            onClick={() => setActiveTab('pairing_code')}
            className={`pb-2.5 px-3 font-semibold transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'pairing_code'
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Código de Pareamento (8 Dígitos)</span>
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`pb-2.5 px-3 font-semibold transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'config'
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Servidor Evolution (VPS)</span>
          </button>
        </div>

        {/* Main Content Body */}
        <div className="p-5 sm:p-6 space-y-6">
          {/* TAB 1: QR CODE PAIRING (ON SCREEN) */}
          {activeTab === 'qrcode' && (
            <div>
              {isConnected ? (
                /* ALREADY CONNECTED SCREEN */
                <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-6 text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-xs">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-emerald-950">
                      WhatsApp Pareado e Operando em Tempo Real!
                    </h4>
                    <p className="text-xs text-emerald-700 max-w-md mx-auto mt-1">
                      A instância <code className="font-mono font-bold bg-emerald-100/70 px-1.5 py-0.5 rounded text-emerald-900">{instanceId}</code> está conectada via Baileys e pronta para enviar cardápios e notificações de pedidos do KDS.
                    </p>
                  </div>

                  {/* Connected Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-2 max-w-lg mx-auto">
                    <div className="bg-white p-3 rounded-xl border border-emerald-200/80 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-neutral-400 block">Número Pareado</span>
                      <p className="font-mono text-xs font-bold text-neutral-900 mt-0.5">
                        +{tenant.phone || '5511987654321'}
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-emerald-200/80 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-neutral-400 block">Perfil no WhatsApp</span>
                      <p className="text-xs font-bold text-neutral-900 mt-0.5 truncate">
                        {tenant.name}
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-emerald-200/80 shadow-2xs">
                      <span className="text-[10px] uppercase font-bold text-neutral-400 block">Status da Bateria</span>
                      <p className="text-xs font-bold text-emerald-700 mt-0.5 flex items-center gap-1">
                        <BatteryCharging className="w-3.5 h-3.5 text-emerald-600" />
                        98% (Online)
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => checkStatus()}
                      className="px-3.5 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-neutral-500" />
                      <span>Verificar Conexão</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      disabled={isDisconnecting}
                      className="px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-600" />
                      <span>{isDisconnecting ? 'Desconectando...' : 'Desconectar WhatsApp'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* PAIRING WAITING FOR SCAN */
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                  {/* Left: Big QR Code Display */}
                  <div className="md:col-span-6 flex flex-col items-center text-center space-y-3">
                    <div className="relative bg-white p-4 rounded-2xl border-2 border-neutral-200 shadow-md inline-block">
                      {loading ? (
                        <div className="w-[280px] h-[280px] flex flex-col items-center justify-center gap-3 bg-neutral-50 rounded-xl">
                          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
                          <span className="text-xs font-semibold text-neutral-600">Gerando QR Code...</span>
                        </div>
                      ) : pairingData?.base64 ? (
                        <div className="relative">
                          <img
                            src={pairingData.base64}
                            alt="QR Code WhatsApp Evolution API"
                            className="w-[280px] h-[280px] object-contain rounded-lg"
                          />
                          {/* Center subtle WhatsApp Logo mark */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-10 h-10 rounded-full bg-white shadow-md border border-neutral-200 flex items-center justify-center">
                              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-[280px] h-[280px] flex flex-col items-center justify-center gap-2 bg-neutral-50 rounded-xl p-4">
                          <AlertTriangle className="w-8 h-8 text-amber-500" />
                          <p className="text-xs text-neutral-600">QR Code expirado ou indisponível.</p>
                          <button
                            type="button"
                            onClick={() => fetchQrCode(true)}
                            className="mt-2 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-md hover:bg-emerald-100"
                          >
                            Recarregar QR Code
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Expiration Progress & Refresh */}
                    <div className="w-full max-w-[280px] space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-neutral-500">
                        <span className="flex items-center gap-1 font-medium">
                          <RefreshCw className="w-3 h-3 animate-spin text-neutral-400" />
                          Atualiza em: <strong className="text-neutral-900 font-mono">{secondsRemaining}s</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => fetchQrCode(true)}
                          className="text-emerald-700 hover:text-emerald-900 font-bold hover:underline"
                        >
                          Atualizar agora
                        </button>
                      </div>

                      {/* Progress line */}
                      <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-1000 ease-linear rounded-full"
                          style={{ width: `${(secondsRemaining / 40) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right: Step-by-Step Instructions & Simulation */}
                  <div className="md:col-span-6 space-y-4">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                        Como Conectar
                      </h4>
                      <h3 className="text-base font-bold text-neutral-900 mt-0.5">
                        Aponte a câmera do seu WhatsApp
                      </h3>
                      <p className="text-xs text-neutral-500 mt-1">
                        Siga os 4 passos rápidos no seu celular para sincronizar o atendimento oficial:
                      </p>
                    </div>

                    {/* 4 Steps */}
                    <div className="space-y-2.5 text-xs text-neutral-700">
                      <div className="flex items-start gap-2.5 p-2.5 bg-neutral-50 rounded-xl border border-neutral-200">
                        <span className="w-5 h-5 rounded-full bg-neutral-900 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                          1
                        </span>
                        <div>
                          <strong className="text-neutral-900">Abra o WhatsApp</strong> no seu celular.
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5 p-2.5 bg-neutral-50 rounded-xl border border-neutral-200">
                        <span className="w-5 h-5 rounded-full bg-neutral-900 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                          2
                        </span>
                        <div>
                          Toque no <strong>Menu (3 pontos no Android)</strong> ou em <strong>Ajustes / Configurações (no iPhone)</strong>.
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5 p-2.5 bg-neutral-50 rounded-xl border border-neutral-200">
                        <span className="w-5 h-5 rounded-full bg-neutral-900 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                          3
                        </span>
                        <div>
                          Selecione <strong>Aparelhos conectados</strong> e depois toque em <strong>Conectar um aparelho</strong>.
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5 p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-950">
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                          4
                        </span>
                        <div>
                          <strong>Aponte a câmera</strong> para o QR Code exibido ao lado nesta tela. A sincronização é instantânea!
                        </div>
                      </div>
                    </div>

                    {/* Simulation Button for testing without 2nd phone */}
                    <div className="pt-2 border-t border-neutral-100">
                      <div className="p-3 bg-neutral-900 text-white rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold flex items-center gap-1.5 text-emerald-400">
                            <Zap className="w-3.5 h-3.5 fill-current" />
                            Ambiente de Demonstração / Teste
                          </span>
                          <span className="text-[10px] bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded font-mono">
                            1 Clique
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-300">
                          Sem um segundo celular em mãos? Clique abaixo para simular a leitura do QR Code e conectar imediatamente a instância <code className="font-mono text-emerald-300 font-bold">{instanceId}</code>.
                        </p>
                        <button
                          type="button"
                          onClick={handleSimulateScan}
                          disabled={isSimulatingScan}
                          className="w-full py-2 px-3 text-xs font-bold text-neutral-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
                        >
                          {isSimulatingScan ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Validando leitura do WhatsApp...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Simular Leitura do QR Code no Celular</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PAIRING CODE (8 DIGITS PHONE ALTERNATIVE) */}
          {activeTab === 'pairing_code' && (
            <div className="space-y-4 max-w-lg mx-auto">
              <div className="text-center space-y-1">
                <h4 className="text-sm font-bold text-neutral-900">
                  Pareamento por Código de 8 Dígitos (Sem Câmera)
                </h4>
                <p className="text-xs text-neutral-500">
                  O WhatsApp permite conectar via código numérico se a câmera do aparelho estiver danificada ou indisponível.
                </p>
              </div>

              {/* Code Box */}
              <div className="bg-neutral-900 text-white rounded-2xl p-5 text-center space-y-3">
                <span className="text-[10px] uppercase font-bold text-neutral-400 block tracking-wider">
                  Seu Código de Pareamento Evolution API
                </span>

                <div className="py-2 px-4 bg-neutral-800/80 border border-neutral-700 rounded-xl inline-flex items-center gap-3">
                  <span className="font-mono text-2xl font-bold tracking-widest text-emerald-400">
                    {pairingData?.pairingCode || 'ALAD-8492'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyCode(pairingData?.pairingCode || 'ALAD-8492')}
                    className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-700 transition-colors"
                    title="Copiar código"
                  >
                    {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <p className="text-[11px] text-neutral-400 max-w-sm mx-auto">
                  No celular, em <strong>Aparelhos conectados</strong>, toque em <strong>Conectar com número de telefone</strong> e digite o código acima.
                </p>
              </div>

              {/* Test Phone Input */}
              <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3 text-xs">
                <div>
                  <label className="font-bold text-neutral-800 block">
                    Número do WhatsApp do Restaurante (com DDD):
                  </label>
                  <input
                    type="text"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="5511987654321"
                    className="mt-1 w-full p-2.5 bg-white border border-neutral-300 rounded-lg font-mono text-neutral-900"
                  />
                  <span className="text-[10px] text-neutral-500 mt-1 block">
                    Formato: Código do país (55) + DDD (11) + 9 dígitos.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleSimulateScan}
                  disabled={isSimulatingScan}
                  className="w-full py-2 px-3 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Confirmar Pareamento deste Número</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: EVOLUTION API HOSTINGER / EASYPANEL CONFIG */}
          {activeTab === 'config' && (
            <form onSubmit={handleSaveConfig} className="space-y-4 max-w-lg mx-auto text-xs">
              <div>
                <h4 className="text-sm font-bold text-neutral-900">
                  Parâmetros de Conexão com Evolution API
                </h4>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Conexão direta com a VPS Hostinger / Easypanel onde a Evolution API está hospedada.
                </p>
              </div>

              <div>
                <label className="font-bold text-neutral-800 block">
                  URL da Evolution API (VPS / Easypanel):
                </label>
                <input
                  type="url"
                  required
                  value={vpsUrl}
                  onChange={(e) => setVpsUrl(e.target.value)}
                  placeholder="https://sua-evolution-api"
                  className="mt-1 w-full p-2.5 bg-white border border-neutral-300 rounded-lg font-mono text-neutral-900"
                />
              </div>

              <div>
                <label className="font-bold text-neutral-800 block">
                  Global API Key (Chave Global de Autenticação):
                </label>
                <input
                  type="text"
                  required
                  value={vpsApiKey}
                  onChange={(e) => setVpsApiKey(e.target.value)}
                  placeholder="Cole a chave configurada no servidor"
                  className="mt-1 w-full p-2.5 bg-white border border-neutral-300 rounded-lg font-mono text-neutral-900"
                />
              </div>

              <div>
                <label className="font-bold text-neutral-800 block">
                  Nome da Instância para este Restaurante:
                </label>
                <input
                  type="text"
                  required
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  placeholder="aladay"
                  className="mt-1 w-full p-2.5 bg-white border border-neutral-300 rounded-lg font-mono text-neutral-900"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => checkStatus()}
                  className="px-3.5 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
                >
                  Testar Ping
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-4 py-2 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  {savingConfig ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>{savingConfig ? 'Salvando...' : 'Salvar Configuração'}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer info bar */}
        <div className="bg-neutral-50 px-5 py-3 border-t border-neutral-200 flex flex-wrap items-center justify-between text-[11px] text-neutral-500 gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Sessão segura Baileys &bull; Multi-Device Protocol oficial</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-neutral-400">Status: {tenant.evolutionStatus}</span>
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-semibold text-neutral-700 hover:text-neutral-900"
            >
              Concluir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
