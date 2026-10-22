import React, { useState } from 'react';
import { Database, GitCommit, ShieldAlert, Cpu, ArrowRight, CheckCircle2, Copy, Check } from 'lucide-react';

export const TechDiagramsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'outbox' | 'rls' | 'states'>('outbox');
  const [activeStep, setActiveStep] = useState<number>(1);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  const sqlDdl = `-- ============================================================================
-- ARQUITETURA MULTI-TENANT ROBUSTA COM ROW LEVEL SECURITY (RLS) - POSTGRESQL 15+
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tenants (Restaurantes)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(30) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabela de Pedidos com RLS
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_number SERIAL,
    customer_phone VARCHAR(30) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('delivery', 'pickup')),
    delivery_address TEXT,
    subtotal_cents INTEGER NOT NULL,
    delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'received',
    payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    idempotency_key UUID UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ativação Obrigatória do RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Política Estrita: A conexão só enxerga linhas do tenant definido na sessão
CREATE POLICY tenant_isolation_orders ON orders
    AS RESTRICTIVE
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 3. Tabela Transacional Outbox (Garante que mensagens nunca se percam)
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    aggregate_type VARCHAR(50) NOT NULL, -- 'order'
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,    -- 'order.created'
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_outbox_pending ON outbox_events(status, next_attempt_at) WHERE status = 'pending';`;

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlDdl);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Selector */}
      <div className="bg-white border border-neutral-200 rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
              <span>Engenharia de Software</span>
              <span aria-hidden="true">·</span>
              <span>Diagramas C4 &amp; Máquinas de Estado</span>
              <span aria-hidden="true">·</span>
              <span>Resiliência de Integração</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-neutral-900">
              Arquitetura de Dados, Outbox Pattern &amp; Máquinas de Estado
            </h2>
          </div>

          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setActiveTab('outbox')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'outbox'
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              Padrão Outbox (WhatsApp)
            </button>
            <button
              onClick={() => setActiveTab('rls')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'rls'
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              Multi-Tenancy &amp; RLS
            </button>
            <button
              onClick={() => setActiveTab('states')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'states'
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              Desacoplamento de Estados
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: OUTBOX PATTERN STEPPER */}
      {activeTab === 'outbox' && (
        <div className="bg-white border border-neutral-200 rounded-lg p-6 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <GitCommit className="w-4 h-4 text-neutral-700" />
              Ciclo de Vida do Pedido com Transactional Outbox Pattern
            </h3>
            <p className="text-xs text-neutral-600 mt-1">
              Como garantimos que pedidos nunca se percam mesmo se o WhatsApp, a Evolution API ou a rede do restaurante oscilarem.
            </p>
          </div>

          {/* Stepper buttons */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            {[
              { step: 1, title: '1. Validação Zero-Trust', desc: 'Recálculo no Servidor' },
              { step: 2, title: '2. Transação Atômica', desc: 'Order + Outbox Event' },
              { step: 3, title: '3. Worker Assíncrono', desc: 'Fila Redis / BullMQ' },
              { step: 4, title: '4. Evolution API', desc: 'Disparo HTTP / Session' },
              { step: 5, title: '5. Ack & Notificação', desc: 'Cliente e Cozinha' },
            ].map((s) => (
              <button
                key={s.step}
                onClick={() => setActiveStep(s.step)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  activeStep === s.step
                    ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs'
                    : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-700'
                }`}
              >
                <span className="text-[11px] font-bold block">{s.title}</span>
                <span
                  className={`text-[10px] block mt-0.5 ${
                    activeStep === s.step ? 'text-neutral-300' : 'text-neutral-500'
                  }`}
                >
                  {s.desc}
                </span>
              </button>
            ))}
          </div>

          {/* Step Detail Card */}
          <div className="p-5 bg-neutral-50 border border-neutral-200 rounded-lg">
            {activeStep === 1 && (
              <div className="space-y-3">
                <span className="text-xs font-mono font-bold text-neutral-500">ETAPA 01</span>
                <h4 className="text-sm font-bold text-neutral-900">
                  Validação do Carrinho e Recálculo Integral no Servidor
                </h4>
                <p className="text-xs text-neutral-700 leading-relaxed">
                  O cliente envia apenas as referências: <code className="bg-neutral-200 px-1 py-0.5 rounded text-[11px]">productId</code>,{' '}
                  <code className="bg-neutral-200 px-1 py-0.5 rounded text-[11px]">optionId</code> e quantidade. O backend consulta a base de dados oficial, ignora qualquer preço passado pelo navegador, verifica se o restaurante está dentro do horário de funcionamento e valida se a taxa de entrega é compatível com o endereço.
                </p>
                <div className="p-3 bg-white border border-neutral-200 rounded font-mono text-[11px] text-neutral-800">
                  POST /api/v1/orders/checkout <br />
                  Header: Idempotency-Key: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
                </div>
              </div>
            )}

            {activeStep === 2 && (
              <div className="space-y-3">
                <span className="text-xs font-mono font-bold text-neutral-500">ETAPA 02</span>
                <h4 className="text-sm font-bold text-neutral-900">
                  Transação Única SQL: Gravação do Pedido e do Evento Outbox
                </h4>
                <p className="text-xs text-neutral-700 leading-relaxed">
                  Dentro da <strong>mesma transação ACID</strong> no PostgreSQL, o sistema grava o registro na tabela <code className="bg-neutral-200 px-1 py-0.5 rounded text-[11px]">orders</code> e um registro correspondente na tabela <code className="bg-neutral-200 px-1 py-0.5 rounded text-[11px]">outbox_events</code>. Se o banco falhar, nada é gravado. Se o banco comitar, a garantia de entrega da mensagem no WhatsApp está selada.
                </p>
                <div className="p-3 bg-white border border-neutral-200 rounded font-mono text-[11px] text-neutral-800">
                  BEGIN TRANSACTION; <br />
                  INSERT INTO orders (...) VALUES (...); <br />
                  INSERT INTO outbox_events (aggregate_type, event_type, payload) VALUES (&apos;order&apos;, &apos;order.created&apos;, ...); <br />
                  COMMIT;
                </div>
              </div>
            )}

            {activeStep === 3 && (
              <div className="space-y-3">
                <span className="text-xs font-mono font-bold text-neutral-500">ETAPA 03</span>
                <h4 className="text-sm font-bold text-neutral-900">
                  Worker Assíncrono com BullMQ e Fila Redis
                </h4>
                <p className="text-xs text-neutral-700 leading-relaxed">
                  Um processo em segundo plano (Worker) consome a tabela Outbox ou ouve a fila de mensagens do Redis. Isso desacopla a requisição HTTP do usuário: o cliente recebe a tela de confirmação em 120ms sem esperar que a API externa do WhatsApp responda.
                </p>
                <div className="p-3 bg-white border border-neutral-200 rounded font-mono text-[11px] text-neutral-800">
                  BullMQ Queue &quot;whatsapp-delivery&quot; &rarr; Concurrency: 5 jobs/sec por instância &rarr; Backoff Exponencial
                </div>
              </div>
            )}

            {activeStep === 4 && (
              <div className="space-y-3">
                <span className="text-xs font-mono font-bold text-neutral-500">ETAPA 04</span>
                <h4 className="text-sm font-bold text-neutral-900">
                  Invocação Segura da Instância Dedicada na Evolution API
                </h4>
                <p className="text-xs text-neutral-700 leading-relaxed">
                  O worker carrega a chave secreta e o identificador da instância do restaurante (<code className="bg-neutral-200 px-1 py-0.5 rounded text-[11px]">instancia_brasas_burger</code>) e faz uma requisição HTTP autenticada para o container da Evolution API disparar o template padronizado para o WhatsApp do consumidor.
                </p>
                <div className="p-3 bg-white border border-neutral-200 rounded font-mono text-[11px] text-neutral-800">
                  POST https://evolution.infra.interno/message/sendText/instancia_brasas_burger <br />
                  Headers: &lbrace; &quot;apikey&quot;: &quot;[SECRET_INTERNAL_KEY]&quot; &rbrace;
                </div>
              </div>
            )}

            {activeStep === 5 && (
              <div className="space-y-3">
                <span className="text-xs font-mono font-bold text-neutral-500">ETAPA 05</span>
                <h4 className="text-sm font-bold text-neutral-900">
                  Acknowledge, Atualização de Status e Notificação da Cozinha
                </h4>
                <p className="text-xs text-neutral-700 leading-relaxed">
                  A Evolution API retorna HTTP 200 com o ID da mensagem. O worker marca o evento outbox como <code className="bg-neutral-200 px-1 py-0.5 rounded text-[11px]">completed</code>. O painel KDS do restaurante toca um alerta sonoro e exibe o novo pedido na coluna &quot;Recebidos&quot;.
                </p>
                <div className="p-3 bg-white border border-neutral-200 rounded font-mono text-[11px] text-neutral-800">
                  UPDATE outbox_events SET status = &apos;completed&apos;, processed_at = NOW() WHERE id = :eventId;
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MULTI-TENANT & RLS SQL */}
      {activeTab === 'rls' && (
        <div className="bg-white border border-neutral-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                <Database className="w-4 h-4 text-neutral-700" />
                Estrutura DDL PostgreSQL com Row-Level Security (RLS)
              </h3>
              <p className="text-xs text-neutral-600 mt-1">
                Garantia matemática no kernel do banco de que nenhum restaurante conseguirá ler dados de outro.
              </p>
            </div>

            <button
              onClick={handleCopySql}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-md transition-colors"
            >
              {copiedSql ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Script DDL</span>
                </>
              )}
            </button>
          </div>

          <div className="bg-neutral-950 text-neutral-200 p-4 rounded-lg font-mono text-xs overflow-x-auto border border-neutral-800">
            <pre className="whitespace-pre">{sqlDdl}</pre>
          </div>
        </div>
      )}

      {/* TAB 3: DECOUPLED STATE MACHINE */}
      {activeTab === 'states' && (
        <div className="bg-white border border-neutral-200 rounded-lg p-6 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-neutral-700" />
              Desacoplamento das 3 Máquinas de Estado Independentes
            </h3>
            <p className="text-xs text-neutral-600 mt-1">
              Uma mensagem entregue no WhatsApp NÃO é uma venda concluída. Veja como os 3 eixos de estado operam de forma autônoma:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Machine 1 */}
            <div className="p-4 border border-neutral-200 rounded-lg bg-neutral-50/50 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                <h4 className="text-xs font-bold text-neutral-900">1. Estado Operacional do Pedido</h4>
              </div>
              <div className="space-y-1.5 text-xs font-mono">
                <div className="p-2 bg-white border border-neutral-200 rounded text-neutral-800">
                  &bull; received (Gravado no banco)
                </div>
                <div className="p-2 bg-white border border-neutral-200 rounded text-neutral-800">
                  &bull; confirmed (Lojista aceitou)
                </div>
                <div className="p-2 bg-white border border-neutral-200 rounded text-neutral-800">
                  &bull; preparing (Cozinha montando)
                </div>
                <div className="p-2 bg-white border border-neutral-200 rounded text-neutral-800">
                  &bull; ready (Aguardando motoboy)
                </div>
                <div className="p-2 bg-white border border-neutral-200 rounded text-emerald-800 font-semibold">
                  &bull; delivered (Pedido finalizado)
                </div>
                <div className="p-2 bg-white border border-neutral-200 rounded text-rose-800">
                  &bull; cancelled (Cancelado)
                </div>
              </div>
            </div>

            {/* Machine 2 */}
            <div className="p-4 border border-neutral-200 rounded-lg bg-neutral-50/50 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                <h4 className="text-xs font-bold text-neutral-900">2. Estado Financeiro do Pagamento</h4>
              </div>
              <div className="space-y-1.5 text-xs font-mono">
                <div className="p-2 bg-white border border-neutral-200 rounded text-neutral-800">
                  &bull; pending (Aguardando liquidação)
                </div>
                <div className="p-2 bg-white border border-neutral-200 rounded text-neutral-800">
                  &bull; paid_on_delivery (Receber no ato)
                </div>
                <div className="p-2 bg-white border border-neutral-200 rounded text-emerald-800 font-semibold">
                  &bull; paid_online (Pix verificado)
                </div>
                <div className="p-2 bg-white border border-neutral-200 rounded text-rose-800">
                  &bull; refunded (Estornado)
                </div>
              </div>
            </div>

            {/* Machine 3 */}
            <div className="p-4 border border-neutral-200 rounded-lg bg-neutral-50/50 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-600" />
                <h4 className="text-xs font-bold text-neutral-900">3. Estado de Mensageria WhatsApp</h4>
              </div>
              <div className="space-y-1.5 text-xs font-mono">
                <div className="p-2 bg-white border border-neutral-200 rounded text-neutral-800">
                  &bull; queued (Na fila BullMQ)
                </div>
                <div className="p-2 bg-white border border-neutral-200 rounded text-neutral-800">
                  &bull; sending (HTTP p/ Evolution)
                </div>
                <div className="p-2 bg-white border border-neutral-200 rounded text-neutral-800">
                  &bull; delivered (Entregue no celular)
                </div>
                <div className="p-2 bg-white border border-neutral-200 rounded text-rose-800">
                  &bull; failed (Erro / chip desconectado)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
