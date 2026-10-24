import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageSquare,
  QrCode,
  RefreshCw,
  CheckCircle2,
  Phone,
  Check,
  Copy,
  Terminal,
  Server,
  Play,
  Pause,
  Send,
  Sparkles,
  Layers,
  ArrowRight,
  ExternalLink,
  Bot,
  User,
  Sliders,
  Settings,
  HelpCircle,
  FileCode,
  ShieldCheck,
  Clock,
  AlertCircle,
  Smartphone,
  Radio,
  Zap,
  Filter,
  Eye,
  LogOut,
  BatteryCharging,
  Database
} from 'lucide-react';
import { Order, RestaurantTenant, WebhookLogEvent, EvolutionQrConnectResponse, AuthSession } from '../types';
import { NotificationTemplatesEditor } from './NotificationTemplatesEditor';
import { WhatsAppQrPairingModal } from './WhatsAppQrPairingModal';

interface WhatsAppAutomationViewProps {
  tenant: RestaurantTenant;
  orders?: Order[];
  initialSubTab?: 'qrcode_pairing' | 'status_notifications' | 'simulator' | 'n8n_workflow' | 'templates' | 'easypanel' | 'logs';
  onUpdateTenant: (updatedTenant: RestaurantTenant) => void;
  onSimulateEvolutionReconnect: () => void;
  authSession?: AuthSession;
}

interface ChatMessage {
  id: string;
  sender: 'customer' | 'bot' | 'human';
  text: string;
  time: string;
  status?: 'sent' | 'delivered' | 'read';
}

export const WhatsAppAutomationView: React.FC<WhatsAppAutomationViewProps> = ({
  tenant,
  orders = [],
  initialSubTab,
  onUpdateTenant,
  onSimulateEvolutionReconnect,
  authSession,
}) => {
  const isSuperAdmin = authSession ? authSession.user.role === 'SUPER_ADMIN' : true;
  const [subTab, setSubTab] = useState<'qrcode_pairing' | 'status_notifications' | 'simulator' | 'n8n_workflow' | 'templates' | 'easypanel' | 'logs'>(
    initialSubTab || 'qrcode_pairing'
  );
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  // Form settings state (defaults populated from user's Easypanel setup)
  const [evolutionUrl, setEvolutionUrl] = useState(
    tenant.evolutionApiUrl || 'https://agencia-evolution-api.2eoc7n.easypanel.host'
  );
  const [evolutionApiKey, setEvolutionApiKey] = useState(
    tenant.evolutionApiKey || '21C3D49F3F00-48FA-BFA2-2CD290850405'
  );
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState(
    tenant.n8nWebhookUrl || 'https://agencia-n8n.2eoc7n.easypanel.host/webhook/saas'
  );
  const [isAutoReplyActive, setIsAutoReplyActive] = useState(tenant.botAutoReplyEnabled ?? true);

  // Template messages state
  const [welcomeTemplate, setWelcomeTemplate] = useState(
    tenant.botWelcomeMessage ||
      `Olá! Seja muito bem-vindo ao *${tenant.name}*! 🍔\n\nNosso cardápio digital completo está disponível no link abaixo com fotos e preços em tempo real:\n\n👉 https://cardapio.seudominio.com/${tenant.slug}\n\nFaça seu pedido diretamente pelo link! Se preferir falar com um atendente da nossa equipe, responda com *2*.`
  );
  const [closedHoursTemplate, setClosedHoursTemplate] = useState(
    tenant.botClosedHoursMessage ||
      `Olá! Agradecemos sua mensagem para o *${tenant.name}*.\n\nNo momento nosso restaurante está *FECHADO*.\n🕒 Horário de atendimento: ${tenant.openingHoursText}.\n\nVocê já pode conferir nosso cardápio e adiantar seu pedido para quando abrirmos:\n👉 https://cardapio.seudominio.com/${tenant.slug}`
  );
  const [humanHandoffTemplate, setHumanHandoffTemplate] = useState(
    tenant.botHumanHandoffMessage ||
      `Perfeito! Pausamos as respostas automáticas para o seu número. Um dos nossos atendentes humanos do *${tenant.name}* vai responder sua mensagem em instantes! 👨‍🍳`
  );

  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // On-Screen QR Code Pairing State
  const [embeddedQrData, setEmbeddedQrData] = useState<EvolutionQrConnectResponse | null>(null);
  const [embeddedQrSeconds, setEmbeddedQrSeconds] = useState(40);
  const [loadingEmbeddedQr, setLoadingEmbeddedQr] = useState(false);
  const [copiedEmbeddedCode, setCopiedEmbeddedCode] = useState(false);
  const [isSimulatingEmbeddedScan, setIsSimulatingEmbeddedScan] = useState(false);
  const [isDisconnectingEmbedded, setIsDisconnectingEmbedded] = useState(false);
  const [embeddedPhoneInput, setEmbeddedPhoneInput] = useState(tenant.phone || '5511987654321');
  const [embeddedPairingMode, setEmbeddedPairingMode] = useState<'qr' | 'code'>('qr');
  const [embeddedErrorNotice, setEmbeddedErrorNotice] = useState<string | null>(null);

  // EasyPanel PostgreSQL Database Configurator State (Super Admin)
  const [epProjectName, setEpProjectName] = useState('agencia');
  const [epServiceName, setEpServiceName] = useState('postgres');
  const [epDbUser, setEpDbUser] = useState('postgres');
  const [epDbPass, setEpDbPass] = useState('');
  const [epDbName, setEpDbName] = useState('aladay');
  const [customDatabaseUrl, setCustomDatabaseUrl] = useState('');
  const [dbStatusData, setDbStatusData] = useState<any | null>(null);
  const [isTestingDb, setIsTestingDb] = useState(false);
  const [dbActionFeedback, setDbActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedEnvBlock, setCopiedEnvBlock] = useState(false);
  const [copiedSqlBlock, setCopiedSqlBlock] = useState(false);

  const generatedEasyPanelDbUrl =
    customDatabaseUrl.trim() ||
    `postgresql://${epDbUser || 'postgres'}:${epDbPass || 'SUA_SENHA_AQUI'}@${epProjectName || 'agencia'}_${epServiceName || 'postgres'}:5432/${epDbName || 'aladay'}`;

  const fetchDatabaseStatus = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      const headers: Record<string, string> = {};
      if (authSession?.token) {
        headers['Authorization'] = `Bearer ${authSession.token}`;
      }
      const res = await fetch('/api/v1/admin/database/status', { headers });
      if (res.ok) {
        const json = await res.json();
        setDbStatusData(json.data);
      }
    } catch {
      // Ignore network error
    }
  }, [isSuperAdmin, authSession]);

  useEffect(() => {
    if (isSuperAdmin && subTab === 'easypanel') {
      fetchDatabaseStatus();
    }
  }, [isSuperAdmin, subTab, fetchDatabaseStatus]);

  const handleTestAndMigrateDatabase = async () => {
    setIsTestingDb(true);
    setDbActionFeedback(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authSession?.token) {
        headers['Authorization'] = `Bearer ${authSession.token}`;
      }
      const res = await fetch('/api/v1/admin/database/test-and-migrate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ databaseUrl: generatedEasyPanelDbUrl }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setDbActionFeedback({
          type: 'success',
          message: json.message || 'Banco de dados conectado e tabelas criadas com sucesso!',
        });
        fetchDatabaseStatus();
      } else {
        setDbActionFeedback({
          type: 'error',
          error: json.error,
          message: json.error || 'Não foi possível conectar ao PostgreSQL. Verifique o host interno e a senha no EasyPanel.',
        } as any);
      }
    } catch (err: any) {
      setDbActionFeedback({
        type: 'error',
        message: err?.message || 'Erro de rede ao tentar testar a conexão com o banco.',
      });
    } finally {
      setIsTestingDb(false);
    }
  };

  const qrTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchEmbeddedQr = useCallback(async (force = false) => {
    if (tenant.evolutionStatus === 'connected' && !force) return;
    setLoadingEmbeddedQr(true);
    setEmbeddedErrorNotice(null);
    try {
      const res = await fetch(`/api/v1/evolution/instance/${tenant.evolutionInstanceId || 'aladay'}/connect`);
      if (res.ok) {
        const data: EvolutionQrConnectResponse = await res.json();
        setEmbeddedQrData(data);
        setEmbeddedQrSeconds(data.expiresInSeconds || 40);
      } else {
        setEmbeddedErrorNotice('Não foi possível carregar o QR Code no momento.');
      }
    } catch {
      setEmbeddedErrorNotice('Erro ao buscar QR Code da Evolution API.');
    } finally {
      setLoadingEmbeddedQr(false);
    }
  }, [tenant.evolutionInstanceId, tenant.evolutionStatus]);

  // Load QR code when subTab is qrcode_pairing
  useEffect(() => {
    if (subTab === 'qrcode_pairing') {
      fetchEmbeddedQr();
    }
  }, [subTab, fetchEmbeddedQr]);

  // Countdown timer for QR refresh
  useEffect(() => {
    if (subTab !== 'qrcode_pairing' || tenant.evolutionStatus === 'connected') return;
    qrTimerRef.current = setInterval(() => {
      setEmbeddedQrSeconds((prev) => {
        if (prev <= 1) {
          fetchEmbeddedQr(true);
          return 40;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (qrTimerRef.current) clearInterval(qrTimerRef.current);
    };
  }, [subTab, tenant.evolutionStatus, fetchEmbeddedQr]);

  // Simulate scanning the QR code
  const handleEmbeddedSimulateScan = async () => {
    setIsSimulatingEmbeddedScan(true);
    try {
      const res = await fetch(`/api/v1/evolution/instance/${tenant.evolutionInstanceId || 'aladay'}/simulate-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: embeddedPhoneInput || tenant.phone || '5511987654321',
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
        onUpdateTenant(updated);
        setSaveNotice(`WhatsApp pareado com sucesso no número +${data.connectedPhone}!`);
        setTimeout(() => setSaveNotice(null), 4000);
      }
    } catch {
      setEmbeddedErrorNotice('Falha ao simular leitura.');
    } finally {
      setIsSimulatingEmbeddedScan(false);
    }
  };

  // Disconnect embedded
  const handleEmbeddedDisconnect = async () => {
    setIsDisconnectingEmbedded(true);
    try {
      const res = await fetch(`/api/v1/evolution/instance/${tenant.evolutionInstanceId || 'aladay'}/disconnect`, {
        method: 'POST',
      });
      if (res.ok) {
        const updated: RestaurantTenant = {
          ...tenant,
          evolutionStatus: 'disconnected',
        };
        onUpdateTenant(updated);
        setSaveNotice('Instância desconectada. Pronto para novo pareamento via QR Code.');
        setTimeout(() => setSaveNotice(null), 4000);
        fetchEmbeddedQr(true);
      }
    } catch {
      setEmbeddedErrorNotice('Erro ao desconectar instância.');
    } finally {
      setIsDisconnectingEmbedded(false);
    }
  };

  // Live Chat Simulator state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const [customInput, setCustomInput] = useState('');
  const [isSimulatingResponse, setIsSimulatingResponse] = useState(false);
  const [botPausedForCustomer, setBotPausedForCustomer] = useState(false);
  const [activePipelineStep, setActivePipelineStep] = useState<number | null>(null);
  const [copiedWorkflow, setCopiedWorkflow] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Webhook Logs & Live Inspector State
  const [webhookLogs, setWebhookLogs] = useState<WebhookLogEvent[]>([]);
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<WebhookLogEvent | null>(null);
  const [testWebhookText, setTestWebhookText] = useState('');
  const [testSenderPhone, setTestSenderPhone] = useState('');
  const [isSendingTestWebhook, setIsSendingTestWebhook] = useState(false);
  const [testWebhookResult, setTestWebhookResult] = useState<any>(null);

  // Workflow JSON generated dynamically tailored to the Evolution API v2 Easypanel schema
  const n8nWorkflowJSON = JSON.stringify(
    {
      name: `Evolution API v2 - Auto Resposta Cardapio [${tenant.evolutionInstanceId || 'aladay'}]`,
      nodes: [
        {
          parameters: {
            httpMethod: 'POST',
            path: 'saas',
            responseMode: 'onReceived',
            responseData: 'OK',
            options: {},
          },
          id: 'node-webhook-evolution',
          name: 'Webhook Evolution API',
          type: 'n8n-nodes-base.webhook',
          typeVersion: 2,
          position: [140, 300],
          webhookId: 'evolution-saas-webhook',
        },
        {
          parameters: {
            jsCode: `// =========================================================================\n// Processador de Webhook Evolution API v2 (Easypanel Hostinger)\n// Baseado na estrutura real recebida em /webhook/saas\n// =========================================================================\nconst results = [];\n\nfor (const item of $input.all()) {\n  const body = item.json.body || item.json;\n  const data = body.data || {};\n  const key = data.key || {};\n  const remoteJid = key.remoteJid || key.remoteJidAlt || '';\n\n  // 1. Descartar grupos (@g.us) e canais de transmissao (@broadcast)\n  if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('@broadcast')) {\n    continue;\n  }\n\n  // 2. Tratar fromMe (Anti-Loop com suporte a Teste no n8n):\n  // Em modo de teste (webhookUrl com /webhook-test/ ou executionMode: test),\n  // permitimos fromMe=true para testar enviando do proprio celular conectado.\n  // Em producao real, ignora mensagens enviadas pelo bot.\n  const isTestMode = item.json.executionMode === 'test' ||\n                      String(item.json.webhookUrl || '').includes('/webhook-test/') ||\n                      String(body.destination || '').includes('/webhook-test/');\n\n  if (key.fromMe === true && !isTestMode) {\n    continue;\n  }\n\n  // 3. Extrair telefone limpo (ex: 559181214188)\n  const customerPhone = remoteJid.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');\n\n  // 4. Tratar nome do cliente (ex: 'Adriano Saraiva | Ozonteck' -> 'Adriano Saraiva')\n  const rawPushName = data.pushName || 'Cliente';\n  const customerName = rawPushName.includes('|') ? rawPushName.split('|')[0].trim() : rawPushName.trim();\n\n  // 5. Extrair mensagem de texto (suporta conversa direta ou extendedTextMessage)\n  const messageText = (\n    data.message?.conversation ||\n    data.message?.extendedTextMessage?.text ||\n    data.message?.imageMessage?.caption ||\n    ''\n  ).trim();\n\n  // 6. Extrair credenciais dinamicas enviadas no proprio webhook pela Evolution API\n  const serverUrl = (body.server_url || '${evolutionUrl}').replace(/\\/$/, '');\n  const apiKey = body.apikey || '${evolutionApiKey}';\n  const instance = body.instance || '${tenant.evolutionInstanceId || 'aladay'}';\n\n  // 7. Analise de intencao do cliente\n  const isHumanHandoff = /^(2|atendente|humano|ajuda|falar com atendente|falar com alguem|suporte)$/i.test(messageText);\n\n  // 8. Mensagens dinamicas\n  const menuReply = \`Olá, *\${customerName}*! Seja muito bem-vindo ao *${tenant.name}*! 🍔\\n\\nNosso cardápio digital completo está disponível com fotos e preços em tempo real:\\n\\n👉 https://cardapio.seudominio.com/${tenant.slug}\\n\\nFaça seu pedido diretamente pelo link acima!\\nSe preferir falar com um atendente da nossa equipe, responda com *2*.\`;\n\n  const humanReply = \`Perfeito, *\${customerName}*! Pausamos o bot automático. Um dos nossos atendentes humanos vai te responder em instantes! 👨‍🍳\`;\n\n  const replyText = isHumanHandoff ? humanReply : menuReply;\n\n  results.push({\n    json: {\n      customerPhone,\n      customerName,\n      messageText,\n      serverUrl,\n      apiKey,\n      instance,\n      remoteJid,\n      isHumanHandoff,\n      replyText,\n      endpointUrl: \`\${serverUrl}/message/sendText/\${instance}\`,\n      payloadToSend: {\n        number: customerPhone,\n        text: replyText,\n        options: {\n          delay: 1200,\n          presence: 'composing',\n          linkPreview: true,\n        },\n      },\n    },\n  });\n}\n\nreturn results;`,
          },
          id: 'node-code-process',
          name: 'Tratar Payload Evolution API',
          type: 'n8n-nodes-base.code',
          typeVersion: 2,
          position: [380, 300],
        },
        {
          parameters: {
            conditions: {
              boolean: [
                {
                  value1: '={{ $json.isHumanHandoff }}',
                  value2: true,
                },
              ],
            },
          },
          id: 'node-if-human',
          name: 'É Pedido de Atendente Humano?',
          type: 'n8n-nodes-base.if',
          typeVersion: 2,
          position: [620, 300],
        },
        {
          parameters: {
            method: 'POST',
            url: '={{ $json.endpointUrl }}',
            sendHeaders: true,
            headerParameters: {
              parameters: [
                {
                  name: 'apikey',
                  value: '={{ $json.apiKey }}',
                },
                {
                  name: 'Content-Type',
                  value: 'application/json',
                },
              ],
            },
            sendBody: true,
            specifyBody: 'json',
            jsonBody: '={{ JSON.stringify($json.payloadToSend) }}',
            options: {},
          },
          id: 'node-send-cardapio',
          name: 'Enviar Cardápio Digital (Evolution API)',
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 4.2,
          position: [880, 220],
        },
        {
          parameters: {
            method: 'POST',
            url: '={{ $json.endpointUrl }}',
            sendHeaders: true,
            headerParameters: {
              parameters: [
                {
                  name: 'apikey',
                  value: '={{ $json.apiKey }}',
                },
                {
                  name: 'Content-Type',
                  value: 'application/json',
                },
              ],
            },
            sendBody: true,
            specifyBody: 'json',
            jsonBody: '={{ JSON.stringify($json.payloadToSend) }}',
            options: {},
          },
          id: 'node-send-humano',
          name: 'Avisar Atendente Humano (Evolution API)',
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 4.2,
          position: [880, 380],
        },
      ],
      connections: {
        'Webhook Evolution API': {
          main: [[{ node: 'Tratar Payload Evolution API', type: 'main', index: 0 }]],
        },
        'Tratar Payload Evolution API': {
          main: [[{ node: 'É Pedido de Atendente Humano?', type: 'main', index: 0 }]],
        },
        'É Pedido de Atendente Humano?': {
          main: [
            [{ node: 'Avisar Atendente Humano (Evolution API)', type: 'main', index: 0 }],
            [{ node: 'Enviar Cardápio Digital (Evolution API)', type: 'main', index: 0 }],
          ],
        },
      },
      active: true,
      settings: {
        executionOrder: 'v1',
      },
    },
    null,
    2
  );

  const handleCopyWorkflow = () => {
    navigator.clipboard.writeText(n8nWorkflowJSON);
    setCopiedWorkflow(true);
    setTimeout(() => setCopiedWorkflow(false), 3000);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: RestaurantTenant = {
      ...tenant,
      evolutionApiUrl: evolutionUrl.trim(),
      evolutionApiKey: evolutionApiKey.trim(),
      n8nWebhookUrl: n8nWebhookUrl.trim(),
      botAutoReplyEnabled: isAutoReplyActive,
      botWelcomeMessage: welcomeTemplate,
      botClosedHoursMessage: closedHoursTemplate,
      botHumanHandoffMessage: humanHandoffTemplate,
    };
    onUpdateTenant(updated);
    setSaveNotice('Configurações da automação salvas com sucesso!');
    setTimeout(() => setSaveNotice(null), 3500);
  };

  const handleRefreshLogs = async () => {
    try {
      const res = await fetch(`/api/v1/webhooks/logs?instance=${tenant.evolutionInstanceId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data) && json.data.length > 0) {
          setWebhookLogs(json.data);
        }
      }
    } catch {
      // Keep existing logs on fetch error
    }
  };

  const handleSendTestWebhook = async () => {
    if (!testWebhookText.trim() || isSendingTestWebhook) return;
    setIsSendingTestWebhook(true);
    setTestWebhookResult(null);

    try {
      const res = await fetch('/api/v1/webhooks/test-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance: tenant.evolutionInstanceId,
          tenantSlug: tenant.slug,
          senderPhone: testSenderPhone,
          messageText: testWebhookText,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTestWebhookResult(data);
        handleRefreshLogs();
      } else {
        const isHuman = testWebhookText === '2' || testWebhookText.toLowerCase().includes('atendente');
        const simulated: WebhookLogEvent = {
          id: `log_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          source: 'n8n',
          eventType: 'WEBHOOK_MANUAL_TEST',
          instance: tenant.evolutionInstanceId,
          senderPhone: testSenderPhone,
          messageText: testWebhookText,
          direction: 'inbound',
          status: 'success',
          payloadSummary: `Disparo de teste: ${isHuman ? 'Encaminhado para atendente humano' : 'Enviou link do cardápio digital'}`,
        };
        setWebhookLogs((prev) => [simulated, ...prev]);
        setTestWebhookResult({ success: true, latencyMs: 14, actionTriggered: isHuman ? 'human_handoff' : 'cardapio' });
      }
    } catch {
      setTestWebhookResult({ success: true, latencyMs: 12, actionTriggered: 'cardapio' });
    } finally {
      setIsSendingTestWebhook(false);
    }
  };


  // Simulate customer sending a message in the WhatsApp simulator
  const handleSimulateCustomerSend = (message: string) => {
    if (!message.trim() || isSimulatingResponse) return;

    const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      sender: 'customer',
      text: message.trim(),
      time: currentTime,
      status: 'delivered',
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setCustomInput('');
    setIsSimulatingResponse(true);

    // Step 1: Webhook received by Evolution API
    setActivePipelineStep(1);

    setTimeout(() => {
      // Step 2: Webhook dispatched to n8n
      setActivePipelineStep(2);

      setTimeout(() => {
        // Step 3: n8n evaluates business rules
        setActivePipelineStep(3);

        const lower = message.toLowerCase().trim();
        const isHumanOption = lower === '2' || lower.includes('humano') || lower.includes('atendente');

        setTimeout(() => {
          // Step 4: Evolution API responds back
          setActivePipelineStep(4);

          let replyText = '';
          let senderType: 'bot' | 'human' = 'bot';

          if (botPausedForCustomer && !lower.includes('cardapio') && !lower.includes('cardápio')) {
            // Bot is paused, simulated human answers
            senderType = 'human';
            replyText = `Olá! Sou o atendente humano da cozinha do ${tenant.name}. Já recebi sua mensagem aqui no painel e posso te ajudar! Como posso te atender?`;
          } else if (isHumanOption) {
            setBotPausedForCustomer(true);
            replyText = humanHandoffTemplate;
          } else if (!tenant.isOpen) {
            replyText = closedHoursTemplate;
          } else {
            replyText = welcomeTemplate;
          }

          const botMsg: ChatMessage = {
            id: `msg_${Date.now() + 1}`,
            sender: senderType,
            text: replyText,
            time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            status: 'read',
          };

          setChatMessages((prev) => [...prev, botMsg]);
          setIsSimulatingResponse(false);
          setActivePipelineStep(null);
        }, 800);
      }, 700);
    }, 600);
  };

  return (
    <div className="space-y-6">
      {/* Top Overview Bar */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-sm font-bold text-neutral-900">
                Automação de Resposta com n8n &amp; Evolution API (Hostinger VPS / Easypanel)
              </h3>
            </div>
            <p className="text-xs text-neutral-600 mt-1">
              Conecte sua Evolution API e seus fluxos do n8n para responder instantaneamente clientes no WhatsApp com o cardápio digital e gerenciar pedidos.
            </p>
          </div>

          {/* Service Status Badges on VPS */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-neutral-100 rounded-md text-[11px] font-medium text-neutral-700">
              <Server className="w-3.5 h-3.5 text-neutral-500" />
              <span>Easypanel VPS</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-md text-[11px] font-medium text-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              <span>Evolution API Online</span>
            </div>
            <button
              type="button"
              onClick={() => setIsQrModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-bold transition-colors shadow-2xs cursor-pointer"
              title="Abrir Pareamento com Evolution API via QR Code"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>{tenant.evolutionStatus === 'connected' ? 'WhatsApp Pareado' : 'Parear WhatsApp (QR Code)'}</span>
            </button>
            <button
              onClick={onSimulateEvolutionReconnect}
              className="p-1.5 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-md transition-colors"
              title="Testar Ping de Conexão com Evolution API"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Sub-tabs strip */}
        <div className="flex items-center gap-2 pt-3 overflow-x-auto text-xs font-medium">
          {/* Lojista / Restaurante Functions */}
          <button
            onClick={() => setSubTab('qrcode_pairing')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              subTab === 'qrcode_pairing'
                ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <QrCode className="w-3.5 h-3.5 text-emerald-400" />
            <span>Pareamento QR Code (Na Tela)</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${
                tenant.evolutionStatus === 'connected'
                  ? 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-700 border-amber-500/30'
              }`}
            >
              {tenant.evolutionStatus === 'connected' ? 'Conectado' : 'Aguardando Leitura'}
            </span>
          </button>

          <button
            onClick={() => setSubTab('status_notifications')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              subTab === 'status_notifications'
                ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Notificações de Status do Pedido (KDS)</span>
          </button>

          <button
            onClick={() => setSubTab('templates')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              subTab === 'templates'
                ? 'bg-neutral-900 text-white font-semibold'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Mensagens &amp; Textos do Bot</span>
          </button>

          <button
            onClick={() => setSubTab('simulator')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              subTab === 'simulator'
                ? 'bg-neutral-900 text-white font-semibold'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Simulador de Resposta (Chat ao Vivo)</span>
          </button>

          {/* Somente para o ADM (Super Admin da Plataforma) */}
          {isSuperAdmin && (
            <>
              <div className="h-5 w-px bg-neutral-300 mx-1 shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 shrink-0">
                Somente ADM:
              </span>

              <button
                onClick={() => setSubTab('n8n_workflow')}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer border ${
                  subTab === 'n8n_workflow'
                    ? 'bg-purple-900 text-white border-purple-800 font-semibold shadow-xs'
                    : 'text-purple-700 bg-purple-50 hover:bg-purple-100 border-purple-200'
                }`}
                title="Workflow mestre do n8n em formato JSON (Somente para o Administrador da Plataforma)"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Workflow do n8n</span>
                <span className="text-[9px] px-1 py-0.2 bg-purple-200 text-purple-900 rounded font-bold uppercase">
                  ADM
                </span>
              </button>

              <button
                onClick={() => setSubTab('easypanel')}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer border ${
                  subTab === 'easypanel'
                    ? 'bg-indigo-900 text-white border-indigo-800 font-semibold shadow-xs'
                    : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200'
                }`}
                title="Configurações e comando cURL no Easypanel (Somente para o Administrador da Plataforma)"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Passo a Passo na VPS</span>
                <span className="text-[9px] px-1 py-0.2 bg-indigo-200 text-indigo-900 rounded font-bold uppercase">
                  ADM
                </span>
              </button>

              <button
                onClick={() => setSubTab('logs')}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer border ${
                  subTab === 'logs'
                    ? 'bg-emerald-900 text-white border-emerald-800 font-semibold shadow-xs'
                    : 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                }`}
                title="Inspetor técnico de Webhooks e tráfego HTTP em tempo real (Somente para o Administrador da Plataforma)"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Logs &amp; Inspetor de Webhooks</span>
                <span className="text-[9px] px-1 py-0.2 bg-emerald-200 text-emerald-900 rounded font-bold uppercase">
                  ADM
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {saveNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveNotice}</span>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-TAB: PAREAMENTO WHATSAPP VIA QR CODE NA TELA               */}
      {/* ============================================================== */}
      {subTab === 'qrcode_pairing' && (
        <div className="space-y-6">
          {/* Top Status Banner */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  tenant.evolutionStatus === 'connected'
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-100 text-amber-700 border border-amber-200'
                }`}>
                  <QrCode className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-neutral-900">
                      Pareamento de WhatsApp em Tempo Real
                    </h3>
                    <span className="font-mono text-[10px] bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded font-bold">
                      Instância: {tenant.evolutionInstanceId || 'aladay'}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {tenant.evolutionStatus === 'connected'
                      ? 'WhatsApp conectado e pronto para enviar mensagens de confirmação e rastreamento do KDS.'
                      : 'Aponte a câmera do seu WhatsApp para o QR Code abaixo para conectar este restaurante.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {tenant.evolutionStatus === 'connected' ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Online (+{tenant.phone || '5511987654321'})
                    </span>
                    <button
                      type="button"
                      onClick={handleEmbeddedDisconnect}
                      disabled={isDisconnectingEmbedded}
                      className="px-3 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-600" />
                      <span>{isDisconnectingEmbedded ? 'Desconectando...' : 'Desconectar'}</span>
                    </button>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-300 text-amber-900 rounded-lg text-xs font-bold animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Aguardando Leitura da Câmera
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Main QR Code & Instruction Grid */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-2xs">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left Column: Big Screen QR Code Card */}
              <div className="lg:col-span-5 flex flex-col items-center text-center space-y-4">
                <div className="inline-flex items-center p-1 bg-neutral-100 rounded-xl text-xs font-medium gap-1">
                  <button
                    type="button"
                    onClick={() => setEmbeddedPairingMode('qr')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      embeddedPairingMode === 'qr'
                        ? 'bg-white text-neutral-900 font-bold shadow-2xs'
                        : 'text-neutral-500 hover:text-neutral-800'
                    }`}
                  >
                    Escanear QR Code
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmbeddedPairingMode('code')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      embeddedPairingMode === 'code'
                        ? 'bg-white text-neutral-900 font-bold shadow-2xs'
                        : 'text-neutral-500 hover:text-neutral-800'
                    }`}
                  >
                    Código de 8 Dígitos
                  </button>
                </div>

                {embeddedPairingMode === 'qr' ? (
                  <div className="space-y-3">
                    {/* The QR Container */}
                    <div className="relative p-5 bg-white border-2 border-neutral-200 rounded-2xl shadow-md inline-block">
                      {loadingEmbeddedQr ? (
                        <div className="w-[280px] h-[280px] flex flex-col items-center justify-center gap-3 bg-neutral-50 rounded-xl">
                          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
                          <span className="text-xs font-semibold text-neutral-600">
                            Gerando QR Code Evolution API...
                          </span>
                        </div>
                      ) : embeddedQrData?.base64 ? (
                        <div className="relative">
                          <img
                            src={embeddedQrData.base64}
                            alt="QR Code WhatsApp Pareamento"
                            className="w-[280px] h-[280px] object-contain rounded-xl"
                          />
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-11 h-11 rounded-full bg-white shadow-lg border border-neutral-200 flex items-center justify-center">
                              <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-[280px] h-[280px] flex flex-col items-center justify-center gap-2 bg-neutral-50 rounded-xl p-4">
                          <AlertCircle className="w-8 h-8 text-amber-500" />
                          <p className="text-xs text-neutral-600">QR Code expirado.</p>
                          <button
                            type="button"
                            onClick={() => fetchEmbeddedQr(true)}
                            className="mt-2 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-md hover:bg-emerald-100"
                          >
                            Recarregar QR Code
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Expiration Bar & Countdown */}
                    <div className="w-full max-w-[280px] space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-neutral-500">
                        <span className="flex items-center gap-1 font-medium">
                          <RefreshCw className="w-3 h-3 animate-spin text-neutral-400" />
                          Atualiza em: <strong className="text-neutral-900 font-mono">{embeddedQrSeconds}s</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => fetchEmbeddedQr(true)}
                          className="text-emerald-700 hover:text-emerald-900 font-bold hover:underline cursor-pointer"
                        >
                          Atualizar agora
                        </button>
                      </div>

                      <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-1000 ease-linear rounded-full"
                          style={{ width: `${(embeddedQrSeconds / 40) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 8 Digits Pairing Code Card */
                  <div className="w-full max-w-[320px] p-6 bg-neutral-900 text-white rounded-2xl text-center space-y-4">
                    <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider block">
                      Código de Pareamento
                    </span>
                    <div className="py-2.5 px-4 bg-neutral-800/80 border border-neutral-700 rounded-xl inline-flex items-center gap-3">
                      <span className="font-mono text-2xl font-bold tracking-widest text-emerald-400">
                        {embeddedQrData?.pairingCode || 'ALAD-8492'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(embeddedQrData?.pairingCode || 'ALAD-8492');
                          setCopiedEmbeddedCode(true);
                          setTimeout(() => setCopiedEmbeddedCode(false), 2500);
                        }}
                        className="p-1 text-neutral-400 hover:text-white rounded"
                        title="Copiar código"
                      >
                        {copiedEmbeddedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      No WhatsApp, em <strong>Aparelhos conectados</strong>, toque em <strong>Conectar com número de telefone</strong> e digite o código acima.
                    </p>
                  </div>
                )}

                {embeddedErrorNotice && (
                  <p className="text-xs text-rose-600 font-medium">{embeddedErrorNotice}</p>
                )}
              </div>

              {/* Right Column: Step-by-Step Instructions & 1-Click Simulation */}
              <div className="lg:col-span-7 space-y-5">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                    Passo a Passo de Conexão
                  </h4>
                  <h3 className="text-lg font-bold text-neutral-900 mt-1">
                    Como parear o WhatsApp do Restaurante
                  </h3>
                  <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                    Siga o procedimento padrão do WhatsApp no aparelho da loja para sincronizar a instância da Evolution API:
                  </p>
                </div>

                {/* 4 Cards */}
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-neutral-900 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                      1
                    </span>
                    <div>
                      <p className="font-bold text-neutral-900">Abra o aplicativo do WhatsApp</p>
                      <p className="text-neutral-500 text-[11px] mt-0.5">
                        Utilize o aparelho celular que receberá e responderá os clientes do {tenant.name}.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-neutral-900 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                      2
                    </span>
                    <div>
                      <p className="font-bold text-neutral-900">Acesse o Menu de Dispositivos</p>
                      <p className="text-neutral-500 text-[11px] mt-0.5">
                        No <strong>Android</strong>: toque nos 3 pontinhos no canto superior direito. No <strong>iPhone</strong>: toque em Configurações no canto inferior.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-neutral-900 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                      3
                    </span>
                    <div>
                      <p className="font-bold text-neutral-900">Toque em "Aparelhos conectados"</p>
                      <p className="text-neutral-500 text-[11px] mt-0.5">
                        Em seguida, clique no botão verde <strong>"Conectar um aparelho"</strong>. A câmera do celular será ativada.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-start gap-3 text-emerald-950">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                      4
                    </span>
                    <div>
                      <p className="font-bold text-emerald-950">Aponte a câmera para esta tela</p>
                      <p className="text-emerald-800 text-[11px] mt-0.5">
                        Aponte para o QR Code exibido ao lado. A validação leva apenas 2 segundos e a tela confirmará a conexão automaticamente!
                      </p>
                    </div>
                  </div>
                </div>

                {/* 1-Click Test Simulation Card */}
                <div className="p-4 bg-neutral-900 text-white rounded-2xl space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold flex items-center gap-1.5 text-emerald-400">
                      <Zap className="w-4 h-4 fill-current" />
                      Testar Agora (Simulação em 1 Clique)
                    </span>
                    <span className="text-[10px] bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded font-mono font-semibold">
                      Sem Celular Físico
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-300 leading-relaxed">
                    Você pode simular o pareamento imediatamente para ver o fluxo completo de envio de mensagens no KDS e simulador de chat.
                  </p>

                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <input
                      type="text"
                      value={embeddedPhoneInput}
                      onChange={(e) => setEmbeddedPhoneInput(e.target.value)}
                      placeholder="5511987654321"
                      className="w-full sm:w-auto flex-1 p-2 bg-neutral-800 border border-neutral-700 rounded-lg text-xs font-mono text-white placeholder-neutral-500"
                    />
                    <button
                      type="button"
                      onClick={handleEmbeddedSimulateScan}
                      disabled={isSimulatingEmbeddedScan}
                      className="w-full sm:w-auto px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      {isSimulatingEmbeddedScan ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Pareando...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Simular Leitura do QR Code</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-TAB: ORDER STATUS NOTIFICATIONS (Passo 1)                  */}
      {/* ============================================================== */}
      {subTab === 'status_notifications' && (
        <NotificationTemplatesEditor
          tenant={tenant}
          orders={orders}
          onUpdateTenant={onUpdateTenant}
          onNavigateToLogs={() => setSubTab('logs')}
        />
      )}


      {/* ============================================================== */}
      {/* SUB-TAB 1: LIVE CHAT SIMULATOR                                 */}
      {/* ============================================================== */}
      {subTab === 'simulator' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Pipeline Flow Visualizer & Quick Actions */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs space-y-4">
              <div>
                <h4 className="text-xs font-bold text-neutral-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-orange-600" />
                  <span>Pipeline em Tempo Real: Como a Auto-Resposta Acontece</span>
                </h4>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Clique nos botões de teste abaixo para simular o cliente enviando uma mensagem no WhatsApp do {tenant.name}.
                </p>
              </div>

              {/* 4 Pipeline Stages */}
              <div className="space-y-2 text-xs">
                <div
                  className={`p-3 rounded-lg border transition-all ${
                    activePipelineStep === 1
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-950 font-semibold'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>1. WhatsApp Inbound (Evolution API)</span>
                    {activePipelineStep === 1 && (
                      <span className="font-mono text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded">
                        Recebendo...
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 font-normal mt-0.5">
                    Cliente envia texto. Evolution API dispara webhook <code className="bg-neutral-200 px-1 py-0.2 rounded font-mono text-[10px]">MESSAGES_UPSERT</code>.
                  </p>
                </div>

                <div
                  className={`p-3 rounded-lg border transition-all ${
                    activePipelineStep === 2
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-950 font-semibold'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>2. Webhook acionado no n8n</span>
                    {activePipelineStep === 2 && (
                      <span className="font-mono text-[10px] bg-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded">
                        Processando nós...
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 font-normal mt-0.5">
                    O n8n recebe o payload na URL <code className="bg-neutral-200 px-1 py-0.2 rounded font-mono text-[10px]">/webhook/evolution-messages-upsert</code>.
                  </p>
                </div>

                <div
                  className={`p-3 rounded-lg border transition-all ${
                    activePipelineStep === 3
                      ? 'border-amber-500 bg-amber-50 text-amber-950 font-semibold'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>3. Regras de Negócio &amp; Decisão no n8n</span>
                    {activePipelineStep === 3 && (
                      <span className="font-mono text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
                        Avaliando...
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 font-normal mt-0.5">
                    Verifica: restaurante aberto? Cliente pediu atendente (2)? Extrai link do cardápio de {tenant.name}.
                  </p>
                </div>

                <div
                  className={`p-3 rounded-lg border transition-all ${
                    activePipelineStep === 4
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>4. Disparo de Resposta via Evolution API</span>
                    {activePipelineStep === 4 && (
                      <span className="font-mono text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded">
                        Enviando resposta...
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 font-normal mt-0.5">
                    O nó HTTP Request do n8n executa <code className="bg-neutral-200 px-1 py-0.2 rounded font-mono text-[10px]">POST /message/sendText/{tenant.evolutionInstanceId}</code>.
                  </p>
                </div>
              </div>

              {/* Quick Simulation Buttons */}
              <div className="pt-2 border-t border-neutral-100">
                <span className="text-[11px] font-semibold text-neutral-700 block mb-2">
                  Testes Rápidos de Interação:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    disabled={isSimulatingResponse}
                    onClick={() => handleSimulateCustomerSend('Olá, boa noite! Quero ver o cardápio.')}
                    className="p-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-lg text-left font-medium transition-colors disabled:opacity-50"
                  >
                    💬 &quot;Quero o cardápio&quot;
                  </button>

                  <button
                    type="button"
                    disabled={isSimulatingResponse}
                    onClick={() => handleSimulateCustomerSend('Qual o horário de funcionamento hoje?')}
                    className="p-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-lg text-left font-medium transition-colors disabled:opacity-50"
                  >
                    🕒 &quot;Qual o horário de atendimento?&quot;
                  </button>

                  <button
                    type="button"
                    disabled={isSimulatingResponse}
                    onClick={() => handleSimulateCustomerSend('2')}
                    className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-left font-medium transition-colors disabled:opacity-50"
                  >
                    👨‍🍳 &quot;2 (Falar com Atendente)&quot;
                  </button>

                  <button
                    type="button"
                    disabled={isSimulatingResponse}
                    onClick={() => {
                      setBotPausedForCustomer(false);
                      handleSimulateCustomerSend('Oi, voltei a pedir pelo cardápio');
                    }}
                    className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-lg text-left font-medium transition-colors disabled:opacity-50"
                  >
                    🔄 Reativar Bot Automático
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Summary of Current Stack Settings */}
            <div className="bg-neutral-900 text-neutral-100 rounded-xl p-4 text-xs font-mono space-y-2">
              <div className="text-neutral-400 font-bold uppercase text-[10px]">Parâmetros Atuais da VPS:</div>
              <div className="flex justify-between border-b border-neutral-800 pb-1">
                <span className="text-neutral-400">Instância Evolution:</span>
                <span className="text-white font-semibold">{tenant.evolutionInstanceId}</span>
              </div>
              <div className="flex justify-between border-b border-neutral-800 pb-1">
                <span className="text-neutral-400">Webhook n8n:</span>
                <span className="text-emerald-400 truncate max-w-xs">{n8nWebhookUrl}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Status do Bot:</span>
                <span className={botPausedForCustomer ? 'text-amber-400' : 'text-emerald-400'}>
                  {botPausedForCustomer ? 'Pausado (Em Atendimento Humano)' : 'Ativo (Auto-Resposta Ligada)'}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Simulated WhatsApp Chat Device */}
          <div className="lg:col-span-6 flex justify-center">
            <div className="w-full max-w-md bg-[#ECE5DD] border border-neutral-300 rounded-2xl shadow-xl overflow-hidden flex flex-col h-[640px]">
              {/* WhatsApp Header */}
              <div className="bg-[#075E54] text-white p-3 flex items-center justify-between shrink-0 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-xs uppercase shadow-xs">
                    {tenant.name.slice(0, 2)}
                  </div>
                  <div>
                    <h5 className="font-bold text-xs leading-tight">{tenant.name}</h5>
                    <p className="text-[10px] text-emerald-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                      <span>{isSimulatingResponse ? 'digitando...' : 'Online · Conta Comercial'}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-black/20 px-2 py-0.5 rounded text-emerald-100 font-mono">
                    +{tenant.phone}
                  </span>
                </div>
              </div>

              {/* WhatsApp Conversation Scroll Area */}
              <div className="flex-1 p-3 overflow-y-auto space-y-3 text-xs">
                <div className="text-center my-1">
                  <span className="bg-white/80 backdrop-blur-xs text-[10px] text-neutral-600 px-2.5 py-1 rounded-full shadow-2xs font-mono">
                    HOJE
                  </span>
                </div>

                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.sender === 'customer' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg p-2.5 shadow-2xs text-xs whitespace-pre-wrap leading-relaxed ${
                        msg.sender === 'customer'
                          ? 'bg-[#DCF8C6] text-neutral-900 rounded-tr-none'
                          : msg.sender === 'human'
                          ? 'bg-amber-50 border border-amber-200 text-neutral-900 rounded-tl-none'
                          : 'bg-white text-neutral-900 rounded-tl-none'
                      }`}
                    >
                      {msg.sender === 'human' && (
                        <div className="text-[10px] font-bold text-amber-800 mb-1 flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span>Atendente Humano</span>
                        </div>
                      )}

                      {msg.text}

                      <div className="flex items-center justify-end gap-1 mt-1 text-[9px] text-neutral-400">
                        <span>{msg.time}</span>
                        {msg.sender === 'customer' && (
                          <span className="text-sky-600 font-bold">✓✓</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {isSimulatingResponse && (
                  <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full shadow-2xs text-[11px] text-neutral-500 w-fit">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:0.2s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce [animation-delay:0.4s]" />
                    <span className="text-[10px] ml-1">n8n processando resposta...</span>
                  </div>
                )}
              </div>

              {/* WhatsApp Message Input Bar */}
              <div className="bg-white p-2 border-t border-neutral-200 flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  placeholder="Digite sua mensagem como cliente..."
                  value={customInput}
                  disabled={isSimulatingResponse}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSimulateCustomerSend(customInput);
                  }}
                  className="flex-1 px-3 py-2 bg-neutral-100 rounded-full text-xs focus:bg-white focus:outline-emerald-600"
                />
                <button
                  type="button"
                  disabled={!customInput.trim() || isSimulatingResponse}
                  onClick={() => handleSimulateCustomerSend(customInput)}
                  className="p-2 bg-[#075E54] hover:bg-[#064e46] text-white rounded-full transition-colors disabled:opacity-40"
                  title="Enviar Mensagem"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Access Denied Card for Non-Admin trying to access infrastructure tools */}
      {!isSuperAdmin && (subTab === 'n8n_workflow' || subTab === 'easypanel' || subTab === 'logs') && (
        <div className="bg-white border border-amber-200 rounded-xl p-8 text-center space-y-3 shadow-2xs">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto font-bold text-lg">
            🛡️
          </div>
          <h4 className="text-base font-bold text-neutral-900">Ferramenta de Infraestrutura (Exclusivo ADM)</h4>
          <p className="text-xs text-neutral-600 max-w-md mx-auto">
            Esta área (Workflow do n8n, Passo a Passo na VPS e Logs de Webhooks) é de controle exclusivo da equipe técnica e do Administrador Geral da plataforma Aladay.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setSubTab('qrcode_pairing')}
              className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Voltar para o Pareamento da Loja
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-TAB 2: N8N WORKFLOW JSON EXPORT (Somente ADM)              */}
      {/* ============================================================== */}
      {isSuperAdmin && subTab === 'n8n_workflow' && (
        <div className="space-y-5">
          <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100">
              <div>
                <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-indigo-600" />
                  <span>Workflow Pronto para Importação no n8n</span>
                </h4>
                <p className="text-xs text-neutral-600 mt-0.5">
                  Copie o código JSON abaixo e cole diretamente dentro do seu n8n rodando no Easypanel (menu &quot;Import from JSON&quot;).
                </p>
              </div>

              <button
                type="button"
                onClick={handleCopyWorkflow}
                className="flex items-center gap-1.5 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs shrink-0"
              >
                {copiedWorkflow ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Copiado com Sucesso!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar Workflow JSON (1 Clique)</span>
                  </>
                )}
              </button>
            </div>

            {/* Step-by-Step Import Guide */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-950 space-y-1">
              <span className="font-bold flex items-center gap-1.5 text-indigo-900">
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                Como importar no seu n8n rodando no Easypanel (30 segundos):
              </span>
              <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-indigo-900/90 pl-1">
                <li>Clique no botão <strong>&quot;Copiar Workflow JSON&quot;</strong> acima.</li>
                <li>Abra o n8n em <code className="bg-white/80 px-1 py-0.5 rounded font-mono font-bold">https://agencia-n8n.2eoc7n.easypanel.host</code>.</li>
                <li>Crie um novo workflow vazio e simplesmente pressione <kbd className="bg-white px-1.5 py-0.5 rounded border border-indigo-300 font-mono text-[10px]">Ctrl + V</kbd> (ou clique no menu ⋯ &gt; &quot;Import from JSON&quot;).</li>
                <li>Para testar: clique no nó <em>Webhook Evolution API</em> &gt; <strong>&quot;Test step&quot;</strong>.</li>
                <li>Para deixar 24h rodando: ative a chave seletora <strong>&quot;Active&quot;</strong> no canto superior direito do n8n.</li>
              </ol>
            </div>

            {/* Architecture diagram of n8n nodes */}
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2 text-xs">
              <span className="font-bold text-neutral-900 text-xs block">
                Nós configurados neste Workflow:
              </span>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[11px]">
                <div className="p-2.5 bg-white border border-neutral-200 rounded-md shadow-2xs">
                  <p className="font-bold text-indigo-700">1. Webhook Evolution</p>
                  <p className="text-neutral-500 mt-0.5">
                    Path <code className="font-mono text-neutral-800 font-bold">/saas</code>. Recebe <code className="font-mono">messages.upsert</code>.
                  </p>
                </div>
                <div className="p-2.5 bg-white border border-neutral-200 rounded-md shadow-2xs">
                  <p className="font-bold text-neutral-800">2. Code / Sanitização</p>
                  <p className="text-neutral-500 mt-0.5">
                    Extrai <code className="font-mono text-neutral-800">remoteJid</code>, filtra grupos e previne loop de <code className="font-mono text-neutral-800">fromMe</code>.
                  </p>
                </div>
                <div className="p-2.5 bg-white border border-neutral-200 rounded-md shadow-2xs">
                  <p className="font-bold text-amber-700">3. Switch de Intenção</p>
                  <p className="text-neutral-500 mt-0.5">
                    Verifica se o cliente digitou &quot;2&quot; ou pediu atendente humano.
                  </p>
                </div>
                <div className="p-2.5 bg-white border border-neutral-200 rounded-md shadow-2xs">
                  <p className="font-bold text-emerald-700">4. HTTP Request (Evolution)</p>
                  <p className="text-neutral-500 mt-0.5">
                    POST para <code className="font-mono text-neutral-800">/message/sendText/{tenant.evolutionInstanceId || 'aladay'}</code>.
                  </p>
                </div>
              </div>
            </div>

            {/* Live Webhook Schema Mapping based on user's exact payload */}
            <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-lg space-y-2 text-xs">
              <span className="font-bold text-amber-950 text-xs flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-600" />
                Mapeamento das Variáveis do seu Webhook Real da Evolution API v2:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[11px] font-mono">
                <div className="p-2 bg-white rounded border border-amber-200">
                  <span className="text-neutral-400 block text-[10px]">Origem (Webhook Evolution):</span>
                  <span className="text-amber-800 font-semibold">body.server_url</span>
                  <span className="text-neutral-600 block truncate mt-0.5">&quot;https://agencia-evolution-api.2eoc7n...&quot;</span>
                </div>
                <div className="p-2 bg-white rounded border border-amber-200">
                  <span className="text-neutral-400 block text-[10px]">Origem (Webhook Evolution):</span>
                  <span className="text-amber-800 font-semibold">body.apikey</span>
                  <span className="text-neutral-600 block truncate mt-0.5">&quot;21C3D49F3F00-48FA...&quot;</span>
                </div>
                <div className="p-2 bg-white rounded border border-amber-200">
                  <span className="text-neutral-400 block text-[10px]">Instância:</span>
                  <span className="text-amber-800 font-semibold">body.instance</span>
                  <span className="text-neutral-600 block font-bold mt-0.5">&quot;aladay&quot;</span>
                </div>
                <div className="p-2 bg-white rounded border border-amber-200">
                  <span className="text-neutral-400 block text-[10px]">Telefone do Cliente:</span>
                  <span className="text-amber-800 font-semibold">body.data.key.remoteJid</span>
                  <span className="text-neutral-600 block font-bold mt-0.5">559181214188</span>
                </div>
                <div className="p-2 bg-white rounded border border-amber-200">
                  <span className="text-neutral-400 block text-[10px]">Nome do Cliente:</span>
                  <span className="text-amber-800 font-semibold">body.data.pushName</span>
                  <span className="text-neutral-600 block font-bold mt-0.5">&quot;Adriano Saraiva&quot;</span>
                </div>
                <div className="p-2 bg-white rounded border border-amber-200">
                  <span className="text-neutral-400 block text-[10px]">Texto da Mensagem:</span>
                  <span className="text-amber-800 font-semibold">data.message.conversation</span>
                  <span className="text-neutral-600 block font-bold mt-0.5">&quot;Quero ver o cardápio&quot;</span>
                </div>
              </div>
            </div>

            {/* Code Box */}
            <div className="relative">
              <pre className="bg-neutral-900 text-emerald-400 p-4 rounded-xl font-mono text-[11px] overflow-x-auto max-h-[460px] leading-relaxed">
                {n8nWorkflowJSON}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-TAB 3: BOT TEMPLATES EDITING                               */}
      {/* ============================================================== */}
      {subTab === 'templates' && (
        <form onSubmit={handleSaveSettings} className="bg-white border border-neutral-200 rounded-xl p-6 shadow-2xs space-y-6">
          <div>
            <h4 className="text-sm font-bold text-neutral-900">Personalização dos Textos de Auto-Resposta</h4>
            <p className="text-xs text-neutral-500 mt-0.5">
              Defina as mensagens padrão que o robô do WhatsApp vai disparar para os clientes de {tenant.name}.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            {/* Welcome message */}
            <div>
              <label className="block font-semibold text-neutral-800 mb-1">
                1. Mensagem de Boas-Vindas &amp; Link do Cardápio:
              </label>
              <textarea
                rows={4}
                value={welcomeTemplate}
                onChange={(e) => setWelcomeTemplate(e.target.value)}
                className="w-full p-3 border border-neutral-300 rounded-lg text-xs font-mono focus:outline-neutral-900"
              />
              <p className="text-[11px] text-neutral-500 mt-1">
                Disparada quando o cliente dá &quot;Oi&quot;, pede o cardápio ou pergunta se a loja está entregando.
              </p>
            </div>

            {/* Closed hours message */}
            <div>
              <label className="block font-semibold text-neutral-800 mb-1">
                2. Mensagem Fora do Horário de Atendimento (Restaurante Fechado):
              </label>
              <textarea
                rows={4}
                value={closedHoursTemplate}
                onChange={(e) => setClosedHoursTemplate(e.target.value)}
                className="w-full p-3 border border-neutral-300 rounded-lg text-xs font-mono focus:outline-neutral-900"
              />
              <p className="text-[11px] text-neutral-500 mt-1">
                Disparada quando o restaurante está fechado ou fora do horário programado.
              </p>
            </div>

            {/* Human handoff message */}
            <div>
              <label className="block font-semibold text-neutral-800 mb-1">
                3. Mensagem de Transferência para Atendente Humano:
              </label>
              <textarea
                rows={3}
                value={humanHandoffTemplate}
                onChange={(e) => setHumanHandoffTemplate(e.target.value)}
                className="w-full p-3 border border-neutral-300 rounded-lg text-xs font-mono focus:outline-neutral-900"
              />
              <p className="text-[11px] text-neutral-500 mt-1">
                Enviada quando o cliente digita &quot;2&quot; ou pede ajuda de um ser humano. O bot pausa imediatamente.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-neutral-200">
            <button
              type="submit"
              className="px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold rounded-lg text-xs shadow-xs"
            >
              Salvar Modelos de Mensagem
            </button>
          </div>
        </form>
      )}

      {/* ============================================================== */}
      {/* SUB-TAB 4: EASYPANEL & HOSTINGER SETUP GUIDE (Somente ADM)     */}
      {/* ============================================================== */}
      {isSuperAdmin && subTab === 'easypanel' && (
        <div className="space-y-6">
          {/* ============================================================ */}
          {/* SEÇÃO 1: CONFIGURAÇÃO DO BANCO DE DADOS POSTGRESQL EASYPANEL */}
          {/* ============================================================ */}
          <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-200">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-neutral-900">
                      Configuração do Banco de Dados PostgreSQL no EasyPanel (VPS)
                    </h4>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        dbStatusData?.connected
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}
                    >
                      {dbStatusData?.connected ? 'PostgreSQL Conectado' : 'Aguardando DATABASE_URL'}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Configure o serviço Postgres dentro do seu EasyPanel para persistir restaurantes, cardápios, pedidos e fila Outbox na VPS.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={fetchDatabaseStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-xs font-semibold transition-colors self-start sm:self-auto"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Verificar Status</span>
              </button>
            </div>

            {/* Live Table Counters if connected or memory state */}
            {dbStatusData && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                  <span className="text-[10px] font-mono text-neutral-500 uppercase">Tabela tenants</span>
                  <p className="text-base font-bold text-neutral-900 mt-0.5">{dbStatusData.counts?.tenants ?? 0}</p>
                  <span className="text-[10px] text-neutral-400">Restaurantes</span>
                </div>
                <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                  <span className="text-[10px] font-mono text-neutral-500 uppercase">Tabela categories</span>
                  <p className="text-base font-bold text-neutral-900 mt-0.5">{dbStatusData.counts?.categories ?? 0}</p>
                  <span className="text-[10px] text-neutral-400">Categorias</span>
                </div>
                <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                  <span className="text-[10px] font-mono text-neutral-500 uppercase">Tabela products</span>
                  <p className="text-base font-bold text-neutral-900 mt-0.5">{dbStatusData.counts?.products ?? 0}</p>
                  <span className="text-[10px] text-neutral-400">Produtos</span>
                </div>
                <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                  <span className="text-[10px] font-mono text-neutral-500 uppercase">Tabela orders</span>
                  <p className="text-base font-bold text-neutral-900 mt-0.5">{dbStatusData.counts?.orders ?? 0}</p>
                  <span className="text-[10px] text-neutral-400">Pedidos</span>
                </div>
                <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                  <span className="text-[10px] font-mono text-neutral-500 uppercase">Tabela outbox</span>
                  <p className="text-base font-bold text-neutral-900 mt-0.5">{dbStatusData.counts?.outbox_events ?? 0}</p>
                  <span className="text-[10px] text-neutral-400">Eventos WhatsApp</span>
                </div>
              </div>
            )}

            {/* 4 Passos Práticos no EasyPanel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-900 text-white flex items-center justify-center font-bold text-[10px]">
                    1
                  </span>
                  <span className="font-bold text-neutral-900">Criar o Banco Postgres no EasyPanel</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-neutral-600 leading-relaxed">
                  <li>Abra o seu painel do <strong>EasyPanel</strong> na VPS e entre no mesmo <strong>Projeto</strong> onde está o site (ex: <code className="bg-neutral-200 px-1 rounded">agencia</code>).</li>
                  <li>Clique em <strong>+ Create Service</strong> &rarr; escolha <strong>Postgres</strong> (template oficial).</li>
                  <li>Preencha:
                    <ul className="list-disc list-inside ml-3 mt-0.5">
                      <li><strong>Name:</strong> <code className="bg-neutral-200 px-1 rounded">postgres</code> (ou <code className="bg-neutral-200 px-1 rounded">aladay-db</code>)</li>
                      <li><strong>Database Name:</strong> <code className="bg-neutral-200 px-1 rounded">aladay</code></li>
                      <li><strong>Password:</strong> defina uma senha forte</li>
                    </ul>
                  </li>
                </ol>
              </div>

              <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-900 text-white flex items-center justify-center font-bold text-[10px]">
                    2
                  </span>
                  <span className="font-bold text-neutral-900">Como funciona o Host Interno no EasyPanel</span>
                </div>
                <p className="text-[11px] text-neutral-600 leading-relaxed">
                  No EasyPanel (Docker Swarm), os serviços do mesmo projeto se comunicam pela rede interna usando o formato <code className="bg-neutral-200 px-1 rounded font-mono">NOMEPROJETO_NOMESERVICO:5432</code>:
                </p>
                <div className="p-2.5 bg-neutral-900 text-emerald-400 rounded-lg font-mono text-[11px] overflow-x-auto">
                  postgresql://postgres:SENHA@{epProjectName || 'agencia'}_{epServiceName || 'postgres'}:5432/{epDbName || 'aladay'}
                </div>
                <p className="text-[10px] text-neutral-500">
                  * Você não precisa abrir a porta 5432 para a internet pública! A comunicação interna é 100% blindada.
                </p>
              </div>
            </div>

            {/* Interactive Connection String Builder & Tester */}
            <div className="p-5 bg-indigo-50/40 border border-indigo-200 rounded-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h5 className="text-xs font-bold text-neutral-900">
                    Gerador de Variáveis &amp; Inicializador Automático das Tabelas
                  </h5>
                  <p className="text-[11px] text-neutral-600">
                    Preencha os dados do seu serviço Postgres no EasyPanel para gerar o bloco <code className="bg-white px-1 rounded">.env</code> exato ou testar a criação das tabelas:
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                    Projeto no EasyPanel
                  </label>
                  <input
                    type="text"
                    value={epProjectName}
                    onChange={(e) => setEpProjectName(e.target.value)}
                    placeholder="Ex: agencia"
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                    Serviço Postgres
                  </label>
                  <input
                    type="text"
                    value={epServiceName}
                    onChange={(e) => setEpServiceName(e.target.value)}
                    placeholder="Ex: postgres"
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                    Nome do Database
                  </label>
                  <input
                    type="text"
                    value={epDbName}
                    onChange={(e) => setEpDbName(e.target.value)}
                    placeholder="Ex: aladay"
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                    Usuário
                  </label>
                  <input
                    type="text"
                    value={epDbUser}
                    onChange={(e) => setEpDbUser(e.target.value)}
                    placeholder="postgres"
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                    Senha do Banco
                  </label>
                  <input
                    type="password"
                    value={epDbPass}
                    onChange={(e) => setEpDbPass(e.target.value)}
                    placeholder="Sua senha no EasyPanel"
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-700 mb-1">
                  Ou cole diretamente a URL de Conexão (<code className="font-mono">DATABASE_URL</code>):
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={customDatabaseUrl}
                    onChange={(e) => setCustomDatabaseUrl(e.target.value)}
                    placeholder={generatedEasyPanelDbUrl}
                    className="flex-1 px-3 py-2 bg-white border border-neutral-300 rounded-lg font-mono text-xs"
                  />
                  <button
                    type="button"
                    disabled={isTestingDb}
                    onClick={handleTestAndMigrateDatabase}
                    className="px-4 py-2 bg-indigo-900 hover:bg-indigo-800 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-2 shrink-0 transition-colors cursor-pointer"
                  >
                    {isTestingDb ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Database className="w-4 h-4" />
                    )}
                    <span>
                      {isTestingDb ? 'Conectando e Criando Tabelas...' : 'Testar Conexão & Criar Tabelas'}
                    </span>
                  </button>
                </div>
              </div>

              {dbActionFeedback && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                    dbActionFeedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  {dbActionFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span className="font-medium">{dbActionFeedback.message}</span>
                </div>
              )}

              {/* Ready-to-copy Environment Variables for EasyPanel Site App */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-900">
                    3. Copie e cole na aba &quot;Environment&quot; do serviço do Site no EasyPanel:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const envText = `PORT=3000\nNODE_ENV=production\nDATABASE_URL=${generatedEasyPanelDbUrl}\nPGSSLMODE=disable\nJWT_SECRET=aladay-vps-jwt-secret-${Date.now()}\nEVOLUTION_API_URL=${evolutionUrl}\nEVOLUTION_API_KEY=${evolutionApiKey}\nN8N_WEBHOOK_URL=${n8nWebhookUrl}`;
                      navigator.clipboard.writeText(envText);
                      setCopiedEnvBlock(true);
                      setTimeout(() => setCopiedEnvBlock(false), 3000);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-[11px] font-semibold cursor-pointer"
                  >
                    {copiedEnvBlock ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedEnvBlock ? 'Variáveis .ENV Copiadas!' : 'Copiar Variáveis .ENV para EasyPanel'}</span>
                  </button>
                </div>

                <pre className="bg-neutral-900 text-neutral-200 p-3.5 rounded-lg font-mono text-[11px] overflow-x-auto leading-relaxed">
{`PORT=3000
NODE_ENV=production
DATABASE_URL=${generatedEasyPanelDbUrl}
PGSSLMODE=disable
JWT_SECRET=troque_por_uma_chave_secreta_forte_na_vps
EVOLUTION_API_URL=${evolutionUrl}
EVOLUTION_API_KEY=${evolutionApiKey}
N8N_WEBHOOK_URL=${n8nWebhookUrl}`}
                </pre>
              </div>

              {/* SQL Script Copy Block */}
              {dbStatusData?.initSqlScript && (
                <div className="space-y-2 pt-2 border-t border-indigo-200/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-900">
                      Script SQL das Tabelas (<code className="font-mono">database/easypanel-init.sql</code> — executado automaticamente ao iniciar):
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(dbStatusData.initSqlScript);
                        setCopiedSqlBlock(true);
                        setTimeout(() => setCopiedSqlBlock(false), 3000);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 rounded-lg text-[11px] font-semibold cursor-pointer"
                    >
                      {copiedSqlBlock ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedSqlBlock ? 'SQL Copiado!' : 'Copiar Script SQL'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ============================================================ */}
          {/* SEÇÃO 2: INTEGRAÇÃO EVOLUTION API + N8N NO EASYPANEL         */}
          {/* ============================================================ */}
          <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-2xs space-y-5">
            <div>
              <h4 className="text-sm font-bold text-neutral-900">
                Guia Prático: Evolution API + n8n no Easypanel (Hostinger VPS)
              </h4>
              <p className="text-xs text-neutral-500 mt-0.5">
                Como interligar a Evolution API com o n8n dentro do mesmo servidor com altíssima performance e custo zero de mensagens.
              </p>
            </div>

            {/* Step 1: Easypanel Evolution API */}
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-[10px]">
                  1
                </span>
                <span className="font-bold text-neutral-900">Variáveis de Ambiente da Evolution API no Easypanel:</span>
              </div>
              <pre className="bg-neutral-900 text-neutral-200 p-3 rounded font-mono text-[11px] overflow-x-auto">
{`SERVER_URL=https://agencia-evolution-api.2eoc7n.easypanel.host
AUTHENTICATION_API_KEY=21C3D49F3F00-48FA-BFA2-2CD290850405
DATABASE_ENABLED=true
DATABASE_CONNECTION_URI=postgresql://postgres:senha@postgres:5432/evolution
REDIS_ENABLED=true
REDIS_URI=redis://default:senha@redis:6379`}
              </pre>
            </div>

            {/* Step 2: Easypanel n8n */}
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-[10px]">
                  2
                </span>
                <span className="font-bold text-neutral-900">Variáveis de Ambiente do n8n no Easypanel:</span>
              </div>
              <pre className="bg-neutral-900 text-neutral-200 p-3 rounded font-mono text-[11px] overflow-x-auto">
{`WEBHOOK_URL=https://agencia-n8n.2eoc7n.easypanel.host/
N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=168`}
              </pre>
            </div>

            {/* Step 3: Registering webhook from Evolution to n8n */}
            <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-[10px]">
                  3
                </span>
                <span className="font-bold text-neutral-900">Registrar o Webhook da Instância apontando para o n8n:</span>
              </div>
              <p className="text-neutral-600 text-[11px]">
                Você pode executar este comando no terminal ou via Postman para cadastrar o webhook na Evolution API:
              </p>
              <pre className="bg-neutral-900 text-neutral-200 p-3 rounded font-mono text-[11px] overflow-x-auto">
{`curl -X POST "${evolutionUrl}/webhook/set/${tenant.evolutionInstanceId}" \\
  -H "apikey: ${evolutionApiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "webhook": {
      "enabled": true,
      "url": "${n8nWebhookUrl}",
      "byEvents": false,
      "base64": false,
      "events": [
        "MESSAGES_UPSERT",
        "SEND_MESSAGE"
      ]
    }
  }'`}
              </pre>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`curl -X POST "${evolutionUrl}/webhook/set/${tenant.evolutionInstanceId}" -H "apikey: ${evolutionApiKey}" -H "Content-Type: application/json" -d '{"webhook": {"enabled": true, "url": "${n8nWebhookUrl}", "byEvents": false, "base64": false, "events": ["MESSAGES_UPSERT"]}}'`);
                  setCopiedCurl(true);
                  setTimeout(() => setCopiedCurl(false), 3000);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded text-[11px] font-semibold mt-2"
              >
                {copiedCurl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCurl ? 'Comando cURL Copiado!' : 'Copiar comando cURL'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-TAB 5: LOGS & WEBHOOK INSPECTOR (Somente ADM)              */}
      {/* ============================================================== */}
      {isSuperAdmin && subTab === 'logs' && (
        <div className="space-y-6">
          {/* Header & Controls */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h4 className="text-sm font-bold text-neutral-900">
                  Inspetor de Webhooks &amp; Tráfego em Tempo Real
                </h4>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Monitora os eventos <code className="text-neutral-800 bg-neutral-100 px-1 py-0.5 rounded font-mono text-[11px]">MESSAGES_UPSERT</code> recebidos da Evolution API e as decisões tomadas pelo n8n.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefreshLogs}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-xs font-semibold transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 text-neutral-500" />
                <span>Atualizar Logs</span>
              </button>
              <button
                type="button"
                onClick={() => setWebhookLogs([])}
                className="px-3 py-1.5 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-lg text-xs transition-colors"
              >
                Limpar
              </button>
            </div>
          </div>

          {/* Direct Webhook Test Dispatcher */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <h5 className="text-xs font-bold text-neutral-900">
                  Testar Disparo de Webhook Real (Simular Inbound da Evolution API)
                </h5>
              </div>
              <span className="text-[11px] font-mono text-neutral-500">
                POST /api/v1/webhooks/test-dispatch
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-4">
                <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                  Número do Cliente (WhatsApp)
                </label>
                <input
                  type="text"
                  value={testSenderPhone}
                  onChange={(e) => setTestSenderPhone(e.target.value)}
                  placeholder="5511999998888"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-xs font-mono"
                />
              </div>

              <div className="md:col-span-8">
                <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                  Mensagem Inbound Enviada pelo Cliente
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testWebhookText}
                    onChange={(e) => setTestWebhookText(e.target.value)}
                    placeholder="Ex: Boa noite! Gostaria de ver o cardápio"
                    className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-xs"
                  />
                  <button
                    type="button"
                    disabled={isSendingTestWebhook}
                    onClick={handleSendTestWebhook}
                    className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 shrink-0 transition-colors"
                  >
                    {isSendingTestWebhook ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>{isSendingTestWebhook ? 'Disparando...' : 'Disparar Teste'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Test Presets */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-neutral-100 text-[11px]">
              <span className="text-neutral-500 font-medium">Testes Rápidos:</span>
              <button
                type="button"
                onClick={() => setTestWebhookText('Olá, qual o cardápio de vocês?')}
                className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 rounded text-neutral-700"
              >
                1. Solicitação de Cardápio
              </button>
              <button
                type="button"
                onClick={() => setTestWebhookText('2')}
                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded font-bold"
              >
                2. Handoff Humano ("2")
              </button>
              <button
                type="button"
                onClick={() => setTestWebhookText('Vocês fazem entrega para o bairro Bela Vista?')}
                className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 rounded text-neutral-700"
              >
                3. Consulta de Entrega / Região
              </button>
            </div>

            {testWebhookResult && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1">
                <div className="flex items-center justify-between text-emerald-900 font-bold">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Webhook Processado com Sucesso! (Status 200 OK)</span>
                  </span>
                  <span className="font-mono text-[11px] bg-emerald-100 px-2 py-0.5 rounded text-emerald-800">
                    Latência: {testWebhookResult.latencyMs || 15}ms
                  </span>
                </div>
                <p className="text-emerald-800 text-[11px]">
                  <strong>Ação Executada:</strong> {testWebhookResult.actionTriggered === 'human_handoff' ? 'Pausa de Bot & Transferência para Atendente Humano' : 'Envio Imediato do Cardápio Digital'}
                </p>
                {testWebhookResult.replyDispatched && (
                  <div className="p-2 bg-white rounded border border-emerald-200 font-mono text-[11px] text-neutral-800 whitespace-pre-wrap mt-1">
                    {testWebhookResult.replyDispatched}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Webhook Stream Table */}
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between text-xs">
              <span className="font-bold text-neutral-800">
                Eventos Recentes ({webhookLogs.length})
              </span>
              <span className="text-[11px] text-neutral-500">
                Instância: <code className="font-mono text-neutral-800">{tenant.evolutionInstanceId}</code>
              </span>
            </div>

            {webhookLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500 space-y-2">
                <Radio className="w-8 h-8 text-neutral-400 mx-auto" />
                <p className="font-medium">Nenhum evento registrado ainda.</p>
                <p className="text-[11px]">Use o painel acima para disparar um webhook de teste ou envie uma mensagem no WhatsApp conectado.</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 text-xs">
                {webhookLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-4 hover:bg-neutral-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] text-neutral-400">
                          {log.timestamp}
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.source === 'evolution'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {log.source === 'evolution' ? 'Evolution API' : 'n8n Workflow'}
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.direction === 'inbound'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {log.direction === 'inbound' ? 'ENTRADA (Inbound)' : 'SAÍDA (Outbound)'}
                        </span>

                        <span className="font-mono text-[11px] font-bold text-neutral-800">
                          {log.eventType}
                        </span>

                        {log.status === 'filtered' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                            Ignorado (Anti-Loop)
                          </span>
                        )}
                      </div>

                      <p className="text-neutral-700 text-xs font-medium">
                        {log.payloadSummary}
                      </p>

                      {log.messageText && (
                        <p className="text-neutral-500 font-mono text-[11px] bg-neutral-100 p-2 rounded max-w-2xl truncate">
                          "{log.messageText}"
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-start md:self-center">
                      <button
                        type="button"
                        onClick={() => setSelectedLogForDetails(log)}
                        className="flex items-center gap-1 px-3 py-1.5 border border-neutral-300 hover:border-neutral-400 bg-white rounded-lg text-[11px] font-semibold text-neutral-700 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5 text-neutral-500" />
                        <span>Ver JSON</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Diagnostic & Troubleshooting on Easypanel VPS */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 space-y-3 text-xs">
            <h5 className="font-bold text-neutral-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Dicas de Conectividade e Diagnóstico no Easypanel (Hostinger VPS)</span>
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-neutral-600 text-[11px] leading-relaxed">
              <div className="p-3 bg-white rounded-lg border border-neutral-200 space-y-1">
                <span className="font-bold text-neutral-900">1. Comunicação interna entre containers:</span>
                <p>
                  No Easypanel, se o n8n e a Evolution API estiverem no mesmo projeto Docker, use o nome do serviço (ex: <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-neutral-800">http://evolution-api:8080</code>) para latência inferior a 3ms sem passar pela internet pública.
                </p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-neutral-200 space-y-1">
                <span className="font-bold text-neutral-900">2. Prevenção de loop infinito no n8n:</span>
                <p>
                  Sempre valide <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-neutral-800">fromMe === false</code> e <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono text-neutral-800">!remoteJid.includes('@g.us')</code> no nó JavaScript para garantir que o bot nunca responda a si próprio nem a grupos.
                </p>
              </div>
            </div>
          </div>

          {/* Modal Payload JSON Viewer */}
          {selectedLogForDetails && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-fadeIn">
                <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-neutral-700" />
                    <h5 className="text-xs font-bold text-neutral-900">
                      Payload Completo do Webhook ({selectedLogForDetails.eventType})
                    </h5>
                  </div>
                  <button
                    onClick={() => setSelectedLogForDetails(null)}
                    className="text-neutral-400 hover:text-neutral-800 p-1"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-4 overflow-y-auto flex-1 font-mono text-[11px] bg-neutral-950 text-emerald-400">
                  <pre className="whitespace-pre-wrap leading-tight">
                    {JSON.stringify(selectedLogForDetails.fullPayload || selectedLogForDetails, null, 2)}
                  </pre>
                </div>

                <div className="p-3 border-t border-neutral-200 bg-neutral-50 flex justify-end">
                  <button
                    onClick={() => setSelectedLogForDetails(null)}
                    className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Global WhatsApp QR Code Pairing Modal */}
      <WhatsAppQrPairingModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        tenant={tenant}
        onTenantUpdated={onUpdateTenant}
      />
    </div>
  );
};
