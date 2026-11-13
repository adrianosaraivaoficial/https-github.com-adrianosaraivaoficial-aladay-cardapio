import QRCode from 'qrcode';
import type { PaymentRepository, PixChargeEntity } from './repository.ts';
import type { GeneratePixDto, SimulatePixPaymentDto } from './validation.ts';
import type { ServiceResult } from '../common/types.ts';

export class PaymentService {
  constructor(private repository: PaymentRepository) {}

  // Compute CRC-16-CCITT (0x1021) per Banco Central EMV BR Code spec
  calculateCrc16(payload: string): string {
    let crc = 0xffff;
    for (let i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc = crc << 1;
        }
      }
    }
    return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  }

  generatePixEmvString(pixKey: string, merchantName: string, merchantCity: string, amountCents: number, txid: string): string {
    const formattedAmount = (amountCents / 100).toFixed(2);
    const cleanMerchant = merchantName.slice(0, 25).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const cleanCity = merchantCity.slice(0, 15).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const gui = '0014br.gov.bcb.pix';
    const key = `01${pixKey.length.toString().padStart(2, '0')}${pixKey}`;
    const mai = `${gui}${key}`;
    const field26 = `26${mai.length.toString().padStart(2, '0')}${mai}`;

    const field52 = '52040000'; // Merchant category
    const field53 = '5303986';  // BRL
    const field54 = `54${formattedAmount.length.toString().padStart(2, '0')}${formattedAmount}`;
    const field58 = '5802BR';
    const field59 = `59${cleanMerchant.length.toString().padStart(2, '0')}${cleanMerchant}`;
    const field60 = `60${cleanCity.length.toString().padStart(2, '0')}${cleanCity}`;

    const field05 = `05${txid.length.toString().padStart(2, '0')}${txid}`;
    const field62 = `62${field05.length.toString().padStart(2, '0')}${field05}`;

    const payloadWithoutCrc = `000201${field26}${field52}${field53}${field54}${field58}${field59}${field60}${field62}6304`;
    const crc = this.calculateCrc16(payloadWithoutCrc);
    return `${payloadWithoutCrc}${crc}`;
  }

  async generatePix(dto: GeneratePixDto): Promise<ServiceResult<{ txid: string; emvPayload: string; qrCodeBase64: string }>> {
    const txid = `ALADAY${Date.now().toString(36).toUpperCase()}`;
    const pixKey = 'financeiro@aladay.com.br';
    const emvPayload = this.generatePixEmvString(pixKey, 'Aladay Restaurante', 'SAO PAULO', dto.amountCents, txid);

    let qrCodeBase64 = '';
    try {
      qrCodeBase64 = await QRCode.toDataURL(emvPayload, { margin: 1, width: 300 });
    } catch {
      // ignore
    }

    const charge: PixChargeEntity = {
      id: `pix_${Date.now()}`,
      txid,
      orderId: dto.orderId,
      tenantSlug: dto.tenantSlug,
      amountCents: dto.amountCents,
      status: 'PENDING',
      emvPayload,
      qrCodeBase64,
      createdAt: new Date().toISOString(),
    };

    await this.repository.saveCharge(charge);

    return {
      success: true,
      data: { txid, emvPayload, qrCodeBase64 },
    };
  }

  async simulatePayment(dto: SimulatePixPaymentDto): Promise<ServiceResult<PixChargeEntity>> {
    const charge = await this.repository.markAsPaid(dto.txid);
    if (!charge) {
      return { success: false, error: 'Cobrança Pix não encontrada para o txid informado.', statusCode: 404 };
    }
    return { success: true, data: charge };
  }

  async getStatus(txid: string): Promise<ServiceResult<PixChargeEntity>> {
    const charge = await this.repository.findByTxid(txid);
    if (!charge) {
      return { success: false, error: 'Cobrança não encontrada.', statusCode: 404 };
    }
    return { success: true, data: charge };
  }
}
