import React from 'react';
import { Activity, Shield, Play, Pause, RefreshCw } from 'lucide-react';

const ALL_SWARM_AGENTS = [
  'hermes-qa',
  'hermes-ops',
  'hermes-marketing',
  'ariadne-data',
  'hermes-commercial',
  'intel'
];

export const SwarmHealthLive = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl animate-pulse h-64"></div>
    );
  }

  // Mapear los datos de la RPC mc_swarm_health() indexados por nombre de agente.
  const swarmDataMap = {};
  if (Array.isArray(data)) {
    data.forEach(row => {
      if (row && row.agent) {
        swarmDataMap[row.agent] = row;
      }
    });
  }

  const getRelativeTime = (isoString) => {
    if (!isoString) return '—';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    if (isNaN(diffMs)) return '—';
    
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'hace segundos';
    if (diffMins < 60) return `hace ${diffMins} min`;
    if (diffHours < 24) return `hace ${diffHours}h`;
    return `hace ${diffDays}d`;
  };

  return (
    <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-750 transition-all col-span-full">
      <div>
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-4">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-emerald-400" />
            Salud del Swarm en Vivo (Swarm Health Live)
          </span>
          <span className="text-[9px] font-black text-slate-500 uppercase font-mono flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
            Ejecución Activa
          </span>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-900 text-[9px] font-black text-slate-500 uppercase tracking-wider">
                <th className="pb-2.5">Agente</th>
                <th className="pb-2.5 text-center">Executing</th>
                <th className="pb-2.5 text-center">Pending</th>
                <th className="pb-2.5 text-center">Completed Hoy</th>
                <th className="pb-2.5 text-right font-mono">Última Actividad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/50 text-[10px]">
              {ALL_SWARM_AGENTS.map(agentName => {
                const dbAgent = swarmDataMap[agentName];

                const executing = dbAgent ? parseInt(dbAgent.executing || 0) : 0;
                const pending = dbAgent ? parseInt(dbAgent.pending || 0) : 0;
                const completedToday = dbAgent ? parseInt(dbAgent.completed_today || 0) : 0;
                const relativeTime = dbAgent ? getRelativeTime(dbAgent.last_activity) : '—';

                return (
                  <tr key={agentName} className="hover:bg-slate-900/10 transition-colors">
                    <td className="py-3 font-bold text-white flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        executing > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'
                      }`}></span>
                      {agentName}
                    </td>
                    <td className="py-3 text-center font-mono font-bold">
                      <span className={`inline-block px-2 py-0.5 rounded ${
                        executing > 0 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-black animate-pulse' 
                          : 'text-slate-400 font-semibold'
                      }`}>
                        {executing}
                      </span>
                    </td>
                    <td className="py-3 text-center font-mono text-slate-350">
                      {pending > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-black">
                          {pending}
                        </span>
                      ) : (
                        pending
                      )}
                    </td>
                    <td className="py-3 text-center font-mono text-white font-bold">
                      {completedToday > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-black">
                          {completedToday}
                        </span>
                      ) : (
                        completedToday
                      )}
                    </td>
                    <td className="py-3 text-right text-slate-500 font-medium font-mono">
                      {relativeTime}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SwarmHealthLive;
