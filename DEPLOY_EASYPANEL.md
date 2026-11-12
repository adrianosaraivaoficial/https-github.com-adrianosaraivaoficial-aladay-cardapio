# Deploy, staging e recuperação

## Ambiente

O `Dockerfile` usa Node 22 Debian slim, build em estágio separado, usuário `node`, encerramento por sinal e healthcheck `/api/v1/ready`. As ferramentas usadas pelo backend (incluindo `tsx` e Vite importado no servidor) são preservadas na imagem. `.env` e arquivos de backup não entram no contexto Docker.

No EasyPanel, use Dockerfile, porta interna 3000, volume PostgreSQL persistente e domínio HTTPS. Configure as variáveis de `.env.example` no ambiente do serviço. `DATABASE_URL`, `JWT_SECRET` e `ADMIN_PASSWORD` são obrigatórias. `ADMIN_EMAIL` identifica a conta administrativa; alterar a senha configurada revoga suas sessões ao reiniciar. Compartilhe os mesmos segredos e banco entre réplicas.

Para Compose local:

```sh
cp .env.example .env
# Edite .env: use segredos aleatórios, POSTGRES_PASSWORD e APP_URL reais do ambiente.
docker compose up -d --build
```

A aplicação fica em `127.0.0.1:3000`; PostgreSQL não publica porta no host. O proxy deve alcançar essa porta pela rede do host ou ser configurado na mesma rede Docker. Mantenha `PGSSLMODE=disable` somente em rede privada; em conexão externa use TLS com validação de certificado (`verify-full`). A senha em uma URI precisa estar codificada quando contiver caracteres reservados.

`TRUST_PROXY_HOPS=0` é o padrão seguro para acesso direto. Ajuste para o número exato de proxies confiáveis e impeça acesso direto à aplicação por redes públicas. Não use um número arbitrário: cabeçalhos encaminhados poderiam falsificar o IP de rate limit.

Integrações são opcionais; ausência de configuração resulta em indisponibilidade explícita. `N8N_WEBHOOK_URL` e `N8N_WORKER_TOKEN` habilitam a entrega do outbox ao n8n. O receptor precisa validar o Bearer e deduplicar o ID do evento. `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_DEFAULT_INSTANCE` habilitam OTP para o telefone já registrado. `GEMINI_API_KEY` e `IFOOD_CLIENT_ID/SECRET` continuam no backend.

`ASAAS_API_KEY`, `ASAAS_ENVIRONMENT` e `ASAAS_WEBHOOK_TOKEN` pertencem ao mesmo ambiente/conta. Asaas envia `asaas-access-token`; o evento tem `id` único. O servidor reconcilia ID, assinatura, cliente e valor e grava o evento junto à mudança de estado. Consulte a [documentação de webhooks](https://docs.asaas.com/docs/sobre-os-webhooks) e [retries e idempotência](https://docs.asaas.com/docs/retries-e-idempot%C3%AAncia). Criação de assinatura não comprova pagamento; suspensão usa `INACTIVE`, e reativação precisa de `nextDueDate`, conforme [API de assinaturas](https://docs.asaas.com/reference/update-existing-subscription).

`PIX_WEBHOOK_SECRET` autentica o adaptador bancário no header `x-pix-webhook-token`. Não configure o segredo no frontend. O adaptador deve comprovar a liquidação; o BR Code local não possui integração bancária automática.

Credenciais globais em produção são configuradas pelo deploy, não por gravação no `.env` pelo painel. Atualize o ambiente e reinicie as réplicas. `ASAAS_PIX_KEY/BENEFICIARY/CITY` são configurações legadas; faturas reais usam o payload fornecido pelo gateway.

## Staging isolado

Use Compose com suporte a `!override` (v2.24.4+). Crie `.env.staging` com segredos próprios, banco sem dados pessoais, `APP_URL` de staging, credenciais sandbox e `POSTGRES_PASSWORD` diferente. Nunca monte o volume de produção.

```sh
docker compose --env-file .env.staging -p aladay-staging -f docker-compose.yml -f docker-compose.staging.yml up -d --build
```

O override de staging redefine `env_file` para `.env.staging`. O projeto separado isola rede e volume. Staging usa porta local 3001, `NODE_ENV=production`, `DEPLOY_ENV=staging`, `ASAAS_ENVIRONMENT=sandbox` e `SEO_NOINDEX=true`. Simuladores ficam bloqueados também em staging. Configure webhooks sandbox apontando para o domínio de staging e homologue autenticação, criação, pagamento, estorno e cancelamento com credenciais próprias.

## Migração e rollout

Faça backup e ensaie uma restauração antes de atualizar produção. O schema único é aplicado dentro de uma transação com trava de migração. Não há exclusão automática de restaurantes reservados nem seeds bancários.

Novos índices únicos rejeitam histórico duplicado. Investigue antes do deploy:

```sql
SELECT tenant_slug,idempotency_key,COUNT(*) FROM orders WHERE idempotency_key IS NOT NULL GROUP BY 1,2 HAVING COUNT(*)>1;
SELECT order_id,COUNT(*) FROM pix_transactions GROUP BY 1 HAVING COUNT(*)>1;
SELECT end_to_end_id,COUNT(*) FROM pix_transactions WHERE end_to_end_id IS NOT NULL GROUP BY 1 HAVING COUNT(*)>1;
```

Não apague duplicidades financeiras automaticamente. Reconcilie e preserve trilha de auditoria. As novas chaves estrangeiras são `NOT VALID`: protegem novas gravações sem remover histórico. Após corrigir os dados antigos, valide cada constraint com `ALTER TABLE ... VALIDATE CONSTRAINT ...` em janela adequada. Não há políticas RLS nesta versão.

IDs de produto/categoria são globalmente únicos no schema existente: importações com IDs de outro restaurante retornam 409 em vez de sobrescrever seus dados. Links antigos de acompanhamento com IDs sequenciais deixam de ser públicos; novos pedidos usam UUID aleatório. Tokens antigos sem sessão persistida deixam de autenticar.

## Backup e restauração

```sh
docker compose --profile ops run --rm backup
```

O script cria dump custom, valida seu catálogo, escreve checksum e só então remove backups com mais de `BACKUP_RETENTION_DAYS` (padrão 7). `BACKUP_PATH` define o diretório no host. Restrinja seu acesso: dumps contêm dados pessoais. Programe esse comando no scheduler do host (por exemplo, diariamente às 03h no fuso configurado no host). Copie os arquivos para armazenamento externo criptografado e monitore a idade do último backup; o script local não faz essa cópia.

Teste com um PostgreSQL vazio e descartável, acessível ao cliente PostgreSQL:

```sh
RESTORE_DATABASE_URL=postgresql://usuario:senha@host:5432/aladay_restore_test sh scripts/restore-check.sh backups/ARQUIVO.dump
```

O script exige destino explícito, restaura com `--exit-on-error` e consulta tenants, pedidos e outbox. Também confira checksum com `sha256sum -c`. Um catálogo válido de dump sozinho não comprova restauração.

## Observabilidade e worker

- `/api/v1/health`: liveness, sem contagens nem dados de clientes.
- `/api/v1/ready`: verifica PostgreSQL, retorna 503 se indisponível.
- `/api/v1/admin/metrics`: Bearer de superadmin, contagens HTTP e fila por estado/idade.
- Logs JSON: ID de requisição, método, template da rota, status e duração. Não registram corpo, query string ou headers. O proxy também precisa redigir URLs e segredos.
- Worker embutido ativo por padrão; `OUTBOX_WORKER_ENABLED=false` desliga o processamento nessa réplica. Múltiplas réplicas coordenam com `SKIP LOCKED`. Lease de dois minutos, timeout HTTP de dez segundos, até dez tentativas com backoff.
- Falhas ficam em `dead`. Após corrigir a causa, superadmin pode chamar `POST /api/v1/admin/outbox/ID/retry`; o evento conserva seu ID. Não reexecute efeitos sem deduplicação no receptor.
- `billing.reconcile` recupera criações Asaas de resultado ambíguo consultando a referência antes de qualquer nova criação. Nenhum PAN/CVV é persistido em outbox ou ledger. Se a referência não tiver resultado único, trate administrativamente; não apague o bloqueio sem consultar a conta Asaas.

Configure alertas no seu coletor para 5xx, readiness, falhas de pool/worker, eventos `dead`, idade do evento pendente e ausência de backup recente. O Compose limita tamanho/rotação dos logs locais. Alertas e serviços externos não foram provisionados por estes arquivos.

## CI

`.github/workflows/ci.yml` executa instalação limpa, TypeScript, testes unitários, integração com PostgreSQL 17, build Vite e build Docker. Nenhum segredo de produção é necessário. O workflow executa em pushes e pull requests quando GitHub Actions está habilitado no repositório.
