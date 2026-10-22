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
| `NODE_ENV` | `production` | Ativa compressão e entrega estática de `dist/` |
| `PORT` | `3000` | Porta interna do contêiner |
| `APP_URL` | `https://cardapio.seudominio.com.br` | URL pública da sua aplicação |
| `EVOLUTION_API_URL` | `https://agencia-evolution-api.2eoc7n.easypanel.host` | URL da sua Evolution API |
| `EVOLUTION_API_KEY` | `21C3D49F3F00-48FA-BFA2-2CD290850405` | Chave de API da sua Evolution API |
| `N8N_WEBHOOK_URL` | `https://agencia-n8n.2eoc7n.easypanel.host/webhook-test/saas` | Webhook do seu n8n para automação |
| `ASAAS_ENVIRONMENT` | `sandbox` (ou `production`) | Ambiente do gateway Asaas |
| `ASAAS_API_KEY` | `$aact_...` | Chave de API do Asaas |
| `ASAAS_WEBHOOK_TOKEN` | `tok_aladay_asaas_sec_2026` | Token secreto do Webhook Asaas |

### Passo 5: Clicar em Deploy
- Clique no botão **"Deploy"**.
- Acompanhe os logs de build em tempo real na aba **Logs**.
- Quando aparecer `[SaaS Server] Running on http://0.0.0.0:3000`, seu app estará no ar com HTTPS ativo!

---

## 3. O que falta para a operação em escala (Checklist de Produção)

| Item | Status Atual | Próximo Passo Recomendado |
| :--- | :---: | :--- |
| **Build & Docker** |  Pronto | Dockerfile multi-stage testado e validado |
| **SSL / HTTPS** |  Pronto | Gerenciado automaticamente pelo Traefik do EasyPanel |
| **Integração Evolution API** |  Conectada | Instância `aladay` pareada com QR Code e webhook |
| **Gateway Asaas R$ 99/mês** |  Conectado | Testado em sandbox. Para faturar de verdade, basta colocar a chave de produção no Asaas |
| **Banco de Dados Persistente** | ⚠️ Em memória (`server.ts`) | No EasyPanel, criar um serviço **PostgreSQL** com 1 clique e adicionar `DATABASE_URL` para não resetar dados ao reiniciar o container |
| **Apontamento de DNS (Hostinger/Cloudflare)** | ⏳ Pendente de DNS | Criar registro tipo `A` apontando `cardapio.seudominio.com.br` para o IP da sua VPS Hostinger |
| **Backups** | ⏳ Opcional | Habilitar a aba "Backups" do EasyPanel com destino para S3/Google Drive |
