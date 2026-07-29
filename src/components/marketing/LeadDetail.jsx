import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

const ACTIVITY_ICONS = {
  nota: { char: '📝', color: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  llamada: { char: '📞', color: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
  whatsapp: { char: '💬', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  cotizacion: { char: '📄', color: 'bg-violet-500/15 text-violet-400 border-violet-500/20' },
  email: { char: '✉️', color: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  sistema: { char: '🤖', color: 'bg-slate-700/30 text-slate-400 border-slate-700/40' },
};

const STAGE_OPTIONS = [
  // CAPTACIÓN
  { value: 'nuevo',                label: 'Entrante',         group: 'CAPTACIÓN'  },
  { value: 'calificado',           label: 'Calificado',       group: 'CAPTACIÓN'  },
  // COMERCIAL
  { value: 'cotizacion_enviada',   label: 'Cotizado',         group: 'COMERCIAL'  },
  { value: 'factura_enviada',      label: 'Factura Enviada',  group: 'COMERCIAL'  },
  { value: 'negociando',           label: 'Negociando',       group: 'COMERCIAL'  },
  // FINANCIERO
  { value: 'validacion_pago',      label: 'Validando Pago',   group: 'FINANCIERO' },
  { value: 'abono_recibido',       label: 'Abono Recibido',   group: 'FINANCIERO' },
  { value: 'saldo_pendiente',      label: 'Saldo Pendiente',  group: 'FINANCIERO' },
  // OPERATIVO
  { value: 'en_fulfillment',       label: 'En Fulfillment',   group: 'OPERATIVO'  },
  { value: 'voucher_enviado',      label: 'Voucher Enviado',  group: 'OPERATIVO'  },
  { value: 'completado',           label: 'Completado',       group: 'OPERATIVO'  },
  // CIERRE
  { value: 'perdido',              label: 'Perdido',          group: 'CIERRE'     },
];

export const LeadDetail = ({ leadId, onClose, onRefresh }) => {
  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Pestañas internas
  const [activeSubTab, setActiveSubTab] = useState('comercial'); // 'comercial' | 'financiero'

  // Datos financieros enlazados
  const [booking, setBooking] = useState(null);
  const [ledgerEntries, setLedgerEntries] = useState([]);

  // Registrar Actividad Form
  const [newActivity, setNewActivity] = useState({
    type: 'nota',
    content: ''
  });
  const [savingActivity, setSavingActivity] = useState(false);

  useEffect(() => {
    if (leadId) {
      loadLeadDetails();
    }
  }, [leadId]);

  const loadLeadDetails = async () => {
    setLoading(true);
    try {
      // 1. Obtener datos del Lead
      const { data: leadData, error: leadError } = await supabase
        .from('crm_leads')
        .select('*')
        .eq('id', leadId)
        .single();
      
      if (leadError) throw leadError;
      setLead(leadData);

      // 2. Obtener Actividades vinculadas
      const { data: actData, error: actError } = await supabase
        .from('crm_activities')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
        
      if (actError) throw actError;
      setActivities(actData || []);

      // 3. Obtener Datos Financieros del Lead (Fase 5.0)
      const { data: bookingData, error: bErr } = await supabase
        .from('bookings')
        .select('id, booking_reference, hotel_code, check_in, check_out, total_amount_usd, status')
        .eq('lead_id', leadId)
        .maybeSingle();

      if (!bErr && bookingData) {
        setBooking(bookingData);
        // Traer ledger contable
        const { data: ledgerData, error: lErr } = await supabase
          .from('payment_ledger')
          .select('id, created_at, amount_applied_usd, currency_original, amount_applied_original, reversal_of_ledger_id')
          .eq('booking_id', bookingData.id)
          .order('created_at', { ascending: false });

        if (!lErr) {
          setLedgerEntries(ledgerData || []);
        }
      } else {
        setBooking(null);
        setLedgerEntries([]);
      }
    } catch (err) {
      console.error('Error loading lead details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStageChange = async (newStage) => {
    if (!lead) return;
    
    // UI local optimista
    setLead(prev => ({ ...prev, stage: newStage }));
    
    try {
      // Intentar actualizar etapa manual
      const { error: updateError } = await supabase
        .from('crm_leads')
        .update({ 
          stage: newStage, 
          commercial_stage: newStage, // QG-01: commercial_stage se sincroniza en cambios manuales
          updated_at: new Date().toISOString() 
        })
        .eq('id', lead.id);
      
      if (updateError) throw updateError;
      
      await supabase.from('crm_activities').insert({
        lead_id: lead.id,
        type: 'sistema',
        content: `Etapa cambiada manualmente a: ${newStage}`,
        created_by: 'director'
      });
      
      loadLeadDetails();
      onRefresh();
    } catch (err) {
      alert('Error al actualizar etapa: ' + err.message);
      loadLeadDetails();
    }
  };

  const handleAddActivity = async (e) => {
    e.preventDefault();
    if (!newActivity.content.trim()) return;
    
    setSavingActivity(true);
    try {
      const { error } = await supabase
        .from('crm_activities')
        .insert([{
          lead_id: leadId,
          type: newActivity.type,
          content: newActivity.content,
          created_by: 'director'
        }]);

      if (error) throw error;
      
      // Actualizar updated_at del lead para orden de Kanban
      await supabase
        .from('crm_leads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', leadId);

      setNewActivity({ type: 'nota', content: '' });
      loadLeadDetails();
      onRefresh();
    } catch (err) {
      alert('Error al registrar actividad: ' + err.message);
    } finally {
      setSavingActivity(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-y-0 right-0 w-full md:w-[450px] bg-slate-900 border-l border-slate-800 shadow-2xl z-40 p-6 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-xs text-slate-400 font-semibold animate-pulse">Cargando expediente del cliente...</div>
      </div>
    );
  }

  if (!lead) return null;

  // Generar links de contacto
  const cleanPhone = lead.phone?.replace(/[^0-9+]/g, '') || '';
  const waUrl = `https://wa.me/${cleanPhone.replace('+', '')}`;
  const cwUrl = lead.chatwoot_id 
    ? `https://chat.aliuntravel.com/app/accounts/1/conversations/${lead.chatwoot_id}`
    : 'https://chat.aliuntravel.com';

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-[460px] bg-slate-900 border-l border-slate-800 shadow-2xl z-40 flex flex-col text-slate-200">
      
      {/* Header */}
      <div className="p-5 border-b border-slate-800 bg-slate-950/40 flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black">Detalles del Lead</span>
          </div>
          <h2 className="text-xl font-black text-white truncate max-w-[320px]">{lead.full_name}</h2>
          
          {/* Selector de Etapa */}
          <div className="flex items-center gap-1.5 pt-1.5">
            <span className="text-xs text-slate-500 font-bold">Etapa:</span>
            <select
              value={lead.stage}
              onChange={(e) => handleStageChange(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg text-xs font-extrabold text-blue-400 px-2 py-0.5 focus:outline-none cursor-pointer"
            >
              {STAGE_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label} ({s.group})</option>
              ))}
            </select>
          </div>
        </div>
        
        <button 
          onClick={onClose}
          className="text-slate-500 hover:text-white text-base font-extrabold p-1 focus:outline-none"
        >
          ✕
        </button>
      </div>
      {/* Body content (scrollable) */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        
        {/* Acciones Rápidas */}
        <div className="grid grid-cols-2 gap-3">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-2 px-3 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-emerald-400 rounded-xl font-bold text-xs transition-all text-center"
          >
            <span>💬</span> WhatsApp Directo
          </a>
          <a
            href={cwUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-2 px-3 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 rounded-xl font-bold text-xs transition-all text-center"
          >
            <span>✉️</span> Ver en Chatwoot
          </a>
        </div>

        {/* SELECTOR DE PESTAÑAS DE EXPEDIENTE */}
        <div className="flex border-b border-slate-800 text-[10px] font-black uppercase tracking-wider mb-4">
          <button
            onClick={() => setActiveSubTab('comercial')}
            className={`flex-1 py-2 text-center border-b-2 transition-all ${
              activeSubTab === 'comercial' 
                ? 'border-blue-500 text-blue-450' 
                : 'border-transparent text-slate-500 hover:text-slate-350'
            }`}
          >
            💼 Expediente Comercial
          </button>
          <button
            onClick={() => setActiveSubTab('financiero')}
            className={`flex-1 py-2 text-center border-b-2 transition-all ${
              activeSubTab === 'financiero' 
                ? 'border-yellow-500 text-yellow-450' 
                : 'border-transparent text-slate-500 hover:text-slate-350'
            }`}
          >
            💳 Expediente Financiero
          </button>
        </div>

        {/* 💼 PESTAÑA A: EXPEDIENTE COMERCIAL */}
        {activeSubTab === 'comercial' && (
          <div className="space-y-6">
            {/* Ficha de Detalles */}
            <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-4 space-y-3.5 text-xs">
              <h3 className="font-extrabold text-slate-400 uppercase tracking-widest text-[9px] border-b border-slate-900 pb-1.5">Datos del Lead</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-500 block font-bold mb-0.5">Teléfono:</span>
                  <span className="font-mono text-white font-semibold">{lead.phone}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-bold mb-0.5">Email:</span>
                  <span className="truncate block text-white font-semibold">{lead.email || 'No registrado'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-500 block font-bold mb-0.5">Origen / Canal:</span>
                  <span className="capitalize text-white font-semibold">{lead.source}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-bold mb-0.5">Hotel de Interés:</span>
                  <span className="text-white font-semibold">{lead.hotel_interest || 'Ninguno'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-500 block font-bold mb-0.5">Check In / Out:</span>
                  <span className="text-white font-semibold font-mono">
                    {lead.check_in ? `${lead.check_in} a ${lead.check_out}` : 'No definido'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block font-bold mb-0.5">Ocupación:</span>
                  <span className="text-white font-semibold">
                    {lead.adults} Adultos {lead.children > 0 && `· ${lead.children} Niños`}
                  </span>
                </div>
              </div>

              {lead.message && (
                <div className="pt-2 border-t border-slate-900/50">
                  <span className="text-slate-500 block font-bold mb-1">Mensaje Inicial:</span>
                  <p className="bg-slate-900/80 p-2.5 rounded-xl text-slate-300 font-medium leading-relaxed italic border border-slate-900">
                    "{lead.message}"
                  </p>
                </div>
              )}
            </div>

            {/* Expediente de Reserva */}
            <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-4 space-y-3.5 text-xs">
              <h3 className="font-extrabold text-slate-400 uppercase tracking-widest text-[9px] border-b border-slate-900 pb-1.5">Expediente de Reserva</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-500 block font-bold mb-0.5">Destino:</span>
                  <span className="text-white font-semibold">{lead.destination || 'No definido'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-bold mb-0.5">Operador Turístico:</span>
                  <span className="text-white font-semibold">{lead.operator_name || 'No definido'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-500 block font-bold mb-0.5">No. Habitaciones:</span>
                  <span className="text-white font-semibold font-mono">{lead.num_rooms || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-bold mb-0.5">No. Tour:</span>
                  <span className="text-white font-semibold font-mono">{lead.tour_number || '—'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-500 block font-bold mb-0.5">No. Vuelo:</span>
                  <span className="text-white font-semibold font-mono">{lead.flight_number || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-bold mb-0.5">Método de Pago:</span>
                  <span className="text-white font-semibold">{lead.payment_method_pref || '—'}</span>
                </div>
              </div>

              {lead.stage === 'perdido' && lead.loss_reason && (
                <div>
                  <span className="text-rose-500 block font-bold mb-0.5">Razón de Pérdida:</span>
                  <span className="text-slate-200 font-semibold">{lead.loss_reason}</span>
                </div>
              )}

              {/* Timestamps Financieros */}
              <div className="pt-2 border-t border-slate-900/50 space-y-2">
                <span className="font-extrabold text-slate-500 uppercase tracking-widest text-[8px] block">Timestamps Financieros</span>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className="text-slate-550 block font-bold">Abono Recibido:</span>
                    <span className="text-slate-350 font-mono">
                      {lead.abono_recibido_at ? new Date(lead.abono_recibido_at).toLocaleString('es-DO') : 'Pendiente'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-550 block font-bold">Saldo Cobrado:</span>
                    <span className="text-slate-350 font-mono">
                      {lead.saldo_cobrado_at ? new Date(lead.saldo_cobrado_at).toLocaleString('es-DO') : 'Pendiente'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-550 block font-bold">Voucher Enviado:</span>
                    <span className="text-slate-350 font-mono">
                      {lead.voucher_enviado_at ? new Date(lead.voucher_enviado_at).toLocaleString('es-DO') : 'Pendiente'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Formulario Nueva Actividad */}
            <form onSubmit={handleAddActivity} className="space-y-3">
              <h3 className="font-extrabold text-slate-400 uppercase tracking-widest text-[9px]">Registrar Actividad / Notas</h3>
              <div className="flex gap-2">
                <select
                  value={newActivity.type}
                  onChange={(e) => setNewActivity({ ...newActivity, type: e.target.value })}
                  className="bg-slate-950 border border-slate-800 px-2 py-2 rounded-xl text-xs text-slate-300 font-semibold focus:outline-none"
                >
                  <option value="nota">Nota</option>
                  <option value="llamada">Llamada</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                </select>
                <input
                  type="text"
                  required
                  placeholder="Escribe un resumen de la actividad..."
                  value={newActivity.content}
                  onChange={(e) => setNewActivity({ ...newActivity, content: e.target.value })}
                  className="flex-1 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500/50 placeholder-slate-650"
                />
                <button
                  type="submit"
                  disabled={savingActivity}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-xs font-bold text-white rounded-xl transition-colors"
                >
                  {savingActivity ? '...' : 'Guardar'}
                </button>
              </div>
            </form>

            {/* Timeline Historial */}
            <div className="space-y-4">
              <h3 className="font-extrabold text-slate-400 uppercase tracking-widest text-[9px] border-b border-slate-900 pb-1.5">Línea de Tiempo</h3>
              
              {activities.length === 0 ? (
                <p className="text-xs text-slate-500 text-center italic py-4">Sin actividades registradas.</p>
              ) : (
                <div className="relative border-l border-slate-800 ml-3 space-y-5 py-1">
                  {activities.map((act) => {
                    const conf = ACTIVITY_ICONS[act.type] || ACTIVITY_ICONS.sistema;
                    const formattedDate = new Date(act.created_at).toLocaleString('es-DO', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });

                    return (
                      <div key={act.id} className="relative pl-6 group">
                        {/* Icon Bullet */}
                        <span className={`absolute -left-3.5 top-0.5 w-7 h-7 rounded-full border flex items-center justify-center text-xs shadow-md ${conf.color}`}>
                          {conf.char}
                        </span>
                        
                        {/* Info */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 capitalize">
                              {act.type} · <span className="text-slate-500 font-semibold">{act.created_by}</span>
                            </span>
                            <span className="text-[9px] font-medium text-slate-500 font-mono">{formattedDate}</span>
                          </div>
                          <p className="text-xs text-slate-200 font-medium leading-relaxed pr-2">
                            {act.content}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 💳 PESTAÑA B: EXPEDIENTE FINANCIERO */}
        {activeSubTab === 'financiero' && (
          <div className="space-y-6 text-xs animate-fadeIn">
            {!booking ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-550 italic bg-slate-950/40 border border-slate-850 rounded-2xl p-6">
                <span className="text-2xl mb-2">📂</span>
                <p className="text-center text-xs">El lead no posee ninguna reserva vinculada en la base de datos de producción.</p>
              </div>
            ) : (
              <>
                {/* Detalles de la Obligación Financiera */}
                <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-4 space-y-3.5">
                  <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                    <h3 className="font-extrabold text-slate-400 uppercase tracking-widest text-[9px]">Obligación Financiera</h3>
                    <span className="font-black text-[11px] text-yellow-500">#{booking.booking_reference}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-slate-550 block font-bold mb-0.5">Hotel en Reserva:</span>
                      <span className="font-semibold text-white uppercase">{booking.hotel_code || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-550 block font-bold mb-0.5">Estado Reserva:</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase inline-block ${
                        booking.status === 'confirmed' ? 'bg-emerald-600/10 text-emerald-500' : 'bg-yellow-600/10 text-yellow-500'
                      }`}>
                        {booking.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-slate-550 block font-bold mb-0.5">Check-In / Out:</span>
                      <span className="font-semibold text-white font-mono">{booking.check_in} a {booking.check_out}</span>
                    </div>
                    <div>
                      <span className="text-slate-550 block font-bold mb-0.5">Moneda Canónica:</span>
                      <span className="font-semibold text-white">USD (Dólares Americanos)</span>
                    </div>
                  </div>
                </div>

                {/* Métricas y Balance Financiero Neto (Fase 5.0) */}
                {(() => {
                  const totalAppliedUsd = ledgerEntries.reduce((sum, entry) => sum + parseFloat(entry.amount_applied_usd || 0), 0);
                  const pendingBalanceUsd = Math.max(0, parseFloat(booking.total_amount_usd || 0) - totalAppliedUsd);
                  const hasAnomaly = totalAppliedUsd > parseFloat(booking.total_amount_usd || 0);
                  
                  return (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-slate-950/60 border border-slate-850 p-3 rounded-2xl text-center space-y-1">
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Costo Total</span>
                          <span className="font-black text-xs text-white">${booking.total_amount_usd}</span>
                        </div>
                        <div className="bg-slate-950/60 border border-slate-850 p-3 rounded-2xl text-center space-y-1">
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Total Pagado</span>
                          <span className="font-black text-xs text-emerald-450">${totalAppliedUsd.toFixed(2)}</span>
                        </div>
                        <div className="bg-slate-950/60 border border-slate-850 p-3 rounded-2xl text-center space-y-1">
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block">Balance</span>
                          <span className="font-black text-xs text-yellow-500">${pendingBalanceUsd.toFixed(2)}</span>
                        </div>
                      </div>

                      {hasAnomaly && (
                        <div className="flex items-start gap-3 p-4 rounded-xl border bg-rose-950/20 border-rose-600/30 text-rose-450">
                          <span className="text-base">⚠️</span>
                          <div>
                            <span className="font-black uppercase tracking-widest text-[9px] block mb-1">Anomalía Contable</span>
                            <p className="font-semibold text-[11px]">Los abonos netos aplicados en el ledger (${totalAppliedUsd.toFixed(2)} USD) superan el costo total de la reserva (${booking.total_amount_usd} USD).</p>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Historial del Ledger Contable Inmutable (Vista B) */}
                <div className="space-y-3">
                  <h3 className="font-extrabold text-slate-400 uppercase tracking-widest text-[9px] border-b border-slate-900 pb-1.5">Ledger Contable (Asientos de Abono)</h3>
                  {ledgerEntries.length === 0 ? (
                    <p className="text-xs text-slate-550 italic text-center py-4">Sin asientos contables en el ledger.</p>
                  ) : (
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {ledgerEntries.map((entry) => (
                        <div key={entry.id} className="bg-slate-950 border border-slate-850 rounded-xl p-3 flex justify-between items-start transition hover:border-slate-800">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-slate-500">{new Date(entry.created_at).toLocaleDateString()}</span>
                              {entry.reversal_of_ledger_id && (
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-rose-600/10 text-rose-500">
                                  Reversión
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 block font-medium">Asiento ID: {entry.id.slice(0, 8)}</span>
                          </div>
                          <div className="text-right space-y-0.5">
                            <span className={`font-black block text-xs ${entry.amount_applied_usd < 0 ? 'text-rose-500' : 'text-slate-200'}`}>
                              {entry.amount_applied_usd < 0 ? '-' : ''}${Math.abs(entry.amount_applied_usd).toFixed(2)} USD
                            </span>
                            <span className="text-[9px] font-mono text-slate-500 block">
                              Original: {entry.currency_original === 'USD' ? '$' : 'RD$ '}{Math.abs(entry.amount_applied_original)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default LeadDetail;
