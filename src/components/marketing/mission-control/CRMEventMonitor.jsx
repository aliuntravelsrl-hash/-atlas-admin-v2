import React from 'react';
import { Activity, ShieldAlert, CheckCircle, AlertTriangle, Clock } from 'lucide-react';

export const CRMEventMonitor = ({ stats, loading }) => {
  if (loading) {
    return (
      <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl animate-pulse space-y-3">
        <div className="h-3 w-20 bg-slate-800 rounded"></div>
        <div className="h-5 w-40 bg-slate-800 rounded"></div>
        <div className="h-10 bg-slate-900 rounded"></div>
      </div>
    );
  }

  const {
    pending = 0,
    processing = 0,
    processed = 0,
    failed = 0,
    retrying = 0,
    last_processed_at = null,
    processing_rate_per_minute = 0
  } = stats || {};

  // Semáforo lógico de estado
  let status = 'healthy';
  if (failed > 0) status = 'critical';
  else if (pending > 0) status = 'warning';

  const statusConfig = {
    healthy: { label: 'Healthy', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: CheckCircle },
    warning: { label: 'Warning (Pending)', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: AlertTriangle },
    critical: { label: 'Critical (Failed)', color: 'bg-rose-500/10 text-rose-450 border-rose-500/20', icon: ShieldAlert }
  };

  const currentStatus = statusConfig[status];
  const Icon = currentStatus.icon;

  return (
    <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-750 transition-all">
      <div>
        <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-3">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            CRM Event Bus
          </span>
          <div className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase flex items-center gap-1 ${currentStatus.color}`}>
            <Icon className="w-2.5 h-2.5 animate-pulse" />
            {currentStatus.label}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center my-3">
          <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-850">
            <span className="text-[9px] text-slate-550 block font-bold uppercase">Pending</span>
            <span className="text-sm font-mono font-black text-white">{pending}</span>
          </div>
          <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-850">
            <span className="text-[9px] text-slate-550 block font-bold uppercase">Processing</span>
            <span className="text-sm font-mono font-black text-white">{processing}</span>
          </div>
          <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-850">
            <span className="text-[9px] text-slate-550 block font-bold uppercase">Failed</span>
            <span className={`text-sm font-mono font-black ${failed > 0 ? 'text-rose-400' : 'text-slate-400'}`}>{failed}</span>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-900/60 pt-3 mt-2 text-[10px] text-slate-400 space-y-1 font-sans">
        <div className="flex justify-between">
          <span className="text-slate-550 font-bold">Processed (24h):</span>
          <span className="font-mono text-white font-bold">{processed}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-550 font-bold">Retrying:</span>
          <span className="font-mono text-white font-bold">{retrying}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-550 font-bold">Rate:</span>
          <span className="font-mono text-white font-bold">{processing_rate_per_minute} events/min</span>
        </div>
        {last_processed_at && (
          <div className="flex justify-between pt-1 border-t border-slate-900/40">
            <span className="text-slate-550 font-bold flex items-center gap-1">
              <Clock className="w-3 h-3" /> Último Proceso:
            </span>
            <span className="font-mono text-slate-300">
              {new Date(last_processed_at).toLocaleTimeString('es-DO')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CRMEventMonitor;
