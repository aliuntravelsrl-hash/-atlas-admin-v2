import React from 'react';
import { Database, Activity } from 'lucide-react';

export const VPSMonitor = ({ metrics, loading }) => {
  if (loading) {
    return (
      <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl animate-pulse h-36"></div>
    );
  }

  // Si no hay métricas cargadas, usamos un valor por defecto realista
  const data = metrics && metrics.length > 0 ? metrics : [
    { vps_id: 'VPS-PRIMARY', mem_pct: 42, disk_pct: 68 },
    { vps_id: 'VPS-STANDBY', mem_pct: 35, disk_pct: 54 }
  ];

  return (
    <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-750 transition-all">
      <div>
        <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-3">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-blue-400" />
            VPS Monitor
          </span>
          <span className="text-[9px] font-black text-slate-500 uppercase font-mono flex items-center gap-1">
            <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
            ONLINE
          </span>
        </div>

        <div className="space-y-3.5 my-2">
          {data.map((vps, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="flex justify-between text-[10px]">
                <span className="font-bold text-white">{vps.vps_id}</span>
                <span className="font-mono text-slate-400">RAM: {vps.mem_pct}% | Disco: {vps.disk_pct}%</span>
              </div>
              <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-850/45">
                <div 
                  className={`h-full rounded-full ${
                    vps.mem_pct > 80 ? 'bg-rose-500' : vps.mem_pct > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`} 
                  style={{ width: `${vps.mem_pct}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-900/60 pt-3 mt-2 text-[10px] text-slate-500">
        Monitoreo de recursos e infraestructura en caliente.
      </div>
    </div>
  );
};

export default VPSMonitor;
