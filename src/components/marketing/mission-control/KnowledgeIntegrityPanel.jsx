import React from 'react';
import { Award, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';

const ALL_SWARM_AGENTS = [
  'hermes-commercial',
  'hermes-ops',
  'hermes-marketing',
  'ariadne-data',
  'hermes-qa',
  'intel'
];

export const KnowledgeIntegrityPanel = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl animate-pulse h-64"></div>
    );
  }

  // Mapear los datos de la RPC mc_execution_readiness() indexados por nombre de agente.
  // En caso de duplicados, mostramos el registro más reciente por agente basándonos en last_rehydration.
  const dbAgentsMap = {};
  if (Array.isArray(data)) {
    // Ordenamos cronológicamente ascendente para que al iterar, el más reciente sobrescriba
    const sortedData = [...data].sort((a, b) => 
      new Date(a.last_rehydration || 0).getTime() - new Date(b.last_rehydration || 0).getTime()
    );
    sortedData.forEach(row => {
      if (row && row.agent) {
        dbAgentsMap[row.agent] = row;
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
            <Award className="w-4 h-4 text-blue-400" />
            Integridad de Conocimiento (KBP Auditor)
          </span>
          <span className="text-[9px] font-black text-slate-500 uppercase font-mono">
            Integridad Canónica (Umbral ≥95%)
          </span>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-900 text-[9px] font-black text-slate-500 uppercase tracking-wider">
                <th className="pb-2.5">Agente</th>
                <th className="pb-2.5 text-center">Integrity</th>
                <th className="pb-2.5 text-center">Status</th>
                <th className="pb-2.5 text-left pl-4">Faltantes (Missing)</th>
                <th className="pb-2.5 text-right">Último KBP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/50 text-[10px]">
              {ALL_SWARM_AGENTS.map(agentName => {
                const dbAgent = dbAgentsMap[agentName];

                let integrityLabel = '—';
                let statusBadge = (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono font-bold bg-slate-900/50 text-slate-500 border border-slate-850/40">
                    <AlertTriangle className="w-2.5 h-2.5 text-slate-500" />
                    N/A
                  </span>
                );
                let missingLabel = '—';
                let relativeTime = '—';

                if (dbAgent) {
                  const integrityPct = parseFloat(dbAgent.integrity);
                  integrityLabel = `${integrityPct.toFixed(1)}%`;
                  
                  if (dbAgent.status === 'ready' || dbAgent.execution_enabled || integrityPct >= 95.0) {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        READY
                      </span>
                    );
                  } else {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono font-bold bg-rose-500/10 text-rose-455 border border-rose-500/20 animate-pulse">
                        <ShieldAlert className="w-2.5 h-2.5" />
                        BLOCKED
                      </span>
                    );
                  }

                  if (Array.isArray(dbAgent.missing) && dbAgent.missing.length > 0) {
                    missingLabel = dbAgent.missing.map(m => (
                      <span key={m} className="inline-block bg-slate-900 border border-slate-800 text-slate-400 px-1.5 py-0.25 rounded text-[8px] font-mono font-bold mr-1.5">
                        {m}
                      </span>
                    ));
                  } else {
                    missingLabel = (
                      <span className="text-emerald-500 font-bold uppercase tracking-wider text-[8px]">Ninguno</span>
                    );
                  }

                  relativeTime = getRelativeTime(dbAgent.last_rehydration);
                }

                return (
                  <tr key={agentName} className="hover:bg-slate-900/10 transition-colors">
                    <td className="py-3 font-bold text-white flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        dbAgent 
                          ? (dbAgent.execution_enabled || parseFloat(dbAgent.integrity) >= 95.0 ? 'bg-emerald-500' : 'bg-rose-500') 
                          : 'bg-slate-700'
                      }`}></span>
                      {agentName}
                    </td>
                    <td className="py-3 text-center font-mono font-bold text-slate-200">
                      {integrityLabel}
                    </td>
                    <td className="py-3 text-center">
                      {statusBadge}
                    </td>
                    <td className="py-3 text-left pl-4">
                      {missingLabel}
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

export default KnowledgeIntegrityPanel;
