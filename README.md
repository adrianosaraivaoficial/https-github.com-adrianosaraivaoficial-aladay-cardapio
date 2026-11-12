# Aladay

SaaS de cardápios digitais em React/TypeScript, Express e PostgreSQL. Node.js 22 e npm são os padrões deste repositório.

## Desenvolvimento e validação

1. Copie `.env.example` para `.env` e configure um PostgreSQL de desenvolvimento.
2. Defina `NODE_ENV=development`, `DATABASE_URL`, `JWT_SECRET` (32+ caracteres), `ADMIN_EMAIL` e `ADMIN_PASSWORD` (12+ caracteres).
3. Execute `npm ci` e `npm run dev` (porta 3000).

A aplicação não inicia sem banco ou segredos obrigatórios. O SQL único em `database/easypanel-init.sql` é aplicado em transação com trava de migração. Nenhum restaurante ou chave bancária de demonstração é criado no banco. O administrador configurado no ambiente pode provisionar restaurantes e proprietários pelas rotas protegidas.

```sh
npm run lint
npm test
TEST_DATABASE_URL=postgresql://usuario:senha@localhost:5432/aladay_test npm run test:integration
npm run build
```

`test:integration` exige banco descartável cujo nome termina em `_test`: apaga os dados desse banco, aplica a migração duas vezes, inicia `npm run dev` equivalente e exercita HTTP real, concorrência, rollback, OTP com Evolution local, Pix e worker. O Asaas é simulado nos testes; nenhuma cobrança externa é enviada. O comando `lint` executa TypeScript.

## Segurança e operação

- API pública explicitamente delimitada em `backend/security.ts`. Integrações e diagnósticos antigos exigem superadmin; operações de tenant validam sessão e escopo.
- Sessões persistidas/revogáveis, OTP destinado ao telefone cadastrado, código com HMAC e consumo único. Senhas legadas em texto puro deixam de autenticar.
- Checkout, catálogo, mudança de status e Pix usam transações. Pedido e evento de outbox são gravados juntos; falha de gravação retorna erro.
- Webhooks Pix exigem `x-pix-webhook-token`. Asaas exige `asaas-access-token`, ID de evento e reconciliação com a API antes de alterar o banco.
- Worker com `SKIP LOCKED`, recuperação de lease, retentativas e fila `dead`. Entrega é **pelo menos uma vez**: n8n deve deduplicar o `Idempotency-Key`/`id` antes de enviar mensagens ou produzir efeitos.
- Frontend mantém a chave de checkout durante retentativas e só mostra Pix gerado pelo backend. Botões do cliente consultam pagamento, sem simular aprovação.
- Docker, staging isolado, backups e métricas: veja [DEPLOY_EASYPANEL.md](DEPLOY_EASYPANEL.md).

## Limites atuais

A modularização é progressiva: banco, segurança, catálogo, pagamentos, recuperação de cobrança, worker, HTTP, SEO e observabilidade estão em `backend/`; autenticação e integrações antigas ainda ficam em `server.ts`. Não há RLS; isolamento depende dos guardas e das consultas, reforçados por chaves estrangeiras em novas gravações.

O onboarding público antigo e webhooks antigos de Evolution/iFood não estão liberados para acesso anônimo. Não reutilize JWT de administrador em automações externas. Esses fluxos precisam de identidade de serviço/validação específica antes de serem reabertos. Cadastro de proprietários novos exige superadmin; proprietário só altera sua própria conta no mesmo restaurante.

O Pix direto é um BR Code estático com identificador de pedido. Ele não cria cobrança em um banco/PSP, nem cancela o código ao encerrar o contador visual. A confirmação depende de um adaptador bancário confiável que autentique o webhook e informe valor e identificador de liquidação reais.

O acesso pago possui validade persistida e é bloqueado no checkout quando expira, mesmo sem webhook de atraso. Criação de assinatura é reservada no banco antes da chamada Asaas. Respostas ambíguas não provocam nova criação: o worker tenta recuperar a assinatura por `externalReference`. Operações ambíguas, múltiplas assinaturas ou listas com mais de 100 faturas ficam em falha para conciliação administrativa; troca de plano de uma assinatura já criada exige um fluxo específico de atualização. Cartão usa CPF/CNPJ, CEP e número de endereço informados pelo titular; o fluxo completo ainda exige homologação no sandbox antes de produção. O trial é local, único, sem cobrança fictícia; a conversão para assinatura é uma operação posterior.

Métricas e logs são emitidos pela aplicação. Alertas externos, retenção de logs, cópia criptografada dos backups para outro local, DNS/HTTPS e execução do workflow no GitHub dependem da infraestrutura onde o projeto será instalado. Não houve publicação ou alteração de serviços de produção.
