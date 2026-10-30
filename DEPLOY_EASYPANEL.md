# Deploy Aladay no EasyPanel — checklist antes de produção

> **Atenção:** esta branch ainda não está liberada para produção. O TypeScript e o build do frontend passam no GitHub Actions, mas o projeto ainda possui dados críticos em memória e não tem persistência multi-tenant completa. Não faça deploy até resolver os bloqueios de `SECURITY_HARDENING.md`.

## 1. Infraestrutura

- VPS Hostinger com Docker e EasyPanel.
- Serviço PostgreSQL gerenciado pelo EasyPanel.
- Serviço da Evolution API e serviço n8n, se forem utilizados.
- Domínio HTTPS apontando para o serviço da aplicação.

No EasyPanel, crie um serviço App usando o Dockerfile da raiz. A aplicação escuta na porta interna `3000`. Configure o domínio no EasyPanel/Traefik; não publique a porta do contêiner diretamente na internet.

## 2. Variáveis obrigatórias

Use `.env.example` como referência e configure os valores reais somente na aba Environment do EasyPanel. Nunca coloque credenciais no Git ou no código.

| Variável | Como configurar |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `APP_URL` | URL HTTPS pública da aplicação |
| `DATABASE_URL` | URL interna do PostgreSQL do EasyPanel |
| `JWT_SECRET` | Gere com `openssl rand -hex 48` |
| `ADMIN_EMAIL` | E-mail administrativo real |
| `ADMIN_PASSWORD` | Senha exclusiva com pelo menos 14 caracteres |
| `ADMIN_PHONE` | Número internacional, necessário para OTP do administrador |
| `EVOLUTION_API_URL` | URL HTTPS da Evolution API |
| `EVOLUTION_API_KEY` | Chave nova gerada no painel Evolution |
| `EVOLUTION_WEBHOOK_TOKEN` | Token aleatório forte, enviado no header `x-evolution-token` |
| `PIX_WEBHOOK_TOKEN` | Token aleatório forte, enviado no header `x-webhook-token` |
| `N8N_WEBHOOK_URL` | URL HTTPS do webhook n8n, se utilizado |
| `ASAAS_ENVIRONMENT` | Comece com `sandbox` |
| `ASAAS_API_KEY` | Chave Asaas do sandbox; mantenha vazia se não usar |
| `ASAAS_WEBHOOK_TOKEN` | Token aleatório forte configurado também no Asaas |

Gere tokens separados. Não reutilize a chave Evolution que apareceu em versões anteriores do repositório. **Rotacione essa chave imediatamente**, pois remover o valor do código atual não apaga o histórico Git.

## 3. Webhooks

- Evolution: configure o webhook para enviar `EVOLUTION_WEBHOOK_TOKEN` no header `x-evolution-token`.
- Pix: configure o provedor para enviar `PIX_WEBHOOK_TOKEN` no header `x-webhook-token`.
- Asaas: configure `ASAAS_WEBHOOK_TOKEN` no header `asaas-access-token`.

O uso de token compartilhado não substitui a validação de assinatura nativa do provedor. Teste os webhooks em sandbox, incluindo duplicidade, valor divergente, expiração e reenvio.

## 4. Pagamentos e teste grátis

- O teste grátis dura 15 dias e não agenda cobrança automática ao terminar.
- O fluxo de assinatura paga está limitado a Pix no estado atual desta branch.
- Cartão e boleto estão desativados no backend e identificados como “em breve” na interface.
- Não habilite confirmação automática Pix até validar o webhook real do banco/provedor e a reconciliação de pagamento.

## 5. Validação executada

O GitHub Actions executa `npm ci --legacy-peer-deps`, `npm run lint` (TypeScript) e `npm run build`. O build do Docker, testes de integração reais e testes de segurança multi-tenant ainda não foram concluídos.

## 6. Bloqueios antes de produção

1. Persistir usuários, produtos, categorias, pedidos, OTPs, trials, assinaturas, cobranças e rate limits no PostgreSQL/Redis.
2. Implementar isolamento por tenant com chaves estrangeiras tenant-scoped, transações e políticas RLS.
3. Criar testes de autorização para cada rota e impedir leitura/escrita cruzada entre restaurantes.
4. Validar o fluxo completo de onboarding, trial, assinatura, webhook e criação de proprietário em sandbox.
5. Implementar idempotência durável e reconciliação para pagamentos/webhooks.
6. Fazer build da imagem Docker, teste de healthcheck e teste de rollback.
7. Revisar retenção de dados, logs, backups, privacidade e requisitos LGPD.

Não execute migrações ou deploy na VPS a partir desta branch sem uma revisão e autorização específicas.
