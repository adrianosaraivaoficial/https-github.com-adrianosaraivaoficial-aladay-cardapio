# Entrega de segurança e operação — 11/11/2026

## Alterações realizadas

- Superfície pública explícita, validação de sessão no PostgreSQL e escopo por restaurante. Rotas administrativas/de integração antigas exigem superadmin. Cozinha não altera catálogo, credenciais ou assinatura.
- Catálogo público com campos permitidos; importação/sync transacionais impedem sobrescrita por colisão de IDs de outro tenant. Cache vazio do servidor prevalece sobre dados antigos; falha de hidratação não autoriza sync.
- Checkout recalcula itens/adicionais, taxa, mínimo e total. Usa o mesmo cliente SQL durante a transação, trava por tenant e chave/hash de idempotência. Pedido e outbox só retornam sucesso após commit. A chave sobrevive a retentativas no navegador.
- Pix gerado pelo backend com txid de até 25 caracteres, compatível com o identificador no BR Code. Cobrança única por pedido; liquidação valida valor, data e identificador de ponta a ponta. Duplicatas não repetem efeitos e pagamento tardio não retrocede pedido entregue/cancelado.
- Cliente consulta o backend para saber se o pagamento foi confirmado. Foram removidas aprovação local após erro HTTP, geração alternativa de cobrança no modal e cobrança de assinatura fictícia baseada em chave estática.
- Asaas valida token, ID de evento, recurso e valor e consulta o estado atual no provedor antes de alterar o banco. Renovações desconhecidas são importadas somente após validação de assinatura/cliente/valor. A validade do acesso pago é persistida e verificada no checkout.
- Criação Asaas é reservada antes da chamada externa; operação ambígua não cria outra assinatura. Worker tenta recuperar por referência externa. O cartão usa CPF/CNPJ/CEP/endereço informados; nenhum PAN/CVV entra na fila ou no ledger.
- OTP usa apenas telefone persistido, HMAC do código, limite por conta/IP no banco, expiração, limite de tentativas e consumo único. Senha administrativa e JWT não possuem fallback. Sessões persistem expiração fixa e revogação; logout e troca de senha invalidam acesso.
- Outbox com claim concorrente, lease recuperável, backoff, dez tentativas, fila `dead` e reprocessamento administrativo conservando ID. Contrato de entrega exige deduplicação no n8n.
- PostgreSQL obrigatório na inicialização; SQL único aplicado em transação com trava. Removidos seeds bancários e exclusões automáticas de restaurantes no startup. Restrições de tenant protegem novas gravações sem apagar histórico.
- Dockerfile com usuário sem privilégios, Compose com banco privado, staging em projeto/volume próprio, backup/restauração, logs JSON, readiness e métricas privadas. Segredos ficam fora da imagem.
- Extraídos módulos em `backend/`; adicionados testes e workflow CI. Ajustados campos bancários de demonstração, dimensões/decodificação de imagens, limites de upload, SEO no HTML servido, sitemap, robots e noindex em staging.

## Revisão antes da publicação

A revisão automática impediu o envio de um arquivo de exemplos que continha nome, telefone e endereço pessoais. Uma chave JWT fixa também foi removida das instruções de configuração, que agora orientam gerar um segredo exclusivo no servidor. Os exemplos foram anonimizados e os contatos de teste deixaram de usar destinatários pessoais fixos; agora dependem de entrada explícita ou do pedido selecionado. Não foram incluídos arquivos `.env`, backups ou mídias temporárias da ferramenta de edição.

## Verificações executadas

- `npm ci`: instalação limpa após sincronizar o lockfile npm que originalmente divergia do package.json. `bun.lock` não foi regenerado.
- `npm run lint` e `npm run build`: aprovados.
- Cinco cenários unitários e treze cenários de integração: aprovados. Os testes de integração iniciam o servidor de desenvolvimento e exercitam HTTP e PostgreSQL 17 reais com dados sintéticos.
- Concorrência de doze checkouts (acima do pool padrão), criação única de pedido/evento, falha injetada no outbox com rollback/retry, segregação de tenants/papéis, importação conflitante, Pix concorrente e rejeição de valor/data/token, OTP, logout, renovação Asaas, ordem de eventos, recuperação de lease, criação/exclusão de restaurante e expiração do acesso pago.
- Docker build: aprovado. Imagem iniciada em modo de produção/staging com filesystem somente leitura, sem capabilities e com usuário `node`.
- Smoke HTTP da imagem: readiness 200, API privada 401, simulador 404, cardápio com metadata no HTML/noindex, cardápio inexistente 404 e ausência de `.env` na imagem.
- Compose base e staging: sintaxe/mesclagem validadas.
- Dump PostgreSQL criado e restaurado em outro banco descartável; consultas de tenants/pedidos/outbox concluídas.

Não foi feito teste visual em navegador nem cobrança real no Asaas ou envio para um telefone real. Evolution de OTP e Asaas foram simulados localmente nos testes. As imagens e o SEO foram verificados por build e HTTP.

## Trabalho que depende do ambiente de implantação

Os arquivos de staging/CI/backups/observabilidade estão preparados. Não foram publicados em serviços externos. É necessário informar repositório GitHub, destino EasyPanel, armazenamento de backup e coletor/alertas para ativá-los. O diretório local não possui histórico Git. A publicação é preparada em uma branch própria com pull request para revisão, sem alterar diretamente a main.

O onboarding anônimo antigo permanece fechado. Criar uma conta nova de proprietário exige superadmin. Webhooks antigos Evolution/iFood também não devem ser reabertos sem autenticação específica de serviço/provedor. Partes antigas de autenticação e integrações ainda estão no monólito.

Pix direto local não cria cobrança bancária nem cancela um BR Code estático: exige adaptador que comprove liquidação. Cobranças antigas cujo txid foi truncado no QR precisam de reconciliação antes de reutilização. Não foram alterados automaticamente identificadores financeiros históricos.

Asaas precisa de homologação completa no sandbox com credenciais próprias, principalmente cartão, cancelamento/reativação e recuperação de timeout. Alterar plano de uma assinatura já criada exige fluxo específico de atualização. Recuperação ambígua, referências múltiplas ou mais de 100 faturas ficam para conciliação administrativa.

Antes do rollout, investigar duplicidades financeiras e dados históricos incompatíveis com as novas constraints. O schema não possui RLS. Configurar deduplicação do receptor n8n, agendamento e cópia externa criptografada de backups, TLS, política de proxy, retenção de logs e alertas conforme o guia de deploy.
