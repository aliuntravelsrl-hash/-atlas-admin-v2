import React from 'react';
import { ShieldCheck, ShieldAlert, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

export const ConstitutionalReadiness = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl animate-pulse h-64"></div>
    );
  }

  const {
    constitutional_readiness_pct = 0,
    execution_enabled = false,
    pipeline_ready = false,
    knowledge_ready = false,
    agent_ready = false,
    ovr_ready = false,
    blocking_reason = "No provisto"
  } = data || {};

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

        {/* Anillo de Progreso y Habilitación */}
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
            <span className="text-[9px] font-bold text-slate-500 uppercase block">Estado Ejecución</span>
            <div className="mt-1 flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                execution_enabled 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${execution_enabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}></span>
                {execution_enabled ? 'EJECUCIÓN HABILITADA' : 'EJECUCIÓN DESHABILITADA'}
              </span>
            </div>
          </div>
        </div>

        {/* Frentes Constitucionales */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between bg-slate-900/25 border border-slate-850/30 p-2.5 rounded-xl text-[10px]">
            <span className="font-bold text-slate-350">Pipeline Ready (F2)</span>
            <div className="flex items-center gap-1.5">
              {pipeline_ready ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-rose-500" />
              )}
              <span className={`font-black font-mono ${pipeline_ready ? 'text-emerald-400' : 'text-rose-500'}`}>
                {pipeline_ready ? 'SÍ' : 'NO'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between bg-slate-900/25 border border-slate-850/30 p-2.5 rounded-xl text-[10px]">
            <span className="font-bold text-slate-350">Knowledge Ready (KBP-v1)</span>
            <div className="flex items-center gap-1.5">
              {knowledge_ready ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-rose-500" />
              )}
              <span className={`font-black font-mono ${knowledge_ready ? 'text-emerald-400' : 'text-rose-500'}`}>
                {knowledge_ready ? 'SÍ' : 'NO'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between bg-slate-900/25 border border-slate-850/30 p-2.5 rounded-xl text-[10px]">
            <span className="font-bold text-slate-350">Agent Ready (Swarm Status)</span>
            <div className="flex items-center gap-1.5">
              {agent_ready ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-rose-500" />
              )}
              <span className={`font-black font-mono ${agent_ready ? 'text-emerald-400' : 'text-rose-500'}`}>
                {agent_ready ? 'SÍ' : 'NO'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between bg-slate-900/25 border border-slate-850/30 p-2.5 rounded-xl text-[10px]">
            <span className="font-bold text-slate-350">OVR Ready (Validation)</span>
            <div className="flex items-center gap-1.5">
              {ovr_ready ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-rose-500" />
              )}
              <span className={`font-black font-mono ${ovr_ready ? 'text-emerald-400' : 'text-rose-500'}`}>
                {ovr_ready ? 'SÍ' : 'NO'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Razón de Bloqueo si aplica */}
      {!execution_enabled && blocking_reason && (
        <div className="mt-4 pt-3.5 border-t border-slate-900/60 flex gap-2 text-[9px] text-rose-400/90 leading-normal items-start font-medium">
          <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold uppercase tracking-wider block mb-0.5 text-rose-500">Motivo del Bloqueo:</span>
            {blocking_reason}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConstitutionalReadiness;
