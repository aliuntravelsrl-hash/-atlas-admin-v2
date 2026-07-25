import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import LeadDetail from './LeadDetail';

const STAGES = [
  { id: 'nuevo', name: 'Nuevo', color: 'border-blue-500/30 text-blue-400 bg-blue-500/5', dot: 'bg-blue-500' },
  { id: 'contactado', name: 'Contactado', color: 'border-amber-500/30 text-amber-400 bg-amber-500/5', dot: 'bg-amber-500' },
  { id: 'cotizacion_enviada', name: 'Cotización Enviada', color: 'border-violet-500/30 text-violet-400 bg-violet-500/5', dot: 'bg-violet-500' },
  { id: 'negociando', name: 'Negociando', color: 'border-orange-500/30 text-orange-400 bg-orange-500/5', dot: 'bg-orange-500' },
  { id: 'deposito_recibido', name: 'Depósito Recibido', color: 'border-pink-500/30 text-pink-400 bg-pink-500/5', dot: 'bg-pink-500' },
  { id: 'confirmada', name: 'Confirmada', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5', dot: 'bg-emerald-500' },
  { id: 'perdido', name: 'Perdido', color: 'border-slate-700 text-slate-400 bg-slate-900/10', dot: 'bg-slate-500' },
];

const SOURCE_BADGES = {
  widget: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
  whatsapp: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  meta_ad: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  referral: 'bg-teal-500/15 text-teal-400 border-teal-500/20',
  manual: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
};

export const PipelineKanban = () => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [draggedLeadId, setDraggedLeadId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSource, setSelectedSource] = useState('all');
  
  // Modal de Nuevo Lead
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    source: 'manual',
    hotel_interest: '',
    budget_range: '',
    message: ''
  });
  const [hotels, setHotels] = useState([]);

  useEffect(() => {
    // Capturar parámetro search de la URL para filtro directo de CRM
    const params = new URLSearchParams(window.location.search);
    const searchVal = params.get('search');
    if (searchVal) {
      setSearchTerm(searchVal);
    }
    fetchLeads();
    fetchHotels();
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('crm_leads')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (err) {
      console.error('Error fetching leads:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHotels = async () => {
    try {
      const { data, error } = await supabase
        .from('hotels_master')
        .select('slug, name')
        .eq('is_active', true);
      if (!error) setHotels(data || []);
    } catch (err) {
      console.error('Error fetching hotels:', err);
    }
  };

  // Drag and Drop Handlers
  const handleDragStart = (e, leadId) => {
    setDraggedLeadId(leadId);
    e.dataTransfer.setData('text/plain', leadId);
  };

  const handleDragOver = (e, stageId) => {
    e.preventDefault();
    setDragOverStage(stageId);
  };

  const handleDrop = async (e, stageId) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain') || draggedLeadId;
    if (!leadId) return;

    // Guarda de seguridad financiera contable (Fase 4.0)
    if (stageId === 'deposito_recibido') {
      try {
        setLoading(true);
        // A. Buscar reserva asociada al lead
        const { data: bookingData, error: errBk } = await supabase
          .from('bookings')
          .select('id, booking_reference')
          .eq('lead_id', leadId)
          .limit(1);

        if (errBk) throw errBk;

        if (!bookingData || bookingData.length === 0) {
          alert('❌ Transición Bloqueada: El lead no posee ninguna reserva asociada en la base de datos de producción.');
          setDragOverStage(null);
          setDraggedLeadId(null);
          fetchLeads();
          return;
        }

        // B. Verificar existencia de abonos conciliados en ledger para esa reserva
        const { data: ledgerData, error: errLedger } = await supabase
          .from('payment_ledger')
          .select('id, amount_applied_usd')
          .eq('booking_id', bookingData[0].id)
          .limit(1);

        if (errLedger) throw errLedger;

        if (!ledgerData || ledgerData.length === 0) {
          alert(`❌ Transición Bloqueada: La reserva #${bookingData[0].booking_reference} no registra depósitos conciliados y aprobados en el ledger contable.`);
          setDragOverStage(null);
          setDraggedLeadId(null);
          fetchLeads();
          return;
        }

      } catch (err) {
        console.error('Error al validar guarda financiera:', err.message);
        alert('❌ Error de comunicación con la base de datos de Supabase.');
        setDragOverStage(null);
        setDraggedLeadId(null);
        fetchLeads();
        return;
      } finally {
        setLoading(false);
      }
    }

    // Actualizar UI localmente de forma optimista
    const updatedLeads = leads.map(l => {
      if (l.id === leadId) {
        return { ...l, stage: stageId, updated_at: new Date().toISOString() };
      }
      return l;
    });
    setLeads(updatedLeads);
    setDragOverStage(null);
    setDraggedLeadId(null);

    // Guardar en Supabase con fallback a actualización directa
    try {
      // 1. Intentar vía RPC
      const { error: rpcError } = await supabase.rpc('avanzar_pipeline', {
        p_lead_id: leadId,
        p_new_stage: stageId,
        p_actor: 'director'
      });

      if (rpcError) {
        console.warn('RPC avanzar_pipeline falló o no existe, usando fallback directo:', rpcError);
        // Fallback
        const { error: updateError } = await supabase
          .from('crm_leads')
          .update({ stage: stageId, updated_at: new Date().toISOString() })
          .eq('id', leadId);

        if (updateError) throw updateError;

        // Insertar registro de actividad
        await supabase.from('crm_activities').insert({
          lead_id: leadId,
          type: 'sistema',
          content: `Etapa del pipeline cambiada manualmente a: ${stageId}`,
          created_by: 'director'
        });
      }
      
      // Refrescar para asegurar sincronización limpia
      fetchLeads();
    } catch (err) {
      console.error('Error al actualizar etapa del lead:', err);
      fetchLeads(); // Revertir cambios en UI si hay error
    }
  };

  // Crear Lead
  const handleCreateLead = async (e) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase
        .from('crm_leads')
        .insert([{
          ...newLeadForm,
          stage: 'nuevo',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select();

      if (error) throw error;

      if (data && data[0]) {
        // Registrar actividad inicial
        await supabase.from('crm_activities').insert({
          lead_id: data[0].id,
          type: 'sistema',
          content: 'Lead creado manualmente desde el Panel de Horizons',
          created_by: 'director'
        });
      }

      setShowCreateModal(false);
      setNewLeadForm({
        full_name: '',
        phone: '',
        email: '',
        source: 'manual',
        hotel_interest: '',
        budget_range: '',
        message: ''
      });
      fetchLeads();
    } catch (err) {
      alert('Error al crear lead: ' + err.message);
    }
  };

  // Filtrado de Leads
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = 
      lead.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone?.includes(searchTerm) ||
      (lead.email && lead.email.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesSource = selectedSource === 'all' || lead.source === selectedSource;
    
    return matchesSearch && matchesSource;
  });

  // Obtener leads agrupados por etapa
  const getLeadsByStage = (stageId) => {
    return filteredLeads.filter(l => l.stage === stageId);
  };

  return (
    <div className="space-y-6 text-slate-100">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">Funnel de Ventas</h1>
          <p className="text-slate-400 mt-1 font-medium">Gestión visual del embudo de leads (Supabase + OpenClaw)</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchLeads}
            className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl font-bold text-sm text-slate-300 transition-colors"
          >
            🔄 Actualizar
          </button>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-sm text-slate-950 transition-colors shadow-lg shadow-emerald-500/10"
          >
            ➕ Nuevo Lead
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row items-center gap-4 bg-slate-900/50 border border-slate-800/80 p-4 rounded-2xl">
        <div className="flex-1 w-full relative">
          <input
            type="text"
            placeholder="Buscar por nombre, teléfono o correo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800/80 px-4 py-2.5 pl-10 rounded-xl text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500/50"
          />
          <span className="absolute left-3.5 top-3 text-slate-500 text-sm">🔍</span>
        </div>
        <div className="w-full md:w-48">
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800/80 px-3 py-2.5 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-blue-500/50"
          >
            <option value="all">Todas las Fuentes</option>
            <option value="widget">Widget Web</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="meta_ad">Meta Ads</option>
            <option value="referral">Referidos</option>
            <option value="manual">Manual</option>
          </select>
        </div>
      </div>

      {/* Kanban Board Container */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-gray-400 font-medium animate-pulse">Cargando embudo de ventas...</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 overflow-x-auto pb-6">
          {STAGES.map(stage => {
            const stageLeads = getLeadsByStage(stage.id);
            const isOver = dragOverStage === stage.id;

            return (
              <div 
                key={stage.id}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDrop={(e) => handleDrop(e, stage.id)}
                onDragLeave={() => setDragOverStage(null)}
                className={`flex flex-col w-full min-h-[500px] bg-slate-900/40 border rounded-2xl transition-all p-3 space-y-3 ${
                  isOver ? 'border-blue-500/60 bg-blue-500/5 scale-[1.01]' : 'border-slate-800/60'
                }`}
              >
                {/* Column Header */}
                <div className={`flex items-center justify-between border-b pb-2 px-1 ${stage.color}`}>
                  <span className="font-extrabold text-sm uppercase tracking-wider flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${stage.dot}`}></span>
                    {stage.name}
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-950/40 border border-slate-800/55">
                    {stageLeads.length}
                  </span>
                </div>

                {/* Cards List */}
                <div className="flex-1 space-y-3 overflow-y-auto max-h-[600px] pr-1">
                  {stageLeads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 border border-dashed border-slate-800/60 rounded-xl text-xs text-slate-500">
                      Arrastrar aquí
                    </div>
                  ) : (
                    stageLeads.map(lead => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, lead.id)}
                        onClick={() => setSelectedLeadId(lead.id)}
                        className={`bg-slate-950 border rounded-xl p-3.5 hover:border-slate-700 cursor-pointer shadow-md group transition-all duration-300 relative ${
                          selectedLeadId === lead.id ? 'border-blue-500/60 bg-blue-950/20' : 'border-slate-850'
                        }`}
                      >
                        {/* Source Tag */}
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[9px] font-black border uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            SOURCE_BADGES[lead.source] || 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}>
                            {lead.source}
                          </span>
                          {lead.budget_range && (
                            <span className="text-[10px] font-black text-emerald-400 font-mono">
                              {lead.budget_range}
                            </span>
                          )}
                        </div>

                        {/* Name & Phone */}
                        <div className="space-y-0.5">
                          <h4 className="font-bold text-white text-sm group-hover:text-blue-400 transition-colors">
                            {lead.full_name}
                          </h4>
                          <p className="text-xs text-slate-400 font-medium font-mono">{lead.phone}</p>
                        </div>

                        {/* Hotel Interest */}
                        {lead.hotel_interest && (
                          <div className="mt-2.5 pt-2 border-t border-slate-900 flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold">
                            <span>🏨</span>
                            <span className="truncate">{lead.hotel_interest}</span>
                          </div>
                        )}

                        {/* Occupancy Indicator */}
                        {(lead.adults > 2 || lead.children > 0) && (
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
                            <span>👥</span>
                            <span>{lead.adults} Ad · {lead.children} Ch</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Panel Detalle Lateral */}
      {selectedLeadId && (
        <LeadDetail 
          leadId={selectedLeadId} 
          onClose={() => setSelectedLeadId(null)}
          onRefresh={fetchLeads}
        />
      )}

      {/* Modal Crear Lead */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-black text-lg text-white">Registrar Nuevo Lead</h3>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white font-bold text-sm focus:outline-none"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleCreateLead} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Nombre Completo *</label>
                  <input
                    type="text"
                    required
                    value={newLeadForm.full_name}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, full_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                    placeholder="Ej. Juan Pérez"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Teléfono (WhatsApp) *</label>
                  <input
                    type="text"
                    required
                    value={newLeadForm.phone}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                    placeholder="Ej. +18095551234"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Correo Electrónico</label>
                  <input
                    type="email"
                    value={newLeadForm.email}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                    placeholder="ejemplo@correo.com"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Origen / Fuente</label>
                  <select
                    value={newLeadForm.source}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, source: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="manual">Manual / Teléfono</option>
                    <option value="widget">Widget Web</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="referral">Referido</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Hotel de Interés</label>
                  <select
                    value={newLeadForm.hotel_interest}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, hotel_interest: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="">Ninguno / Explorando</option>
                    {hotels.map(h => (
                      <option key={h.slug} value={h.slug}>{h.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">Rango de Presupuesto</label>
                  <input
                    type="text"
                    value={newLeadForm.budget_range}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, budget_range: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
                    placeholder="Ej. USD 1000 - 1500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400">Mensaje o Requerimientos</label>
                <textarea
                  value={newLeadForm.message}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, message: e.target.value })}
                  rows="3"
                  className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-white placeholder-slate-650 focus:outline-none focus:border-blue-500/50"
                  placeholder="Detalles sobre el viaje o fechas deseadas..."
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-xl font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl font-bold transition-colors"
                >
                  Registrar Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default PipelineKanban;
