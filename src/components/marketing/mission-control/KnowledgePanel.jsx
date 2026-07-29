import React from 'react';
import { BookOpen, CheckCircle, AlertTriangle } from 'lucide-react';

export const KnowledgePanel = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl animate-pulse h-36"></div>
    );
  }

  const { count = 0, status = 'offline', pending_gaps = 0 } = data || {};

  return (
    <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-750 transition-all">
      <div>
        <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-3">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-blue-400" />
            Hotel Knowledge
          </span>
          <div className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase flex items-center gap-1 ${
            status === 'green' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
          }`}>
            {status === 'green' ? <CheckCircle className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}
            {status === 'green' ? 'COMPLETO' : 'INCOMPLETO'}
          </div>
        </div>

        <div className="flex items-center justify-between my-3">
          <div>
            <span className="text-[10px] text-slate-550 block font-bold uppercase">Entradas Activas</span>
            <span className="text-xl font-mono font-black text-white">{count} / 150</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-550 block font-bold uppercase">Gaps Pendientes</span>
            <span className={`text-xl font-mono font-black ${pending_gaps > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`}>
              {pending_gaps}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-900/60 pt-3 mt-2 text-[10px] text-slate-500">
        Base de datos de conocimiento de hoteles indexada para RAG. Mapeada en tiempo real.
      </div>
    </div>
  );
};

export default KnowledgePanel;
