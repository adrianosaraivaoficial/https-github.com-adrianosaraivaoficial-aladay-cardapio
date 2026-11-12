import React, { useState, useEffect, useRef } from 'react';
import {
  QrCode,
  Copy,
  Check,
  Clock,
  Zap,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  X
} from 'lucide-react';
import { Order, RestaurantTenant, PixTransaction } from '../types';
import { resolveTenantPixCredentials } from '../utils/pixPayloadGenerator';
import QRCode from 'qrcode';

interface PixPaymentModalProps {
  order: Order;
  tenant: RestaurantTenant;
  isOpen: boolean;
  onPaymentApproved: (updatedOrder: Order) => void;
  onClose: () => void;
  onViewTracking: (order: Order) => void;
}

export const PixPaymentModal: React.FC<PixPaymentModalProps> = ({
  order,
  tenant,
  isOpen,
  onPaymentApproved,
  onClose,
  onViewTracking,
}) => {
  const [transaction, setTransaction] = useState<PixTransaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chargeError, setChargeError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [isSimulatingPayment, setIsSimulatingPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'approved' | 'expired'>('pending');
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(15 * 60); // 15 minutes
  const [approvedOrder, setApprovedOrder] = useState<Order>(order);
  const [localQrDataUrl, setLocalQrDataUrl] = useState<string>('');

  const pollIntervalRef = useRef<any>(null);

  const tenantPix = resolveTenantPixCredentials(tenant);

  // Initialize or fetch dynamic Pix charge using the tenant's configured Pix key and Beneficiary Name
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);
    setTransaction(null);
    setLocalQrDataUrl('');
    setChargeError('');
    setPaymentStatus('pending');

    const initPixCharge = async () => {
      try {
        const res = await fetch('/api/v1/pix/charges', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: order.id,
          }),
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Não foi possível obter a cobrança Pix.');
        if (res.ok) {
          if (isMounted && json.data) {
            setTransaction(json.data);
            if (json.data.status === 'PAID') {
              setPaymentStatus('approved');
            }
          }
        }
      } catch (err) {
        if (isMounted) setChargeError(err instanceof Error ? err.message : 'Cobrança Pix indisponível. Tente novamente.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    initPixCharge();

    return () => {
      isMounted = false;
    };
  }, [
    isOpen,
    order.id,
    order.totalCents,
    order.customerName,
    order.customerPhone,
    tenant.slug,
    tenantPix.pixKey,
    tenantPix.pixKeyType,
    tenantPix.beneficiaryName,
    tenantPix.merchantNameEmv,
    tenantPix.merchantCityEmv,
  ]);

  // Polling listener to detect webhook confirmation
  useEffect(() => {
    if (!isOpen || paymentStatus === 'approved' || !transaction?.txid) return;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/pix/${transaction.txid}/status`);
        if (res.ok) {
          const json = await res.json();
          if (json.status === 'PAID') {
            clearInterval(pollIntervalRef.current);
            setPaymentStatus('approved');
            const updated = {
              ...order,
              ...(json.order || {}),
              paymentStatus: 'paid_online' as const,

            };
            setApprovedOrder(updated);
            onPaymentApproved(updated);
          }
        }
      } catch (e) {
        // quiet poll fail
      }
    }, 1500);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isOpen, paymentStatus, transaction?.txid, order, onPaymentApproved]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || paymentStatus === 'approved') return;

    const timer = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // A static bank Pix is not cancelled by a browser timer.
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, paymentStatus]);

  const effectivePixKey = transaction?.pixKey || tenantPix.pixKey;
  const effectiveBeneficiaryName =
    transaction?.beneficiaryName || transaction?.merchantName || tenant.name;
  const pixPayload = transaction?.pixCopiaECola || '';

  useEffect(() => {
    if (!isOpen || !pixPayload) return;
    let active = true;
    QRCode.toDataURL(pixPayload, { width: 260, margin: 2 })
      .then((url) => {
        if (active) setLocalQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen, pixPayload]);

  if (!isOpen) return null;

  const formatMinutes = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formattedAmount = `R$ ${(order.totalCents / 100).toFixed(2).replace('.', ',')}`;

  const qrCodeUrl = localQrDataUrl;

  const handleCopyCode = async () => {
    try {
      if (!pixPayload) return;
      await navigator.clipboard.writeText(pixPayload);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 3000);
    } catch {
      // Fallback
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 3000);
    }
  };

  // This action only polls settlement recorded by the backend.
  const handleConfirmPixPaid = async () => {
    if (!transaction?.txid) return;
    setIsSimulatingPayment(true);
    try {
      const response = await fetch(`/api/v1/pix/${encodeURIComponent(transaction.txid)}/status`);
      const result = await response.json();
      if (!response.ok || result.status !== 'PAID') {
        setChargeError('Pagamento ainda não confirmado. Aguarde a compensação do Pix.');
        return;
      }
      const updated: Order = { ...order, ...result.order, paymentStatus: 'paid_online' };
      setPaymentStatus('approved'); setApprovedOrder(updated); onPaymentApproved(updated);
    } catch { setChargeError('Não foi possível consultar o pagamento. Tente novamente.'); }
    finally { setIsSimulatingPayment(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-neutral-200 overflow-hidden relative my-auto">
        {/* Top Header */}
        <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-700 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-xs flex items-center justify-center">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold leading-tight">Pagamento via Pix</h3>
              <p className="text-[11px] text-emerald-100">{tenant.name}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          {paymentStatus === 'approved' ? (
            /* SUCCESS STATE */
            <div className="text-center py-6 space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-inner">
                <CheckCircle2 className="w-10 h-10 animate-bounce" />
              </div>

              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider mb-1">
                  <Zap className="w-3.5 h-3.5 text-emerald-600" />
                  Pagamento Registrado
                </span>
                <h4 className="text-lg font-bold text-neutral-900">
                  {formattedAmount} Confirmado!
                </h4>
                <p className="text-xs text-neutral-600 max-w-xs mx-auto mt-1 leading-relaxed">
                  O pedido <strong>#{approvedOrder.orderNumber}</strong> foi enviado e já está em preparo no {tenant.name}!
                </p>
              </div>

              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-left text-xs space-y-1.5 font-mono">
                <div className="flex justify-between text-neutral-500">
                  <span>Beneficiário Recebedor:</span>
                  <span className="text-neutral-900 font-bold truncate max-w-[200px]">
                    {effectiveBeneficiaryName}
                  </span>
                </div>
                <div className="flex justify-between text-neutral-500">
                  <span>Chave Pix de Destino:</span>
                  <span className="text-emerald-700 font-bold truncate max-w-[200px]">
                    {effectivePixKey}
                  </span>
                </div>
                <div className="flex justify-between text-neutral-500">
                  <span>Horário:</span>
                  <span className="text-emerald-700 font-bold">
                    {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onViewTracking(approvedOrder);
                  }}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <span>Acompanhar Status do Pedido</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2 text-xs text-neutral-500 hover:text-neutral-800 font-medium"
                >
                  Voltar ao Cardápio
                </button>
              </div>
            </div>
          ) : paymentStatus === 'expired' ? (
            /* EXPIRED STATE */
            <div className="text-center py-6 space-y-3">
              <div className="w-14 h-14 rounded-full bg-rose-100 text-rose-600 mx-auto flex items-center justify-center">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-neutral-900">QR Code Pix Expirado</h4>
              <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                O prazo de 15 minutos para este QR Code expirou. Por favor, abra novamente para gerar um novo código.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-neutral-900 text-white text-xs font-semibold rounded-lg"
              >
                Tentar Novamente
              </button>
            </div>
          ) : (
            /* PENDING PAYMENT STATE */
            <>
              {/* Order Amount and Expiry Notice */}
              <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                <div>
                  <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Valor do Pix</span>
                  <p className="text-xl font-extrabold text-neutral-900">{formattedAmount}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1 justify-end">
                    <Clock className="w-3 h-3 text-amber-500" />
                    Tempo de espera
                  </span>
                  <p className="text-xs font-mono font-bold text-amber-600">{formatMinutes(timeLeftSeconds)}</p>
                </div>
              </div>

              {/* Restaurant Beneficiary & Pix Key Details */}
              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Recebimento Direto na Conta do Restaurante</span>
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-emerald-200/70">
                  <div>
                    <span className="text-[10px] text-emerald-700 block">Nome do Beneficiário:</span>
                    <p className="font-bold text-neutral-900 text-xs truncate" title={effectiveBeneficiaryName}>
                      {effectiveBeneficiaryName}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-700 block">Pagamento:</span>
                    <p className="font-mono font-bold text-neutral-900 text-xs truncate" title={effectivePixKey}>
                      Confira o favorecido no seu banco.
                    </p>
                  </div>
                </div>
              </div>

              {chargeError && <p role="alert" className="text-sm text-rose-700">{chargeError}</p>}
              {/* QR Code Container */}
              <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200 flex flex-col items-center justify-center relative">
                {isLoading && !qrCodeUrl ? (
                  <div className="w-48 h-48 flex flex-col items-center justify-center gap-2 text-neutral-400">
                    <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                    <span className="text-xs">Gerando QR Code Pix...</span>
                  </div>
                ) : qrCodeUrl ? (
                  <div className="bg-white p-3 rounded-xl shadow-xs border border-neutral-200 relative group">
                    <img
                      src={qrCodeUrl}
                      alt="QR Code Pix"
                      className="w-48 h-48 rounded-lg object-contain"
                    />
                  </div>
                ) : <p className="text-sm text-neutral-600">Cobrança indisponível.</p>}

                <div className="mt-3 flex items-center gap-2 text-[11px] text-neutral-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Abra o app do seu banco e escaneie o QR Code acima</span>
                </div>
              </div>

              {/* Pix Copia e Cola field */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-neutral-700">
                  Ou copie o código Pix Copia e Cola:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={pixPayload}
                    onClick={handleCopyCode}
                    className="flex-1 p-2 bg-neutral-100 border border-neutral-300 rounded-lg text-[11px] font-mono text-neutral-700 truncate cursor-pointer focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 shadow-xs cursor-pointer"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar Código</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Customer Confirmation Action */}
              <div className="pt-1 space-y-2">
                <button
                  type="button"
                  onClick={handleConfirmPixPaid}
                  disabled={isSimulatingPayment}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSimulatingPayment ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Confirmando Pagamento...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Já realizei o pagamento Pix</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
