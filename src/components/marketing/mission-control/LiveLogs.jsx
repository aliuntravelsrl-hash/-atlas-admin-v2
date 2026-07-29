import React, { useState, useMemo } from 'react';
import { FileText, Search, ShieldAlert, CheckCircle, AlertTriangle } from 'lucide-react';

export const LiveLogs = ({ logs, loading }) => {
  const [filterLevel, setFilterLevel] = useState('all'); // 'all' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const levelMatches = filterLevel === 'all' || log.nivel === filterLevel;
      const textMatches = 
        !searchQuery.trim() || 
        (log.mensaje || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
        (log.origen || '').toLowerCase().includes(searchQuery.toLowerCase());
      return levelMatches && textMatches;
    });
  }, [logs, filterLevel, searchQuery]);

  return (
    <div className="bg-slate-950/40 border border-slate-850 p-5 rounded-2xl col-span-full md:col-span-2 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-900 pb-3">
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-blue-400" />
          Live Logs (Últimos 50)
        </h3>

        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de Nivel */}
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="bg-slate-900 border border-slate-850 rounded-lg text-[10px] font-bold text-slate-300 px-2 py-1 focus:outline-none focus:border-slate-750"
          >
            <option value="all">TODOS LOS NIVELES</option>
            <option value="INFO">INFO</option>
            <option value="WARNING">WARNING</option>
            <option value="ERROR">ERROR</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>

          {/* Buscador de Logs */}
          <div className="flex items-center bg-slate-900 border border-slate-850 rounded-lg px-2.5 py-1">
            <Search className="w-3.5 h-3.5 text-slate-500 mr-1.5" />
            <input
              type="text"
              placeholder="Filtrar logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-[10px] text-white focus:outline-none placeholder-slate-650"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-40 flex flex-col items-center justify-center space-y-2">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest animate-pulse">Cargando logs...</span>
        </div>
      ) : filteredLogs.length > 0 ? (
        <div className="overflow-y-auto max-h-60 border border-slate-900/60 rounded-xl">
          <table className="w-full text-left border-collapse text-[10px]">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-850 text-slate-500 font-bold uppercase">
                <th className="p-2.5">Time</th>
                <th className="p-2.5">Nivel</th>
                <th className="p-2.5">Origen</th>
                <th className="p-2.5">Mensaje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/40 bg-slate-950/20">
              {filteredLogs.map(log => {
                const isErr = log.nivel === 'ERROR' || log.nivel === 'CRITICAL';
                const isWarn = log.nivel === 'WARNING';
                return (
                  <tr key={log.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="p-2.5 font-mono text-slate-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleTimeString('es-DO')}
                    </td>
                    <td className="p-2.5 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-wide ${
                        isErr ? 'bg-rose-500/10 text-rose-450 border border-rose-500/20' :
                        isWarn ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        'bg-slate-900 text-slate-400'
                      }`}>
                        {log.nivel}
                      </span>
                    </td>
                    <td className="p-2.5 font-mono font-bold text-slate-300 whitespace-nowrap">
                      {log.origen || 'system'}
                    </td>
                    <td className="p-2.5 text-slate-350 font-medium">
                      {log.mensaje}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-40 flex items-center justify-center text-slate-650 text-xs font-bold uppercase tracking-wider bg-slate-950/10 rounded-xl border border-dashed border-slate-900/50">
          Ningún registro coincide
        </div>
      )}
    </div>
  );
};

export default LiveLogs;
