import { BlueprintSection } from '../types';

export const BLUEPRINT_SECTIONS: BlueprintSection[] = [
  {
    id: 'visao-produto',
    number: '01',
    title: 'Visão do Produto, Público-Alvo e Escopo',
    subtitle: 'Contexto de mercado, dores reais dos restaurantes e limites estratégicos do MVP',
    summary: 'Diagnóstico dos gargalos de cardápios em PDF/WhatsApp manual e definição estrita do MVP por R$ 129,90/mês para pizzarias, lanchonetes e delivery de bairro.',
    tags: ['Estratégia', 'MVP', 'Escopo', 'Público-Alvo'],
    contentMarkdown: `### 1.1 O Problema Real Enfrentado por Restaurantes
Pequenos e médios estabelecimentos gastronômicos (lanchonetes, hamburguerias, pizzarias e pequenos deliveries de bairro) enfrentam um ciclo diário ineficiente:
- **Cardápios em PDF e imagens desatualizadas:** Preços e ingredientes mudam com a inflação de insumos, mas o cardápio enviado pelo WhatsApp é um PDF pesado ou foto antiga salva na galeria do atendente, gerando atritos constantes de *"este preço aumentou ontem"*.
- **Atendimento manual exaustivo:** O atendente passa de 5 a 10 minutos por cliente digitando mensagens como *"Qual o sabor?", "Quer borda recheada?", "Qual o endereço?", "Vai troco?"*.
- **Erros de montagem e retrabalho:** Anotações em papel ou mensagens truncadas provocam trocas de pedidos, custos de reentrega e perda de clientes.
- **Falta de visibilidade e dependência de marketplaces:** Comissões de 12% a 27% sobre o faturamento em plataformas de entrega corroem a margem de lucro de operações que lutam para fechar o mês no azul.

### 1.2 Público-Alvo Inicial
O público prioritário não são grandes redes com ERPs legados, mas sim:
1. **Hamburguerias e Lanchonetes Artesanais:** 30 a 150 pedidos/dia com alta necessidade de adicionais (ex: bacon extra, ponto da carne, molhos).
2. **Pizzarias de Bairro:** Alta demanda de montagem fracionada (dois sabores, borda recheada, exclusão de ingredientes).
3. **Marmitarias e Restaurantes de PF (Prato Feito):** Cardápios diários rotativos que demandam atualização instantânea em segundos.
4. **Dark Kitchens e Operações de Delivery Puro:** Dependem 100% de canais digitais e precisam de velocidade sem intermediários caros.

### 1.3 Proposta de Valor e o Papel do WhatsApp
- **Centralização por R$ 129,90 fixos mensais:** Sem cobrança de comissão percentual por pedido. O restaurante mantém 100% da sua margem.
- **WhatsApp como canal de finalização e engajamento:** Em vez de forçar o consumidor a baixar aplicativos nativos que ocupam memória, o cardápio roda direto no navegador mobile via link ou QR Code e despacha a ordem com dados limpos para o WhatsApp do restaurante e do cliente via **Evolution API**.
- **Benefícios para o Consumidor:** Acesso instantâneo sem instalação, fotos nítidas, seleção transparente de adicionais com cálculo automático em tempo real e cópia do pedido no próprio WhatsApp.
- **Benefícios para o Restaurante:** Painel simples com atualização imediata de itens indisponíveis, painel de pedidos organizado em colunas (KDS) e relatórios básicos de vendas.

### 1.4 Divisão Estratégica de Escopo

| Nível de Escopo | Funcionalidades Incluídas | Justificativa Econômica / Técnica |
| :--- | :--- | :--- |
| **1. MVP (Lançamento e Validação)** | • Cardápio web responsivo por slug/link e QR Code.<br>• Cadastro de categorias, produtos e grupos de adicionais.<br>• Carrinho com recálculo 100% no servidor.<br>• Configuração de taxas de entrega fixas/bairros e retirada.<br>• Despacho de mensagens via Evolution API.<br>• Painel do restaurante (KDS/gestão de pedidos e estoque).<br>• Assinatura recorrente de R$ 129,90/mês via Gateway nacional.<br>• Isolamento multi-tenant seguro com RLS em PostgreSQL. | Conjunto mínimo estrito para resolver a dor do atendimento sem inflar o custo operacional da mensalidade. |
| **2. Evolução Próxima (Pós-validação)** | • Múltiplas taxas por raio de distância (Geocoding/Maps).<br>• Integração com impressoras térmicas ESC/POS (via agente local).<br>• Cupons de desconto com regras de limite e valor mínimo.<br>• Botão de reordenar pedido com 1 clique para clientes recorrentes.<br>• Webhook para status de entrega (motoboy saiu). | Agrega valor percebido e reduz churn sem alterar a infraestrutura central de forma destrutiva. |
| **3. Fora do Escopo Inicial** | • Emissão de Nota Fiscal Eletrônica (NFC-e / SAT).<br>• Controle de estoque por ficha técnica com pesagem de gramas.<br>• Roteirização avançada de frotas com algoritmo TSP.<br>• Sistema de pagamentos com split bancário complexo. | Custos regulatórios, licenças de APIs e suporte especializado incompatíveis com o plano de R$ 129,90/mês. |`
  },
  {
    id: 'requisitos-justificativas',
    number: '02',
    title: 'Requisitos Principais e Justificativas',
    subtitle: 'Matriz funcional completa e requisitos não-funcionais com impacto de custo',
    summary: 'Tabela de requisitos funcionais priorizados e metas não-funcionais realistas de latência e disponibilidade.',
    tags: ['Requisitos', 'Engenharia', 'Disponibilidade', 'Priorização'],
    contentMarkdown: `### 2.1 Matriz de Requisitos Funcionais

| Funcionalidade | Necessidade Atendida | Funcionamento Proposto | Prioridade |
| :--- | :--- | :--- | :--- |
| **Cardápio Público Responsivo** | Consulta rápida em celulares sem instalar apps. | Interface web ultra-rápida, mobile-first, renderizada via Next.js/React com tema visual do restaurante. | **Obrigatória (MVP)** |
| **Gestão de Categorias e Produtos** | Exposição clara dos itens com preços e fotos. | Cadastro de nome, descrição, preço em centavos inteiros, foto otimizada (WebP) e alternador de disponibilidade imediata. | **Obrigatória (MVP)** |
| **Adicionais e Grupos de Variações** | Customização do prato (tamanho, ponto, extras). | Estrutura de grupos com regras de seleção mínima e máxima (ex: "Escolha até 3 molhos, obrigatório 1"). | **Obrigatória (MVP)** |
| **Horários e Disponibilidade** | Evitar pedidos com restaurante fechado. | Bloqueio automático de fechamento de carrinho fora da grade de horários configurada pelo lojista. | **Obrigatória (MVP)** |
| **Carrinho com Validação no Servidor** | Garantir integridade de preços e frete. | O navegador envia apenas IDs e quantidades; o servidor recalcula todos os itens a partir do banco de dados oficial. | **Obrigatória (MVP)** |
| **Modalidades de Retirada e Entrega** | Atender clientes no balcão e no delivery. | Seleção com campos dinâmicos: retirada solicita apenas nome/WhatsApp; entrega exige endereço completo. | **Obrigatória (MVP)** |
| **Taxas de Entrega e Bairros** | Cobrir despesas de frete por região. | Cadastro simples de taxa por bairro ou taxa fixa por pedido no MVP. | **Obrigatória (MVP)** |
| **Integração WhatsApp (Evolution API)** | Notificar lojista e cliente sem custo de SMS. | Envio de template padronizado de pedido via instância privada pareada pelo QR Code da Evolution API. | **Obrigatória (MVP)** |
| **Área de Membros com Autenticação** | Acesso restrito e seguro dos restaurantes. | Login por e-mail/senha com JWT seguro, hash Argon2/bcrypt e recuperação com token temporal. | **Obrigatória (MVP)** |
| **Gestão de Pedidos (KDS)** | Cozinha e balcão precisam acompanhar estados. | Painel Kanban com colunas (Recebido, Em Preparo, Pronto, Concluído) e sinal sonoro a cada novo pedido. | **Obrigatória (MVP)** |
| **Personalização Visual por Tenant** | Identidade da marca do restaurante. | Configuração de cor primária, logotipo, banner e tipografia sem injeção de HTML/JS inseguro. | **Obrigatória (MVP)** |
| **Cobrança Recorrente de R$ 129,90** | Sustentabilidade financeira do SaaS. | Integração com gateway de assinaturas (ex: Asaas) com emissão automática de Pix/Boleto/Cartão e bloqueio por inadimplência. | **Obrigatória (MVP)** |
| **Isolamento de Dados (Multi-tenancy)** | Privacidade e segurança entre competidores. | Separação lógica rígida por \`tenant_id\` com Row-Level Security (RLS) no PostgreSQL. | **Obrigatória (MVP)** |
| **Gestão de Usuários e Permissões** | Limitar acesso de atendentes e sócios. | Perfis estruturados: Proprietário (acesso total), Gerente (operações e cardápio) e Atendente (apenas pedidos). | **Recomendada** |
| **Dashboard Operacional e Vendas** | Entender desempenho e faturamento. | Visualização de pedidos concluídos, ticket médio real, produtos líderes e horários de pico. | **Recomendada** |
| **Logs de Auditoria e Backups** | Rastreabilidade e recuperação de desastres. | Tabela de eventos para alterações sensíveis e backups diários com Point-In-Time-Recovery (PITR). | **Recomendada** |

### 2.2 Requisitos Não-Funcionais e Implicações de Custo
1. **Desempenho em Redes Móveis (3G/4G):**
   - *Meta:* First Contentful Paint (FCP) $\le 1.2s$ e Time to Interactive (TTI) $\le 2.0s$.
   - *Implementação:* Otimização de imagens no upload (conversão para WebP 800px max), CDN global Cloudflare e bundle JS mínimo.
2. **Disponibilidade Proposta:**
   - *Meta:* **99.5% de disponibilidade mensal** (permite até ~3.6 horas de indisponibilidade programada/mês).
   - *Justificativa de Custo:* Prometer 99.99% exigiria redundância multi-região ativa e replicação síncrona que custariam de 5 a 10 vezes mais, inviabilizando o modelo de R$ 129,90/mês.
3. **Acessibilidade e Usabilidade:**
   - Conformidade com padrões WCAG 2.1 Nível AA: contraste mínimo 4.5:1, áreas de toque de no mínimo 44x44px e suporte a navegação por leitor de tela nos campos de endereço.`
  },
  {
    id: 'fluxo-consumidor',
    number: '03',
    title: 'Fluxo Detalhado do Consumidor',
    subtitle: 'Jornada passo a passo do cliente, recálculo no servidor e máquina de estados',
    summary: 'Mapeamento rigoroso das 12 etapas do consumidor, da leitura do QR Code à confirmação do pedido, sem confiar no cliente.',
    tags: ['UX', 'Consumidor', 'Carrinho', 'Segurança'],
    contentMarkdown: `### 3.1 A Jornada do Consumidor em 12 Etapas

1. **Acesso ao Cardápio:** O cliente escaneia o QR Code na mesa ou clica no link \`[restaurante].[DOMINIO]\` divulgado na bio do Instagram ou WhatsApp.
2. **Resolução de Tenant e Identidade:** O frontend resolve o subdomínio ou path, carrega as cores e logotipo do restaurante e verifica se o estabelecimento está aberto.
3. **Exploração do Cardápio:** Navegação fluida por abas horizontais de categorias (ex: *Hambúrgueres, Bebidas, Sobremesas*), com busca instantânea.
4. **Configuração do Item:** Ao clicar em um produto, abre-se uma gaveta inferior (bottom sheet) com foto, descrição e seleção de adicionais com limites estritos (mínimo/máximo validados na UI).
5. **Revisão do Carrinho:** O cliente visualiza os itens agrupados, quantidades e campo para observações gerais (ex: *"Sem cebola, por favor"*).
6. **Escolha da Modalidade:** Opção entre **Entrega** (exige endereço com CEP/bairro) ou **Retirada no Balcão** (solicita apenas identificação).
7. **Identificação Simplificada (Sem Criação de Senha):** O consumidor informa apenas **Nome Completo** e **WhatsApp (com DDD)**. Não há barreiras de login ou cadastro longo no MVP, maximizando a taxa de conversão.
8. **Submissão e Recálculo no Servidor (Zero Trust):**
   - O payload enviado contém apenas: \`{ tenantId, items: [{ productId, quantity, options: [optionId] }], type, deliveryAddress, customerPhone }\`.
   - O servidor busca os preços atualizados no banco de dados, recalcula todos os adicionais, soma a taxa de entrega oficial do bairro e valida se o restaurante ainda está no horário de atendimento.
   - Caso um item tenha ficado indisponível ou o preço tenha mudado durante a navegação, o servidor retorna erro sem debitar nada.
9. **Criação do Pedido e Registro na Tabela Outbox:** O pedido é gravado no banco no estado \`received\` e um evento transacional \`order.created\` é agendado.
10. **Despacho da Notificação WhatsApp:** O worker do backend consome o evento e envia a mensagem formatada para a Evolution API com link único de acompanhamento do pedido.
11. **Confirmação pelo Restaurante:** O atendente do restaurante recebe o pedido no painel KDS e clica em **"Confirmar Pedido"** ou **"Rejeitar"**.
12. **Acompanhamento:** O consumidor recebe atualização em tempo real por uma página web pública leve (\`/[restaurante]/pedido/[ID]\`) e mensagem complementar no WhatsApp.

### 3.2 Distinção Obrigatória de Estados
Um erro comum em arquiteturas amadoras é fundir status de mensagem com status de negócio. No nosso SaaS, os estados são desacoplados:

- **1. Pedido Registrado no SaaS (\`received\`):** Gravado no banco de dados. Ainda **não** significa que a cozinha começou a produzir.
- **2. Mensagem Enviada ao WhatsApp (\`evolution_sent\`):** Indica apenas que os bytes foram entregues ao servidor da Evolution API. Não garante visualização.
- **3. Pedido Confirmado pelo Restaurante (\`confirmed\`):** Ação humana explícita do atendente ou operador do KDS aceitando o pedido.
- **4. Pagamento Confirmado (\`paid\`):**
  - Se for *Pagamento na Entrega (Cartão/Dinheiro)*: marcado como pendente até o motoboy retornar.
  - Se for *Pix Dinâmico*: confirmado via webhook do provedor de pagamento.
- **5. Pedido Concluído (\`delivered\` ou \`finished\`):** Mercadoria entregue ao cliente e ciclo finalizado.`
  },
  {
    id: 'fluxo-restaurante-onboarding',
    number: '04',
    title: 'Fluxo do Restaurante e Área de Membros',
    subtitle: 'Onboarding em 9 passos, estrutura de telas administrativas e controle de acessos',
    summary: 'Roteiro de implantação do restaurante em menos de 15 minutos e hierarquia de perfis (Proprietário, Gerente, Atendente).',
    tags: ['Onboarding', 'Admin', 'KDS', 'RBAC'],
    contentMarkdown: `### 4.1 Onboarding do Restaurante em 9 Passos
O fluxo de ativação é desenhado para permitir que o restaurante cadastre seus primeiros itens e receba pedidos no mesmo dia:

1. **Cadastro do Responsável:** Nome, e-mail comercial, telefone WhatsApp e senha.
2. **Criação do Tenant:** Definição do Nome Fantasia, Razão Social/CNPJ (opcional no início) e escolha do slug único (ex: \`burgertop\`).
3. **Ativação da Assinatura (R$ 129,90):** Checkout transparente do SaaS para cobrança recorrente via Cartão de Crédito ou Pix com período de avaliação (trial) de 7 dias.
4. **Identidade Visual Básica:** Upload do logotipo (PNG/SVG), cor da marca (color picker) e imagem de capa.
5. **Configuração de Horários e Canais:** Definição da grade semanal de funcionamento e habilitação de modalidades (Delivery e/ou Retirada).
6. **Cadastro das Primeiras Categorias e Itens:** Inserção de fotos, descrições, preços e criação de grupos de opcionais.
7. **Conexão com WhatsApp (Evolution API):** Abertura da tela de integração, geração do QR Code da Evolution API na tela e leitura pelo aplicativo WhatsApp do restaurante.
8. **Pedido de Teste Guiado:** O sistema gera automaticamente um pedido fictício para o lojista experimentar a notificação no WhatsApp e o som de alerta no painel de pedidos.
9. **Publicação e Geração de Materiais:** Liberação do link público \`[restaurante].[DOMINIO]\` e download do PDF com QR Code pronto para impressão em mesas e balcão.

### 4.2 Matriz de Perfis e Permissões (RBAC)

| Ação no Painel | Proprietário | Gerente | Atendente |
| :--- | :---: | :---: | :---: |
| Visualizar e mudar status de pedidos no KDS | Sim | Sim | Sim |
| Pausar produto (marcar como indisponível) | Sim | Sim | Sim |
| Criar/Editar produtos, categorias e adicionais | Sim | Sim | Não |
| Alterar horários de funcionamento e taxas de entrega | Sim | Sim | Não |
| Conectar ou reiniciar instância da Evolution API | Sim | Sim | Não |
| Visualizar faturamento e relatórios financeiros | Sim | Sim | Não |
| Gerenciar plano de assinatura (R$ 129,90) e cartões | Sim | Não | Não |
| Convidar e revogar acessos de funcionários | Sim | Não | Não |

### 4.3 Separação entre Painel do Restaurante e Painel do Operador SaaS
- **Painel do Restaurante (Tenant):** Focado estritamente na rotina operacional do estabelecimento. Não possui acesso a dados de outros restaurantes nem configurações globais de infraestrutura.
- **Painel Interno do Operador do SaaS (Superadmin):**
  - Gerenciamento de assinaturas, inadimplência e churn.
  - Painel de integridade técnica das instâncias da Evolution API (consumo de memória, instâncias desconectadas).
  - Suporte ao cliente com **acesso auditado**: o operador não possui acesso irrestrito aos dados de consumidores dos restaurantes sem registro explícito em log de auditoria com justificativa de chamado técnico.`
  },
  {
    id: 'arquitetura-multi-tenant',
    number: '05',
    title: 'Arquitetura Multi-Tenant e Isolamento de Dados',
    subtitle: 'Modelos de tenancy, Row-Level Security no PostgreSQL e limites de sustentabilidade',
    summary: 'Comparativo técnico entre abordagens de multi-tenancy e recomendação do modelo de Banco Compartilhado com RLS para manter o custo baixo em R$ 129,90/mês.',
    tags: ['Arquitetura', 'Multi-tenant', 'PostgreSQL', 'RLS', 'Segurança'],
    contentMarkdown: `### 5.1 Comparativo de Modelos Multi-Tenant

| Modelo de Tenancy | Custo de Infraestrutura | Complexidade Operacional | Isolamento de Dados | Adequação ao Plano de R$ 129,90/mês |
| :--- | :--- | :--- | :--- | :--- |
| **1. Banco Compartilhado + RLS (Recomendado)** | **Baixo** (único cluster PostgreSQL compartilhado com instâncias réplicas) | **Média** (migrações centralizadas, automação simples) | **Alto** (garantido por políticas de Row-Level Security no kernel do banco) | **Perfeita** (permite atender centenas de clientes com VPS de R$ 200 a R$ 400/mês) |
| **2. Schemas Separados (Schema per Tenant)** | **Médio** (limitação de conexões e cache do catálogo de tabelas) | **Alta** (executar 500 migrações de schema em cada deploy gera lentidão e risco de inconsistência) | **Alto** (segregação por namespace no Postgres) | **Inadequada para início** (custo de manutenção alto para equipe enxuta) |
| **3. Bancos Separados (DB per Tenant)** | **Extremamente Alto** (custo mínimo de R$ 40 a R$ 80 por banco gerenciado/mês) | **Inviável** (gerenciar centenas de conexões, pools e backups isolados) | **Máximo** (isolamento físico) | **Incompatível** (inviabiliza a margem de contribuição da mensalidade de R$ 129,90) |

### 5.2 Implementação Segura com PostgreSQL Row-Level Security (RLS)
Para garantir que nenhum restaurante consiga ler ou modificar dados de outro, não confiamos apenas em cláusulas \`WHERE tenant_id = x\` escritas manualmente pelos programadores. O banco de dados aplica a trava nativamente:

\`\`\`sql
-- Ativação do RLS na tabela de pedidos
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Política de isolamento baseada na variável de sessão da conexão
CREATE POLICY tenant_isolation_policy ON orders
  AS RESTRICTIVE
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
\`\`\`

No backend, toda requisição autenticada passa por um middleware que valida o JWT, extrai o \`tenant_id\` do token assinado e injeta na transação do banco:

\`\`\`typescript
await db.transaction(async (tx) => {
  await tx.execute(sql\`SET LOCAL app.current_tenant_id = \${authenticatedUser.tenantId}\`);
  // Qualquer consulta executada aqui só enxergará registros do tenant correspondente!
  return await tx.query.orders.findMany();
});
\`\`\`

### 5.3 Diferenciação de Entidades Críticas
1. **Tenant do SaaS:** Representa a entidade jurídica do restaurante no banco de dados (\`tenants.id\`), com suas configurações de tema, cardápio e faturamento.
2. **Instância da Evolution API:** Sessão de WebSocket/Baileys criada no servidor da Evolution API para manter a conexão aberta com o número de WhatsApp do estabelecimento.
3. **Instância de Infraestrutura:** Servidor virtual (VPS ou Container Cloud Run) onde roda a aplicação web central.`
  },
  {
    id: 'stack-tecnologica',
    number: '06',
    title: 'Tecnologias e Integrações Recomendadas',
    subtitle: 'Stack moderna, monólito modular e justificativas técnicas pautadas em custo',
    summary: 'Arquitetura baseada em Next.js/React, Node.js modular, PostgreSQL, Redis/BullMQ, Evolution API e Gateway de pagamentos.',
    tags: ['Tech Stack', 'Node.js', 'PostgreSQL', 'Redis', 'BullMQ'],
    contentMarkdown: `### 6.1 Matriz de Decisão Tecnológica

| Camada | Tecnologia Recomendada | Justificativa Técnica e Econômica |
| :--- | :--- | :--- |
| **Frontend Público e Admin** | **Next.js / React + TypeScript + Tailwind CSS** | Mesma base de código para o cardápio público (Server Components com SSR veloz) e para a área de membros do restaurante (SPA interativa). Tailwind garante bundle CSS minúsculo. |
| **Backend / API** | **Node.js com Monólito Modular (Fastify ou NestJS)** | O modelo de monólito modular elimina a sobrecarga operacional de microsserviços. O mesmo serviço processa rotas HTTP e escuta webhooks. |
| **Banco de Dados** | **PostgreSQL (v15+)** | Padrão da indústria para integridade relacional, suporte robusto a transações ACID, colunas JSONB para opções dinâmicas e Row-Level Security nativo. |
| **Camada de Dados (ORM)** | **Drizzle ORM ou Prisma** | Tipagem fim-a-fim entre o schema do banco e o frontend TypeScript, facilitando migrações seguras sem sacrificar performance. |
| **Filas e Processamento Assíncrono** | **Redis + BullMQ** | Gerencia filas de envio de mensagens do WhatsApp, retentativas com backoff exponencial e controle de concorrência para evitar rate-limiting. |
| **Armazenamento e CDN** | **Cloudflare (Proxy Nuvem Laranja, SSL Full Strict e R2)** | O domínio oficial **aladay.com.br** passa pela Cloudflare com proteção contra DDoS, WAF, terminação SSL segura e custo zero de tráfego de saída. |
| **Integração WhatsApp** | **Evolution API (Instância Aladay em Docker)** | Camada de mensageria para WhatsApp pareada por QR Code, com envio de notificações transacionais em tempo real. |
| **Gateway Nacional de Pagamento** | **Asaas (Gateway Nacional - Pix & Recorrência)** | Provedor nacional homologado no BACEN com suporte a Pix Dinâmico por pedido, split de pagamento entre restaurantes, aprovação automática via Webhook e recorrência das assinaturas de R$ 129,90/mês. |
| **Observabilidade e Logs** | **Pino + Prometheus + Grafana** | Logs estruturados em formato JSON com rastreamento de IDs de correlação (\`traceId\`), permitindo diagnosticar problemas em segundos. |

### 6.2 Por que Monólito Modular e NÃO Microsserviços no Início?
Adotar microsserviços para um SaaS inicial cobrando R$ 129,90/mês é um erro comum de super-engenharia:
- Microsserviços exigem orquestração complexa (Kubernetes), rede de serviços (Service Mesh), tracing distribuído e múltiplos bancos de dados, aumentando o custo fixo de infraestrutura de R$ 300 para mais de R$ 2.500 mensais.
- Um **Monólito Modular** organiza o código em módulos isolados por pasta (\`modules/orders\`, \`modules/catalog\`, \`modules/whatsapp\`, \`modules/billing\`), permitindo futura extração de serviços caso um módulo específico (como workers do WhatsApp) exija escala independente.

### 6.3 Poderíamos Usar Python no Backend? (Opinião e Análise Crítica)
**Sim, é perfeitamente viável utilizar Python**, especialmente com **FastAPI** (ou Django Ninja). No entanto, há implicações técnicas e econômicas diretas para este modelo de negócio que devem ser ponderadas:

#### A. Cenário com Python (FastAPI + Pydantic + SQLAlchemy Assíncrono + Celery/Arq):
- **Vantagens de Python:**
  - **Legibilidade e maturidade sintática:** Excelente para regras de negócio e validações complexas.
  - **FastAPI:** Documentação OpenAPI/Swagger automática de altíssima qualidade e tipagem forte via Pydantic.
  - **Ecossistema de dados/IA:** Se o SaaS evoluir para recomendar itens por inteligência artificial ou previsão de demanda para cozinhas, Python é o líder incontestável.
- **Desafios e Desvantagens no contexto deste SaaS:**
  - **Perda do Full-stack TypeScript Unificado:** Com Node.js/Next.js, os schemas de validação (ex: Zod) e tipos TypeScript são compartilhados 100% entre frontend do cardápio e backend da API sem gerar código duplicado. Com Python, é necessário manter Pydantic no backend e TypeScript no frontend (ou usar geradores de código como openapi-typescript).
  - **A Evolution API é 100% TypeScript/Node.js:** A biblioteca de integração do WhatsApp que o SaaS utiliza (Evolution API) é construída em TypeScript/Node.js (utilizando Baileys). Ter a equipe dominando TypeScript facilita debugar eventuais problemas de sessão e webhooks na mesma linguagem.
  - **Consumo de Memória de Workers:** Um worker Celery em Python costuma consumir entre 60MB e 120MB de RAM por processo devido ao modelo de pre-fork, enquanto workers assíncronos em Node.js (BullMQ) operam com event loop leve (~30MB a 45MB), reduzindo o custo de servidores VPS compartilhados para a mensalidade de R$ 129,90.

#### B. Veredito e Recomendação:
- **Se a equipe fundadora/desenvolvedores domina Python:** A escolha por **FastAPI + asyncpg + Arq/Redis** é **excelente e totalmente aprovada**. A velocidade de entrega de um time experiente em Python supera qualquer benefício marginal de linguagem.
- **Se o projeto está sendo iniciado do zero sem viés de equipe:** **TypeScript/Node.js (com Fastify ou NestJS)** permanece a recomendação mais eficiente para manter a infraestrutura enxuta, compartilhamento direto de tipos com o React/Next.js e alinhamento com a base da Evolution API.`
  },
  {
    id: 'integracao-evolution-api',
    number: '07',
    title: 'Integração com WhatsApp via Evolution API',
    subtitle: 'Arquitetura de mensageria, padrão Outbox, webhooks e mitigação de banimento',
    summary: 'Especificação técnica da integração com a Evolution API, gerenciamento de instâncias, filas com retentativa e política anti-spam.',
    tags: ['Evolution API', 'WhatsApp', 'Webhooks', 'Outbox Pattern', 'Filas'],
    contentMarkdown: `### 7.1 Natureza da Evolution API e Modos de Conexão
A **Evolution API** é um servidor de integração open-source que encapsula os protocolos de comunicação do WhatsApp (tanto Baileys/Web quanto a API Cloud Oficial da Meta).
- **Modo Sessão de Dispositivo (QR Code / Baileys):** Conecta o número existente do restaurante (celular físico) sem custo por mensagem da Meta.
- **Atenção Legal e de Risco:** A utilização de sessões baseadas em engenharia reversa do WhatsApp Web está sujeita às políticas da Meta. O SaaS **não garante disponibilidade ininterrupta do canal** e deve educar o lojista a não realizar disparos massivos de marketing para listas frias, mitigando riscos de banimento de chip.

### 7.2 Arquitetura de Comunicação (Quem envia e Quem recebe)
- **Remetente:** A instância da Evolution API conectada ao número oficial do próprio restaurante (ex: \`5511999998888\`).
- **Destinatário da Notificação do Pedido:**
  1. *O próprio restaurante (grupo interno ou atendente):* Recebe o resumo técnico do pedido para início imediato do preparo.
  2. *O consumidor final:* Recebe uma mensagem acolhedora com o link de acompanhamento e o resumo do que foi pedido.

### 7.3 Padrão Transacional Outbox (Resiliência contra Falhas)
Nunca envie uma mensagem externa diretamente dentro do bloco da transação HTTP do pedido. Se o WhatsApp estiver lento ou fora do ar, a transação do banco travaria e o cliente veria tela de erro. Adotamos o **Transactional Outbox Pattern**:

\`\`\`text
1. Requisição HTTP do Cliente -> Valida dados -> Abre Transação SQL
2. Grava Pedido na tabela "orders"
3. Grava Notificação na tabela "outbox_events" (mesma transação SQL!)
4. Comita Transação SQL e retorna HTTP 201 ao Navegador
------------------------------------------------------------------
[Processo em Background / Worker BullMQ]
5. Poller/Worker lê eventos pendentes na "outbox_events"
6. Invoca Evolution API via POST /message/sendText/{instancia}
7. Se Sucesso: atualiza status para 'sent' na outbox
8. Se Falha temporária: agenda retentativa com Backoff Exponencial (10s, 30s, 2min)
9. Se Falha permanente: marca como 'failed' e alerta o restaurante no painel KDS
\`\`\`

### 7.4 Exemplo de Template de Mensagem Formatada

\`\`\`text
🍕 *NOVO PEDIDO RECEBIDO!* [#1042]
---------------------------------------
👤 *Cliente:* Lucas Silveira
📱 *WhatsApp:* (11) 98765-4321
🛵 *Tipo:* Entrega
📍 *Endereço:* Rua das Flores, 120, Apto 34 - Bela Vista

🛒 *Itens do Pedido:*
• 1x Pizza Grande Meio-a-Meio (R$ 68,00)
  - 1/2 Calabresa Especial (Cebola roxa, azeitonas)
  - 1/2 Quatro Queijos
  - Borda: Catupiry (+ R$ 8,00)
• 1x Coca-Cola 2L (R$ 14,00)

📝 *Obs:* Campainha não funciona, favor chamar no interfone.
---------------------------------------
Taxa de Entrega: R$ 7,00
*TOTAL DO PEDIDO: R$ 97,00*
💳 *Forma de Pagamento:* Cartão de Crédito na Entrega

👉 Acompanhe seu pedido em tempo real:
https://aladay.com.br/[restaurante]/pedido/a8f9-4bc2
\`\`\``
  },
  {
    id: 'personalizacao-tecnica',
    number: '08',
    title: 'Personalização Técnica do Cardápio',
    subtitle: 'Identidade visual por tenant, motor de estilos controlados e segurança',
    summary: 'Estrutura JSON de personalização, variáveis CSS dinâmicas, proteção contra injeção de scripts (XSS) e ciclo de rascunho/publicação.',
    tags: ['Personalização', 'Design System', 'CSS Variables', 'Segurança XSS'],
    contentMarkdown: `### 8.1 Modelo de Configuração Visual do Tenant
Cada restaurante possui um registro de configuração visual que alimenta dinamicamente as variáveis de estilo (CSS Custom Properties) do cardápio:

\`\`\`json
{
  "tenantId": "c3b94e82-72c1-4b10-918d-f561937f2621",
  "slug": "hamburgueria-brasas",
  "theme": {
    "primaryColor": "#C2410C",
    "primaryForeground": "#FFFFFF",
    "backgroundColor": "#FAFAFA",
    "surfaceColor": "#FFFFFF",
    "fontFamily": "Plus Jakarta Sans",
    "borderRadius": "0.75rem",
    "logoUrl": "https://cdn.[DOMINIO]/tenants/c3b9/logo.webp",
    "bannerUrl": "https://cdn.[DOMINIO]/tenants/c3b9/banner.webp"
  },
  "serviceSettings": {
    "deliveryEnabled": true,
    "pickupEnabled": true,
    "minOrderValueCents": 2000,
    "estimatedDeliveryTimeMinutes": "40-50",
    "estimatedPickupTimeMinutes": "20-30"
  }
}
\`\`\`

### 8.2 Injeção Segura via CSS Variables (Zero Injeção Arbitrária)
Para evitar vulnerabilidades de **Cross-Site Scripting (XSS)** ou sequestro de sessão, o SaaS **nunca** permite inserção de CSS livre (\`<style>\`) ou JavaScript arbitrário pelo restaurante. Todas as customizações são validadas por schemas estritos (hex color code regex \`^#([A-Fa-f0-9]{6})$\`) e injetadas via propriedades customizadas:

\`\`\`tsx
// Exemplo de container no Next.js aplicando o tema de forma higienizada
<div
  className="min-h-screen bg-[var(--tenant-bg)] text-neutral-900"
  style={{
    '--tenant-primary': tenant.theme.primaryColor,
    '--tenant-primary-fg': tenant.theme.primaryForeground,
    '--tenant-bg': tenant.theme.backgroundColor,
    '--tenant-surface': tenant.theme.surfaceColor,
    '--tenant-radius': tenant.theme.borderRadius,
  } as React.CSSProperties}
>
  {/* Conteúdo do Cardápio */}
</div>
\`\`\`

### 8.3 Ciclo de Rascunho, Pré-visualização e Publicação
- **Modo Rascunho:** O lojista pode editar cores, adicionar novos pratos e reordenar categorias em uma tela administrativa com pré-visualizador de tela de smartphone em tempo real (Split View).
- **Publicação com Invalidação de Cache:** As alterações só vão para os clientes após o clique em *"Publicar Cardápio"*, que invalida a tag de cache (\`revalidateTag('menu-[tenantId]')\`) na CDN e no servidor.`
  },
  {
    id: 'modelo-dados-integridade',
    number: '09',
    title: 'Modelo de Dados e Integridade dos Pedidos',
    subtitle: 'Entidades relacionais, snapshot imutável de preços e garantia de idempotência',
    summary: 'Diagrama conceitual de dados, armazenamento financeiro em centavos inteiros e proteção contra pedidos duplicados.',
    tags: ['Banco de Dados', 'PostgreSQL', 'Modelagem', 'Idempotência'],
    contentMarkdown: `### 9.1 Entidades Principais do Sistema

1. **tenants:** id (UUID), name, slug, phone, document_cnpj, is_active, created_at.
2. **tenant_settings:** tenant_id, theme_json, business_hours_json, delivery_rules_json.
3. **users:** id, tenant_id, email, password_hash, role ('owner' | 'manager' | 'attendant').
4. **categories:** id, tenant_id, name, display_order, is_active.
5. **products:** id, tenant_id, category_id, name, description, price_cents, image_url, is_available.
6. **option_groups:** id, tenant_id, name, required, min_selectable, max_selectable.
7. **option_items:** id, group_id, name, additional_price_cents, is_available.
8. **customers:** id, tenant_id, phone, name, orders_count, total_spent_cents, lgpd_consent.
9. **orders:** id, tenant_id, order_number, customer_id, type, delivery_address_json, status, subtotal_cents, delivery_fee_cents, total_cents, idempotency_key.
10. **order_items:** id, order_id, product_id, historical_product_name, historical_unit_price_cents, quantity, total_item_cents.
11. **order_item_options:** id, order_item_id, historical_option_name, historical_price_cents.
12. **outbox_events:** id, tenant_id, event_type, payload_json, status ('pending' | 'processing' | 'completed' | 'failed'), retry_count, next_attempt_at.

### 9.2 Princípio do Snapshot Imutável (Preservação Histórica)
Um erro crítico em sistemas amadores é relacionar a linha do pedido diretamente ao produto sem copiar os dados no instante da compra:
- Se a pizza custava R$ 50,00 na sexta-feira e o lojista aumenta o cardápio para R$ 60,00 no sábado, os relatórios financeiros de sexta-feira **não podem sofrer alteração**.
- Cada \`order_item\` e \`order_item_option\` armazena uma cópia histórica congelada (\`historical_product_name\` e \`historical_unit_price_cents\`).

### 9.3 Matemática Financeira com Centavos Inteiros
Nunca utilize números de ponto flutuante (\`FLOAT\` ou \`DOUBLE\`) para cálculos financeiros, sob pena de erros de arredondamento como \`0.1 + 0.2 = 0.30000000000000004\`.
- Todos os valores são armazenados como **inteiros em centavos** (\`INTEGER\` ou \`BIGINT\`).
- Exemplo: R$ 49,90 é armazenado como \`4990\`.
- O frontend formata apenas na renderização com \`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })\`.

### 9.4 Idempotência na Criação de Pedidos
Para evitar que toques duplos em celulares lentos gerem cobranças ou pedidos repetidos na cozinha:
- O cliente gera um UUID v4 de chave de idempotência (\`idempotency_key\`) ao abrir o checkout.
- O endpoint de criação verifica se já existe pedido registrado com a mesma chave para aquele \`tenant_id\`. Se existir, retorna o pedido existente sem recriá-lo.`
  },
  {
    id: 'dashboard-crm',
    number: '10',
    title: 'Acompanhamento de Clientes e Dashboard de Vendas',
    subtitle: 'Métricas operacionais, fórmulas matemáticas exatas e CRM com privacidade',
    summary: 'Definições auditáveis de Ticket Médio, Vendas Concluídas, tempo de preparo e gestão de clientes sem vazamento entre estabelecimentos.',
    tags: ['Dashboard', 'Métricas', 'CRM', 'Fórmulas', 'Relatórios'],
    contentMarkdown: `### 10.1 Métricas do Dashboard e Fórmulas Concretas
O painel gerencial do restaurante exibe métricas confiáveis com regras transparentes:

1. **Pedidos Recebidos:** Contagem bruta de pedidos submetidos no período.
2. **Pedidos Concluídos:** Pedidos que chegaram ao estado final \`delivered\` ou \`finished\`.
3. **Taxa de Cancelamento:**
$$\\text{Taxa de Cancelamento} = \\left( \\frac{\\text{Pedidos Cancelados}}{\\text{Total de Pedidos Recebidos}} \\right) \\times 100$$
4. **Vendas Concluídas (Faturamento Bruto Realizado):**
$$\\text{Vendas Concluídas} = \\sum (\\text{Valor Total dos Pedidos no estado Concluído})$$
*(Não inclui pedidos cancelados nem pedidos pendentes de confirmação).*
5. **Ticket Médio:**
$$\\text{Ticket Médio} = \\frac{\\text{Vendas Concluídas}}{\\text{Quantidade de Pedidos Concluídos}}$$
6. **Tempo Médio de Confirmação:** Média do intervalo entre a criação do pedido (\`created_at\`) e a aceitação humana pelo operador (\`confirmed_at\`).

### 10.2 Importante: Vendas Concluídas NÃO é Lucro!
O SaaS esclarece explicitamente no rodapé dos relatórios: *"Vendas representam o volume financeiro bruto transacionado. O cálculo do lucro real requer deduções de custo de mercadoria vendida (CMV), embalagens, mão de obra, taxas de entrega e impostos."*

### 10.3 CRM Simplificado de Clientes (Isolado por Restaurante)
Cada restaurante visualiza apenas os consumidores que realizaram pedidos em seu próprio cardápio:
- **Identificador Único:** Número de WhatsApp sanitizado no padrão E.164 (ex: \`5511987654321\`).
- **Métricas por Cliente:** Quantidade de compras históricas, valor total acumulado (LTV) e data da última compra.
- **Identificação de Clientes VIP e Inativos:** O sistema destaca clientes fiéis (mais de 4 pedidos no mês) e clientes ausentes (mais de 30 dias sem pedir).
- **Conformidade LGPD:** As listas de contatos pertencem unicamente ao restaurante respectivo; em hipótese alguma o SaaS comercializa ou cruza bancos de clientes entre estabelecimentos vizinhos.`
  },
  {
    id: 'modelo-negocios-precificacao',
    number: '11',
    title: 'Modelo de Negócios e a Mensalidade de R$ 129,90',
    subtitle: 'Análise de viabilidade financeira, custos unitários e cálculo do ponto de equilíbrio',
    summary: 'Estruturação econômica do plano de R$ 129,90/mês por restaurante, decomposição de custos variáveis/fixos e margem de contribuição.',
    tags: ['Precificação', 'Unit Economics', 'Break-even', 'Financeiro', 'SaaS'],
    contentMarkdown: `### 11.1 Proposta de Valor da Mensalidade de R$ 129,90
O preço de R$ 129,90 por mês é cirúrgico para o mercado brasileiro de alimentação:
- É inferior ao custo de um único garçom ou motoboy em uma noite movimentada.
- Representa menos de **1/10 do que o restaurante gasta em comissões de marketplaces** em uma única semana.
- Transmite previsibilidade: o lojista sabe exatamente quanto pagará ao final do mês, independentemente de faturar R$ 5.000 ou R$ 50.000.

### 11.2 O que Está Incluso e Quais São os Limites de Sustentabilidade
Para garantir que a conta feche no longo prazo sem prejuízo para o SaaS:
- **Incluso:** Acesso total à plataforma web, cardápio digital ilimitado, geração de QR Codes, painel KDS de pedidos, suporte via chamado/chat em horário comercial.
- **Limites de Uso Justo (Fair Use):**
  - Até 3.000 pedidos/mês por restaurante (cobre 98% das operações pequenas e médias).
  - Até 1 instância de WhatsApp Evolution API conectada.
  - Armazenamento de até 150 fotos de produtos (otimizadas em WebP na nuvem).
  - Casos com volume fora da curva contam com planos corporativos adicionais sob consulta.

### 11.3 Estrutura de Custos e Fórmulas de Viabilidade

\`\`\`text
[Exemplo de Projeção de Faturamento Bruto]
• 50 restaurantes  × R$ 129,90 = R$ 6.495,00 / mês
• 100 restaurantes × R$ 129,90 = R$ 12.990,00 / mês
• 500 restaurantes × R$ 129,90 = R$ 64.950,00 / mês
\`\`\`

#### Decomposição de Custos Unitários por Restaurante (Estimativas Ilustrativas):
1. **Taxa de Gateway de Pagamento Recorrente (Asaas/Cartão/Pix):** ~3,5% + R$ 0,49 = **R$ 5,04**
2. **Impostos (Simples Nacional - Anexo III ~6%):** **R$ 7,79**
3. **Custo Marginal de Infraestrutura (Armazenamento, CDN e Banco):** **R$ 4,50**
4. **Custo Proporcional de Servidor Evolution API:** **R$ 6,00**
5. **Total de Custos Variáveis Médios por Restaurante:** **R$ 23,33 / mês**

#### Margem de Contribuição Unitária:
$$\\text{Margem de Contribuição por Restaurante} = R\\$ 129,90 - R\\$ 23,33 = R\\$ 106,57 \\text{ (82,0\\% de margem)}$$

#### Ponto de Equilíbrio (Break-Even Point):
Se os custos fixos mensais do SaaS (servidores centrais, domínios, ferramentas de suporte e honorários contábeis) somarem **R$ 3.500,00**:
$$\\text{Ponto de Equilíbrio} = \\frac{R\\$ 3.500,00}{R\\$ 106,57} \\approx 33 \\text{ Restaurantes Ativos}$$
*Com apenas 33 estabelecimentos pagantes, o projeto atinge seu equilíbrio operacional.*

### 11.4 Política de Inadimplência e Régua de Cobrança
- **D+0 (Vencimento):** Notificação amigável automática no WhatsApp e e-mail.
- **D+3 (Tolerância):** Alerta amarelo no painel administrativo do restaurante informando pendência financeira, sem interromper o cardápio público dos clientes.
- **D+7 (Suspensão):** O cardápio exibe mensagem de *"Estabelecimento temporariamente indisponível para pedidos"*.
- **D+30 (Cancelamento e Retenção):** Congelamento dos dados. Em conformidade com a LGPD e boas práticas comerciais, os dados **não são excluídos imediatamente**, ficando preservados por 90 dias caso o lojista decida reativar a operação.`
  },
  {
    id: 'design-experiencia-ux',
    number: '12',
    title: 'Design da Experiência do Cardápio e Área de Membros',
    subtitle: 'Diretrizes de interface, wireframes textuais e acessibilidade universal',
    summary: 'Princípios mobile-first para o consumidor com carregamento instantâneo e layout ergonômico de alta densidade para a cozinha.',
    tags: ['UX/UI', 'Mobile First', 'Wireframes', 'Acessibilidade'],
    contentMarkdown: `### 12.1 Diretrizes para o Cardápio do Consumidor
- **Ergonomia do Polegar (Thumb Zone):** Botões críticos de navegação, carrinho e botão flutuante de checkout posicionados na faixa inferior da tela do celular.
- **Carregamento Instantâneo:** Fotos com dimensões pré-calculadas para evitar Layout Shift (CLS), tags de imagem com \`loading="lazy"\` e prioridade para itens em destaque.
- **Barra de Progresso e Subtotal Claro:** O cliente sempre enxerga o total exato que pagará, inclusive a taxa de entrega calculada antes do envio final.

### 12.2 Wireframe Textual 1: Página de Produto (Cardápio Mobile)

\`\`\`text
┌──────────────────────────────────────────────────┐
│ [← Voltar]                 [Logo Restaurante] [🛒 2] │
├──────────────────────────────────────────────────┤
│ [ Foto Grande do Hambúrguer - 4:3 ]             │
├──────────────────────────────────────────────────┤
│ Smash Bacon Duplo Especial                       │
│ R$ 34,90                                         │
│ Dois burgers artesanais de 90g, queijo cheddar   │
│ inglês derretido, fatias de bacon crocante e     │
│ maionese defumada no pão brioche amanteigado.    │
├──────────────────────────────────────────────────┤
│ ESCOLHA O PONTO DA CARNE (Obrigatório - Escolha 1)│
│ ( ) Ao Ponto para Bem                            │
│ (•) Ao Ponto (Vermelhinho no centro)             │
│ ( ) Bem Passado                                  │
├──────────────────────────────────────────────────┤
│ ADICIONAIS EXTRAS (Opcional - Até 3 opções)      │
│ [ ] Bacon Crocante Extra (+ R$ 5,00)             │
│ [x] Queijo Cheddar Extra (+ R$ 4,00)             │
│ [ ] Picles Artesanal (+ R$ 3,00)                 │
├──────────────────────────────────────────────────┤
│ OBSERVAÇÕES PARA A COZINHA                       │
│ [ Enviar sachê de maionese à parte...          ] │
├──────────────────────────────────────────────────┤
│ [-]  1  [+]      ADICIONAR AO PEDIDO • R$ 38,90  │
└──────────────────────────────────────────────────┘
\`\`\`

### 12.3 Wireframe Textual 2: Painel de Pedidos (KDS da Cozinha)

\`\`\`text
┌────────────────────────────────────────────────────────────────────────┐
│ [Restaurante Brasas]  [WhatsApp: Conectado] [🔔 Som: Ativo]  [Filtro]  │
├──────────────┬──────────────┬──────────────┬──────────────┬────────────┤
│ RECEBIDOS (2)│ CONFIRMADOS(1│ EM PREPARO(3)│ PRONTOS (1)  │ CONCLUÍDOS │
├──────────────┼──────────────┼──────────────┼──────────────┼────────────┤
│ #1042        │ #1041        │ #1039        │ #1038        │ #1037      │
│ 19:42 (3 min)│ 19:35 (10min)│ 19:22 (23min)│ 19:10        │ 18:55      │
│ Lucas S.     │ Maria Clara  │ João Pedro   │ Amanda R.    │ R$ 64,00   │
│ Entrega 🛵   │ Retirada 🛍️  │ Entrega 🛵   │ Entrega 🛵   │ Entregue   │
│ 1x Smash Bac │ 2x Pizza M   │ 1x Combo Fam │ 1x Poke Sol  │            │
│ R$ 38,90     │ R$ 84,00     │ R$ 112,00    │ R$ 49,00     │            │
│ [ACEITAR]    │ [P/ PREPARO] │ [MARCAR PRON]│ [DESPACHAR]  │            │
│ [RECUSAR]    │              │              │              │            │
└──────────────┴──────────────┴──────────────┴──────────────┴────────────┘
\`\`\``
  },
  {
    id: 'seguranca-privacidade-lgpd',
    number: '13',
    title: 'Segurança, Privacidade e Operação',
    subtitle: 'Conformidade com a LGPD, criptografia, proteção de segredos e plano de backup',
    summary: 'Estrutura de papéis (Controlador vs Operador), minimização de dados, políticas de retenção e proteção contra ataques DDoS e brute-force.',
    tags: ['Segurança', 'LGPD', 'Backups', 'Criptografia', 'Privacidade'],
    contentMarkdown: `### 13.1 O SaaS e a LGPD na Prática (Lei nº 13.709/2018)
Na relação com os dados dos consumidores de comida:
- **O Restaurante é o CONTROLADOR:** Ele decide quais produtos vender, define preços e possui a relação comercial direta com o consumidor final.
- **O SaaS é o OPERADOR:** A plataforma apenas processa, armazena e transmite as mensagens e dados do pedido estritamente sob as ordens e em benefício da operação do restaurante.
- **Base Legal Aplicável:** *Execução de Contrato e Procedimentos Preliminares (Art. 7º, V da LGPD)* para a entrega da comida; e *Consentimento Explicito ou Legítimo Interesse (Art. 7º, IX)* para eventuais mensagens promocionais posteriores.

### 13.2 Princípio da Minimização de Dados
O cardápio solicita estritamente o necessário para que a refeição chegue à mesa do cliente:
- Não coletamos CPF, RG, data de nascimento ou gênero do consumidor no fluxo padrão do MVP.
- O endereço de entrega pode ser esquecido ou anonimizado após o período regulatório contábil.

### 13.3 Segurança Técnica e Proteção de Segredos
1. **Credenciais da Evolution API e Banco de Dados:** Armazenadas exclusivamente em variáveis de ambiente seguras no servidor (\`process.env\`), nunca trafegadas para o navegador.
2. **Proteção Contra Força Bruta:** Limitação de tentativas de login com **Rate Limiting** via Redis (máximo 5 tentativas de login por IP a cada 15 minutos).
3. **Criptografia em Trânsito e em Repouso:** Todo tráfego protegido com TLS 1.3 / HTTPS com certificado HSTS ativo. Banco de dados com discos criptografados (AES-256).
4. **Política de Backups e Testes de Restauração:**
   - Snapshots diários automatizados do PostgreSQL retidos por 30 dias.
   - Logs de transações contínuos (WAL) permitindo recuperação ponto a ponto (PITR) em caso de desastre com RPO (Recovery Point Objective) $\le 15$ minutos e RTO (Recovery Time Objective) $\le 2$ horas.`
  },
  {
    id: 'escalabilidade-roadmap',
    number: '14',
    title: 'Escalabilidade, Roadmap de Fases e Critérios de Aceite',
    subtitle: 'Planejamento de entrega em 7 fases, metas de escala e validação de qualidade',
    summary: 'Roteiro de desenvolvimento estruturado em fatias funcionais verticais e 10 critérios objetivos de aceite para o lançamento.',
    tags: ['Roadmap', 'Escala', 'Critérios de Aceite', 'Deploy'],
    contentMarkdown: `### 14.1 Roadmap de Implementação em 7 Fases

\`\`\`text
Fase 1: Fundação Multi-tenant & Autenticação (Sprints 1 e 2)
  ├── Setup PostgreSQL + RLS + Migrações Drizzle
  ├── Modelo de Tenants, Usuários e RBAC
  └── Autenticação JWT com cookies HttpOnly seguros

Fase 2: Catálogo e Gestão de Cardápio (Sprints 3 e 4)
  ├── Cadastro de Categorias, Produtos e Adicionais
  ├── Upload e otimização de imagens (Cloudflare R2/S3)
  └── Motor de temas com CSS Variables seguras

Fase 3: Cardápio Público & Carrinho com Validação (Sprints 5 e 6)
  ├── Interface mobile-first ultra veloz (SSR / ISR)
  ├── Carrinho local com recálculo estrito no servidor (Zero Trust)
  └── Horários de funcionamento e bloqueio de fechamento

Fase 4: Integração com Evolution API & Painel KDS (Sprints 7 e 8)
  ├── Pareamento de WhatsApp via QR Code na tela
  ├── Implementação da Tabela Outbox e workers BullMQ
  └── Tela operacional Kanban em tempo real para a cozinha

Fase 5: Cobrança Recorrente de R$ 129,90/mês (Sprint 9)
  ├── Integração com gateway nacional (Asaas/Iugu)
  └── Webhooks de pagamento, suspensão amigável e reativação

Fase 6: Dashboard Gerencial & CRM (Sprint 10)
  ├── Fórmulas de vendas concluídas e ticket médio auditadas
  └── Listagem isolada de clientes com histórico de pedidos

Fase 7: Piloto Controlado & Homologação (Sprints 11 e 12)
  ├── Testes de carga, validação de segurança e pentest básico
  └── Implantação piloto com 3 a 5 restaurantes parceiros
\`\`\`

### 14.2 Os 10 Critérios de Aceite Inegociáveis (Definition of Done)
1. **Isolamento de Tenant Inviolável:** Uma requisição com JWT do Restaurante A tentando ler produtos ou pedidos do Restaurante B deve retornar HTTP 403/404 em 100% dos casos.
2. **Rejeição de Preços Alterados:** Se um cliente mal-intencionado alterar o valor de um item no DevTools do navegador de R$ 40,00 para R$ 0,01, o servidor deve recalcular o preço original do banco e rejeitar qualquer divergência.
3. **Idempotência de Pedidos:** Clicar 5 vezes seguidas no botão de enviar pedido deve gerar exatamente 1 pedido no banco de dados e 1 notificação no WhatsApp.
4. **Resiliência do WhatsApp:** A indisponibilidade momentânea da Evolution API nunca deve impedir que o pedido seja salvo no banco de dados do restaurante.
5. **Preservação de Histórico:** Alterar o nome ou preço de um lanche no cardápio não pode alterar os valores gravados em pedidos de dias anteriores.
6. **Desacoplamento de Status:** Uma mensagem entregue no WhatsApp nunca pode marcar automaticamente um pedido como pago ou concluído.
7. **Performance em Dispositivos Móveis:** O cardápio deve carregar em menos de 2 segundos em conexão 4G padrão.
8. **Recuperação de Desconexão do WhatsApp:** O painel deve alertar visualmente o lojista caso a sessão do WhatsApp caia por descarregamento de bateria do celular.
9. **Não-duplicação de Webhooks de Assinatura:** O gateway de cobrança reenviando eventos de pagamento não pode estender indevidamente o período de vigência.
10. **Acessibilidade de Contraste:** Temas configurados pelos lojistas devem manter contraste mínimo de 4.5:1 para garantir legibilidade de preços.`
  },
  {
    id: 'conclusao-recomendacoes',
    number: '15',
    title: 'Recomendação Consolidada e Conclusões',
    subtitle: 'Síntese estratégica para o empreendedor e alinhamento de sustentabilidade',
    summary: 'Consolidação das diretrizes arquiteturais e diretiva executiva para iniciar a captação de clientes.',
    tags: ['Conclusão', 'Diretrizes', 'Recomendação'],
    contentMarkdown: `### 15.1 Recomendação Técnica Consolidada
Para viabilizar o SaaS de cardápios digitais pelo valor acessível de **R$ 129,90/mês**, a melhor decisão arquitetural é a simplicidade e a disciplina de custos:
- **Arquitetura Central:** Monólito Modular em Node.js/TypeScript com PostgreSQL compartilhado e Row-Level Security (RLS).
- **Zero Fantasias Tecnológicas:** Evitar Kubernetes, microserviços e bancos separados por cliente nesta fase. Uma única VPS de R$ 250 a R$ 400 suporta com folga os primeiros 100 a 200 estabelecimentos.
- **WhatsApp Estável:** Hospedar a Evolution API em um servidor dedicado exclusivo com limites de memória controlados (Node/Chromium headless consome de 150MB a 350MB por sessão ativa).
- **Padrão Outbox:** Garante que nenhum pedido se perca mesmo diante de instabilidades transitórias da rede de telefonia.

### 15.2 Viabilidade Comercial
O produto possui uma tese comercial sólida: os restaurantes já sentem a dor diária do atendimento caótico e já utilizam o WhatsApp como principal canal. O valor de R$ 129,90 elimina objeções de preço e permite tração rápida via prospecção direta porta-a-porta e indicações locais.`
  },
  {
    id: 'perguntas-pendentes',
    number: '16',
    title: 'Perguntas Pendentes para o Empreendedor',
    subtitle: 'Questões estratégicas que podem refinar as próximas decisões do produto',
    summary: 'Decisões de negócio sobre chip de WhatsApp, modelo de cobrança de adesão e suporte operacional.',
    tags: ['Decisões', 'Empreendedor', 'Próximos Passos'],
    contentMarkdown: `### Questões que podem alterar significativamente o escopo e a infraestrutura:

1. **Gestão do Número de WhatsApp:**
   - *Cenário A:* Cada restaurante conecta o seu próprio chip/aparelho existente via QR Code (Recomendado para início).
   - *Cenário B:* O SaaS oferece um número central com disparo via API Oficial da Meta (Cloud API)? *(Isso geraria custos adicionais em dólar por conversa da Meta, exigindo repasse para além dos R$ 129,90).*
2. **Impressão Térmica de Comandas na Cozinha:**
   - Os restaurantes-alvo operam 100% com tela/celular ou exigem impressão física em bobinas térmicas de 58mm/80mm? *(Se exigirem impressão automática, será necessário desenvolver um agente desktop local em Electron ou ponte WebSocket).*
3. **Taxa de Adesão / Implantação:**
   - Haverá cobrança de taxa de implantação avulsa (ex: R$ 150 a R$ 300) para ajudar o lojista a cadastrar as primeiras fotos e menu, ou o onboarding será 100% self-service?
4. **Política de Suporte:**
   - O suporte aos lojistas durante o horário de pico (sextas e sábados à noite) será feito pelo próprio fundador ou haverá escala de plantão terceirizada?`
  }
];
