import React, { useState, useEffect } from 'react';
import { Link2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

export const DependencyIntelligence = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchIntel = async () => {
    try {
      const { data: res, error } = await supabase.rpc('mc_dependency_intelligence');
      if (error) throw error;
      setData(res);
    } catch (err) {
      console.error('Error fetching Dependency Intelligence:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntel();
    const interval = setInterval(fetchIntel, 30000); // Live updates every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl animate-pulse h-64"></div>
    );
  }

  const {
    stats = {},
    cuellos_activos = [],
    resueltos_recientes = []
  } = data || {};

  const {
    cuellos_activos_count = 0,
    en_ready = 0
  } = stats;

  const getRelativeTime = (isoString) => {
    if (!isoString) return '';
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `hace ${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `hace ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `hace ${diffDays}d`;
  };

  return (
    <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-750 transition-all text-xs">
      <div>
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-4">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <Link2 className="w-4 h-4 text-blue-400" />
            Dependency Intelligence
          </span>
          <span className="text-[9px] font-black text-slate-550 uppercase font-mono">
            {cuellos_activos_count} cuellos activos · {en_ready} en ready
          </span>
        </div>

        {/* Sección: Cuellos Activos */}
        <div className="space-y-3">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
            Cuellos Activos
          </span>
          {cuellos_activos.length === 0 ? (
            <div className="text-[10px] text-slate-550 italic py-2">
              Sin cuellos de botella activos detectados.
            </div>
          ) : (
            <div className="space-y-2.5">
              {cuellos_activos.map((item, idx) => {
                const isCritica = item.prioridad?.toLowerCase() === 'critica';
                const isReady = item.estado?.toLowerCase() === 'ready';

                let dot = '⏸️';
                if (isCritica) dot = '🔴';
                else if (isReady) dot = '🟢';

                return (
                  <div key={idx} className="bg-slate-900/35 border border-slate-850/50 p-2.5 rounded-xl space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs">{dot}</span>
                      <span className="font-bold font-mono text-[10px] text-white">
                        {item.codigo}
                      </span>
                      {item.prioridad && (
                        <span className={`text-[8px] font-black uppercase px-1 rounded ${
                          isCritica ? 'bg-rose-500/10 text-rose-455' : 'bg-blue-500/10 text-blue-400'
                        }`}>
                          ({item.prioridad})
                        </span>
                      )}
                      {item.bloquea_a && item.bloquea_a.length > 0 && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          → {item.bloquea_a.join(', ')}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-450 pl-5 italic leading-tight">
                      "{item.titulo}"
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sección: Liberadas Hoy / Resueltas Recientes */}
      <div className="mt-4 pt-3.5 border-t border-slate-900/60">
        <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider block mb-2.5 flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          Liberadas Hoy
        </span>
        {resueltos_recientes.length === 0 ? (
          <div className="text-[10px] text-slate-550 italic">
            Ninguna dependencia crítica resuelta en las últimas 24h.
          </div>
        ) : (
          <div className="space-y-2">
            {resueltos_recientes.slice(0, 2).map((item, idx) => (
              <div key={idx} className="bg-emerald-500/5 border border-emerald-500/10 p-2.5 rounded-xl">
                <div className="text-[10px] text-slate-300 font-medium">
                  <span className="font-bold text-white font-mono">{item.codigo}</span> completado →{' '}
                  <span className="text-emerald-400 font-bold font-mono">
                    {item.libero_a?.join(', ')} READY
                  </span>
                </div>
                <div className="text-[9px] text-slate-550 font-bold uppercase tracking-wider mt-1 font-mono">
                  {getRelativeTime(item.completado_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DependencyIntelligence;
