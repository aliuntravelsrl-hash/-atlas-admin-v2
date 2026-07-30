import React from 'react';
import { ShieldCheck, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, Clock, Circle } from 'lucide-react';

export const ConstitutionalReadiness = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl animate-pulse h-96"></div>
    );
  }

  const {
    gates = {},
    dimensions = {},
    blocking = [],
    execution_enabled = false,
    constitutional_readiness_pct = 0
  } = data || {};

  const gateKeys = ['AGF', 'EVO', 'TPP', 'KBP', 'OVR', 'CRP'];
  const dimensionKeys = [
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'execution', label: 'Execution' },
    { key: 'knowledge', label: 'Knowledge' },
    { key: 'governance', label: 'Governance' },
    { key: 'evidence', label: 'Evidence' }
  ];

  const GATE_STATUS = {
    PASS: {
      label: 'PASS',
      icon: CheckCircle2,
      iconColor: 'text-emerald-400',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    },
    FAIL: {
      label: 'FAIL',
      icon: XCircle,
      iconColor: 'text-rose-500',
      badgeClass: 'bg-rose-500/10 text-rose-455 border-rose-500/20'
    },
    PENDING: {
      label: 'PENDING',
      icon: Clock,
      iconColor: 'text-amber-500',
      badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    },
    PLANNED: {
      label: 'PLANNED',
      icon: Circle,
      iconColor: 'text-slate-500',
      badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
  };

  const totalScore = dimensionKeys.reduce((sum, dim) => sum + (dimensions[dim.key]?.score || 0), 0);
  const totalMax = dimensionKeys.reduce((sum, dim) => sum + (dimensions[dim.key]?.max || 20), 0);

  return (
    <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-750 transition-all">
      <div>
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-4">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            Preparación Constitucional (Readiness Monitor)
          </span>
          <span className="text-[9px] font-black text-slate-500 uppercase font-mono">
            COS-v3.5 Spec
          </span>
        </div>

        {/* Anillo de Progreso y Habilitación de Ejecución */}
        <div className="flex items-center gap-5 mb-5">
          <div className="relative flex items-center justify-center">
            {/* Círculo de fondo */}
            <svg className="w-16 h-16 transform -rotate-90">
              <circle
                cx="32"
                cy="32"
                r="28"
                className="stroke-slate-900 fill-none"
                strokeWidth="5"
              />
              <circle
                cx="32"
                cy="32"
                r="28"
                className={`fill-none transition-all duration-500 ${
                  constitutional_readiness_pct >= 95
                    ? 'stroke-emerald-500'
                    : constitutional_readiness_pct >= 70
                    ? 'stroke-amber-500'
                    : 'stroke-rose-500'
                }`}
                strokeWidth="5"
                strokeDasharray={2 * Math.PI * 28}
                strokeDashoffset={2 * Math.PI * 28 * (1 - constitutional_readiness_pct / 100)}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute text-xs font-black text-white font-mono">
              {constitutional_readiness_pct}%
            </span>
          </div>

          <div className="flex-1">
            <span className="text-[9px] font-bold text-slate-500 uppercase block">Estado de Ejecución</span>
            <div className="mt-1.5 flex items-center">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border ${
                execution_enabled 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}>
                <span className={`w-2 h-2 rounded-full ${execution_enabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}></span>
                Execution: {execution_enabled ? '🟢 ACTIVE' : '🔴 BLOCKED'}
              </span>
            </div>
          </div>
        </div>

        {/* Sección: Constitutional Gates */}
        <div className="border-t border-slate-900/60 pt-4 mb-4">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-2.5">
            Constitutional Gates
          </span>
          <div className="grid grid-cols-2 gap-2">
            {gateKeys.map((key) => {
              const status = gates[key] || 'PLANNED';
              const config = GATE_STATUS[status] || GATE_STATUS.PLANNED;
              const IconComponent = config.icon;
              return (
                <div key={key} className="flex items-center justify-between bg-slate-900/20 border border-slate-850/40 px-2.5 py-1.5 rounded-xl">
                  <div className="flex items-center gap-1.5">
                    <IconComponent className={`w-3.5 h-3.5 ${config.iconColor}`} />
                    <span className="font-bold font-mono text-[10px] text-white">{key}</span>
                  </div>
                  <span className={`text-[8px] font-black tracking-wider px-1.5 py-0.5 rounded font-mono ${config.badgeClass}`}>
                    {status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sección: Dimensiones */}
        <div className="border-t border-slate-900/60 pt-4">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-3">
            Dimension Analysis
          </span>
          <div className="space-y-3">
            {dimensionKeys.map((dim) => {
              const { score = 0, max = 20 } = dimensions[dim.key] || {};
              const pct = max > 0 ? (score / max) * 100 : 0;
              return (
                <div key={dim.key} className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-slate-400">{dim.label}</span>
                    <span className="text-white font-mono">{score}/{max}</span>
                  </div>
                  <div className="w-full bg-slate-900/60 border border-slate-850/30 rounded-full h-2 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-slate-800/80'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex justify-end text-[10px] font-black text-slate-450 font-mono tracking-wide">
            Total: {totalScore}/{totalMax}
          </div>
        </div>
      </div>

      {/* Razón de Bloqueo / blocking reasons */}
      {blocking && blocking.length > 0 && (
        <div className="mt-4 pt-3.5 border-t border-slate-900/60 text-[9px] text-rose-400/90 leading-normal">
          <div className="font-bold uppercase tracking-wider mb-2 text-rose-500 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span>Motivos del Bloqueo:</span>
          </div>
          <ul className="space-y-1 pl-4 list-disc font-semibold font-mono text-[9px] text-slate-400 animate-pulse">
            {blocking.map((reason, idx) => (
              <li key={idx} className="marker:text-rose-500">{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ConstitutionalReadiness;
