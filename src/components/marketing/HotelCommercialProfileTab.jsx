import React from 'react';
import { DollarSign, TrendingUp, Target, Users, ShoppingBag, Calendar, CheckCircle, Flag, Compass } from 'lucide-react';

export const HotelCommercialProfileTab = ({ hotel, auditResults }) => {
  if (!hotel) return null;

  const metrics = {
    marginPercentage: 15,
    totalRevenueUsd: 18420.00,
    totalBookings: 28,
    aggTicketUsd: 657.85,
    adsSpendUsd: 730.00,
    roas: 8.4,
    cplUsd: 5.14,
    leadsAttributed: 142,
    crossSellingRatio: 42,
    hermesAvgClosingMins: 7.2,
    settlementStatus: 'Al día (próximo corte: 15 Sep)'
  };


  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* 1. Key Performance Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>REVENUE TOTAL BRUTO</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-22xl font-black text-white mt-2">
            USD ${metrics.totalRevenueUsd.toFixed(2)}
          </div>
          <div className="text-[11px] text-emerald-400 font-semibold mt-1 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" /> +${metrics.totalBookings} reservas confirmadas
          </div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>INVERSI�N EN PAUTA</span>
            <Target className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-2xl font-black text-white mt-2">
            USD ${metrics.adsSpendUsd.toFixed(2)}
          </div>
          <div className="text-[11px] text-orange-400 font-semibold mt-1">
            ROAS: ${metrics.roas}x • CPL: USD ${metrics.cplUsd}
          </div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>RATIO CROSS-SELLING</span>
            <Compass className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-white mt-2">
            {metrics.crossSellingRatio}%
          </div>
          <div className="text-[11px] text-amber-400 font-semibold mt-1">
            Huéspedes con Tours (Dolphin / Saona)
          </div>
        </div>

        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>EMBUFO HERMES IA</span>
            <Users className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-22xl font-black text-white mt-2">
            {metrics.leadsAttributed} Leads
          </div>
          <div className="text-[11px] text-cyan-400 font-semibold mt-1">
            Tiempo Cierre: {metrics.hermesAvgClosingMins} minutos
          </div>
        </div>

      </div>

      {/* 2. Desglose Estratégico de la Relación Comercial */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Izquierda: Condiciones y Allotment */}
        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-850 space-y-4">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Calendar className="w-4 h-4 text-orange-500" />
            Contrato y Compromiso de Inventario (Allotment)
          </h4>
          
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-slate-850">
              <span className="text-slate-400">Estructura de Suministro:</span>
              <span className="font-bold text-white">Core 1 (Tarifas Master) + Core 2 (Bloqueos)</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-850">
              <span className="text-slate-400">Margen Comercial Neto:</span>
              <span className="font-bold text-emerald-400">${metrics.marginPercentage}% Garantizado</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-850">
              <span className="text-slate-400">Estado de Conciliación:</span>
              <span className="font-semibold text-slate-200">{metrics.settlementStatus}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-400">Visibilidad en Comparador:</span>
              <span className="font-black text-orange-400">Activo (Quote / Compare & ShareTrip)</span>
            </div>
          </div>
        </div>

        {/* Derecha: Tracción de Pauta Meta & GTM */}
        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-850 space-y-4">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Flag className="w-4 h-4 text-cyan-500" />
            Atribución de Pauta y Huella CRM
          </h4>
          
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-slate-850">
              <span className="text-slate-400">Meta Pixel / CAPI Tracking:</span>
              <span className="font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> Vinculado (AddToCart + Lead)
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-850">
              <span className="text-slate-400">Google Tag Manager (GA4):</span>
              <span className="font-semibold text-slate-200">Eventos dataLayer sync</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-850">
              <span className="text-slate-400">Vendedor IA Hermes Commercial:</span>
              <span className="font-semibold text-cyan-400">Contexto de Carrito Activo</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-400">Distribución PDF DOC-1:</span>
              <span className="font-bold text-white">Proformas Oficiales Gotenberg</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};

export default HotelCommercialProfileTab;
