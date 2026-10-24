import React, { useState, useMemo } from 'react';
import { Calculator, TrendingUp, AlertCircle, DollarSign, Layers } from 'lucide-react';

export const FinancialCalculator: React.FC = () => {
  // Parameters
  const [activeTenants, setActiveTenants] = useState<number>(100);
  const [subscriptionPrice, setSubscriptionPrice] = useState<number>(129.90);
  const [fixedInfraCost, setFixedInfraCost] = useState<number>(1200); // VPS central + Managed PostgreSQL + Redis + S3/CDN
  const [evolutionCostPer50Tenants, setEvolutionCostPer50Tenants] = useState<number>(300); // 1 VPS can host ~50 active Evolution WhatsApp instances
  const [gatewayFeePercent, setGatewayFeePercent] = useState<number>(3.5); // Asaas / Iugu
  const [gatewayFixedFee, setGatewayFixedFee] = useState<number>(0.49);
  const [taxPercent, setTaxPercent] = useState<number>(6.0); // Simples Nacional Anexo III
  const [churnPercent, setChurnPercent] = useState<number>(4.5);
  const [cacBRL, setCacBRL] = useState<number>(220); // Customer Acquisition Cost
  const [supportCostPerTenant, setSupportCostPerTenant] = useState<number>(4.0); // customer success / support allocation

  // Financial Calculations
  const calculations = useMemo(() => {
    const grossMRR = activeTenants * subscriptionPrice;
    
    // Variable costs per tenant per month
    const gatewayCostPerTenant = (subscriptionPrice * (gatewayFeePercent / 100)) + gatewayFixedFee;
    const taxCostPerTenant = subscriptionPrice * (taxPercent / 100);
    const evolutionCostPerTenant = evolutionCostPer50Tenants / 50; // proportional per instance
    const totalVariableCostPerTenant = gatewayCostPerTenant + taxCostPerTenant + evolutionCostPerTenant + supportCostPerTenant;
    
    const totalVariableCosts = activeTenants * totalVariableCostPerTenant;
    const contributionMarginPerTenant = subscriptionPrice - totalVariableCostPerTenant;
    const contributionMarginPercent = (contributionMarginPerTenant / subscriptionPrice) * 100;
    
    // Break-even
    const breakEvenTenants = contributionMarginPerTenant > 0 ? Math.ceil(fixedInfraCost / contributionMarginPerTenant) : 0;
    const isAboveBreakEven = activeTenants >= breakEvenTenants;

    // Monthly Net Operating Result (EBITDA projetado)
    const netOperatingProfit = (activeTenants * contributionMarginPerTenant) - fixedInfraCost;

    // Lifetime Value (LTV)
    const averageLifespanMonths = churnPercent > 0 ? 100 / churnPercent : 24;
    const ltv = contributionMarginPerTenant * averageLifespanMonths;
    const ltvCacRatio = cacBRL > 0 ? ltv / cacBRL : 0;

    return {
      grossMRR,
      gatewayCostPerTenant,
      taxCostPerTenant,
      evolutionCostPerTenant,
      totalVariableCostPerTenant,
      totalVariableCosts,
      contributionMarginPerTenant,
      contributionMarginPercent,
      breakEvenTenants,
      isAboveBreakEven,
      netOperatingProfit,
      averageLifespanMonths,
      ltv,
      ltvCacRatio,
    };
  }, [
    activeTenants,
    subscriptionPrice,
    fixedInfraCost,
    evolutionCostPer50Tenants,
    gatewayFeePercent,
    gatewayFixedFee,
    taxPercent,
    churnPercent,
    cacBRL,
    supportCostPerTenant,
  ]);

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="bg-white border border-neutral-200 rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
              <span>Unit Economics</span>
              <span aria-hidden="true">·</span>
              <span>Viabilidade Financeira</span>
              <span aria-hidden="true">·</span>
              <span>Assinatura de R$ 129,90/mês</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-neutral-900">
              Calculadora de Margem, Ponto de Equilíbrio &amp; Sustentabilidade
            </h2>
            <p className="text-xs text-neutral-600 mt-1 max-w-3xl">
              Simulador paramétrico em tempo real que decompõe receitas, custos variáveis de gateways/WhatsApp e custos fixos de servidores para provar a viabilidade do preço de R$ 129,90/mês.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setActiveTenants(50)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTenants === 50 ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              50 Lojas
            </button>
            <button
              onClick={() => setActiveTenants(100)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTenants === 100 ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              100 Lojas
            </button>
            <button
              onClick={() => setActiveTenants(500)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTenants === 500 ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              500 Lojas
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-white border border-neutral-200 rounded-lg p-4">
          <p className="text-xs font-medium text-neutral-500">Receita Recorrente Bruta (MRR)</p>
          <p className="text-2xl font-bold text-neutral-900 mt-1 font-mono tabular-nums">
            {formatBRL(calculations.grossMRR)}
          </p>
          <div className="text-[11px] text-neutral-500 mt-2 flex items-center gap-1.5">
            <span>{activeTenants} restaurantes</span>
            <span aria-hidden="true">·</span>
            <span>R$ {subscriptionPrice.toFixed(2)}/mês</span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-white border border-neutral-200 rounded-lg p-4">
          <p className="text-xs font-medium text-neutral-500">Margem de Contribuição / Loja</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1 font-mono tabular-nums">
            {formatBRL(calculations.contributionMarginPerTenant)}
          </p>
          <div className="text-[11px] text-neutral-500 mt-2 flex items-center gap-1.5">
            <span className="text-emerald-700 font-medium">
              {calculations.contributionMarginPercent.toFixed(1)}% do valor
            </span>
            <span aria-hidden="true">·</span>
            <span>R$ {calculations.totalVariableCostPerTenant.toFixed(2)} custo var.</span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-white border border-neutral-200 rounded-lg p-4">
          <p className="text-xs font-medium text-neutral-500">Ponto de Equilíbrio (Break-Even)</p>
          <p className="text-2xl font-bold text-neutral-900 mt-1 font-mono tabular-nums">
            {calculations.breakEvenTenants}{' '}
            <span className="text-sm font-normal text-neutral-500">restaurantes</span>
          </p>
          <div className="text-[11px] text-neutral-500 mt-2 flex items-center gap-1.5">
            <span>Fixos: {formatBRL(fixedInfraCost)}</span>
            <span aria-hidden="true">·</span>
            <span className={calculations.isAboveBreakEven ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
              {calculations.isAboveBreakEven ? 'Operação no Azul' : 'Abaixo da meta'}
            </span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-white border border-neutral-200 rounded-lg p-4">
          <p className="text-xs font-medium text-neutral-500">Resultado Operacional (EBITDA)</p>
          <p
            className={`text-2xl font-bold mt-1 font-mono tabular-nums ${
              calculations.netOperatingProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {formatBRL(calculations.netOperatingProfit)}
          </p>
          <div className="text-[11px] text-neutral-500 mt-2 flex items-center gap-1.5">
            <span>LTV: {formatBRL(calculations.ltv)}</span>
            <span aria-hidden="true">·</span>
            <span>LTV/CAC: {calculations.ltvCacRatio.toFixed(1)}x</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Parameters on Left, Detailed Decomposition on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls Column */}
        <div className="lg:col-span-5 bg-white border border-neutral-200 rounded-lg p-5 space-y-5">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2 pb-2 border-b border-neutral-200">
            <Calculator className="w-4 h-4 text-neutral-700" />
            Parâmetros do Modelo
          </h3>

          {/* Slider 1: Active Tenants */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-neutral-700 font-medium">Restaurantes Ativos Pagantes</span>
              <span className="font-mono font-bold text-neutral-900 tabular-nums">
                {activeTenants}
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="600"
              step="5"
              value={activeTenants}
              onChange={(e) => setActiveTenants(Number(e.target.value))}
              className="w-full accent-neutral-900 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-neutral-400 mt-0.5">
              <span>10 lojas</span>
              <span>100 lojas</span>
              <span>300 lojas</span>
              <span>600 lojas</span>
            </div>
          </div>

          {/* Slider 2: Fixed Infra */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-neutral-700 font-medium">Custos Fixos de Servidores Centrais</span>
              <span className="font-mono font-bold text-neutral-900 tabular-nums">
                {formatBRL(fixedInfraCost)}
              </span>
            </div>
            <input
              type="range"
              min="400"
              max="5000"
              step="100"
              value={fixedInfraCost}
              onChange={(e) => setFixedInfraCost(Number(e.target.value))}
              className="w-full accent-neutral-900 cursor-pointer"
            />
            <p className="text-[11px] text-neutral-500 mt-1">
              Inclui VPS central Node.js, cluster PostgreSQL gerenciado, Redis e storage S3/CDN.
            </p>
          </div>

          {/* Slider 3: Evolution API Server Cost per 50 instances */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-neutral-700 font-medium">VPS Evolution API (bloco de 50 instâncias)</span>
              <span className="font-mono font-bold text-neutral-900 tabular-nums">
                {formatBRL(evolutionCostPer50Tenants)}
              </span>
            </div>
            <input
              type="range"
              min="150"
              max="600"
              step="25"
              value={evolutionCostPer50Tenants}
              onChange={(e) => setEvolutionCostPer50Tenants(Number(e.target.value))}
              className="w-full accent-neutral-900 cursor-pointer"
            />
            <p className="text-[11px] text-neutral-500 mt-1">
              Custo de memória RAM para Chromium/Baileys (~R$ {calculations.evolutionCostPerTenant.toFixed(2)} por restaurante).
            </p>
          </div>

          {/* Slider 4: Gateway Fee */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-100">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Taxa Gateway (%)</label>
              <input
                type="number"
                step="0.1"
                value={gatewayFeePercent}
                onChange={(e) => setGatewayFeePercent(Number(e.target.value))}
                className="w-full p-2 text-xs bg-neutral-50 border border-neutral-200 rounded-md font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Taxa Fixa Gateway (R$)</label>
              <input
                type="number"
                step="0.05"
                value={gatewayFixedFee}
                onChange={(e) => setGatewayFixedFee(Number(e.target.value))}
                className="w-full p-2 text-xs bg-neutral-50 border border-neutral-200 rounded-md font-mono"
              />
            </div>
          </div>

          {/* Slider 5: Imposto & Churn */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Imposto Simples (%)</label>
              <input
                type="number"
                step="0.5"
                value={taxPercent}
                onChange={(e) => setTaxPercent(Number(e.target.value))}
                className="w-full p-2 text-xs bg-neutral-50 border border-neutral-200 rounded-md font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Churn Mensal (%)</label>
              <input
                type="number"
                step="0.5"
                value={churnPercent}
                onChange={(e) => setChurnPercent(Number(e.target.value))}
                className="w-full p-2 text-xs bg-neutral-50 border border-neutral-200 rounded-md font-mono"
              />
            </div>
          </div>
        </div>

        {/* Detailed Breakdown Column */}
        <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-lg p-5 space-y-5">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2 pb-2 border-b border-neutral-200">
            <Layers className="w-4 h-4 text-neutral-700" />
            Demonstrativo de Resultado Mensal (DRE Projetado)
          </h3>

          <div className="overflow-x-auto border border-neutral-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-700 font-semibold">
                <tr>
                  <th className="p-2.5 text-left">Rubrica / Linha</th>
                  <th className="p-2.5 text-right">Por Restaurante</th>
                  <th className="p-2.5 text-right">Total Mensal ({activeTenants} lojas)</th>
                  <th className="p-2.5 text-right">% Receita</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 font-mono">
                <tr className="bg-neutral-50/50 font-semibold text-neutral-900">
                  <td className="p-2.5 text-left font-sans">Receita Bruta (Faturamento)</td>
                  <td className="p-2.5 text-right tabular-nums">{formatBRL(subscriptionPrice)}</td>
                  <td className="p-2.5 text-right tabular-nums">{formatBRL(calculations.grossMRR)}</td>
                  <td className="p-2.5 text-right tabular-nums">100.0%</td>
                </tr>

                <tr className="text-neutral-700">
                  <td className="p-2.5 text-left font-sans pl-5">(-) Gateway de Cobrança (Asaas/Iugu)</td>
                  <td className="p-2.5 text-right tabular-nums text-rose-700">
                    -{formatBRL(calculations.gatewayCostPerTenant)}
                  </td>
                  <td className="p-2.5 text-right tabular-nums text-rose-700">
                    -{formatBRL(calculations.gatewayCostPerTenant * activeTenants)}
                  </td>
                  <td className="p-2.5 text-right tabular-nums">
                    {((calculations.gatewayCostPerTenant / subscriptionPrice) * 100).toFixed(1)}%
                  </td>
                </tr>

                <tr className="text-neutral-700">
                  <td className="p-2.5 text-left font-sans pl-5">(-) Impostos (Simples Nacional ~6%)</td>
                  <td className="p-2.5 text-right tabular-nums text-rose-700">
                    -{formatBRL(calculations.taxCostPerTenant)}
                  </td>
                  <td className="p-2.5 text-right tabular-nums text-rose-700">
                    -{formatBRL(calculations.taxCostPerTenant * activeTenants)}
                  </td>
                  <td className="p-2.5 text-right tabular-nums">
                    {taxPercent.toFixed(1)}%
                  </td>
                </tr>

                <tr className="text-neutral-700">
                  <td className="p-2.5 text-left font-sans pl-5">(-) VPS Evolution API (RAM/instância)</td>
                  <td className="p-2.5 text-right tabular-nums text-rose-700">
                    -{formatBRL(calculations.evolutionCostPerTenant)}
                  </td>
                  <td className="p-2.5 text-right tabular-nums text-rose-700">
                    -{formatBRL(calculations.evolutionCostPerTenant * activeTenants)}
                  </td>
                  <td className="p-2.5 text-right tabular-nums">
                    {((calculations.evolutionCostPerTenant / subscriptionPrice) * 100).toFixed(1)}%
                  </td>
                </tr>

                <tr className="text-neutral-700">
                  <td className="p-2.5 text-left font-sans pl-5">(-) Suporte Operacional Alocado</td>
                  <td className="p-2.5 text-right tabular-nums text-rose-700">
                    -{formatBRL(supportCostPerTenant)}
                  </td>
                  <td className="p-2.5 text-right tabular-nums text-rose-700">
                    -{formatBRL(supportCostPerTenant * activeTenants)}
                  </td>
                  <td className="p-2.5 text-right tabular-nums">
                    {((supportCostPerTenant / subscriptionPrice) * 100).toFixed(1)}%
                  </td>
                </tr>

                <tr className="bg-emerald-50/50 font-semibold text-emerald-900 border-t-2 border-neutral-300">
                  <td className="p-2.5 text-left font-sans">(=) Margem de Contribuição Total</td>
                  <td className="p-2.5 text-right tabular-nums">
                    {formatBRL(calculations.contributionMarginPerTenant)}
                  </td>
                  <td className="p-2.5 text-right tabular-nums">
                    {formatBRL(calculations.contributionMarginPerTenant * activeTenants)}
                  </td>
                  <td className="p-2.5 text-right tabular-nums">
                    {calculations.contributionMarginPercent.toFixed(1)}%
                  </td>
                </tr>

                <tr className="text-neutral-700">
                  <td className="p-2.5 text-left font-sans pl-5">(-) Custos Fixos Centrais (Postgres/VPS/CDN)</td>
                  <td className="p-2.5 text-right tabular-nums text-neutral-400">—</td>
                  <td className="p-2.5 text-right tabular-nums text-rose-700">
                    -{formatBRL(fixedInfraCost)}
                  </td>
                  <td className="p-2.5 text-right tabular-nums">
                    {((fixedInfraCost / calculations.grossMRR) * 100).toFixed(1)}%
                  </td>
                </tr>

                <tr className="bg-neutral-900 text-white font-bold border-t border-neutral-800">
                  <td className="p-3 text-left font-sans">(=) Resultado Operacional Líquido (EBITDA)</td>
                  <td className="p-3 text-right tabular-nums">
                    {formatBRL(calculations.netOperatingProfit / activeTenants)}
                  </td>
                  <td className="p-3 text-right tabular-nums text-emerald-400">
                    {formatBRL(calculations.netOperatingProfit)}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {((calculations.netOperatingProfit / calculations.grossMRR) * 100).toFixed(1)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Formula Callout */}
          <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3.5 space-y-2 text-xs text-neutral-700">
            <p className="font-semibold text-neutral-900">Fórmulas Rigorosas Utilizadas:</p>
            <div className="font-mono text-[11px] space-y-1">
              <p>• Margem de Contribuição = R$ 129,90 − Custos Variáveis Médios</p>
              <p>• Ponto de Equilíbrio (Break-Even) = Custos Fixos ÷ Margem de Contribuição</p>
              <p>• LTV = Margem de Contribuição ÷ Churn Mensal</p>
            </div>
            <p className="text-[11px] text-neutral-500 pt-1">
              *Nota legal: Projeções matemáticas ilustrativas com base em custos de provedores em 2026. Não constituem promessa de faturamento ou garantia contratual.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
