import React from 'react';
import { TrendingUp, DollarSign, Sparkles } from 'lucide-react';

export const MarketingOverview = ({ marketingData, loading }) => {
  if (loading) {
    return (
      <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl animate-pulse h-36"></div>
    );
  }

  const {
    leads_total = 0,
    cotizados = 0,
    confirmadas = 0,
    conversion_pct = 0,
    revenue_usd = 0,
    revenue_dop = 0,
    excursions_count = 0,
    exchange_rate = 58.5
  } = marketingData || {};

  return (
    <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-750 transition-all col-span-full md:col-span-1">
      <div>
        <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-4">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            Marketing & Conversión
          </span>
          <span className="text-[9px] font-bold text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-850">
            DOP/USD: {exchange_rate}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-550 block font-bold uppercase">Leads Registrados</span>
            <span className="text-lg font-mono font-black text-white">{leads_total}</span>
            <span className="text-[8px] text-slate-500 block font-medium">Cotizados: {cotizados}</span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-slate-550 block font-bold uppercase">Tasa Conversión</span>
            <span className="text-lg font-mono font-black text-emerald-400">{conversion_pct}%</span>
            <span className="text-[8px] text-slate-500 block font-medium">Confirmados: {confirmadas}</span>
          </div>

          <div className="space-y-1 col-span-2 pt-2 border-t border-slate-900/40">
            <span className="text-[10px] text-slate-550 block font-bold uppercase">Revenue Acumulado</span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-mono font-black text-white">
                ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(revenue_usd)} USD
              </span>
              <span className="text-xs font-mono font-bold text-slate-450">
                ≈ RD$ {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(revenue_dop)}
              </span>
            </div>
            <div className="flex justify-between items-center text-[9px] text-slate-500 pt-1">
              <span>Reservas Excursión: {excursions_count}</span>
              <span className="flex items-center gap-0.5 text-yellow-500/80">
                <Sparkles className="w-2.5 h-2.5 animate-pulse" />
                Live Revenue
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketingOverview;
