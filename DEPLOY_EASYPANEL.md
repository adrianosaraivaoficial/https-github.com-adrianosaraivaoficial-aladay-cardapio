# Guia de Deploy em Produção: VPS Hostinger + EasyPanel

Este guia documenta todos os passos para colocar a **Plataforma SaaS de Cardápios Digitais & WhatsApp Evolution API** no ar utilizando sua VPS na Hostinger gerenciada pelo **EasyPanel**.

---

## 1. O que foi preparado e corrigido no código

1. **Dockerfile Multi-Stage Otimizado (`/Dockerfile`)**:
   - Criação de imagem Docker leve com `node:22-alpine`.
   - Etapa 1 compila o frontend Vite (`dist/`).
   - Etapa 2 instala apenas dependências de produção e inicializa o servidor Node/Express com `tsx`.
   - Healthcheck integrado em `/api/v1/health`.
2. **Correção do Script de Inicialização (`package.json`)**:
   - Atualizado `"start": "tsx server.ts"` e movido `tsx` para `dependencies` (evita falha de execução de TypeScript nativo no Node.js em contêineres de produção).
3. **Carregamento Dinâmico de Variáveis de Ambiente (`server.ts` & `.env.example`)**:
   - Integração com `dotenv` logo na primeira linha do servidor.
   - Leitura de `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `ASAAS_API_KEY`, `ASAAS_ENVIRONMENT` e `APP_URL`.
4. **Arquivo `docker-compose.yml` e `.dockerignore`**:
   - Pronto para importação direta no EasyPanel.

---

## 2. Passo a Passo do Deploy no EasyPanel (Hostinger VPS)

### Passo 1: Criar o Projeto no EasyPanel
1. Acesse o painel do EasyPanel na sua VPS: `http://SEU_IP_VPS:3000` (ou pelo seu subdomínio configurado).
2. Clique em **"New Project"** e dê o nome: `saas-delivery` (ou o nome que preferir).

### Passo 2: Adicionar o Serviço da Aplicação
1. Dentro do projeto, clique em **"+ Service"** e selecione **"App"**.
2. Nome do serviço: `cardapio-app`.
3. Na aba **Source** (Origem):
   - **Opção A (GitHub / Git)**: Conecte seu repositório Git. O EasyPanel detectará automaticamente o `Dockerfile` na raiz.
   - **Opção B (Docker Compose)**: Se preferir colar o arquivo `docker-compose.yml` pronto.
4. Na aba **Build**, certifique-se de que está selecionado **Dockerfile**.

### Passo 3: Configurar a Porta e Domínio
1. Vá na aba **Domains**:
   - Adicione seu domínio ou subdomínio (ex: `cardapio.seudominio.com.br` ou `app.aladay.com.br`).
   - Porta interna: digite **`3000`**.
   - O EasyPanel (Traefik) gerará o certificado **SSL Let's Encrypt (HTTPS)** de forma 100% automática.

### Passo 4: Configurar as Variáveis de Ambiente (Environment)
Na aba **Environment**, adicione as seguintes chaves:

| Variável | Valor Recomendado | Descrição |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Ativa entrega estática de `dist/`, HSTS e travas de segurança |
| `PORT` | `3000` | Porta interna do contêiner |
| `APP_URL` | `https://aladay.com.br` | URL pública oficial da sua aplicação (usada nos links de WhatsApp e Webhooks) |
| `DATABASE_URL` | `postgresql://postgres:SENHA@postgres:5432/aladay` | Conexão PostgreSQL no EasyPanel (cria e migra todas as 8 tabelas automaticamente) |
| `PGSSLMODE` | `disable` (rede interna Docker) ou `require` | Modo SSL do PostgreSQL |
| `JWT_SECRET` | *(gerar string aleatória de 64 caracteres)* | Segredo criptográfico para assinatura de sessões JWT Multi-Tenant |
| `ADMIN_EMAIL` | `admin@aladay.com.br` | E-mail do Super Admin da plataforma |
| `ADMIN_PASSWORD` | *(definir senha forte)* | Senha do Super Admin da plataforma |
| `PIX_WEBHOOK_SECRET` | *(gerar token secreto)* | Segredo para autenticação de Webhooks Pix |
| `EVOLUTION_API_URL` | `https://agencia-evolution-api.2eoc7n.easypanel.host` | URL da sua Evolution API |
| `EVOLUTION_API_KEY` | `SUA_CHAVE_EVOLUTION` | Chave Global (`AUTHENTICATION_API_KEY`) da sua Evolution API |
| `EVOLUTION_DEFAULT_INSTANCE` | `aladay` | Instância padrão para envio de códigos OTP de 6 dígitos via WhatsApp |
| `ASAAS_ENVIRONMENT` | `production` | Ambiente do gateway Asaas (`production` para cobranças reais) |
| `ASAAS_API_KEY` | `$aact_...` | Chave de API de Produção do Asaas |
| `ASAAS_WEBHOOK_TOKEN` | *(token secreto configurado no Asaas)* | Token de segurança (`asaas-access-token`) para validar webhooks de assinatura |

### Passo 5: Clicar em Deploy
- Clique no botão **"Deploy"**.
- Acompanhe os logs de build em tempo real na aba **Logs**.
- Quando aparecer `[SaaS Server] Running on http://0.0.0.0:3000`, seu app estará no ar com HTTPS ativo!

---

## 3. Checklist Final de Produção (Status Atual)

| Item | Status Atual | Detalhes / Ação no EasyPanel |
| :--- | :---: | :--- |
| **Build, Docker & Healthcheck** | ✅ Pronto | `Dockerfile` multi-stage (`node:22-alpine`) + `/api/v1/health` |
| **Banco de Dados PostgreSQL (Auto-Migration)** | ✅ Pronto | Auto-criação e sincronização de `tenants`, `categories`, `products`, `orders`, `subscriber_users`, `asaas_subscriptions`, `pix_transactions` e `outbox_events` ao definir `DATABASE_URL` |
| **Segurança OWASP & Isolamento Multi-Tenant** | ✅ Pronto | Senhas com `scrypt` + `timingSafeEqual`, Rate Limiting por IP, Headers HSTS/XFO/CSP, bloqueio de simuladores em `NODE_ENV=production` |
| **Assinaturas Asaas (Anual R$ 99/mês Cartão & Mensal R$ 129,90 + Trial 15 dias)** | ✅ Pronto | Bloqueio automático de inadimplentes/trial expirado + Webhook `/api/v1/asaas/webhook` |
| **Pix Dinâmico EMV BACEN Direto p/ Lojista (0% Taxa)** | ✅ Pronto | Cada restaurante configura sua Chave Pix e Nome do Beneficiário na aba Pix Direto |
| **SEO, Schema.org (JSON-LD) & LGPD** | ✅ Pronto | Meta tags OpenGraph, JSON-LD `SoftwareApplication`, Termos de Uso e Política de Privacidade no rodapé |
| **Variáveis de Ambiente & DNS** | ⏳ Ação no Painel | Preencher variáveis na aba *Environment* do EasyPanel, apontar DNS Tipo `A` para o IP da VPS e cadastrar a URL de Webhook no painel do Asaas |

