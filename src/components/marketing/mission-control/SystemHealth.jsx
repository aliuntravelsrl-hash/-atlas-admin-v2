import React from 'react';
import { Shield, CheckCircle, AlertTriangle, ShieldAlert } from 'lucide-react';

const HEALTH_STATUS_CONFIG = {
  healthy: { label: 'Healthy', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: CheckCircle },
  warning: { label: 'Warning', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: AlertTriangle },
  critical: { label: 'Critical', color: 'bg-rose-500/10 text-rose-450 border-rose-500/20', icon: ShieldAlert }
};

export const SystemHealth = ({ healthData, loading, onSelectCard }) => {
  if (loading) {
    return (
      <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl animate-pulse h-36"></div>
    );
  }

  const { cards = [], status = 'healthy' } = healthData || {};
  const currentStatus = HEALTH_STATUS_CONFIG[status] || HEALTH_STATUS_CONFIG.healthy;
  const StatusIcon = currentStatus.icon;

  return (
    <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-750 transition-all col-span-full">
      <div>
        <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-4">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-blue-400" />
            System Health & Compliance
          </span>
          <div className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase flex items-center gap-1 ${currentStatus.color}`}>
            <StatusIcon className="w-2.5 h-2.5 animate-pulse" />
            {currentStatus.label}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {cards.map(card => {
            const cardStatusCfg = HEALTH_STATUS_CONFIG[card.status] || HEALTH_STATUS_CONFIG.healthy;
            const CardIcon = cardStatusCfg.icon;

            return (
              <div
                key={card.id}
                onClick={() => onSelectCard({ id: card.entity_id, type: card.entity_type })}
                className="bg-slate-900/35 border border-slate-850 hover:border-slate-750 p-4 rounded-xl cursor-pointer transition-all group flex flex-col justify-between min-h-[110px]"
              >
                <div className="flex justify-between items-start">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider">
                    {card.title.split(' ')[0]}
                  </span>
                  <CardIcon className={`w-3.5 h-3.5 ${
                    card.status === 'healthy' ? 'text-emerald-400' : 'text-amber-400 animate-pulse'
                  }`} />
                </div>
                <h4 className="text-[10px] font-bold text-white leading-normal mt-2 group-hover:text-blue-400 transition-colors">
                  {card.title}
                </h4>
                <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-850/30">
                  <span className="text-xs font-mono font-black text-white">{card.value}</span>
                  <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wide group-hover:text-blue-400 transition-colors">
                    Evidencia
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SystemHealth;
