import { RestaurantTenant } from '../types';

export interface ResolvedTenantPixCredentials {
  pixKey: string;
  beneficiaryName: string;
  merchantNameEmv: string;
  merchantCityEmv: string;
  pixKeyType: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
  bankName: string;
}

export function sanitizeEmvText(text: string, maxLength: number, fallback: string): string {
  const cleaned = (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 .&-]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, maxLength);
  return cleaned || fallback.slice(0, maxLength);
}

export function resolveTenantPixCredentials(tenant: RestaurantTenant): ResolvedTenantPixCredentials {
  const rawKey = (
    tenant.pixKey ||
    tenant.pixConfig?.pixKey ||
    tenant.phone ||
    '+5511999999999'
  ).trim();

  const rawBeneficiary = (
    tenant.pixBeneficiaryName ||
    tenant.pixConfig?.beneficiaryName ||
    tenant.pixConfig?.merchantName ||
    tenant.name ||
    'MEU RESTAURANTE'
  ).trim();

  const rawCity = (tenant.pixConfig?.merchantCity || 'SAO PAULO').trim();
  const pixKeyType = tenant.pixConfig?.pixKeyType || 'phone';
  const bankName = (tenant.pixConfig?.bankName || 'Conta Bancária do Proprietário').trim();

  return {
    pixKey: rawKey,
    beneficiaryName: rawBeneficiary,
    merchantNameEmv: sanitizeEmvText(rawBeneficiary, 25, 'RESTAURANTE'),
    merchantCityEmv: sanitizeEmvText(rawCity, 15, 'SAO PAULO'),
    pixKeyType,
    bankName,
  };
}

function formatEMV(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

export function calculateCRC16(payload: string): string {
  let crc = 0xffff;
  for (let c = 0; c < payload.length; c++) {
    crc ^= payload.charCodeAt(c) << 8;
    for (let i = 0; i < 8; i++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

export function generateDynamicPixPayload(params: {
  pixKey: string;
  beneficiaryName: string;
  merchantCity?: string;
  amountCents: number;
  txid: string;
}): string {
  const amountStr = (Math.max(1, params.amountCents) / 100).toFixed(2);
  const cleanKey = params.pixKey.replace(/\s+/g, '');
  const emvMerchantName = sanitizeEmvText(params.beneficiaryName, 25, 'RESTAURANTE');
  const emvMerchantCity = sanitizeEmvText(params.merchantCity || 'SAO PAULO', 15, 'SAO PAULO');
  const cleanTxid = (params.txid || 'PEDIDO').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || 'PEDIDO';

  const merchantAccount = formatEMV('00', 'BR.GOV.BCB.PIX') + formatEMV('01', cleanKey);
  const additionalData = formatEMV('05', cleanTxid);

  const payloadWithoutCrc =
    formatEMV('00', '01') +
    formatEMV('01', '12') + // 12 = QR Code Pix Dinâmico
    formatEMV('26', merchantAccount) +
    formatEMV('52', '0000') +
    formatEMV('53', '986') + // 986 = BRL
    formatEMV('54', amountStr) +
    formatEMV('58', 'BR') +
    formatEMV('59', emvMerchantName) +
    formatEMV('60', emvMerchantCity) +
    formatEMV('62', additionalData) +
    '6304';

  const crc = calculateCRC16(payloadWithoutCrc);
  return `${payloadWithoutCrc}${crc}`;
}
