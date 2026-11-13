export interface SanitizedWebhookLog {
  id: string;
  timestamp: string;
  source: string;
  eventType: string;
  instance: string;
  senderPhone: string;
  messageText: string;
  direction: 'inbound' | 'outbound';
  status: string;
  payloadSummary: string;
  fullPayload: any;
  tenantSlug?: string;
}

export class WebhookRepository {
  private logs: SanitizedWebhookLog[] = [];
  private readonly maxLogs = 100;

  addLog(log: SanitizedWebhookLog): void {
    this.logs.unshift(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
  }

  getLogs(instance?: string, tenantSlug?: string, limit = 30): SanitizedWebhookLog[] {
    let filtered = [...this.logs];
    if (tenantSlug && tenantSlug !== '*') {
      filtered = filtered.filter(
        (l) => l.tenantSlug === tenantSlug || l.instance.includes(tenantSlug) || !l.instance,
      );
    }
    if (instance) {
      filtered = filtered.filter((l) => l.instance === instance);
    }
    return filtered.slice(0, Math.min(limit, this.maxLogs));
  }

  count(): number {
    return this.logs.length;
  }
}
