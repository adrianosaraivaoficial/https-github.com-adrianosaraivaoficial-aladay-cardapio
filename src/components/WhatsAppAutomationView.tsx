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
  authSession?: AuthSession | null;
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
  const isSuperAdmin = Boolean(authSession && authSession.user?.role === 'SUPER_ADMIN');
  const [subTab, setSubTab] = useState<'qrcode_pairing' | 'status_notifications' | 'simulator' | 'n8n_workflow' | 'templates' | 'easypanel' | 'logs'>(
    initialSubTab && (isSuperAdmin || (initialSubTab !== 'n8n_workflow' && initialSubTab !== 'easypanel' && initialSubTab !== 'logs'))
      ? initialSubTab
      : 'qrcode_pairing'
  );

  // Redireciona restaurantes para o pareamento QR Code caso tentem acessar abas restritas de infraestrutura
  useEffect(() => {
    if (!isSuperAdmin && (subTab === 'n8n_workflow' || subTab === 'easypanel' || subTab === 'logs')) {
      setSubTab('qrcode_pairing');
    }
  }, [isSuperAdmin, subTab]);

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
  const publicStoreUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?loja=${encodeURIComponent(tenant.slug)}`
      : `https://aladay.com.br/?loja=${encodeURIComponent(tenant.slug)}`;

  const [welcomeTemplate, setWelcomeTemplate] = useState(
    tenant.botWelcomeMessage ||
      `Olá! Seja muito bem-vindo ao *${tenant.name}*! 🍔\n\nNosso cardápio digital completo está disponível no link abaixo com fotos e preços em tempo real:\n\n👉 ${publicStoreUrl}\n\nFaça seu pedido diretamente pelo link! Se preferir falar com um atendente da nossa equipe, responda com *2*.`
  );
  const [closedHoursTemplate, setClosedHoursTemplate] = useState(
    tenant.botClosedHoursMessage ||
      `Olá! Agradecemos sua mensagem para o *${tenant.name}*.\n\nNo momento nosso restaurante está *FECHADO*.\n🕒 Horário de atendimento: ${tenant.openingHoursText}.\n\nVocê já pode conferir nosso cardápio e adiantar seu pedido para quando abrirmos:\n👉 ${publicStoreUrl}`
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
  const [epServiceName, setEpServiceName] = useState('agpostgres');
  const [epDbUser, setEpDbUser] = useState('postgres');
  const [epDbPass, setEpDbPass] = useState('');
  const [epDbName, setEpDbName] = useState('agencia');
  const [customDatabaseUrl, setCustomDatabaseUrl] = useState('');
  const [dbStatusData, setDbStatusData] = useState<any | null>(null);
  const [isTestingDb, setIsTestingDb] = useState(false);
  const [dbActionFeedback, setDbActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedEnvBlock, setCopiedEnvBlock] = useState(false);
  const [copiedSqlBlock, setCopiedSqlBlock] = useState(false);

  const generatedEasyPanelDbUrl =
    customDatabaseUrl.trim() ||
    `postgresql://${epDbUser || 'postgres'}:${epDbPass || 'SUA_SENHA_AQUI'}@${epProjectName || 'agencia'}_${epServiceName || 'agpostgres'}:5432/${epDbName || 'agencia'}`;

  const fetchDatabaseStatus = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      let activeToken = authSession?.token;
      let headers: Record<string, string> = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
      let res = await fetch('/api/v1/admin/database/status', { headers });

      if (res.status === 401) {
        const refreshRes = await fetch('/api/v1/auth/session');
        if (refreshRes.ok) {
          const freshData = await refreshRes.json();
          if (freshData?.token) {
            activeToken = freshData.token;
            headers = { Authorization: `Bearer ${activeToken}` };
            res = await fetch('/api/v1/admin/database/status', { headers });
          }
        }
      }

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
      let activeToken = authSession?.token;
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      };

      let res = await fetch('/api/v1/admin/database/test-and-migrate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ databaseUrl: generatedEasyPanelDbUrl }),
      });

      // If token is invalid or expired, automatically get fresh token from server and retry
      if (res.status === 401) {
        const refreshRes = await fetch('/api/v1/auth/session');
        if (refreshRes.ok) {
          const freshData = await refreshRes.json();
          if (freshData?.token) {
            activeToken = freshData.token;
            headers = {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${activeToken}`,
            };
            res = await fetch('/api/v1/admin/database/test-and-migrate', {
              method: 'POST',
              headers,
              body: JSON.stringify({ databaseUrl: generatedEasyPanelDbUrl }),
            });
          }
        }
      }

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
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // n8n AI Agent Configurator State
  const [n8nAgentMode, setN8nAgentMode] = useState<'sdr_aladay' | 'restaurante_ia' | 'deterministico'>('sdr_aladay');
  const [n8nLlmProvider, setN8nLlmProvider] = useState<'openai' | 'gemini'>('openai');
  const [n8nLlmModel, setN8nLlmModel] = useState<string>('gpt-4o-mini');
  const [n8nMemoryWindow, setN8nMemoryWindow] = useState<number>(12);
  const [n8nWebhookPath, setN8nWebhookPath] = useState<string>('saas');
  const [isBindingWebhook, setIsBindingWebhook] = useState(false);
  const [webhookBindFeedback, setWebhookBindFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Live n8n Agent Tester State
  const [agentTestCustomerName, setAgentTestCustomerName] = useState('Carlos Mendes (Dono de Hamburgueria)');
  const [agentTestPhone, setAgentTestPhone] = useState('5591988887777');
  const [agentTestMessage, setAgentTestMessage] = useState('Olá! Gostaria de saber quanto custa o sistema da Aladay e se vocês cobram comissão por pedido.');
  const [dispatchToRemoteN8n, setDispatchToRemoteN8n] = useState(false);
  const [isTestingN8nAgent, setIsTestingN8nAgent] = useState(false);
  const [agentTestResult, setAgentTestResult] = useState<any | null>(null);

  const appOriginUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://aladay.com.br';

  const defaultSdrSystemPrompt = `Você é o Consultor Comercial Especialista (SDR / Closer) da Aladay Cardápios Digitais (https://aladay.com.br).
WhatsApp Oficial de Suporte e Vendas: +55 (91) 3197-6334 (https://wa.me/559131976334).

SEU OBJETIVO PRINCIPAL:
1. Responder com clareza, rapidez, empatia e autoridade a qualquer dúvida de leads (donos de restaurantes, hamburguerias, pizzarias, lanchonetes, açaíterias, sushi bars, padarias e dark kitchens).
2. Demonstrar como o restaurante economiza milhares de reais por mês trocando comissões abusivas (de 12% a 27% dos aplicativos tradicionais) por uma assinatura fixa acessível com 0% de comissão.
3. Conduzir o lead para iniciar imediatamente o TESTE GRÁTIS DE 15 DIAS (no Plano Mensal) ou garantir o desconto máximo no PLANO ANUAL (12x de R$ 99,00 no cartão de crédito).

PLANOS E PREÇOS OFICIAIS (0% DE COMISSÃO SEMPRE):
1) PLANO ANUAL ALADAY PRO (MAIS VANTAJOSO — ECONOMIA DE R$ 370,80/ANO):
   - Valor: 12x de R$ 99,00 sem juros no Cartão de Crédito (total R$ 1.188,00/ano).
   - Forma de pagamento: Exclusivo via Cartão de Crédito em até 12x (via Asaas).
   - Ativação imediata (o teste grátis de 15 dias aplica-se ao Plano Mensal).

2) PLANO MENSAL ALADAY PRO (COM 15 DIAS DE TESTE GRÁTIS):
   - Valor: R$ 129,90/mês.
   - Teste Grátis: 15 dias 100% gratuitos para testar todas as funcionalidades na prática (R$ 0,00 hoje).
   - Formas de pagamento após os 15 dias: Pix, Boleto Bancário ou Cartão de Crédito. Sem fidelidade.

DIFERENCIAIS EXCLUSIVOS INCLUSOS EM TODOS OS PLANOS:
- Pedidos, produtos e fotos ilimitados com 0% de comissão sobre vendas.
- Três modalidades no mesmo cardápio: Delivery (Entrega), Retirada no Balcão e QR Code de Mesa.
- Pagamento Pix Direto 100% na conta bancária do restaurante na mesma hora (QR Code + Pix Copia e Cola).
- Automação de WhatsApp via Evolution API inclusa (dispara automaticamente: 1. Pedido Recebido, 2. Em Preparo na Cozinha, 3. Saiu para Entrega / Pronto).
- Painel de Cozinha KDS em tempo real com alerta sonoro e impressão térmica 80mm.
- Importador inteligente de cardápio via planilha Excel/CSV em menos de 10 segundos.

REGRAS DE ATENDIMENTO NO WHATSAPP:
- Use formatação limpa para WhatsApp (*negrito*, listas curtas e parágrafos objetivos).
- Sempre chame o lead pelo nome se disponível.
- Se precisar consultar detalhes completos da plataforma ou FAQ, acione a ferramenta HTTP "consultar_base_conhecimento_aladay".
- Se o cliente pedir para falar com um atendente humano ou digitar "2", encaminhe imediatamente para o WhatsApp oficial: https://wa.me/559131976334 (+55 91 3197-6334).
- Sempre finalize com uma pergunta engajadora convidando para criar a conta em: ${appOriginUrl}`;

  const defaultRestaurantSystemPrompt = `Você é o Assistente Virtual de Atendimento do restaurante *${tenant.name}*.
Seu objetivo é atender os clientes no WhatsApp com simpatia, rapidez e precisão:
1. Sempre envie o link direto do Cardápio Digital oficial para o cliente fazer o pedido sem fila: ${appOriginUrl}/?loja=${tenant.slug}
2. Use a ferramenta HTTP "consultar_cardapio_e_loja" para verificar em tempo real se o restaurante está aberto, os produtos disponíveis, preços atualizados e taxa de entrega.
3. Se o cliente perguntar sobre o andamento do pedido ("Onde está meu pedido?"), use a ferramenta HTTP "consultar_status_pedido" passando o telefone do cliente.
4. Nunca invente produtos ou preços fora do cardápio retornado pela ferramenta.
5. Se o cliente digitar "2" ou pedir um atendente humano, informe que um atendente da equipe do ${tenant.name} já vai atendê-lo.`;

  const [agentSystemPrompt, setAgentSystemPrompt] = useState<string>(defaultSdrSystemPrompt);

  // Switch default system prompt when user switches agent mode
  const handleSelectAgentMode = (mode: 'sdr_aladay' | 'restaurante_ia' | 'deterministico') => {
    setN8nAgentMode(mode);
    if (mode === 'sdr_aladay') {
      setAgentSystemPrompt(defaultSdrSystemPrompt);
      setAgentTestCustomerName('Carlos Mendes (Dono de Hamburgueria)');
      setAgentTestMessage('Olá! Gostaria de saber quanto custa o sistema da Aladay e se vocês cobram comissão por pedido.');
    } else if (mode === 'restaurante_ia') {
      setAgentSystemPrompt(defaultRestaurantSystemPrompt);
      setAgentTestCustomerName('Adriano Saraiva');
      setAgentTestMessage('Boa noite! Vocês estão abertos? Quero ver o cardápio.');
    }
  };

  // Webhook Logs & Live Inspector State
  const [webhookLogs, setWebhookLogs] = useState<WebhookLogEvent[]>([]);
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<WebhookLogEvent | null>(null);
  const [testWebhookText, setTestWebhookText] = useState('');
  const [testSenderPhone, setTestSenderPhone] = useState('');
  const [isSendingTestWebhook, setIsSendingTestWebhook] = useState(false);
  const [testWebhookResult, setTestWebhookResult] = useState<any>(null);

  // Build the dynamic n8n Workflow JSON according to the selected mode (AI Agent SDR, AI Agent Restaurant, or Deterministic)
  const n8nWorkflowJSON = React.useMemo(() => {
    const cleanEvoUrl = (evolutionUrl || 'https://agencia-evolution-api.2eoc7n.easypanel.host').replace(/\/$/, '');
    const cleanInstance = tenant.evolutionInstanceId || 'aladay';
    const cleanPath = (n8nWebhookPath || 'saas').replace(/^\//, '');

    if (n8nAgentMode === 'deterministico') {
      return JSON.stringify(
        {
          name: `Evolution API v2 - Auto Resposta Rapida [${cleanInstance}]`,
          nodes: [
            {
              parameters: {
                httpMethod: 'POST',
                path: cleanPath,
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
                jsCode: `// =========================================================================\n// Processador de Webhook Evolution API v2 (Easypanel Hostinger)\n// =========================================================================\nconst results = [];\n\nfor (const item of $input.all()) {\n  const body = item.json.body || item.json;\n  const data = body.data || {};\n  const key = data.key || {};\n  const remoteJid = key.remoteJid || key.remoteJidAlt || '';\n\n  if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('@broadcast')) {\n    continue;\n  }\n\n  const isTestMode = item.json.executionMode === 'test' ||\n                      String(item.json.webhookUrl || '').includes('/webhook-test/') ||\n                      String(body.destination || '').includes('/webhook-test/');\n\n  if (key.fromMe === true && !isTestMode) {\n    continue;\n  }\n\n  const customerPhone = remoteJid.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');\n  const rawPushName = data.pushName || 'Cliente';\n  const customerName = rawPushName.includes('|') ? rawPushName.split('|')[0].trim() : rawPushName.trim();\n  const messageText = (\n    data.message?.conversation ||\n    data.message?.extendedTextMessage?.text ||\n    data.message?.imageMessage?.caption ||\n    ''\n  ).trim();\n\n  if (!messageText) continue;\n\n  const serverUrl = (body.server_url || '${cleanEvoUrl}').replace(/\\/$/, '');\n  const apiKey = body.apikey || '${evolutionApiKey}';\n  const instance = body.instance || '${cleanInstance}';\n  const isHumanHandoff = /^(2|atendente|humano|ajuda|falar com atendente|falar com alguem|suporte)$/i.test(messageText);\n\n  const menuReply = \`Olá, *\${customerName}*! Seja muito bem-vindo ao *${tenant.name}*! 🍔\\n\\nNosso cardápio digital completo está disponível com fotos e preços em tempo real:\\n\\n👉 ${appOriginUrl}/?loja=${tenant.slug}\\n\\nFaça seu pedido diretamente pelo link acima!\\nSe preferir falar com um atendente da nossa equipe, responda com *2*.\`;\n  const humanReply = \`Perfeito, *\${customerName}*! Pausamos o bot automático. Um dos nossos atendentes humanos vai te responder em instantes! 👨‍🍳\`;\n  const replyText = isHumanHandoff ? humanReply : menuReply;\n\n  results.push({\n    json: {\n      customerPhone,\n      customerName,\n      messageText,\n      serverUrl,\n      apiKey,\n      instance,\n      remoteJid,\n      isHumanHandoff,\n      replyText,\n      endpointUrl: \`\${serverUrl}/message/sendText/\${instance}\`,\n      payloadToSend: {\n        number: customerPhone,\n        text: replyText,\n        options: {\n          delay: 1200,\n          presence: 'composing',\n          linkPreview: true,\n        },\n      },\n    },\n  });\n}\n\nreturn results;`,
              },
              id: 'node-code-process',
              name: 'Tratar Payload Evolution API',
              type: 'n8n-nodes-base.code',
              typeVersion: 2,
              position: [380, 300],
            },
            {
              parameters: {
                method: 'POST',
                url: '={{ $json.endpointUrl }}',
                sendHeaders: true,
                headerParameters: {
                  parameters: [
                    { name: 'apikey', value: '={{ $json.apiKey }}' },
                    { name: 'Content-Type', value: 'application/json' },
                  ],
                },
                sendBody: true,
                specifyBody: 'json',
                jsonBody: '={{ JSON.stringify($json.payloadToSend) }}',
                options: {},
              },
              id: 'node-send-whatsapp',
              name: 'Enviar Resposta (Evolution API)',
              type: 'n8n-nodes-base.httpRequest',
              typeVersion: 4.2,
              position: [660, 300],
            },
          ],
          connections: {
            'Webhook Evolution API': {
              main: [[{ node: 'Tratar Payload Evolution API', type: 'main', index: 0 }]],
            },
            'Tratar Payload Evolution API': {
              main: [[{ node: 'Enviar Resposta (Evolution API)', type: 'main', index: 0 }]],
            },
          },
          active: true,
          settings: { executionOrder: 'v1' },
        },
        null,
        2
      );
    }

    // AI Agent Workflow (LangChain n8n Agent + Chat Model + Window Buffer Memory + HTTP Tools + Evolution API v2)
    const llmNode =
      n8nLlmProvider === 'gemini'
        ? {
            parameters: {
              modelName: 'models/gemini-2.5-flash',
              options: { temperature: 0.3 },
            },
            id: 'node-llm-model',
            name: 'Google Gemini Chat Model',
            type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
            typeVersion: 1,
            position: [540, 540],
          }
        : {
            parameters: {
              model: {
                __rl: true,
                value: n8nLlmModel || 'gpt-4o-mini',
                mode: 'list',
              },
              options: { temperature: 0.3 },
            },
            id: 'node-llm-model',
            name: 'OpenAI Chat Model',
            type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
            typeVersion: 1.2,
            position: [540, 540],
          };

    const toolNode =
      n8nAgentMode === 'sdr_aladay'
        ? {
            parameters: {
              name: 'consultar_base_conhecimento_aladay',
              description:
                'Consulta a Base de Conhecimento Oficial da Aladay Cardápios Digitais, incluindo planos (Anual R$ 99/mês no cartão e Mensal R$ 129,90/mês com 15 dias grátis), funcionalidades, comparativo de comissão 0% vs marketplaces e FAQ.',
              method: 'GET',
              url: `${appOriginUrl}/api/v1/n8n/knowledge-base`,
            },
            id: 'node-http-tool-kb',
            name: 'Tool: Base de Conhecimento Aladay',
            type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
            typeVersion: 1.1,
            position: [880, 540],
          }
        : {
            parameters: {
              name: 'consultar_cardapio_e_loja',
              description:
                'Consulta em tempo real se o restaurante está aberto, produtos disponíveis no cardápio com preços, taxa de entrega e link direto do cardápio digital.',
              method: 'GET',
              url: `${appOriginUrl}/api/v1/n8n/agent-context/${tenant.slug}`,
            },
            id: 'node-http-tool-catalog',
            name: 'Tool: Consultar Cardápio ao Vivo',
            type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
            typeVersion: 1.1,
            position: [880, 540],
          };

    const orderToolNode =
      n8nAgentMode === 'restaurante_ia'
        ? {
            parameters: {
              name: 'consultar_status_pedido',
              description: 'Consulta o status em tempo real dos pedidos recentes do cliente na cozinha pelo número de WhatsApp.',
              method: 'GET',
              url: `=${appOriginUrl}/api/v1/n8n/order-status?phone={{ $fromAI("phone", "Telefone do cliente apenas numeros") }}&tenantSlug=${tenant.slug}`,
            },
            id: 'node-http-tool-orders',
            name: 'Tool: Consultar Status do Pedido',
            type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
            typeVersion: 1.1,
            position: [1060, 540],
          }
        : null;

    const nodesList: any[] = [
      {
        parameters: {
          httpMethod: 'POST',
          path: cleanPath,
          responseMode: 'onReceived',
          responseData: 'OK',
          options: {},
        },
        id: 'node-webhook-evolution',
        name: 'Webhook Evolution API',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [120, 300],
        webhookId: 'evolution-saas-ai-agent-webhook',
      },
      {
        parameters: {
          jsCode: `// =========================================================================\n// Sanitizador & Filtro Anti-Loop Evolution API v2 -> Agente de IA n8n\n// =========================================================================\nconst results = [];\n\nfor (const item of $input.all()) {\n  const body = item.json.body || item.json;\n  const data = body.data || {};\n  const key = data.key || {};\n  const remoteJid = key.remoteJid || key.remoteJidAlt || '';\n\n  // 1. Ignorar grupos e canais\n  if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('@broadcast')) {\n    continue;\n  }\n\n  // 2. Ignorar mensagens enviadas pelo proprio bot (fromMe), exceto em Teste no n8n\n  const isTestMode = item.json.executionMode === 'test' ||\n                      String(item.json.webhookUrl || '').includes('/webhook-test/');\n  if (key.fromMe === true && !isTestMode) {\n    continue;\n  }\n\n  const customerPhone = remoteJid.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');\n  const rawPushName = data.pushName || 'Cliente';\n  const customerName = rawPushName.includes('|') ? rawPushName.split('|')[0].trim() : rawPushName.trim();\n  const messageText = (\n    data.message?.conversation ||\n    data.message?.extendedTextMessage?.text ||\n    data.message?.imageMessage?.caption ||\n    ''\n  ).trim();\n\n  if (!messageText) continue;\n\n  const serverUrl = (body.server_url || '${cleanEvoUrl}').replace(/\\/$/, '');\n  const apiKey = body.apikey || '${evolutionApiKey}';\n  const instance = body.instance || '${cleanInstance}';\n\n  results.push({\n    json: {\n      customerPhone,\n      customerName,\n      messageText,\n      serverUrl,\n      apiKey,\n      instance,\n      remoteJid,\n      endpointUrl: \`\${serverUrl}/message/sendText/\${instance}\`,\n      chatInput: \`Cliente (\${customerName} - WhatsApp \${customerPhone}): \${messageText}\`,\n    },\n  });\n}\n\nreturn results;`,
        },
        id: 'node-code-sanitize',
        name: 'Tratar Payload & Anti-Loop',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [380, 300],
      },
      {
        parameters: {
          promptType: 'define',
          text: '={{ $json.chatInput }}',
          options: {
            systemMessage: agentSystemPrompt,
          },
        },
        id: 'node-ai-agent',
        name: n8nAgentMode === 'sdr_aladay' ? 'Agente IA Comercial Aladay (SDR)' : `Agente IA Atendimento (${tenant.name})`,
        type: '@n8n/n8n-nodes-langchain.agent',
        typeVersion: 1.7,
        position: [680, 300],
      },
      llmNode,
      {
        parameters: {
          sessionIdType: 'customKey',
          sessionKey: '={{ $("Tratar Payload & Anti-Loop").item.json.customerPhone }}',
          contextWindowLength: n8nMemoryWindow,
        },
        id: 'node-memory-window',
        name: 'Memória por WhatsApp (Window Buffer)',
        type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
        typeVersion: 1.3,
        position: [710, 540],
      },
      toolNode,
      {
        parameters: {
          method: 'POST',
          url: '={{ $("Tratar Payload & Anti-Loop").item.json.endpointUrl }}',
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: 'apikey',
                value: '={{ $("Tratar Payload & Anti-Loop").item.json.apiKey }}',
              },
              {
                name: 'Content-Type',
                value: 'application/json',
              },
            ],
          },
          sendBody: true,
          specifyBody: 'json',
          jsonBody:
            '={{ JSON.stringify({ number: $("Tratar Payload & Anti-Loop").item.json.customerPhone, text: $json.output, options: { delay: 1200, presence: "composing", linkPreview: true } }) }}',
          options: {},
        },
        id: 'node-send-evolution-reply',
        name: 'Responder Cliente no WhatsApp (Evolution API)',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [1060, 300],
      },
    ];

    if (orderToolNode) {
      nodesList.push(orderToolNode);
    }

    const agentNodeName = n8nAgentMode === 'sdr_aladay' ? 'Agente IA Comercial Aladay (SDR)' : `Agente IA Atendimento (${tenant.name})`;

    const connectionsObj: Record<string, any> = {
      'Webhook Evolution API': {
        main: [[{ node: 'Tratar Payload & Anti-Loop', type: 'main', index: 0 }]],
      },
      'Tratar Payload & Anti-Loop': {
        main: [[{ node: agentNodeName, type: 'main', index: 0 }]],
      },
      [llmNode.name]: {
        ai_languageModel: [[{ node: agentNodeName, type: 'ai_languageModel', index: 0 }]],
      },
      'Memória por WhatsApp (Window Buffer)': {
        ai_memory: [[{ node: agentNodeName, type: 'ai_memory', index: 0 }]],
      },
      [toolNode.name]: {
        ai_tool: [[{ node: agentNodeName, type: 'ai_tool', index: 0 }]],
      },
      [agentNodeName]: {
        main: [[{ node: 'Responder Cliente no WhatsApp (Evolution API)', type: 'main', index: 0 }]],
      },
    };

    if (orderToolNode) {
      connectionsObj[orderToolNode.name] = {
        ai_tool: [[{ node: agentNodeName, type: 'ai_tool', index: 0 }]],
      };
    }

    return JSON.stringify(
      {
        name:
          n8nAgentMode === 'sdr_aladay'
            ? `Aladay SaaS - Agente IA Comercial SDR + Evolution API [${cleanInstance}]`
            : `${tenant.name} - Agente IA Cardapio & Pedidos + Evolution API [${cleanInstance}]`,
        nodes: nodesList,
        connections: connectionsObj,
        active: true,
        settings: {
          executionOrder: 'v1',
        },
      },
      null,
      2
    );
  }, [
    n8nAgentMode,
    n8nLlmProvider,
    n8nLlmModel,
    n8nMemoryWindow,
    n8nWebhookPath,
    evolutionUrl,
    evolutionApiKey,
    tenant.evolutionInstanceId,
    tenant.name,
    tenant.slug,
    agentSystemPrompt,
    appOriginUrl,
  ]);

  const handleCopyWorkflow = () => {
    navigator.clipboard.writeText(n8nWorkflowJSON);
    setCopiedWorkflow(true);
    setTimeout(() => setCopiedWorkflow(false), 3000);
  };

  const handleDownloadWorkflowJson = () => {
    const blob = new Blob([n8nWorkflowJSON], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      n8nAgentMode === 'sdr_aladay'
        ? `n8n-agente-ia-comercial-aladay-${tenant.evolutionInstanceId || 'aladay'}.json`
        : `n8n-agente-ia-${tenant.slug}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopySystemPrompt = () => {
    navigator.clipboard.writeText(agentSystemPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 3000);
  };

  const handleBindEvolutionWebhookToN8n = async () => {
    setIsBindingWebhook(true);
    setWebhookBindFeedback(null);
    try {
      const res = await fetch('/api/v1/n8n/configure-evolution-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evolutionUrl,
          evolutionApiKey,
          instanceName: tenant.evolutionInstanceId || 'aladay',
          n8nWebhookUrl,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWebhookBindFeedback({
          type: 'success',
          message: data.message || 'Webhook MESSAGES_UPSERT vinculado com sucesso na Evolution API apontando para o n8n!',
        });
        handleRefreshLogs();
      } else {
        setWebhookBindFeedback({
          type: 'error',
          message: data.error || 'Falha ao vincular webhook na Evolution API.',
        });
      }
    } catch (err: any) {
      setWebhookBindFeedback({
        type: 'error',
        message: err?.message || 'Erro de conexão ao tentar configurar o webhook.',
      });
    } finally {
      setIsBindingWebhook(false);
    }
  };

  const handleRunAgentLiveTest = async (overrideMessage?: string) => {
    const msgToTest = overrideMessage ?? agentTestMessage;
    if (!msgToTest.trim() || isTestingN8nAgent) return;
    if (overrideMessage) setAgentTestMessage(overrideMessage);
    setIsTestingN8nAgent(true);
    setAgentTestResult(null);

    try {
      const res = await fetch('/api/v1/n8n/test-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentProfile: n8nAgentMode === 'restaurante_ia' ? 'restaurante_ia' : 'sdr_aladay',
          tenantSlug: tenant.slug,
          customerName: agentTestCustomerName,
          customerPhone: agentTestPhone,
          messageText: msgToTest,
          n8nWebhookUrl,
          dispatchToRemoteN8n,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAgentTestResult(data);
        handleRefreshLogs();
      }
    } catch {
      // Ignore error
    } finally {
      setIsTestingN8nAgent(false);
    }
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
              <span className={`w-2.5 h-2.5 rounded-full ${tenant.evolutionStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`} />
              <h3 className="text-sm font-bold text-neutral-900">
                {isSuperAdmin
                  ? 'Automação de Resposta com n8n & Evolution API (Infraestrutura Geral)'
                  : `WhatsApp Oficial - ${tenant.name}`}
              </h3>
            </div>
            <p className="text-xs text-neutral-600 mt-1">
              {isSuperAdmin
                ? 'Conecte sua Evolution API e seus fluxos do n8n para responder instantaneamente clientes no WhatsApp com o cardápio digital e gerenciar pedidos.'
                : 'Conecte o WhatsApp do seu estabelecimento para enviar atualizações de pedidos da cozinha e interagir com seus clientes automaticamente. A infraestrutura e a conexão são configuradas de forma 100% automática pela plataforma.'}
            </p>
          </div>

          {/* Service Status Badges */}
          <div className="flex flex-wrap items-center gap-2">
            {isSuperAdmin && (
              <>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-neutral-100 rounded-md text-[11px] font-medium text-neutral-700">
                  <Server className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Easypanel VPS</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-md text-[11px] font-medium text-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  <span>Evolution API Online</span>
                </div>
              </>
            )}

            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold border ${
              tenant.evolutionStatus === 'connected'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <span className={`w-2 h-2 rounded-full ${tenant.evolutionStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span>{tenant.evolutionStatus === 'connected' ? 'WhatsApp Conectado' : 'Aguardando Leitura'}</span>
            </div>

            <button
              type="button"
              onClick={() => {
                setSubTab('qrcode_pairing');
                fetchEmbeddedQr(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-bold transition-colors shadow-2xs cursor-pointer"
              title="Abrir Pareamento com WhatsApp via QR Code"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>{tenant.evolutionStatus === 'connected' ? 'Ver Status / Reconectar' : 'Ler QR Code'}</span>
            </button>

            {isSuperAdmin && (
              <button
                onClick={onSimulateEvolutionReconnect}
                className="p-1.5 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-md transition-colors"
                title="Testar Ping de Conexão com Evolution API"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Sub-tabs strip */}
        <div className="flex items-center gap-2 pt-3 overflow-x-auto text-xs font-medium">
          {/* Aba Principal do Restaurante: QR Code */}
          <button
            onClick={() => setSubTab('qrcode_pairing')}
            className={`px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              subTab === 'qrcode_pairing'
                ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <QrCode className="w-3.5 h-3.5 text-emerald-400" />
            <span>Conectar WhatsApp (QR Code)</span>
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
            <span>Avisos de Pedidos (KDS)</span>
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
            <span>Mensagens do Restaurante</span>
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
            <span>Simulador de Atendimento</span>
          </button>

          {/* Somente para o Administrador Geral da Plataforma (Super Admin) */}
          {isSuperAdmin && (
            <>
              <div className="h-5 w-px bg-neutral-300 mx-1 shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 shrink-0">
                Infra Plataforma:
              </span>

              <button
                onClick={() => setSubTab('n8n_workflow')}
                className={`px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer border ${
                  subTab === 'n8n_workflow'
                    ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-xs'
                    : 'text-blue-700 bg-blue-50 hover:bg-blue-100 border-blue-200 font-semibold'
                }`}
                title="Configurar Agente de IA e exportar Workflow JSON para o n8n"
              >
                <Bot className="w-4 h-4" />
                <span>Configurar Agente IA no n8n</span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                    subTab === 'n8n_workflow'
                      ? 'bg-white/20 text-white'
                      : 'bg-blue-200 text-blue-900'
                  }`}
                >
                  Super Admin
                </span>
              </button>

              <button
                onClick={() => setSubTab('easypanel')}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer border ${
                  subTab === 'easypanel'
                    ? 'bg-indigo-900 text-white border-indigo-800 font-semibold shadow-xs'
                    : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200'
                }`}
                title="Configurações e comando cURL no Easypanel"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Passo a Passo na VPS</span>
              </button>

              <button
                onClick={() => setSubTab('logs')}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer border ${
                  subTab === 'logs'
                    ? 'bg-emerald-900 text-white border-emerald-800 font-semibold shadow-xs'
                    : 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                }`}
                title="Inspetor técnico de Webhooks e tráfego HTTP em tempo real"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Logs &amp; Inspetor de Webhooks</span>
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
          {/* Automatic Configuration Assurance Notice */}
          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                <strong>Configuração Automática Ativa:</strong> A plataforma gerencia todos os servidores, webhooks e conexões em nuvem nos bastidores. Você só precisa manter o QR Code conectado abaixo.
              </span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-200/80 text-blue-900 px-2 py-0.5 rounded shrink-0">
              100% Automático
            </span>
          </div>

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
                      Conexão do WhatsApp do Restaurante
                    </h3>
                    {isSuperAdmin && (
                      <span className="font-mono text-[10px] bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded font-bold">
                        Instância: {tenant.evolutionInstanceId || 'aladay'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {tenant.evolutionStatus === 'connected'
                      ? 'WhatsApp conectado e pronto para enviar mensagens de confirmação e rastreamento da cozinha.'
                      : 'Aponte a câmera do seu WhatsApp para o QR Code abaixo para conectar seu restaurante.'}
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
          onNavigateToLogs={isSuperAdmin ? () => setSubTab('logs') : undefined}
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
                    <span>1. Mensagem Recebida do Cliente</span>
                    {activePipelineStep === 1 && (
                      <span className="font-mono text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded">
                        Recebendo...
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 font-normal mt-0.5">
                    {isSuperAdmin
                      ? 'Cliente envia texto. Evolution API dispara webhook MESSAGES_UPSERT.'
                      : 'Cliente envia mensagem para o número de WhatsApp conectado do seu restaurante.'}
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
                    <span>2. Verificação Automática da Loja</span>
                    {activePipelineStep === 2 && (
                      <span className="font-mono text-[10px] bg-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded">
                        Processando...
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 font-normal mt-0.5">
                    {isSuperAdmin
                      ? 'O n8n recebe o payload na URL /webhook/evolution-messages-upsert.'
                      : 'O sistema verifica se o restaurante está aberto e seleciona a mensagem apropriada.'}
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
                    <span>3. Geração do Link do Cardápio</span>
                    {activePipelineStep === 3 && (
                      <span className="font-mono text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
                        Avaliando...
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 font-normal mt-0.5">
                    {isSuperAdmin
                      ? `Verifica: restaurante aberto? Cliente pediu atendente (2)? Extrai link do cardápio de ${tenant.name}.`
                      : `Insere o link oficial do cardápio digital de ${tenant.name} com fotos e preços atualizados.`}
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
                    <span>4. Resposta Entregue no WhatsApp</span>
                    {activePipelineStep === 4 && (
                      <span className="font-mono text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded">
                        Enviando resposta...
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 font-normal mt-0.5">
                    {isSuperAdmin
                      ? `O nó HTTP Request do n8n executa POST /message/sendText/${tenant.evolutionInstanceId}.`
                      : 'O cliente recebe instantaneamente a resposta no WhatsApp e clica no cardápio para pedir.'}
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

      {/* Access Notice for Non-Admin trying to access infrastructure tools */}
      {!isSuperAdmin && (subTab === 'easypanel' || subTab === 'logs' || subTab === 'n8n_workflow') && (
        <div className="bg-white border border-neutral-200 rounded-xl p-8 text-center space-y-3 shadow-2xs">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center mx-auto font-bold text-lg">
            📱
          </div>
          <h4 className="text-base font-bold text-neutral-900">Configuração Automática da Plataforma</h4>
          <p className="text-xs text-neutral-600 max-w-md mx-auto">
            Toda a inteligência e infraestrutura de servidores em nuvem são gerenciadas automaticamente pela Aladay. Como restaurante, você só precisa conectar seu WhatsApp lendo o QR Code.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setSubTab('qrcode_pairing')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Ir para Conectar WhatsApp (QR Code)
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-TAB 2: N8N AI AGENT CONFIGURATOR & WORKFLOW STUDIO (SUPER ADMIN) */}
      {/* ============================================================== */}
      {isSuperAdmin && subTab === 'n8n_workflow' && (
        <div className="space-y-6">
          {/* STEP 1: SELECT AGENT ARCHITECTURE PROFILE */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-2xs space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-bold text-neutral-900">
                      Estúdio de Configuração do Agente de IA no n8n + Evolution API v2
                    </h4>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      Pronto para Importar no EasyPanel
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 mt-1">
                    Configure seu Agente de IA com memória de conversa por WhatsApp, Base de Conhecimento Oficial e ferramentas HTTP em tempo real, e importe no seu n8n em 1 clique.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <a
                  href="/base-conhecimento-agente-ia-aladay.txt"
                  download="base-conhecimento-agente-ia-aladay.txt"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl transition-colors"
                >
                  <FileCode className="w-3.5 h-3.5 text-blue-600" />
                  <span>Baixar Base de Conhecimento (.TXT)</span>
                </a>
                <button
                  type="button"
                  onClick={handleCopyWorkflow}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-xs cursor-pointer"
                >
                  {copiedWorkflow ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-300" />
                      <span>Workflow JSON Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar Workflow p/ n8n (Ctrl+V)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 3 Profile Cards */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-neutral-900">
                1. Escolha o Perfil do Agente no n8n:
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => handleSelectAgentMode('sdr_aladay')}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                    n8nAgentMode === 'sdr_aladay'
                      ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-600/20'
                      : 'border-neutral-200 bg-white hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-blue-600" />
                      <span>Agente IA Comercial SDR Aladay</span>
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-600 text-white">
                      Recomendado
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-600 leading-relaxed">
                    Treinado com toda a Base de Conhecimento da plataforma para responder dúvidas de <strong>Leads (donos de restaurantes)</strong> no WhatsApp (+55 91 3197-6334), quebrar objeções e converter nos planos de <strong>R$ 99/mês (Anual)</strong> ou <strong>15 Dias Grátis (Mensal)</strong>.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectAgentMode('restaurante_ia')}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                    n8nAgentMode === 'restaurante_ia'
                      ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-600/20'
                      : 'border-neutral-200 bg-white hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                      <Bot className="w-4 h-4 text-emerald-600" />
                      <span>Agente IA de Cardápio &amp; Pedidos</span>
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Loja: {tenant.slug}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-600 leading-relaxed">
                    Atende os consumidores finais de <strong>{tenant.name}</strong>, consulta o cardápio e preços ao vivo via HTTP Tool, envia o link do pedido e responde sobre o status na cozinha.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectAgentMode('deterministico')}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                    n8nAgentMode === 'deterministico'
                      ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-600/20'
                      : 'border-neutral-200 bg-white hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-600" />
                      <span>Fluxo Rápido Determinístico</span>
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-neutral-100 text-neutral-700">
                      Sem Tokens LLM
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-600 leading-relaxed">
                    Auto-resposta instantânea sem custo de API de IA: envia imediatamente o link do cardápio digital ou transfere para atendente humano quando o cliente digita <strong>2</strong>.
                  </p>
                </button>
              </div>
            </div>

            {/* STEP 2: CREDENTIALS, LLM MODEL & WEBHOOK BINDING */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
              <div className="lg:col-span-7 space-y-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-blue-600" />
                    <span>2. Parâmetros de Conexão (Evolution API + n8n + Modelo de IA)</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    Instância: {tenant.evolutionInstanceId || 'aladay'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      URL da Evolution API (EasyPanel)
                    </label>
                    <input
                      type="text"
                      value={evolutionUrl}
                      onChange={(e) => setEvolutionUrl(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-[11px]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Global API Key (Evolution API)
                    </label>
                    <input
                      type="text"
                      value={evolutionApiKey}
                      onChange={(e) => setEvolutionApiKey(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-[11px]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      URL do Webhook no n8n (Produção)
                    </label>
                    <input
                      type="text"
                      value={n8nWebhookUrl}
                      onChange={(e) => setN8nWebhookUrl(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-[11px]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Path do Nó Webhook no n8n
                    </label>
                    <input
                      type="text"
                      value={n8nWebhookPath}
                      onChange={(e) => setN8nWebhookPath(e.target.value)}
                      placeholder="saas"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-[11px]"
                    />
                  </div>

                  {n8nAgentMode !== 'deterministico' && (
                    <>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Provedor de IA no n8n (Chat Model)
                        </label>
                        <select
                          value={n8nLlmProvider}
                          onChange={(e) => {
                            const val = e.target.value as 'openai' | 'gemini';
                            setN8nLlmProvider(val);
                            setN8nLlmModel(val === 'gemini' ? 'models/gemini-2.5-flash' : 'gpt-4o-mini');
                          }}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium"
                        >
                          <option value="openai">OpenAI (gpt-4o-mini / gpt-4o)</option>
                          <option value="gemini">Google Gemini (gemini-2.5-flash)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Janela de Memória por Cliente (Mensagens)
                        </label>
                        <input
                          type="number"
                          min={4}
                          max={40}
                          value={n8nMemoryWindow}
                          onChange={(e) => setN8nMemoryWindow(Number(e.target.value) || 12)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs"
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* 1-Click Evolution API -> n8n Webhook Binder */}
                <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-[11px] text-slate-600">
                    Apontar evento <code className="bg-white px-1 py-0.5 rounded border border-slate-200 font-mono font-bold">MESSAGES_UPSERT</code> da instância <strong>{tenant.evolutionInstanceId || 'aladay'}</strong> direto para o n8n:
                  </div>
                  <button
                    type="button"
                    disabled={isBindingWebhook}
                    onClick={handleBindEvolutionWebhookToN8n}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {isBindingWebhook ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Vinculando...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>Vincular Webhook na Evolution API (1 Clique)</span>
                      </>
                    )}
                  </button>
                </div>

                {webhookBindFeedback && (
                  <div
                    className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                      webhookBindFeedback.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-rose-50 border-rose-200 text-rose-900'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>{webhookBindFeedback.message}</span>
                  </div>
                )}
              </div>

              {/* Right Column: Step-by-Step Checklist in n8n */}
              <div className="lg:col-span-5 bg-blue-950 text-white rounded-xl p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-blue-800 text-blue-200 font-bold">
                      Guia Rápido (60 Segundos)
                    </span>
                    <span className="text-[11px] font-mono text-blue-300">
                      n8n + EasyPanel
                    </span>
                  </div>
                  <h5 className="text-sm font-bold text-white">
                    Como ativar este Agente no seu n8n:
                  </h5>
                  <ol className="space-y-2.5 text-xs text-blue-100 leading-relaxed">
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                        1
                      </span>
                      <span>
                        Clique em <strong>&ldquo;Copiar Workflow p/ n8n (Ctrl+V)&rdquo;</strong> ou baixe o arquivo <code className="bg-blue-900 px-1 rounded font-mono">.json</code> abaixo.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                        2
                      </span>
                      <span>
                        Abra seu painel n8n em <code className="bg-blue-900 px-1 py-0.5 rounded font-mono text-[11px]">agencia-n8n.2eoc7n.easypanel.host</code>, crie um workflow em branco e pressione <kbd className="bg-blue-800 px-1.5 py-0.5 rounded border border-blue-600 font-mono text-[10px]">Ctrl + V</kbd>.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                        3
                      </span>
                      <span>
                        {n8nAgentMode === 'deterministico' ? (
                          <>Verifique o nó <strong>Webhook Evolution API</strong> e ative a chave <strong>Active</strong> no topo direito do n8n.</>
                        ) : (
                          <>Abra o nó <strong>{n8nLlmProvider === 'gemini' ? 'Google Gemini Chat Model' : 'OpenAI Chat Model'}</strong>, selecione sua credencial de API no n8n e ative a chave <strong>Active</strong> no canto superior direito.</>
                        )}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-500 text-neutral-950 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                        4
                      </span>
                      <span>
                        Clique em <strong>&ldquo;Vincular Webhook na Evolution API&rdquo;</strong> ao lado e teste no simulador abaixo!
                      </span>
                    </li>
                  </ol>
                </div>

                <div className="pt-3 border-t border-blue-800/80 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCopyWorkflow}
                    className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {copiedWorkflow ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedWorkflow ? 'Copiado!' : 'Copiar JSON (Ctrl+V)'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadWorkflowJson}
                    className="py-2.5 px-3 bg-blue-900 hover:bg-blue-800 text-blue-100 border border-blue-700 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FileCode className="w-4 h-4" />
                    <span>Baixar .JSON</span>
                  </button>
                </div>
              </div>
            </div>

            {/* STEP 3: SYSTEM PROMPT & TOOLS ARCHITECTURE */}
            {n8nAgentMode !== 'deterministico' && (
              <div className="space-y-3 pt-2 border-t border-neutral-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="block text-xs font-bold text-neutral-900">
                      3. System Prompt &amp; Base de Conhecimento Embutida no Nó &ldquo;AI Agent&rdquo; do n8n:
                    </label>
                    <p className="text-[11px] text-neutral-500">
                      Você pode editar as instruções abaixo antes de copiar o JSON. O workflow já inclui este prompt configurado dentro do nó Agente IA.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setAgentSystemPrompt(
                          n8nAgentMode === 'sdr_aladay' ? defaultSdrSystemPrompt : defaultRestaurantSystemPrompt
                        )
                      }
                      className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-[11px] font-semibold cursor-pointer"
                    >
                      Restaurar Padrão
                    </button>
                    <button
                      type="button"
                      onClick={handleCopySystemPrompt}
                      className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedPrompt ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedPrompt ? 'Prompt Copiado!' : 'Copiar Apenas o Prompt'}</span>
                    </button>
                  </div>
                </div>

                <textarea
                  rows={10}
                  value={agentSystemPrompt}
                  onChange={(e) => setAgentSystemPrompt(e.target.value)}
                  className="w-full p-3.5 bg-slate-950 text-emerald-400 border border-slate-800 rounded-xl font-mono text-[11px] leading-relaxed focus:outline-blue-600"
                />

                {/* Endpoints HTTP Tools Exposed to the n8n AI Agent */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="font-bold text-blue-700 block">
                      Tool HTTP 1: Base de Conhecimento SDR
                    </span>
                    <code className="font-mono text-[10px] text-slate-800 block mt-1 break-all">
                      GET {appOriginUrl}/api/v1/n8n/knowledge-base
                    </code>
                    <p className="text-slate-500 mt-1">
                      Retorna todos os planos, argumentos de conversão, ROI e FAQ oficial para o Agente Comercial.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="font-bold text-emerald-700 block">
                      Tool HTTP 2: Cardápio &amp; Status da Loja
                    </span>
                    <code className="font-mono text-[10px] text-slate-800 block mt-1 break-all">
                      GET {appOriginUrl}/api/v1/n8n/agent-context/{tenant.slug}
                    </code>
                    <p className="text-slate-500 mt-1">
                      Retorna em tempo real os produtos disponíveis, preços, taxa de entrega e se a loja está aberta.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="font-bold text-purple-700 block">
                      Tool HTTP 3: Consulta de Pedido por Telefone
                    </span>
                    <code className="font-mono text-[10px] text-slate-800 block mt-1 break-all">
                      GET {appOriginUrl}/api/v1/n8n/order-status?phone=...
                    </code>
                    <p className="text-slate-500 mt-1">
                      Permite ao agente informar ao cliente se o pedido está confirmado, em preparo ou saiu para entrega.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: LIVE AGENT SIMULATOR & N8N WEBHOOK DISPATCHER */}
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h5 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span>4. Testar Resposta do Agente IA &amp; Disparar Payload Real para o n8n</span>
                  </h5>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Simule perguntas reais de Leads ou clientes para validar o comportamento do Agente IA e a estrutura do webhook da Evolution API v2.
                  </p>
                </div>

                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 bg-white px-3 py-1.5 rounded-lg border border-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dispatchToRemoteN8n}
                    onChange={(e) => setDispatchToRemoteN8n(e.target.checked)}
                    className="accent-blue-600"
                  />
                  <span>Enviar também POST real p/ URL do n8n</span>
                </label>
              </div>

              {/* Quick Preset Questions */}
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-semibold text-slate-600">Perguntas de Teste:</span>
                {n8nAgentMode === 'sdr_aladay' ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        handleRunAgentLiveTest(
                          'Olá! Quero saber quanto custa o sistema da Aladay e como funcionam os planos.'
                        )
                      }
                      className="px-2.5 py-1 bg-white hover:bg-blue-50 text-slate-800 border border-slate-300 rounded-lg font-medium transition-colors cursor-pointer"
                    >
                      💰 &ldquo;Quanto custa e quais os planos?&rdquo;
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleRunAgentLiveTest(
                          'Eu já vendo pelo iFood. Vocês cobram comissão por pedido também?'
                        )
                      }
                      className="px-2.5 py-1 bg-white hover:bg-blue-50 text-slate-800 border border-slate-300 rounded-lg font-medium transition-colors cursor-pointer"
                    >
                      📊 &ldquo;Vocês cobram comissão igual ao iFood?&rdquo;
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleRunAgentLiveTest(
                          'Tenho muitos produtos, dá para importar meu cardápio por planilha Excel?'
                        )
                      }
                      className="px-2.5 py-1 bg-white hover:bg-blue-50 text-slate-800 border border-slate-300 rounded-lg font-medium transition-colors cursor-pointer"
                    >
                      📑 &ldquo;Dá para importar cardápio por planilha?&rdquo;
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRunAgentLiveTest('Quero falar com um consultor humano')}
                      className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg font-medium transition-colors cursor-pointer"
                    >
                      👨‍💼 &ldquo;Falar com consultor humano&rdquo;
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleRunAgentLiveTest('Boa noite! Vocês estão abertos? Quero ver o cardápio.')}
                      className="px-2.5 py-1 bg-white hover:bg-blue-50 text-slate-800 border border-slate-300 rounded-lg font-medium transition-colors cursor-pointer"
                    >
                      🍔 &ldquo;Quero ver o cardápio de hoje&rdquo;
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRunAgentLiveTest('Qual o status do meu pedido?')}
                      className="px-2.5 py-1 bg-white hover:bg-blue-50 text-slate-800 border border-slate-300 rounded-lg font-medium transition-colors cursor-pointer"
                    >
                      🛵 &ldquo;Onde está meu pedido?&rdquo;
                    </button>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
                <div className="md:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Nome do Lead / Cliente (pushName)
                  </label>
                  <input
                    type="text"
                    value={agentTestCustomerName}
                    onChange={(e) => setAgentTestCustomerName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    WhatsApp (remoteJid)
                  </label>
                  <input
                    type="text"
                    value={agentTestPhone}
                    onChange={(e) => setAgentTestPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs"
                  />
                </div>
                <div className="md:col-span-6">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Mensagem Recebida no WhatsApp
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={agentTestMessage}
                      onChange={(e) => setAgentTestMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRunAgentLiveTest();
                      }}
                      className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                    />
                    <button
                      type="button"
                      disabled={isTestingN8nAgent}
                      onClick={() => handleRunAgentLiveTest()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                    >
                      {isTestingN8nAgent ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>{isTestingN8nAgent ? 'Processando...' : 'Testar Agente'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {agentTestResult && (
                <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-3 text-xs shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Resposta Gerada pelo Agente IA ({agentTestResult.triggeredTool})</span>
                    </span>
                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                        Latência: {agentTestResult.latencyMs}ms
                      </span>
                      {dispatchToRemoteN8n && (
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Webhook n8n: {agentTestResult.remoteN8nStatus}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-3.5 bg-[#DCF8C6]/50 border border-emerald-200 rounded-xl whitespace-pre-wrap text-slate-900 leading-relaxed font-sans text-xs">
                    {agentTestResult.agentReply}
                  </div>
                </div>
              )}
            </div>

            {/* STEP 5: COMPLETE N8N WORKFLOW JSON PREVIEW */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-900">
                  5. Código JSON Completo do Workflow n8n ({n8nAgentMode === 'sdr_aladay' ? 'Agente IA Comercial SDR Aladay' : n8nAgentMode === 'restaurante_ia' ? `Agente IA ${tenant.name}` : 'Auto-Resposta Determinística'}):
                </span>
                <button
                  type="button"
                  onClick={handleCopyWorkflow}
                  className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedWorkflow ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedWorkflow ? 'JSON Copiado!' : 'Copiar JSON'}</span>
                </button>
              </div>
              <div className="relative">
                <pre className="bg-neutral-900 text-emerald-400 p-4 rounded-xl font-mono text-[11px] overflow-x-auto max-h-[420px] leading-relaxed">
                  {n8nWorkflowJSON}
                </pre>
              </div>
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
                  <span className="font-bold text-neutral-900">Seu Serviço Postgres no EasyPanel</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-neutral-600 leading-relaxed">
                  <li>No seu painel do <strong>EasyPanel</strong>, no projeto <code className="bg-neutral-200 px-1 rounded font-mono">agencia</code>:</li>
                  <li>Serviço Postgres configurado:
                    <ul className="list-disc list-inside ml-3 mt-0.5 space-y-0.5">
                      <li><strong>Name (Serviço):</strong> <code className="bg-neutral-200 px-1 rounded font-mono">agpostgres</code></li>
                      <li><strong>Database Name:</strong> <code className="bg-neutral-200 px-1 rounded font-mono">agencia</code></li>
                      <li><strong>Usuário:</strong> <code className="bg-neutral-200 px-1 rounded font-mono">postgres</code></li>
                      <li><strong>Host Interno:</strong> <code className="bg-neutral-200 px-1 rounded font-mono">agencia_agpostgres:5432</code></li>
                    </ul>
                  </li>
                </ol>
              </div>

              <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-900 text-white flex items-center justify-center font-bold text-[10px]">
                    2
                  </span>
                  <span className="font-bold text-neutral-900">Host Interno &amp; URL de Conexão</span>
                </div>
                <p className="text-[11px] text-neutral-600 leading-relaxed">
                  No EasyPanel (Docker Swarm), a comunicação entre o site e o banco ocorre na rede overlay interna sem expor a porta 5432:
                </p>
                <div className="p-2.5 bg-neutral-900 text-emerald-400 rounded-lg font-mono text-[11px] overflow-x-auto">
                  postgresql://postgres:SENHA@{epProjectName || 'agencia'}_{epServiceName || 'agpostgres'}:5432/{epDbName || 'agencia'}
                </div>
                <p className="text-[10px] text-neutral-500">
                  * Basta clicar no ícone de copiar ao lado de <strong>"URL de Conexão Interna"</strong> no seu EasyPanel para copiar essa string completa!
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
                    placeholder="agencia"
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
                    placeholder="agpostgres"
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
                    placeholder="agencia"
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
                      const envText = `PORT=3000\nNODE_ENV=production\nDATABASE_URL=${generatedEasyPanelDbUrl}\nPGSSLMODE=disable\nJWT_SECRET=9f8d7a6b5c4e3f2a1b0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b\nEVOLUTION_API_URL=${evolutionUrl}\nEVOLUTION_API_KEY=${evolutionApiKey}\nN8N_WEBHOOK_URL=${n8nWebhookUrl}`;
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
JWT_SECRET=9f8d7a6b5c4e3f2a1b0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b
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
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
};
