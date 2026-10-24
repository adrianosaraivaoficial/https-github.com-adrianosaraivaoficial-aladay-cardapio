import React, { useState } from 'react';
import {
  ArrowRight,
  LogIn,
  QrCode,
  MessageSquare,
  Utensils,
  ShieldCheck,
  Check,
  Calculator,
  ChefHat,
  CreditCard,
  ExternalLink,
} from 'lucide-react';
import { AuthSession, RestaurantTenant } from '../types';

interface LandingPageViewProps {
  tenant: RestaurantTenant;
  authSession: AuthSession;
  onNavigateToLogin: () => void;
  onNavigateToSetup: () => void;
  onNavigateToDemoMenu: () => void;
  onNavigateToAdmin: () => void;
}

export const LandingPageView: React.FC<LandingPageViewProps> = ({
  tenant,
  authSession,
  onNavigateToLogin,
  onNavigateToSetup,
  onNavigateToDemoMenu,
  onNavigateToAdmin,
}) => {
  const [monthlyOrders, setMonthlyOrders] = useState<number>(450);
  const [averageTicketBRL, setAverageTicketBRL] = useState<number>(68);
  const [marketplaceFeePercent, setMarketplaceFeePercent] = useState<number>(18);

  const grossMonthlyRevenue = monthlyOrders * averageTicketBRL;
  const marketplaceMonthlyCost = (grossMonthlyRevenue * marketplaceFeePercent) / 100;
  const aladayMonthlyCost = 129.9;
  const monthlySavings = Math.max(0, marketplaceMonthlyCost - aladayMonthlyCost);
  const annualSavings = monthlySavings * 12;

  const formatBRL = (val: number) =>
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  return (
    <div className="space-y-16 pb-12">
      {/* ================================================================== */}
      {/* 1. HERO SECTION: VALUE PROPOSITION + LOGIN & CONVERSION CTAS       */}
      {/* ================================================================== */}
      <section className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-10 lg:p-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Column: Editorial Pitch & Direct Actions */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 font-medium">
              <span>aladay.com.br</span>
              <span aria-hidden="true">&middot;</span>
              <span>Cardápio Digital Próprio</span>
              <span aria-hidden="true">&middot;</span>
              <span>Pix 100% Direto na Conta da Loja</span>
              <span aria-hidden="true">&middot;</span>
              <span>Zero Comissão</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-neutral-950 leading-[1.12] max-w-2xl">
              Transforme seu WhatsApp em uma máquina de pedidos sem pagar comissão por venda.
            </h1>

            <p className="text-base text-neutral-600 leading-relaxed max-w-2xl">
              Com o <strong>Aladay Cardápios Digitais</strong>, seu restaurante recebe pedidos ilimitados, avisa o cliente automaticamente no WhatsApp a cada etapa da cozinha e recebe o <strong>Pix 100% direto na sua própria conta bancária</strong>. Você paga apenas uma assinatura fixa de <strong>R$ 129,90/mês</strong>.
            </p>

            {/* Primary & Secondary Action Bar */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onNavigateToSetup}
                className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <span>Criar Meu Cardápio por R$ 129,90/mês</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onNavigateToLogin}
                className="px-5 py-3.5 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Fazer Login no Painel</span>
              </button>

              <button
                type="button"
                onClick={onNavigateToDemoMenu}
                className="px-4 py-3.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-sm font-medium rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <span>Ver Cardápio ao Vivo</span>
                <ExternalLink className="w-3.5 h-3.5 text-neutral-500" />
              </button>
            </div>

            {/* Quiet Trust Metrics Row */}
            <div className="pt-6 border-t border-neutral-200 grid grid-cols-3 gap-6">
              <div>
                <p className="text-2xl font-bold text-neutral-950 font-mono tabular-nums">0%</p>
                <p className="text-xs text-neutral-500 mt-0.5">Taxa sobre seus pedidos</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-700 font-mono tabular-nums">100% Direto</p>
                <p className="text-xs text-neutral-500 mt-0.5">Pix cai no banco da sua loja</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-neutral-950 font-mono tabular-nums">R$ 129,90/mês</p>
                <p className="text-xs text-neutral-500 mt-0.5">Plano único via Asaas</p>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Live Operational Preview Card */}
          <div className="lg:col-span-5 bg-neutral-950 text-white rounded-xl p-6 space-y-5 border border-neutral-800">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div>
                <p className="text-xs text-neutral-400">Fluxo Real de Pedido &middot; aladay.com.br</p>
                <h2 className="text-sm font-semibold text-white mt-0.5">
                  Liquidação Direta + Automação KDS WhatsApp
                </h2>
              </div>
              <span className="text-xs font-mono text-emerald-400">Sem Intermediação</span>
            </div>

            {/* Step-by-step live transaction breakdown */}
            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1">
                <div className="flex items-center justify-between text-neutral-400">
                  <span>1. Cliente finaliza no Cardápio Digital</span>
                  <span className="font-mono text-white font-semibold">R$ 85,80</span>
                </div>
                <p className="text-neutral-300">
                  Geração instantânea de QR Code Pix Oficial (EMV BACEN) com a chave CNPJ/Telefone do restaurante.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1">
                <div className="flex items-center justify-between text-neutral-400">
                  <span>2. Liquidação no Banco do Restaurante</span>
                  <span className="font-mono text-emerald-400 font-semibold">Recebido: R$ 85,80</span>
                </div>
                <p className="text-neutral-300">
                  O valor entra integralmente no Nubank PJ / Inter / Itaú da loja. A Aladay retém R$ 0,00.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1">
                <div className="flex items-center justify-between text-neutral-400">
                  <span>3. Cozinha KDS &amp; Disparo no WhatsApp</span>
                  <span className="font-mono text-amber-300">Automático</span>
                </div>
                <p className="text-neutral-300">
                  Comanda impressa na cozinha e cliente notificado no WhatsApp a cada mudança de status.
                </p>
              </div>
            </div>

            {/* Quick Access Box for Existing Users */}
            <div className="pt-3 border-t border-neutral-800 flex items-center justify-between gap-3">
              <div className="text-xs">
                <p className="text-neutral-400">Acesso Direto ao Painel:</p>
                <p className="font-semibold text-white truncate">
                  {authSession.user.name}
                </p>
              </div>
              <button
                type="button"
                onClick={onNavigateToAdmin}
                className="px-3.5 py-2 bg-white hover:bg-neutral-200 text-neutral-950 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                Acessar KDS Agora
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 2. INTERACTIVE SAVINGS CALCULATOR (MARKETPLACE VS ALADAY R$ 129,90) */}
      {/* ================================================================== */}
      <section className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-10">
        <div className="max-w-3xl space-y-2 mb-8">
          <p className="text-xs font-medium text-emerald-700">
            01. Simulador de Margem &amp; Economia Real
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-950 tracking-tight">
            Descubra quanto do seu lucro fica retido nas taxas comissionadas todos os meses
          </h2>
          <p className="text-sm text-neutral-600">
            Ajuste o volume de pedidos do seu delivery e compare o modelo comissionado tradicional com a assinatura fixa de R$ 129,90/mês da Aladay.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Sliders */}
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <label htmlFor="slider-orders" className="text-neutral-700">
                  Pedidos por mês no seu restaurante
                </label>
                <span className="font-mono font-bold text-neutral-950 tabular-nums">
                  {monthlyOrders} pedidos/mês
                </span>
              </div>
              <input
                id="slider-orders"
                type="range"
                min={50}
                max={2000}
                step={25}
                value={monthlyOrders}
                onChange={(e) => setMonthlyOrders(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-neutral-400 font-mono">
                <span>50 pedidos</span>
                <span>1.000 pedidos</span>
                <span>2.000 pedidos</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <label htmlFor="slider-ticket" className="text-neutral-700">
                  Ticket Médio por Pedido (R$)
                </label>
                <span className="font-mono font-bold text-neutral-950 tabular-nums">
                  R$ {averageTicketBRL},00
                </span>
              </div>
              <input
                id="slider-ticket"
                type="range"
                min={25}
                max={180}
                step={5}
                value={averageTicketBRL}
                onChange={(e) => setAverageTicketBRL(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-neutral-400 font-mono">
                <span>R$ 25</span>
                <span>R$ 90</span>
                <span>R$ 180</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <label htmlFor="slider-fee" className="text-neutral-700">
                  Comissão Média Cobrada por Apps Tradicionais (%)
                </label>
                <span className="font-mono font-bold text-neutral-950 tabular-nums">
                  {marketplaceFeePercent}%
                </span>
              </div>
              <input
                id="slider-fee"
                type="range"
                min={12}
                max={27}
                step={1}
                value={marketplaceFeePercent}
                onChange={(e) => setMarketplaceFeePercent(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-neutral-400 font-mono">
                <span>12% (Plano Básico)</span>
                <span>18% (Média)</span>
                <span>27% (Com Entrega)</span>
              </div>
            </div>
          </div>

          {/* Results Summary Box */}
          <div className="lg:col-span-5 bg-neutral-50 border border-neutral-200 rounded-xl p-6 space-y-5">
            <div className="space-y-3 border-b border-neutral-200 pb-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-neutral-600">Faturamento Bruto Mensal:</span>
                <span className="font-mono font-semibold text-neutral-900 tabular-nums">
                  {formatBRL(grossMonthlyRevenue)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-600">Comissão paga aos Apps ({marketplaceFeePercent}%):</span>
                <span className="font-mono font-semibold text-red-600 tabular-nums">
                  - {formatBRL(marketplaceMonthlyCost)} / mês
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-600">Mensalidade Fixa Aladay (via Asaas):</span>
                <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                  R$ 129,90 / mês
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-neutral-500">
                Economia Líquida que permanece no caixa do seu restaurante:
              </p>
              <p className="text-3xl font-bold text-emerald-700 font-mono tabular-nums">
                {formatBRL(monthlySavings)} / mês
              </p>
              <p className="text-xs font-mono text-neutral-600 tabular-nums">
                Equivalente a <strong>{formatBRL(annualSavings)} economizados em 12 meses</strong>
              </p>
            </div>

            <button
              type="button"
              onClick={onNavigateToSetup}
              className="w-full py-3 px-4 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Calculator className="w-4 h-4" />
              <span>Quero Economizar {formatBRL(monthlySavings)}/mês Agora</span>
            </button>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 3. HOW IT WORKS: 3 PILLARS OF ALADAY ARCHITECTURE                  */}
      {/* ================================================================== */}
      <section className="space-y-8">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-medium text-emerald-700">
            02. Arquitetura Operacional Completa
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-950 tracking-tight">
            Tudo que sua operação precisa do pedido à entrega
          </h2>
          <p className="text-sm text-neutral-600">
            Projetado para hamburguerias, pizzarias, restaurantes, açaiterias e dark kitchens que buscam independência financeira e atendimento rápido.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Pillar 1 */}
          <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-900">
                <QrCode className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-neutral-950">
                01. Pix 100% Direto na Conta da Loja
              </h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Cada restaurante cadastra sua própria chave Pix (CNPJ, CPF, Celular ou E-mail). Quando o cliente faz o pedido, o código Pix Copia e Cola e o QR Code são gerados diretamente para o banco da sua loja, sem passar por contas intermediárias.
              </p>
            </div>
            <div className="pt-4 border-t border-neutral-100 text-[11px] font-mono text-neutral-500">
              Padrão Oficial BACEN EMVCo &middot; Zero Retenção
            </div>
          </div>

          {/* Pillar 2 */}
          <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-900">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-neutral-950">
                02. KDS &amp; Avisos no WhatsApp em Tempo Real
              </h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Quando a cozinha move o pedido no painel Kanban (Confirmado &rarr; Em Preparo &rarr; Saiu para Entrega), o Aladay dispara automaticamente uma mensagem personalizada no WhatsApp do cliente via Evolution API com o link de rastreio ao vivo.
              </p>
            </div>
            <div className="pt-4 border-t border-neutral-100 text-[11px] font-mono text-neutral-500">
              Reduz em até 80% as mensagens &ldquo;Cadê meu pedido?&rdquo;
            </div>
          </div>

          {/* Pillar 3 */}
          <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-900">
                <CreditCard className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-neutral-950">
                03. Assinatura Fixa R$ 129,90 via Asaas
              </h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                O Gateway Nacional Asaas é utilizado exclusivamente para a cobrança da sua assinatura mensal fixa de R$ 129,90/mês da plataforma Aladay. Sem surpresas no fim do mês: venda R$ 5.000 ou R$ 100.000, sua mensalidade é a mesma.
              </p>
            </div>
            <div className="pt-4 border-t border-neutral-100 text-[11px] font-mono text-neutral-500">
              Domínio Seguro Cloudflare &middot; aladay.com.br
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 4. ATTRIBUTABLE SOCIAL PROOF & CASE STUDIES                        */}
      {/* ================================================================== */}
      <section className="space-y-6">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-medium text-emerald-700">
            03. Resultados Comprovados em Operações Reais
          </p>
          <h2 className="text-2xl font-bold text-neutral-950 tracking-tight">
            Restaurantes que migraram seus clientes recorrentes para o Aladay
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
            <p className="text-sm text-neutral-700 leading-relaxed">
              &ldquo;Antes deixávamos quase R$ 4.200 por mês em comissões de marketplace para clientes que já conheciam nossa hamburgueria. Com o link da Aladay na bio do Instagram e no WhatsApp automático, migramos 65% dos pedidos recorrentes em 60 dias e o Pix cai na hora na nossa conta Nubank PJ.&rdquo;
            </p>
            <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-xs">
              <div>
                <p className="font-bold text-neutral-950">Carlos Eduardo Mendes</p>
                <p className="text-neutral-500">Sócio-Proprietário &middot; Brasas &amp; Burger Artesanal (São Paulo, SP)</p>
              </div>
              <span className="font-mono font-bold text-emerald-700 tabular-nums">
                +R$ 3.850/mês em margem
              </span>
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
            <p className="text-sm text-neutral-700 leading-relaxed">
              &ldquo;O grande diferencial para nossa pizzaria foi o KDS integrado ao WhatsApp. O pizzaiolo avança o pedido na tela da cozinha e o cliente recebe na hora que a pizza entrou no forno e quando o motoboy saiu. Zeramos o gargalo de atendimento telefônico nas sextas e sábados.&rdquo;
            </p>
            <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-xs">
              <div>
                <p className="font-bold text-neutral-950">Marco Antônio Di Fiori</p>
                <p className="text-neutral-500">Fundador &middot; Pizzaria Di Fiori Forno a Lenha (Consolação, SP)</p>
              </div>
              <span className="font-mono font-bold text-emerald-700 tabular-nums">
                -78% chamadas no balcão
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 5. PRICING & LOGIN CONVERSION SECTION                              */}
      {/* ================================================================== */}
      <section className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <p className="text-xs font-medium text-emerald-700">
              04. Plano Único e Transparente
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-neutral-950 tracking-tight">
              Tudo liberado por R$ 129,90 fixos por mês. Sem letras miúdas.
            </h2>
            <p className="text-sm text-neutral-600">
              Sem taxa de adesão, sem fidelidade obrigatória e sem limite de pedidos ou produtos cadastrados.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs text-neutral-700">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Cardápio Digital Ilimitado (Link &amp; QR Code Mesa)</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Pix 100% Direto na Conta do seu Restaurante</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Painel KDS Kanban para Cozinha e Expedição</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Notificações Automáticas no WhatsApp (Evolution API)</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Taxas de Entrega por Bairro e Cupons de Desconto</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Login Multi-Tenant Seguro (Dono, Gerente e Cozinha)</span>
              </div>
            </div>
          </div>

          {/* Right Card: Pricing & Login Box */}
          <div className="lg:col-span-5 bg-neutral-50 border border-neutral-200 rounded-xl p-6 space-y-5">
            <div className="flex items-baseline justify-between border-b border-neutral-200 pb-4">
              <div>
                <h3 className="text-base font-bold text-neutral-950">Plano Aladay Pro</h3>
                <p className="text-xs text-neutral-500">Cobrança mensal via Asaas</p>
              </div>
              <div className="text-right">
                <span className="text-3xl font-bold text-neutral-950 font-mono tabular-nums">R$ 129,90</span>
                <span className="text-xs text-neutral-500">/mês</span>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={onNavigateToSetup}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Criar Conta do Meu Restaurante Agora</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onNavigateToLogin}
                className="w-full py-3 px-4 bg-white hover:bg-neutral-100 text-neutral-900 border border-neutral-300 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4 text-neutral-700" />
                <span>Já sou cliente &middot; Fazer Login no Sistema</span>
              </button>
            </div>

            <p className="text-[11px] text-neutral-500 text-center">
              Acesso imediato ao painel do lojista, KDS e autenticação via WhatsApp 2FA.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
