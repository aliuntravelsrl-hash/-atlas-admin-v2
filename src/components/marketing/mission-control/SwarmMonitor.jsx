import React from 'react';
import { User, Activity, Clock, ShieldAlert, CheckCircle, AlertTriangle } from 'lucide-react';

const HEALTH_STATUS_CONFIG = {
  healthy: { label: 'Healthy', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: CheckCircle },
  warning: { label: 'Warning', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: AlertTriangle },
  critical: { label: 'Critical', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20', icon: ShieldAlert },
  offline: { label: 'Offline', color: 'bg-slate-900/65 text-slate-500 border-slate-800', icon: Clock }
};

const AGENT_META = {
  'hermes-ops': { label: 'Hermes Ops', desc: 'Infrastructure & Webhooks' },
  'hermes-commercial': { label: 'Hermes Commercial', desc: 'Tarifas & B2B Inventory' },
  'hermes-marketing': { label: 'Hermes Marketing', desc: 'Copies & Offers Engine' },
  'ariadne-data': { label: 'Ariadne Data', desc: 'Analytics & SSOT rates' },
  'hermes-qa': { label: 'Hermes QA', desc: 'Test Suites & Validation' },
  'antigravity': { label: 'Antigravity', desc: 'UI/UX Builder & Deployer' }
};

export const SwarmMonitor = ({ swarmData, loading }) => {
  if (loading) {
    return (
      <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl animate-pulse space-y-4 col-span-full">
        <div className="h-4 w-32 bg-slate-800 rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-28 bg-slate-900 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  // Desestructurar datos de agentes y tareas
  const { agents = {}, tasks = [] } = swarmData || {};

  // Mapear agentes para renderizar
  const agentKeys = ['hermes-ops', 'hermes-commercial', 'hermes-marketing', 'ariadne-data', 'hermes-qa', 'antigravity'];

  return (
    <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl col-span-full flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-slate-900 pb-3">
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
          <User className="w-4 h-4 text-blue-400" />
          Swarm Monitor
        </h3>
        <div className="flex gap-4 text-[9px] font-extrabold text-slate-500 uppercase font-mono">
          <span>Activos: <span className="text-emerald-400">6/6</span></span>
          <span>Tareas ejecutándose: <span className="text-blue-400">
            {tasks.filter(t => t.estado === 'en_progreso').length}
          </span></span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        {agentKeys.map(key => {
          const meta = AGENT_META[key] || { label: key, desc: 'Agente autónomo' };
          const activity = agents[key] || { events: 0, errors: 0, lastReport: null };
          
          // Lógica de salud por agente
          let status = 'healthy';
          if (!activity.lastReport) {
            status = 'offline';
          } else {
            const hours = (Date.now() - new Date(activity.lastReport)) / 3600000;
            if (hours > 24) status = 'warning';
            if (activity.errors > 0) status = 'critical';
          }

          const statusCfg = HEALTH_STATUS_CONFIG[status];
          const StatusIcon = statusCfg.icon;

          // Buscar tarea actual asignada a este agente
          const currentTask = tasks.find(t => (t.ejecutor === key || t.asignado_a === key) && t.estado === 'en_progreso');

          return (
            <div 
              key={key} 
              className="bg-slate-900/40 border border-slate-850/60 p-4 rounded-xl flex flex-col justify-between hover:border-slate-750 transition-all group"
            >
              <div>
                <div className="flex items-center justify-between border-b border-slate-850/40 pb-2 mb-2.5">
                  <span className="text-[10px] font-black text-white truncate max-w-[120px] group-hover:text-blue-400 transition-colors">
                    {meta.label}
                  </span>
                  <div className={`px-1.5 py-0.5 rounded-full border text-[8px] font-bold uppercase flex items-center gap-0.5 ${statusCfg.color}`}>
                    <StatusIcon className="w-2 h-2 animate-pulse" />
                    {statusCfg.label}
                  </div>
                </div>
                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-wider leading-relaxed">
                  {meta.desc}
                </p>
                <div className="mt-3 text-[10px] text-slate-400 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-550 font-bold">Eventos:</span>
                    <span className="font-mono text-slate-300">{activity.events || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-550 font-bold">Errores:</span>
                    <span className={`font-mono ${activity.errors > 0 ? 'text-rose-400 font-bold' : 'text-slate-300'}`}>{activity.errors || 0}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-850/40 pt-2.5 mt-3 text-[9px]">
                {currentTask ? (
                  <div>
                    <span className="text-blue-400 font-bold block truncate" title={currentTask.titulo}>⚡ {currentTask.titulo}</span>
                    <span className="text-slate-550 font-semibold uppercase text-[8px] mt-0.5 block">Ejecutando...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-slate-550">
                    <span className="font-semibold uppercase text-[8px]">Último reporte:</span>
                    <span className="font-mono">
                      {activity.lastReport ? new Date(activity.lastReport).toLocaleTimeString('es-DO') : 'nunca'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SwarmMonitor;
