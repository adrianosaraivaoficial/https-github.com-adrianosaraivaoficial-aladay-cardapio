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
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, maxLength)
    .trim();
  return cleaned || fallback.slice(0, maxLength);
}

/**
 * Validates standard Brazilian CPF mod-11 check digits so we can distinguish
 * an 11-digit CPF (e.g. 57471207272) from an 11-digit mobile phone (DDD + 9 digits).
 */
export function isValidCpf(digits: string): boolean {
  const clean = digits.replace(/\D/g, '');
  if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean.charAt(i), 10) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean.charAt(i), 10) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  return rev === parseInt(clean.charAt(10), 10);
}

/**
 * Formats a Pix Key strictly according to the BACEN BR Code specification:
 * - Email: lowercase, trimmed
 * - Random (EVP UUID): lowercase 36-char UUID with hyphens
 * - CPF: 11 pure digits (no dots/hyphens, no +55)
 * - CNPJ: 14 pure digits (no dots/slashes/hyphens)
 * - Phone: E.164 format starting with +55 (e.g., +5591981214188)
 */
export function formatPixKeyForBacen(
  rawKey: string,
  pixKeyType?: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random',
  tenantPhone?: string
): { formattedKey: string; detectedType: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random' } {
  const trimmed = (rawKey || '').trim();
  if (!trimmed) {
    return { formattedKey: '+5511999999999', detectedType: 'phone' };
  }

  // 1. Email key
  if (trimmed.includes('@') || pixKeyType === 'email') {
    return { formattedKey: trimmed.toLowerCase().replace(/\s+/g, ''), detectedType: 'email' };
  }

  // 2. Random EVP key (UUID with hyphens)
  if (
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(trimmed) ||
    pixKeyType === 'random'
  ) {
    return { formattedKey: trimmed.toLowerCase().replace(/\s+/g, ''), detectedType: 'random' };
  }

  const digits = trimmed.replace(/\D/g, '');
  const cleanTenantPhone = (tenantPhone || '').replace(/\D/g, '');

  // 3. Explicit phone prefix (+) or explicit phone type (when not a valid CPF that differs from tenant phone)
  if (trimmed.startsWith('+')) {
    if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
      return { formattedKey: `+${digits}`, detectedType: 'phone' };
    }
    return { formattedKey: `+55${digits}`, detectedType: 'phone' };
  }

  // 4. 14 digits -> CNPJ (unless it starts with 55 and matches a 12/13-digit phone)
  if (digits.length === 14 && pixKeyType !== 'phone') {
    return { formattedKey: digits, detectedType: 'cnpj' };
  }

  // 5. 11 digits -> Check if CPF or Brazilian mobile phone (DDD + 9XXXX-XXXX)
  if (digits.length === 11) {
    const matchesTenantPhone =
      Boolean(cleanTenantPhone) &&
      (cleanTenantPhone === digits || cleanTenantPhone === `55${digits}`);

    if (pixKeyType === 'cpf' || (!matchesTenantPhone && isValidCpf(digits))) {
      return { formattedKey: digits, detectedType: 'cpf' };
    }
    return { formattedKey: `+55${digits}`, detectedType: 'phone' };
  }

  // 6. 10 digits -> Brazilian landline/phone (DDD + 8 digits)
  if (digits.length === 10) {
    return { formattedKey: `+55${digits}`, detectedType: 'phone' };
  }

  // 7. 12 or 13 digits starting with 55 -> Brazilian phone with DDI 55
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    const withoutDdi = digits.slice(2);
    // Guard against someone typing 55 + 11-digit CPF by mistake only if explicitly CPF, otherwise it's DDI 55 + phone
    if (pixKeyType === 'cpf' && withoutDdi.length === 11 && isValidCpf(withoutDdi)) {
      return { formattedKey: withoutDdi, detectedType: 'cpf' };
    }
    return { formattedKey: `+${digits}`, detectedType: 'phone' };
  }

  if (pixKeyType === 'cpf' || pixKeyType === 'cnpj') {
    return { formattedKey: digits, detectedType: pixKeyType };
  }

  return { formattedKey: trimmed.replace(/\s+/g, ''), detectedType: pixKeyType || 'random' };
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

  const rawCity = (tenant.pixConfig?.merchantCity || 'BELEM').trim();
  const explicitKeyType = tenant.pixConfig?.pixKeyType;
  const { formattedKey, detectedType } = formatPixKeyForBacen(rawKey, explicitKeyType, tenant.phone);
  const bankName = (tenant.pixConfig?.bankName || 'Conta Bancária do Proprietário').trim();

  return {
    pixKey: formattedKey,
    beneficiaryName: rawBeneficiary,
    merchantNameEmv: sanitizeEmvText(rawBeneficiary, 25, 'RESTAURANTE'),
    merchantCityEmv: sanitizeEmvText(rawCity, 15, 'BELEM'),
    pixKeyType: detectedType,
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
  pixKeyType?: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
  tenantPhone?: string;
  beneficiaryName: string;
  merchantCity?: string;
  amountCents: number;
  txid: string;
}): string {
  const amountStr = (Math.max(1, params.amountCents) / 100).toFixed(2);
  const { formattedKey } = formatPixKeyForBacen(params.pixKey, params.pixKeyType, params.tenantPhone);
  const emvMerchantName = sanitizeEmvText(params.beneficiaryName, 25, 'RESTAURANTE');
  const emvMerchantCity = sanitizeEmvText(params.merchantCity || 'BELEM', 15, 'BELEM');
  const cleanTxid = (params.txid || 'PEDIDO').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || 'PEDIDO';

  // Per BACEN BR Code manual:
  // - GUI (Subtag 00 of Tag 26) must be lowercase 'br.gov.bcb.pix'
  // - When using a direct Pix Key (Subtag 01 of Tag 26), Tag 01 ("12" Dynamic URL flag) MUST NOT be included,
  //   because Tag 01=12 is reserved exclusively for PSP JWS URLs (Subtag 25 of Tag 26).
  const merchantAccount = formatEMV('00', 'br.gov.bcb.pix') + formatEMV('01', formattedKey);
  const additionalData = formatEMV('05', cleanTxid);

  const payloadWithoutCrc =
    formatEMV('00', '01') +
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

