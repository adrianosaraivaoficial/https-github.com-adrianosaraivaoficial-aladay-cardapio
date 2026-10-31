import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  FileText,
  Scale,
  Lock,
  ArrowLeft,
  CheckCircle2,
  Building2,
  QrCode,
  MessageSquare,
  Database,
  UserCheck,
  Mail,
  Clock,
  CreditCard,
} from 'lucide-react';

export type LegalTab = 'terms' | 'privacy';

interface LegalComplianceViewProps {
  initialTab?: LegalTab;
  onTabChange?: (tab: LegalTab) => void;
  onBackToHome: () => void;
}

export const LegalComplianceView: React.FC<LegalComplianceViewProps> = ({
  initialTab = 'terms',
  onTabChange,
  onBackToHome,
}) => {
  const [activeTab, setActiveTab] = useState<LegalTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleSelectTab = (tab: LegalTab) => {
    setActiveTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const scrollToClause = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-4 sm:py-8 space-y-8">
      {/* Top Bar & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-6">
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-950 transition-colors cursor-pointer mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar para a Página Inicial</span>
          </button>
          <div className="flex items-center gap-2 text-xs text-neutral-500 font-mono">
            <span>DOCUMENTAÇÃO JURÍDICA &amp; LGPD</span>
            <span aria-hidden="true">·</span>
            <span>ATUALIZADO EM OUTUBRO DE 2026</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-neutral-950 tracking-tight">
            {activeTab === 'terms'
              ? 'Termos e Condições Gerais de Uso'
              : 'Política de Privacidade e Proteção de Dados (LGPD)'}
          </h1>
        </div>

        {/* Segmented Document Switcher */}
        <div className="inline-flex p-1 bg-neutral-200/80 rounded-xl self-start sm:self-center shrink-0">
          <button
            type="button"
            onClick={() => handleSelectTab('terms')}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'terms'
                ? 'bg-neutral-950 text-white shadow-xs'
                : 'text-neutral-700 hover:text-neutral-950'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Termos de Uso</span>
          </button>
          <button
            type="button"
            onClick={() => handleSelectTab('privacy')}
            className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'privacy'
                ? 'bg-neutral-950 text-white shadow-xs'
                : 'text-neutral-700 hover:text-neutral-950'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Política de Privacidade</span>
          </button>
        </div>
      </div>

      {/* Executive Summary Banner */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-5 sm:p-6 shadow-2xs grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
            <QrCode className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-neutral-950">
              100% Pix Direto para a Loja
            </h2>
            <p className="text-[11px] text-neutral-600 leading-relaxed mt-0.5">
              A Aladay não intermedia nem retém valores de pedidos. O QR Code Pix é gerado com a chave bancária configurada pelo próprio restaurante.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-neutral-100 border border-neutral-200 text-neutral-800 flex items-center justify-center shrink-0">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-neutral-950">
              Isolamento Multi-Tenant (RLS)
            </h2>
            <p className="text-[11px] text-neutral-600 leading-relaxed mt-0.5">
              Dados de cardápios, clientes e pedidos de cada restaurante são isolados por políticas de segurança em nível de linha (PostgreSQL RLS).
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-neutral-100 border border-neutral-200 text-neutral-800 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-neutral-950">
              Conformidade Lei nº 13.709/2018
            </h2>
            <p className="text-[11px] text-neutral-600 leading-relaxed mt-0.5">
              Transparência integral sobre coleta, finalidade, retenção e direitos dos titulares de dados pessoais para lojistas e consumidores.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Layout with Sidebar TOC */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Sidebar Table of Contents */}
        <aside className="lg:col-span-4 bg-white border border-neutral-200 rounded-2xl p-5 space-y-4 lg:sticky lg:top-24">
          <div className="border-b border-neutral-100 pb-3">
            <p className="text-[11px] font-mono uppercase tracking-wider text-neutral-500">
              Sumário Navegável
            </p>
            <h3 className="text-sm font-bold text-neutral-950 mt-0.5">
              {activeTab === 'terms' ? 'Cláusulas dos Termos de Uso' : 'Seções da Política LGPD'}
            </h3>
          </div>

          {activeTab === 'terms' ? (
            <nav className="space-y-1.5 text-xs">
              {[
                { id: 'termos-1', label: '1. Objeto e Aceitação' },
                { id: 'termos-2', label: '2. Cadastro e Conta do Restaurante' },
                { id: 'termos-3', label: '3. Teste Grátis (15 Dias) e Assinaturas' },
                { id: 'termos-4', label: '4. Pagamentos via Pix Direto (0% Taxa)' },
                { id: 'termos-5', label: '5. Automação WhatsApp (Evolution API)' },
                { id: 'termos-6', label: '6. Propriedade Intelectual e SLA' },
                { id: 'termos-7', label: '7. Cancelamento, Suspensão e Foro' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToClause(item.id)}
                  className="w-full text-left px-3 py-2 rounded-lg text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 font-medium transition-colors cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </nav>
          ) : (
            <nav className="space-y-1.5 text-xs">
              {[
                { id: 'lgpd-1', label: '1. Papéis na LGPD (Controlador vs Operador)' },
                { id: 'lgpd-2', label: '2. Dados Pessoais Coletados' },
                { id: 'lgpd-3', label: '3. Finalidades e Bases Legais' },
                { id: 'lgpd-4', label: '4. Segurança e Isolamento Multi-Tenant' },
                { id: 'lgpd-5', label: '5. Compartilhamento e Cookies' },
                { id: 'lgpd-6', label: '6. Direitos do Titular e Canal DPO' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToClause(item.id)}
                  className="w-full text-left px-3 py-2 rounded-lg text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 font-medium transition-colors cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </nav>
          )}

          <div className="pt-3 border-t border-neutral-100 space-y-2 text-[11px] text-neutral-500">
            <p className="font-semibold text-neutral-800">Precisa de suporte jurídico ou DPO?</p>
            <p>
              Entre em contato com nosso Encarregado de Proteção de Dados pelo canal{' '}
              <span className="font-mono text-neutral-900">privacidade@aladay.com.br</span>.
            </p>
          </div>
        </aside>

        {/* Document Body */}
        <article className="lg:col-span-8 bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 space-y-8 text-neutral-700 text-xs sm:text-sm leading-relaxed shadow-2xs">
          {activeTab === 'terms' ? (
            <>
              {/* TERMOS DE USO */}
              <div className="border-b border-neutral-200 pb-5 space-y-2">
                <div className="flex items-center gap-2 text-emerald-700 font-mono text-xs font-semibold">
                  <FileText className="w-4 h-4" />
                  <span>CONTRATO DE LICENÇA DE USO DE SOFTWARE (SaaS)</span>
                </div>
                <p className="text-xs text-neutral-500">
                  Estes Termos de Uso regulam a utilização da plataforma tecnológica{' '}
                  <strong>Aladay Cardápios Digitais</strong> por estabelecimentos gastronômicos (restaurantes, hamburguerias, pizzarias, lanchonetes e similares, doravante denominados <strong>&ldquo;Lojista&rdquo;</strong> ou <strong>&ldquo;Tenant&rdquo;</strong>) e por seus clientes finais (<strong>&ldquo;Consumidores&rdquo;</strong>).
                </p>
              </div>

              <section id="termos-1" className="space-y-2.5 scroll-mt-24">
                <h2 className="text-base font-bold text-neutral-950">
                  1. Objeto e Aceitação dos Termos
                </h2>
                <p>
                  1.1. A <strong>Aladay</strong> disponibiliza um software como serviço (SaaS) voltado à criação e gestão de cardápios digitais interativos para delivery, retirada no balcão e atendimento em mesas via QR Code, integrado a painel operacional de cozinha (KDS - <em>Kitchen Display System</em>) e automação de avisos transacionais de pedidos via WhatsApp (Evolution API).
                </p>
                <p>
                  1.2. Ao cadastrar um restaurante, iniciar o período de teste gratuito de 15 (quinze) dias ou utilizar o cardápio digital para realizar pedidos, o usuário declara ter lido, compreendido e aceitado integralmente as disposições destes Termos de Uso e da Política de Privacidade.
                </p>
              </section>

              <section id="termos-2" className="space-y-2.5 scroll-mt-24">
                <h2 className="text-base font-bold text-neutral-950">
                  2. Cadastro, Conta do Restaurante (Tenant) e Responsabilidades
                </h2>
                <p>
                  2.1. O Lojista compromete-se a fornecer dados cadastrais exatos, completos e atualizados (incluindo CNPJ ou CPF do responsável legal, nome comercial, telefone WhatsApp e endereço de operação), responsabilizando-se civil e criminalmente pela veracidade das informações.
                </p>
                <p>
                  2.2. O Lojista é o único e exclusivo responsável pela composição do seu cardápio digital, incluindo descrições de pratos, imagens, preços, taxas de entrega, disponibilidade de estoque, preparo higiênico-sanitário dos alimentos, cumprimento do tempo estimado e entrega ao Consumidor final.
                </p>
                <p>
                  2.3. O acesso ao Painel Administrativo é protegido por autenticação criptografada (JWT). O Lojista deve manter suas credenciais sob sigilo, não as compartilhando com terceiros não autorizados.
                </p>
              </section>

              <section id="termos-3" className="space-y-2.5 scroll-mt-24">
                <h2 className="text-base font-bold text-neutral-950 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-700" />
                  <span>3. Período de Teste Grátis (15 Dias) e Planos de Assinatura</span>
                </h2>
                <p>
                  3.1. <strong>Teste Grátis de 15 Dias:</strong> Novos restaurantes cadastrados têm direito a um período de avaliação gratuita de 15 (quinze) dias corridos, com acesso integral às funcionalidades da plataforma e sem cobrança no ato do cadastro (R$ 0,00).
                </p>
                <p>
                  3.2. <strong>Bloqueio Automático por Expiração sem Assinatura:</strong> Encerrado o prazo de 15 (quinze) dias de avaliação sem que haja uma assinatura ativa confirmada no gateway de faturamento Asaas, o acesso ao Painel Administrativo (KDS/Gestão) e ao link público do Cardápio Digital da loja será temporariamente bloqueado até a regularização do plano.
                </p>
                <p>
                  3.3. <strong>Modalidades de Assinatura Aladay Pro:</strong>
                </p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>
                    <strong>Plano Anual no Cartão de Crédito:</strong> Valor promocional equivalente a <strong>R$ 99,00/mês</strong> (faturado no cartão de crédito em 12 parcelas mensais de R$ 99,00, totalizando R$ 1.188,00/ano), com economia de 24% em relação ao ciclo mensal.
                  </li>
                  <li>
                    <strong>Plano Mensal Flexível:</strong> Valor fixo de <strong>R$ 129,90/mês</strong>, sem fidelidade anual, pagável via Pix, Cartão de Crédito ou Boleto Bancário processado via Asaas.
                  </li>
                </ul>
                <p>
                  3.4. Ambos os planos garantem <strong>0% de comissão sobre as vendas</strong> realizadas pelo restaurante, independentemente do volume de pedidos ou faturamento mensal.
                </p>
              </section>

              <section id="termos-4" className="space-y-2.5 scroll-mt-24">
                <h2 className="text-base font-bold text-neutral-950 flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-emerald-700" />
                  <span>4. Pagamentos de Pedidos via Pix Direto (Isenção de Intermediação)</span>
                </h2>
                <p>
                  4.1. O Lojista configura diretamente no Painel Administrativo a sua própria <strong>Chave Pix</strong> (CNPJ, CPF, E-mail, Telefone ou Chave Aleatória EVP) e o <strong>Nome do Beneficiário</strong> vinculado à sua conta bancária.
                </p>
                <p>
                  4.2. No checkout do consumidor, a plataforma Aladay gera o QR Code dinâmico e o código &ldquo;Pix Copia e Cola&rdquo; seguindo estritamente o padrão técnico <strong>EMV® QRCPS-MPM do Banco Central do Brasil</strong> utilizando os dados bancários informados pelo Lojista.
                </p>
                <p>
                  4.3. <strong>Inexistência de Custódia ou Split pela Aladay:</strong> O valor pago pelo Consumidor é liquidado <strong>100% e diretamente na conta bancária do Lojista</strong>. A Aladay não atua como instituição de pagamento ou subcredenciadora nas vendas de refeições, não retendo qualquer percentual e não se responsabilizando por chaves Pix cadastradas incorretamente pelo Lojista ou por estornos comerciais entre Lojista e Consumidor.
                </p>
              </section>

              <section id="termos-5" className="space-y-2.5 scroll-mt-24">
                <h2 className="text-base font-bold text-neutral-950 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-700" />
                  <span>5. Integração WhatsApp (Evolution API) e Boas Práticas</span>
                </h2>
                <p>
                  5.1. O módulo de automação WhatsApp destina-se ao envio de notificações transacionais sobre o andamento do pedido solicitado pelo próprio Consumidor (confirmação de recebimento, início de preparo na cozinha, saída para entrega e conclusão).
                </p>
                <p>
                  5.2. É expressamente vedado ao Lojista utilizar a integração para envio de mensagens publicitárias não solicitadas (<em>spam</em>), conteúdo ilícito ou práticas que violem as políticas de uso do WhatsApp Inc., sob pena de suspensão da instância conectada.
                </p>
              </section>

              <section id="termos-6" className="space-y-2.5 scroll-mt-24">
                <h2 className="text-base font-bold text-neutral-950">
                  6. Propriedade Intelectual e Disponibilidade (SLA)
                </h2>
                <p>
                  6.1. O código-fonte, arquitetura de banco de dados, interfaces visuais, logotipos e marcas da <strong>Aladay</strong> são de titularidade exclusiva da plataforma, sendo concedida ao Lojista uma licença de uso não exclusiva, intransferível e revogável enquanto durar a assinatura ativa ou período de teste.
                </p>
                <p>
                  6.2. As marcas, logotipos, fotografias de pratos e receitas inseridas pelo Lojista permanecem sob propriedade exclusiva do respectivo restaurante.
                </p>
              </section>

              <section id="termos-7" className="space-y-2.5 scroll-mt-24">
                <h2 className="text-base font-bold text-neutral-950">
                  7. Cancelamento, Suspensão e Foro Aplicável
                </h2>
                <p>
                  7.1. O Lojista poderá solicitar o cancelamento de sua assinatura a qualquer momento através do painel de gestão ou dos canais oficiais de suporte, sem multa rescisória no Plano Mensal, ou observadas as condições da contratação parcelada no Plano Anual.
                </p>
                <p>
                  7.2. Estes Termos são regidos pelas leis da República Federativa do Brasil, ficando eleito o foro da comarca da sede da contratada ou do domicílio do usuário, conforme aplicável pelo Código de Defesa do Consumidor e legislação civil vigente.
                </p>
              </section>
            </>
          ) : (
            <>
              {/* POLÍTICA DE PRIVACIDADE E LGPD */}
              <div className="border-b border-neutral-200 pb-5 space-y-2">
                <div className="flex items-center gap-2 text-emerald-700 font-mono text-xs font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>CONFORMIDADE COM A LEI GERAL DE PROTEÇÃO DE DADOS (LEI Nº 13.709/2018)</span>
                </div>
                <p className="text-xs text-neutral-500">
                  Esta Política de Privacidade descreve de forma clara e transparente como a{' '}
                  <strong>Aladay Cardápios Digitais</strong> coleta, utiliza, armazena e protege os dados pessoais de Lojistas assinantes e de Consumidores que realizam pedidos através dos cardápios digitais hospedados na plataforma.
                </p>
              </div>

              <section id="lgpd-1" className="space-y-2.5 scroll-mt-24">
                <h2 className="text-base font-bold text-neutral-950 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-700" />
                  <span>1. Papéis na LGPD: Controlador e Operador de Dados</span>
                </h2>
                <p>
                  Para fins do Art. 5º, incisos VI e VII da Lei nº 13.709/2018 (LGPD), a cadeia de responsabilidade sobre o tratamento de dados pessoais estrutura-se da seguinte maneira:
                </p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>
                    <strong>Dados dos Consumidores Finais do Cardápio:</strong> O <strong>Restaurante (Lojista/Tenant)</strong> atua como <strong>Controlador</strong> dos dados pessoais dos clientes que realizam pedidos em sua loja, cabendo-lhe as decisões sobre o atendimento e entrega. A <strong>Aladay</strong> atua como <strong>Operadora</strong>, processando tais dados exclusivamente em nome e sob instrução do Restaurante para viabilizar o pedido, o QR Code Pix e os avisos no WhatsApp.
                  </li>
                  <li>
                    <strong>Dados Cadastrais e de Assinatura dos Lojistas:</strong> A <strong>Aladay</strong> atua como <strong>Controladora</strong> dos dados cadastrais, credenciais de acesso e registros de assinatura SaaS dos próprios restaurantes contratantes.
                  </li>
                </ul>
              </section>

              <section id="lgpd-2" className="space-y-2.5 scroll-mt-24">
                <h2 className="text-base font-bold text-neutral-950">
                  2. Dados Pessoais Coletados
                </h2>
                <p>
                  Coletamos apenas o mínimo necessário (princípio da necessidade, Art. 6º, III da LGPD) para a operação segura do sistema:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-1.5">
                    <p className="text-xs font-bold text-neutral-900">
                      A. Dados do Lojista (Restaurante)
                    </p>
                    <p className="text-[11px] text-neutral-600 leading-relaxed">
                      Nome completo ou Razão Social, CPF/CNPJ, e-mail de login, telefone WhatsApp, endereço do estabelecimento, Chave Pix e Nome do Beneficiário para recebimento de vendas.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 space-y-1.5">
                    <p className="text-xs font-bold text-neutral-900">
                      B. Dados do Consumidor Final
                    </p>
                    <p className="text-[11px] text-neutral-600 leading-relaxed">
                      Nome de identificação do pedido, número de WhatsApp (para recebimento de status do pedido), endereço de entrega (ou número da mesa) e itens escolhidos na sacola.
                    </p>
                  </div>
                </div>
              </section>

              <section id="lgpd-3" className="space-y-2.5 scroll-mt-24">
                <h2 className="text-base font-bold text-neutral-950">
                  3. Finalidades e Bases Legais de Tratamento (Art. 7º da LGPD)
                </h2>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>
                    <strong>Execução de Contrato (Art. 7º, V):</strong> Processar pedidos realizados no cardápio digital, enviá-los à fila da cozinha (KDS), gerar o código de pagamento Pix e disparar notificações de status de preparo e entrega via WhatsApp.
                  </li>
                  <li>
                    <strong>Cumprimento de Obrigação Legal ou Regulatória (Art. 7º, II):</strong> Emissão de cobranças de assinatura via Asaas, guarda de registros de acesso conforme o Marco Civil da Internet (Lei nº 12.965/2014) e obrigações fiscais.
                  </li>
                  <li>
                    <strong>Consentimento (Art. 7º, I):</strong> Coleta opcional de métricas analíticas de navegação (Google Analytics 4), ativada somente mediante aceite explícito no banner de privacidade.
                  </li>
                </ul>
              </section>

              <section id="lgpd-4" className="space-y-2.5 scroll-mt-24">
                <h2 className="text-base font-bold text-neutral-950 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-700" />
                  <span>4. Segurança da Informação e Isolamento Multi-Tenant</span>
                </h2>
                <p>
                  A Aladay adota medidas técnicas e administrativas rigorosas para proteger os dados contra acessos não autorizados, vazamentos ou alterações indevidas:
                </p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>
                    <strong>PostgreSQL Row-Level Security (RLS):</strong> Isolamento lógico estrito por <code>tenant_id</code> em nível de banco de dados, garantindo que um restaurante jamais tenha acesso a pedidos, clientes ou configurações de outro estabelecimento.
                  </li>
                  <li>
                    <strong>Autenticação JWT &amp; Hash Criptográfico:</strong> Senhas de lojistas armazenadas sob hash criptográfico com salt e sessões validadas por tokens assinados no servidor.
                  </li>
                  <li>
                    <strong>Proteção de Credenciais Financeiras:</strong> Chaves de API de faturamento (Asaas) trafegam exclusivamente no ambiente de servidor (backend proxy), nunca sendo expostas no navegador.
                  </li>
                </ul>
              </section>

              <section id="lgpd-5" className="space-y-2.5 scroll-mt-24">
                <h2 className="text-base font-bold text-neutral-950">
                  5. Compartilhamento de Dados e Uso de Cookies
                </h2>
                <p>
                  5.1. <strong>Não Comercialização:</strong> A Aladay <strong>jamais vende, aluga ou comercializa</strong> dados pessoais de lojistas ou de consumidores finais para terceiros ou corretores de dados.
                </p>
                <p>
                  5.2. O compartilhamento ocorre estritamente com operadores essenciais à prestação do serviço: (i) o próprio Restaurante onde o Consumidor realizou o pedido; (ii) o gateway de assinaturas <strong>Asaas</strong> (exclusivamente para processar a mensalidade do Lojista); e (iii) a API de WhatsApp conectada pelo restaurante para envio do recibo e status do pedido.
                </p>
                <p>
                  5.3. Utilizamos armazenamento local (<code>localStorage</code>) e cookies estritamente necessários para manter os itens da sacola de compras, a sessão autenticada do lojista e a preferência de privacidade selecionada pelo usuário.
                </p>
              </section>

              <section id="lgpd-6" className="space-y-2.5 scroll-mt-24">
                <h2 className="text-base font-bold text-neutral-950 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-700" />
                  <span>6. Direitos do Titular (Art. 18 da LGPD) e Contato do DPO</span>
                </h2>
                <p>
                  O titular dos dados pessoais pode exercer, a qualquer tempo e mediante requisição gratuita:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Confirmação da existência de tratamento e acesso aos seus dados;</li>
                  <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
                  <li>Anonimização, bloqueio ou eliminação de dados desnecessários;</li>
                  <li>Portabilidade dos dados e revogação do consentimento de cookies analíticos.</li>
                </ul>
                <div className="mt-4 p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Encarregado pelo Tratamento de Dados Pessoais (DPO)</span>
                    </p>
                    <p className="text-[11px] text-emerald-800">
                      Para solicitações relativas à LGPD, exclusão de conta ou dúvidas sobre privacidade:
                    </p>
                  </div>
                  <span className="font-mono text-xs font-bold text-emerald-950 bg-white px-3 py-1.5 rounded-lg border border-emerald-200 shrink-0">
                    privacidade@aladay.com.br
                  </span>
                </div>
              </section>
            </>
          )}

          {/* Bottom Switcher & Back Action */}
          <div className="pt-6 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBackToHome}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-neutral-300 text-neutral-700 hover:bg-neutral-100 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar ao Início</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab(activeTab === 'terms' ? 'privacy' : 'terms')}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {activeTab === 'terms' ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Ler Política de Privacidade (LGPD)</span>
                </>
              ) : (
                <>
                  <Scale className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Ler Termos e Condições de Uso</span>
                </>
              )}
            </button>
          </div>
        </article>
      </div>
    </div>
  );
};
