import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

const EXCHANGE_RATE = 61;

const generarReciboPDF = async (deal) => {
  // 1. Buscar booking del cliente
  const { data: bookings } = await supabase
    .from('bookings')
    .select('*, hotels_master(name)')
    .ilike('lead_guest_name', `%${(deal.crm_leads?.full_name || '').split(' ')[0]}%`)
    .order('created_at', { ascending: false })
    .limit(3);

  const booking = bookings?.[0];
  const total   = parseFloat(booking?.total_amount || deal.total_usd || 0);
  const hotelNm = booking?.hotels_master?.name || deal.hotel_slug?.replace(/-/g,' ') || 'Hotel';
  const ref     = booking?.booking_reference || 'N/A';
  const guest   = deal.crm_leads?.full_name || 'Cliente';
  const checkIn = booking?.check_in || '';
  const checkOut= booking?.check_out || '';
  const conf    = booking?.hotel_confirmation_no || '';

  // 2. Cargar pagos
  let paid = 0;
  if (booking?.id) {
    const { data: pagos } = await supabase
      .from('atlas_payments')
      .select('amount')
      .eq('booking_id', booking.id)
      .eq('status', 'approved');
    paid = (pagos || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  }
  const balance = total - paid;

  const now = new Date().toLocaleDateString('es-DO', { year:'numeric', month:'long', day:'numeric' });
  const GREEN = '#059669', RED = '#DC2626', NAVY = '#0A1628', GOLD = '#B8860B';

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Recibo ${ref}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;max-width:520px;margin:30px auto;color:#111;font-size:13px;padding:0 16px}
  .hdr{background:${NAVY};color:white;padding:16px 20px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center}
  .hdr h2{font-size:17px;font-weight:800;margin:0}
  .hdr .sub{color:${GOLD};font-size:10px;letter-spacing:2px;text-transform:uppercase;margin-top:2px}
  .ref{color:${GOLD};font-size:13px;font-weight:700;text-align:right}
  .conf-badge{background:#05966920;border:1px solid ${GREEN};color:${GREEN};font-size:10px;font-weight:700;padding:4px 12px;border-radius:20px;text-align:center;margin:12px 0}
  .section{padding:12px 0;border-bottom:1px solid #e5e7eb}
  .row{display:flex;justify-content:space-between;padding:4px 0;font-size:12px}
  .row .lbl{color:#64748B}
  .row .val{font-weight:600}
  .abono{color:${GREEN};font-weight:700}
  .saldo{color:${balance > 0 ? RED : GREEN};font-weight:700;font-size:15px}
  .total-row{display:flex;justify-content:space-between;align-items:center;background:#FFF7E6;border:1.5px solid ${GOLD};border-radius:8px;padding:10px 14px;margin:12px 0}
  .total-lbl{font-weight:700;font-size:13px;color:${NAVY}}
  footer{text-align:center;color:#94A3B8;font-size:10px;margin-top:20px;background:${NAVY};padding:10px;border-radius:0 0 10px 10px;color:#94A3B8}
  footer span{color:${GOLD};font-weight:700}
  @media print{button{display:none}}
  .btn{display:block;width:100%;background:${NAVY};color:white;border:none;padding:10px;border-radius:8px;font-weight:700;cursor:pointer;margin-top:12px;font-size:13px}
</style></head><body>
<div class="hdr">
  <div><h2>ALIUN TRAVEL SRL</h2><div class="sub">Comprobante de Reserva</div></div>
  <div class="ref">${ref}<br/><span style="font-size:10px;color:#94A3B8">${now}</span></div>
</div>
<div style="padding:16px">
  <div class="conf-badge">${booking?.status === 'confirmed' ? '✓ RESERVA CONFIRMADA' : '⏳ PENDIENTE DE CONFIRMACIÓN'}</div>
  
  <div class="section">
    <div class="row"><span class="lbl">Cliente</span><span class="val">${guest}</span></div>
    <div class="row"><span class="lbl">Referencia</span><span class="val">${ref}</span></div>
    ${conf ? `<div class="row"><span class="lbl">Conf. Proveedor</span><span class="val">${conf}</span></div>` : ''}
  </div>
  
  <div class="section">
    <div class="row"><span class="lbl">Hotel</span><span class="val">${hotelNm}</span></div>
    ${checkIn ? `<div class="row"><span class="lbl">Check-in</span><span class="val">${checkIn}</span></div>` : ''}
    ${checkOut ? `<div class="row"><span class="lbl">Check-out</span><span class="val">${checkOut}</span></div>` : ''}
    <div class="row"><span class="lbl">PAX</span><span class="val">${booking?.adults || 2} adultos</span></div>
  </div>
  
  <div class="section">
    <div class="row"><span class="lbl">Total acordado</span><span class="val">$${total.toFixed(2)} USD</span></div>
    ${paid > 0 ? `<div class="row"><span class="lbl">Abono recibido</span><span class="abono">-$${paid.toFixed(2)} USD</span></div>` : ''}
  </div>
  
  <div class="total-row">
    <span class="total-lbl">SALDO PENDIENTE</span>
    <span class="saldo">${balance <= 0 ? '✓ Saldado' : '$' + balance.toFixed(2) + ' USD'}</span>
  </div>
  
  <p style="font-size:10px;color:#94A3B8;margin-top:8px">• Saldo a cancelar antes del check-in.<br/>• Transferencia bancaria a nombre de Aliun Travel SRL.</p>
  <button class="btn" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
</div>
<footer><span>Aliun Travel SRL</span> · aliuntravelsrl.com · Aliuntravelgroup@gmail.com</footer>
</body></html>`;

  try {
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const w    = window.open(url, '_blank');
    if (!w) {
      const a = document.createElement('a');
      a.href = url; a.download = `recibo-${ref}.html`; a.click();
    } else {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  } catch(e) {
    alert('Error generando recibo: ' + e.message);
  }
};

export const CrmDashboard = () => {
  const [stats, setStats] = useState({
    leadsByStage: {},
    dealsByStatus: {},
    totalPipelineValue: 0,
    totalWonValue: 0,
    totalLeads: 0,
    conversionRate: 0,
    loading: true
  });
  const [recentDeals, setRecentDeals] = useState([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // 1. Cargar estadísticas de la RPC
      const { data: statsData, error: statsError } = await supabase.rpc('crm_pipeline_stats');
      
      let fetchedStats = {
        leadsByStage: {},
        dealsByStatus: {},
        totalPipelineValue: 0,
        totalWonValue: 0
      };

      if (!statsError && statsData) {
        fetchedStats = {
          leadsByStage: statsData.leads_by_stage || {},
          dealsByStatus: statsData.deals_by_status || {},
          totalPipelineValue: parseFloat(statsData.total_pipeline_value || 0),
          totalWonValue: parseFloat(statsData.total_won_value || 0)
        };
      } else {
        console.warn('RPC crm_pipeline_stats falló o no existe. Ejecutando consultas de fallback directo:', statsError);
        // Fallback directo a Supabase
        const { data: leads } = await supabase.from('crm_leads').select('stage');
        const { data: deals } = await supabase.from('crm_deals').select('status, total_usd');

        const leadsByStage = {};
        leads?.forEach(l => {
          leadsByStage[l.stage] = (leadsByStage[l.stage] || 0) + 1;
        });

        const dealsByStatus = {};
        let totalPipelineValue = 0;
        let totalWonValue = 0;

        deals?.forEach(d => {
          dealsByStatus[d.status] = (dealsByStatus[d.status] || 0) + 1;
          if (d.status === 'pendiente') totalPipelineValue += parseFloat(d.total_usd || 0);
          if (d.status === 'confirmada' || d.status === 'depositado') totalWonValue += parseFloat(d.total_usd || 0);
        });

        fetchedStats = { leadsByStage, dealsByStatus, totalPipelineValue, totalWonValue };
      }

      // 2. Cargar recuento total de leads y tasa de conversión
      const { count: totalLeadsCount } = await supabase
        .from('crm_leads')
        .select('*', { count: 'exact', head: true });
        
      const { count: wonLeadsCount } = await supabase
        .from('crm_leads')
        .select('*', { count: 'exact', head: true })
        .eq('stage', 'confirmada');

      const totalLeads = totalLeadsCount || 0;
      const wonLeads = wonLeadsCount || 0;
      const conversionRate = totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : 0;

      // 3. Cargar Negociaciones Recientes con datos del lead
      const { data: dealsData, error: dealsError } = await supabase
        .from('crm_deals')
        .select(`
          id,
          total_usd,
          margin_pct,
          status,
          created_at,
          crm_leads (
            full_name,
            phone
          ),
          hotel_slug
        `)
        .order('created_at', { ascending: false })
        .limit(6);

      setRecentDeals(dealsData || []);

      setStats({
        ...fetchedStats,
        totalLeads,
        conversionRate,
        loading: false
      });
    } catch (err) {
      console.error('Error loading CRM Dashboard statistics:', err);
      setStats(prev => ({ ...prev, loading: false }));
    }
  };

  if (stats.loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-gray-400 font-medium animate-pulse">Analizando métricas del pipeline...</div>
      </div>
    );
  }

  // Prepara datos del Funnel
  const funnelStages = [
    { label: 'Nuevos', count: stats.leadsByStage.nuevo || 0, color: 'bg-blue-500' },
    { label: 'Contactados', count: stats.leadsByStage.contactado || 0, color: 'bg-amber-500' },
    { label: 'Cotizados', count: stats.leadsByStage.cotizado || 0, color: 'bg-violet-500' },
    { label: 'Negociando', count: stats.leadsByStage.negociando || 0, color: 'bg-orange-500' },
    { label: 'Confirmados', count: stats.leadsByStage.confirmada || 0, color: 'bg-emerald-500' }
  ];
  const maxCount = Math.max(...funnelStages.map(s => s.count), 1);

  return (
    <div className="space-y-8 bg-slate-950 p-6 rounded-2xl border border-slate-800 text-slate-100">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">Análisis de Pipeline</h1>
          <p className="text-slate-400 mt-1 font-medium">Métricas de rendimiento comercial de la agencia</p>
        </div>
        <button 
          onClick={loadDashboardData}
          className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl font-bold text-sm text-slate-300 transition-colors self-start"
        >
          🔄 Recargar Datos
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Total Leads */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-violet-500/30 transition-all duration-300 group flex items-start justify-between">
          <div className="space-y-2">
            <span className="text-xs uppercase tracking-wider font-bold text-violet-400">Total Leads</span>
            <div className="text-4xl font-black text-white group-hover:scale-105 transition-transform duration-300">
              {stats.totalLeads}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400 group-hover:bg-violet-500/20 transition-colors">
            👥
          </div>
        </div>

        {/* Pipeline Value */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-violet-500/30 transition-all duration-300 group flex items-start justify-between">
          <div className="space-y-2">
            <span className="text-xs uppercase tracking-wider font-bold text-violet-400 font-mono">Valor Funnel Activo</span>
            <div className="text-3xl font-black text-white group-hover:scale-105 transition-transform duration-300 font-mono">
              ${stats.totalPipelineValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400 group-hover:bg-violet-500/20 transition-colors text-lg">
            💰
          </div>
        </div>

        {/* Ganado Value */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-emerald-500/30 transition-all duration-300 group flex items-start justify-between">
          <div className="space-y-2">
            <span className="text-xs uppercase tracking-wider font-bold text-emerald-400 font-mono">Ventas Confirmadas</span>
            <div className="text-3xl font-black text-white group-hover:scale-105 transition-transform duration-300 font-mono">
              ${stats.totalWonValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20 transition-colors text-lg">
            ✅
          </div>
        </div>

        {/* Tasa de conversión */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-blue-500/30 transition-all duration-300 group flex items-start justify-between">
          <div className="space-y-2">
            <span className="text-xs uppercase tracking-wider font-bold text-blue-400">Conversión Final</span>
            <div className="text-4xl font-black text-white group-hover:scale-105 transition-transform duration-300 font-mono">
              {stats.conversionRate}%
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20 transition-colors">
            🎯
          </div>
        </div>

      </div>

      {/* Main Grid: Funnel & Deals Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Funnel de Leads */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-5">
          <div>
            <h3 className="font-extrabold text-white text-lg">Embudo de Ventas (Leads)</h3>
            <p className="text-xs text-slate-400 mt-0.5">Distribución de leads en cada etapa comercial.</p>
          </div>
          
          <div className="space-y-4 pt-2">
            {funnelStages.map((stage) => {
              const percentage = Math.round((stage.count / maxCount) * 100);
              return (
                <div key={stage.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-300">{stage.label}</span>
                    <span className="text-white font-mono">{stage.count} leads</span>
                  </div>
                  <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden p-0.5 border border-slate-850">
                    <div 
                      className={`${stage.color} h-full rounded-full transition-all duration-500 shadow-md`}
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Distribución de Estados de Negociación */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-5 flex flex-col justify-between">
          <div>
            <h3 className="font-extrabold text-white text-lg">Estados de Negociación (Deals)</h3>
            <p className="text-xs text-slate-400 mt-0.5">Estado de reservas vinculadas en crm_deals.</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 flex-1 pt-4">
            <div className="bg-slate-950 p-4 border border-slate-850 rounded-xl text-center space-y-1 flex flex-col justify-center">
              <span className="text-2xl font-black text-amber-500">
                {stats.dealsByStatus.pendiente || 0}
              </span>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Pendientes</span>
            </div>
            <div className="bg-slate-950 p-4 border border-slate-850 rounded-xl text-center space-y-1 flex flex-col justify-center">
              <span className="text-2xl font-black text-violet-400">
                {stats.dealsByStatus.aprobada || 0}
              </span>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Aprobados</span>
            </div>
            <div className="bg-slate-950 p-4 border border-slate-850 rounded-xl text-center space-y-1 flex flex-col justify-center">
              <span className="text-2xl font-black text-blue-400">
                {stats.dealsByStatus.depositado || 0}
              </span>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Depositados</span>
            </div>
            <div className="bg-slate-950 p-4 border border-slate-850 rounded-xl text-center space-y-1 flex flex-col justify-center">
              <span className="text-2xl font-black text-emerald-400">
                {stats.dealsByStatus.confirmada || 0}
              </span>
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Confirmadas</span>
            </div>
          </div>
        </div>

      </div>

      {/* Recent Deals Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div>
          <h3 className="font-extrabold text-white text-lg">Negociaciones Recientes</h3>
          <p className="text-xs text-slate-400 mt-0.5">Últimas cotizaciones y depósitos formales del CRM.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-850 text-slate-500 uppercase tracking-widest font-black text-[9px] pb-3">
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">Hotel</th>
                <th className="py-3 px-4 text-right">Total USD</th>
                <th className="py-3 px-4 text-center">Margen</th>
                <th className="py-3 px-4 text-center">Estado</th>
                <th className="py-3 px-4 text-right">Fecha</th>
                <th className="py-3 px-4 text-center">Recibo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850/60">
              {recentDeals.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-500 italic">No hay negociaciones activas en este momento.</td>
                </tr>
              ) : (
                recentDeals.map((deal) => {
                  let statusColor = 'bg-slate-800 text-slate-400 border-slate-700';
                  if (deal.status === 'confirmada') statusColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                  if (deal.status === 'depositado') statusColor = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                  if (deal.status === 'pendiente') statusColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                  if (deal.status === 'perdida') statusColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';

                  const dateFormatted = new Date(deal.created_at).toLocaleDateString('es-DO', {
                    month: 'short',
                    day: 'numeric'
                  });

                  return (
                    <tr key={deal.id} className="hover:bg-slate-950/40 transition-colors font-medium">
                      <td className="py-3 px-4 font-bold text-white">
                        {deal.crm_leads?.full_name || 'Desconocido'}
                        <span className="block text-[10px] text-slate-500 font-mono font-medium mt-0.5">{deal.crm_leads?.phone}</span>
                      </td>
                      <td className="py-3 px-4 capitalize text-slate-300 truncate max-w-[150px]">{deal.hotel_slug?.replace(/-/g, ' ')}</td>
                      <td className="py-3 px-4 text-right text-white font-mono font-bold">${parseFloat(deal.total_usd).toLocaleString()}</td>
                      <td className="py-3 px-4 text-center text-blue-400 font-mono">{deal.margin_pct}%</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2.5 py-0.5 border text-[9px] font-bold rounded-md uppercase tracking-wider ${statusColor}`}>
                          {deal.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400 font-mono">{dateFormatted}</td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => generarReciboPDF(deal)}
                          className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white px-2.5 py-1 rounded-lg font-bold transition-colors"
                        >
                          🧾 Recibo
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default CrmDashboard;
