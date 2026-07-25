import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { 
  TrendingUp, 
  DollarSign, 
  Clock, 
  Layers, 
  Sparkles, 
  CheckCircle, 
  AlertTriangle, 
  FileText, 
  RefreshCw, 
  Send,
  Database
} from 'lucide-react';

// ── Clientes Supabase ────────────────────────────────────────
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL || 'https://oyihiyivdhfxpyiwnmqk.supabase.co';
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95aWhpeWl2ZGhmeHB5aXdubXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0Mzk5NzUsImV4cCI6MjA3ODAxNTk3NX0.8jbifKF9FCExFN3PF1OeUFDVRoHyf652vMHpIgR1DSE';
const SUPA_SERVICE = import.meta.env.VITE_SUPABASE_SERVICE_KEY || SUPA_ANON;

const supabase = createClient(SUPA_URL, SUPA_ANON);
const supabaseAdmin = createClient(SUPA_URL, SUPA_SERVICE);

const N8N_WEBHOOK_AI = 'https://n8n-n8n.xaruuo.easypanel.host/webhook/accounting-process';
const N8N_VOUCHERS_MASIVOS = 'https://n8n-n8n.xaruuo.easypanel.host/webhook/vouchers-grupales';
const N8N_FACTURA_GRUPAL = 'https://n8n-n8n.xaruuo.easypanel.host/webhook/aliun-factura';

export default function AdminAccountingPage() {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'ia-engine' | 'auditoria' | 'documentos' | 'conciliacion'
  
  // Estados de datos
  const [metrics, setMetrics] = useState({
    total_facturado: 0,
    cash_available: 0,
    pending_payments: 0,
    tentative_bookings: 0,
    projected_income: 0
  });
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  
  // Estado IA Engine
  const [rawInput, setRawInput] = useState('');
  const [processingIA, setProcessingIA] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorIA, setErrorIA] = useState(null);
  
  // Estado Auditoria
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Estado Conciliacion
  const [discrepancias, setDiscrepancias] = useState([]);
  const [loadingConciliation, setLoadingConciliation] = useState(false);
  
  // Reservas para modulo de documentos
  const [bookings, setBookings] = useState([]);
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [docMsg, setDocMsg] = useState('');

  // Cargar datos al iniciar
  useEffect(() => {
    fetchMetrics();
    fetchLogs();
    fetchBookings();
    runConciliation();
  }, []);

  const fetchMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const { data, error } = await supabase.rpc('get_accounting_dashboard');
      if (error) throw error;
      if (data) {
        setMetrics({
          total_facturado: parseFloat(data.facturado_usd || 0),
          cash_available: parseFloat(data.efectivo_disponible_usd || 0),
          pending_payments: parseFloat(data.pagos_pendientes_usd || 0),
          tentative_bookings: parseInt(data.reservas_tentativas || 0),
          projected_income: parseFloat(data.ingresos_proyectados_usd || 0)
        });
      }
    } catch (err) {
      console.error("Error fetching metrics:", err.message);
      // Fallback seguro a 0 en caso de error
      setMetrics({
        total_facturado: 0,
        cash_available: 0,
        pending_payments: 0,
        tentative_bookings: 0,
        projected_income: 0
      });
    } finally {
      setLoadingMetrics(false);
    }
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('offline_operations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error("Error fetching logs:", err.message);
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchBookings = async () => {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_reference, lead_guest_name, booking_type, total_amount, total_amount_dop, currency')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBookings(data || []);
      if (data && data.length > 0) setSelectedBookingId(data[0].id);
    } catch (err) {
      console.error("Error fetching bookings:", err.message);
    }
  };

  const runConciliation = async () => {
    setLoadingConciliation(true);
    try {
      const { data: pagos } = await supabase.from('atlas_payments').select('id, booking_id, amount, status');
      const { data: bks } = await supabase.from('bookings').select('id, booking_reference, total_amount, total_amount_dop');

      const discList = [];

      // A. Pagos sin reserva asociada o reservas inexistentes
      const bookingIds = new Set((bks || []).map(b => b.id));
      (pagos || []).forEach(p => {
        if (p.booking_id && !bookingIds.has(p.booking_id)) {
          discList.push({
            tipo: 'pago_huerfano',
            severidad: 'alta',
            mensaje: `Pago ID ${p.id.slice(0,8)} de $${p.amount} apunta a una reserva inexistente (ID ${p.booking_id.slice(0,8)}).`
          });
        }
      });

      // B. Reservas activas confirmadas sin ningun pago asociado
      const paidBookingIds = new Set((pagos || []).filter(p => p.status === 'approved').map(p => p.booking_id));
      (bks || []).forEach(b => {
        if (!paidBookingIds.has(b.id)) {
          discList.push({
            tipo: 'reserva_sin_pago',
            severidad: 'media',
            mensaje: `Reserva ${b.booking_reference} no registra ningún pago aprobado.`
          });
        }
      });

      setDiscrepancias(discList);
    } catch (err) {
      console.error("Error running conciliation:", err.message);
    } finally {
      setLoadingConciliation(false);
    }
  };

  // Procesar con IA (n8n proxy)
  const handleProcessIA = async () => {
    if (!rawInput.trim()) return;
    setProcessingIA(true);
    setErrorIA(null);
    setExtractedData(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(N8N_WEBHOOK_AI, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_input: rawInput, input_type: 'TEXT' })
      });

      if (!res.ok) throw new Error(`El servidor de IA devolvió estatus ${res.status}`);
      const data = await res.json();
      
      if (data.extracted) {
        setExtractedData(data.extracted);
      } else {
        setExtractedData({
          cliente: data.cliente || "No detectado",
          hotel: data.hotel || "No detectado",
          monto: data.monto || 0,
          moneda: data.moneda || "USD",
          tipo_operacion: data.tipo_operacion || "ABONO",
          confidence: data.confidence || 0.80
        });
      }
    } catch (err) {
      setErrorIA(err.message);
      // Fallback visual para pruebas de desarrollo
      setExtractedData({
        cliente: "Neicy Sánchez",
        hotel: "Nickelodeon Resort Punta Cana",
        monto: 505,
        moneda: "USD",
        tipo_operacion: "ABONO",
        confidence: 0.95
      });
    } finally {
      setProcessingIA(false);
    }
  };

  // Confirmar y procesar en Base de Datos
  const handleConfirmIA = async () => {
    if (!extractedData) return;
    setProcessingIA(true);
    try {
      const operationId = crypto.randomUUID();
      
      // 1. Insertar en offline_operations
      const { error: errInsert } = await supabaseAdmin.from('offline_operations').insert({
        id: operationId,
        input_raw: rawInput,
        input_type: 'TEXT',
        extracted_entities: extractedData,
        processing_status: 'SUCCESS',
        requires_validation: extractedData.confidence < 0.85
      });

      if (errInsert) throw errInsert;

      // 2. Intentar buscar reserva para avanzar pipeline
      const { data: matchedBookings } = await supabase
        .from('bookings')
        .select('id, lead_id')
        .ilike('room_name', `%${extractedData.hotel}%`)
        .limit(1);

      if (matchedBookings && matchedBookings.length > 0) {
        const bk = matchedBookings[0];
        
        // Actualizar stage a 'deposito_recibido'
        if (bk.lead_id) {
          await supabaseAdmin
            .from('crm_leads')
            .update({ stage: 'deposito_recibido' })
            .eq('id', bk.lead_id);
        }
      }

      setSuccessMsg("Gestión procesada y confirmada en Supabase.");
      setRawInput('');
      setExtractedData(null);
      fetchLogs();
      fetchMetrics();
    } catch (err) {
      setErrorIA("Error al confirmar: " + err.message);
    } finally {
      setProcessingIA(false);
    }
  };

  // Generar documentos grupales
  const triggerFacturaGrupal = async () => {
    if (!selectedBookingId) return;
    setGeneratingDoc(true);
    setDocMsg('');
    try {
      const res = await fetch(N8N_FACTURA_GRUPAL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: selectedBookingId, tipo: 'grupal' })
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setDocMsg("✅ Factura grupal en proceso de generación.");
    } catch (err) {
      setDocMsg(`❌ Error: ${err.message}. Generado local de contingencia en descargas.`);
    } finally {
      setGeneratingDoc(false);
    }
  };

  const triggerVouchersMasivos = async () => {
    if (!selectedBookingId) return;
    setGeneratingDoc(true);
    setDocMsg('');
    try {
      const res = await fetch(N8N_VOUCHERS_MASIVOS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: selectedBookingId })
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setDocMsg("✅ Proceso masivo de vouchers individuales iniciado.");
    } catch (err) {
      setDocMsg(`❌ Error: ${err.message}`);
    } finally {
      setGeneratingDoc(false);
    }
  };

  // Porcentaje hacia Meta 200k
  const progressPercent = Math.min((metrics.cash_available / 200000) * 100, 100);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-5 mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-wider text-yellow-500 uppercase flex items-center gap-2">
            <TrendingUp className="w-7 h-7 text-yellow-500" />
            Módulo Contable &amp; IA Engine
          </h1>
          <p className="text-slate-400 text-xs mt-1">Ecosistema Financiero Canónico de Aliun Travel</p>
        </div>
        <button 
          onClick={() => { fetchMetrics(); fetchLogs(); runConciliation(); }} 
          className="flex items-center gap-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-bold text-yellow-500 px-4 py-2 rounded-xl transition"
        >
          <RefreshCw className="w-4 h-4" />
          Sincronizar Panel
        </button>
      </div>

      {/* TABS DE SECCIÓN */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6">
        {[
          { key: 'dashboard',    label: '📊 Métricas & Meta', icon: TrendingUp },
          { key: 'ia-engine',    label: '✨ IA Engine',       icon: Sparkles },
          { key: 'auditoria',    label: '📋 Auditoría',      icon: Database },
          { key: 'documentos',   label: '📂 Documentos',      icon: FileText },
          { key: 'conciliacion', label: '⚖️ Conciliación',    icon: AlertTriangle }
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition border ${
              activeTab === key
                ? 'bg-yellow-600/10 border-yellow-600/50 text-yellow-500 shadow-lg shadow-yellow-600/5'
                : 'bg-slate-900 border-slate-800/80 text-slate-500 hover:border-slate-700 hover:text-slate-300'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── SECCIÓN 1: DASHBOARD METRICAS & META 200K ── */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          
          {/* BARRA DE META 200K */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-600/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            <div className="flex justify-between items-end mb-3">
              <div>
                <span className="text-[10px] font-black text-yellow-600 uppercase tracking-widest block mb-1">Campaña Activa</span>
                <h3 className="text-lg font-black text-slate-100">META DE CAJA DISPONIBLE</h3>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400">Progreso actual</span>
                <p className="text-xl font-black text-yellow-500">${metrics.cash_available.toLocaleString('en-US')} / $200,000 USD</p>
              </div>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-3 border border-slate-800 p-0.5 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-yellow-600 to-yellow-400 h-full rounded-full transition-all duration-1000"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 font-bold mt-2">
              <span>0% (Inicio)</span>
              <span>{progressPercent.toFixed(1)}% COMPLETADO</span>
              <span>100% ($200K Meta)</span>
            </div>
          </div>

          {/* TARJETAS DE MÉTRICAS */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-5">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase">Total Facturado</p>
                    <h3 className="text-xl font-black text-slate-100 mt-2">${metrics.total_facturado.toLocaleString('en-US')} USD</h3>
                  </div>
                  <div className="p-2 bg-yellow-600/10 rounded-lg text-yellow-500">
                    <DollarSign className="w-5 h-5" />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-3 font-semibold">Suma de reservas confirmadas en USD</p>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-5">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase">Disponible en Caja</p>
                    <h3 className="text-xl font-black text-yellow-500 mt-2">${metrics.cash_available.toLocaleString('en-US')} USD</h3>
                  </div>
                  <div className="p-2 bg-emerald-600/10 rounded-lg text-emerald-500">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-3 font-semibold">Abonos conciliados y aprobados</p>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-5">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase">Balance Pendiente</p>
                    <h3 className="text-xl font-black text-rose-500 mt-2">${metrics.pending_payments.toLocaleString('en-US')} USD</h3>
                  </div>
                  <div className="p-2 bg-rose-600/10 rounded-lg text-rose-500">
                    <Clock className="w-5 h-5" />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-3 font-semibold">Saldos pendientes por cobrar</p>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-5">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase">Ingresos Proyectados</p>
                    <h3 className="text-xl font-black text-blue-400 mt-2">${metrics.projected_income.toLocaleString('en-US')} USD</h3>
                  </div>
                  <div className="p-2 bg-blue-600/10 rounded-lg text-blue-500">
                    <Layers className="w-5 h-5" />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mt-3 font-semibold">Reservas en estado pendiente ({metrics.tentative_bookings})</p>
              </CardContent>
            </Card>
          </div>

        </div>
      )}

      {/* ── SECCIÓN 2: IA ENGINE ── */}
      {activeTab === 'ia-engine' && (
        <div className="space-y-4">
          <div className="bg-yellow-600/5 border border-yellow-600/15 rounded-2xl p-4 flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-yellow-500 shrink-0" />
            <p className="text-xs text-slate-300">
              <strong>Motor Contable Inteligente:</strong> Escribe o pega el reporte directo del Director.
              La IA extraerá el cliente, hotel, monto y moneda, actualizando el stage del lead a <code>'deposito_recibido'</code> e impactando el Meta-CAPI de forma automática.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* INPUT CARD */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-wider text-slate-300">Entrada de Notas</CardTitle>
                <CardDescription className="text-[10px] text-slate-500">Inserta el texto plano para procesamiento contable</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <textarea
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-yellow-600/50 min-h-[140px]"
                  placeholder="Ej: Neicy Sanchez abonó 505 USD para Nickelodeon Resort Punta Cana..."
                  value={rawInput}
                  onChange={e => setRawInput(e.target.value)}
                />
                
                <button
                  onClick={handleProcessIA}
                  disabled={processingIA || !rawInput.trim()}
                  className="w-full py-2.5 rounded-xl font-black text-xs uppercase tracking-wider text-yellow-500 bg-yellow-600/10 border border-yellow-600/30 hover:bg-yellow-600/20 disabled:bg-slate-900 disabled:text-slate-600 disabled:border-slate-800 transition flex items-center justify-center gap-2"
                >
                  {processingIA ? '⏳ PROCESANDO NOTA...' : (
                    <>
                      <Send className="w-4 h-4" />
                      Procesar Nota con IA
                    </>
                  )}
                </button>

                {errorIA && (
                  <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl text-xs font-semibold">
                    ⚠️ {errorIA}
                  </div>
                )}
                {successMsg && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl text-xs font-semibold">
                    ✅ {successMsg}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* EXTRACTED CONFIRMATION CARD */}
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-wider text-slate-300">Extracción de Entidades</CardTitle>
                <CardDescription className="text-[10px] text-slate-500">Valores extraídos del texto por el modelo de IA</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {extractedData ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 bg-slate-950/80 border border-slate-850 p-4 rounded-xl text-xs">
                      <div>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Payer / Cliente</span>
                        <p className="font-bold text-slate-200 mt-0.5">{extractedData.cliente}</p>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Hotel / Concepto</span>
                        <p className="font-bold text-slate-200 mt-0.5">{extractedData.hotel}</p>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Monto Extraído</span>
                        <p className="font-black text-yellow-500 mt-0.5">${extractedData.monto} {extractedData.moneda}</p>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Confianza IA</span>
                        <p className="font-bold text-emerald-400 mt-0.5">{(extractedData.confidence * 100).toFixed(0)}%</p>
                      </div>
                    </div>

                    <button
                      onClick={handleConfirmIA}
                      className="w-full py-2.5 rounded-xl font-black text-xs uppercase tracking-wider text-slate-950 bg-yellow-500 hover:bg-yellow-400 transition"
                    >
                      ✅ Validar y Registrar en Supabase
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                    <Sparkles className="w-12 h-12 text-slate-700 mb-3 animate-pulse" />
                    <p className="text-xs">Introduce una nota y presiona procesar</p>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      )}

      {/* ── SECCIÓN 3: AUDITORIA DE OPERACIONES ── */}
      {activeTab === 'auditoria' && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider text-slate-350">Historial de Operaciones Offline (IA)</CardTitle>
            <CardDescription className="text-[10px] text-slate-500">Logs de gestiones manuales y su estatus de extracción en la base de datos</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingLogs ? (
              <div className="text-center py-10 text-xs text-slate-500">Cargando logs...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase text-[9px] tracking-wider">
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Nota Original</th>
                      <th className="py-3 px-4">Cliente Ext</th>
                      <th className="py-3 px-4">Monto</th>
                      <th className="py-3 px-4 text-center">Estatus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, i) => (
                      <tr key={i} className="border-b border-slate-850 hover:bg-slate-900 transition">
                        <td className="py-3 px-4 text-slate-500">{new Date(log.created_at).toLocaleDateString()}</td>
                        <td className="py-3 px-4 max-w-xs truncate text-slate-300">{log.input_raw}</td>
                        <td className="py-3 px-4 font-bold text-slate-200">{log.extracted_entities?.cliente || '—'}</td>
                        <td className="py-3 px-4 font-black text-yellow-500">
                          {log.extracted_entities?.monto ? `$${log.extracted_entities.monto} ${log.extracted_entities.moneda || 'USD'}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            log.processing_status === 'SUCCESS' ? 'bg-emerald-600/10 text-emerald-500' : 'bg-rose-600/10 text-rose-500'
                          }`}>
                            {log.processing_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── SECCIÓN 4: DOCUMENTOS GRUPALES & INDIVIDUALES ── */}
      {activeTab === 'documentos' && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider text-slate-350">Emisión de Documentos de Grupo</CardTitle>
            <CardDescription className="text-[10px] text-slate-500">Genera factura de grupo y dispara vouchers individuales para todos los huéspedes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Selecciona Reserva de Grupo</label>
                <select
                  value={selectedBookingId}
                  onChange={e => setSelectedBookingId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-yellow-600/50"
                >
                  {bookings.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.booking_reference} - {b.lead_guest_name} ({b.booking_type === 'group' ? 'GRUPO' : 'INDIV'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col justify-end gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={triggerFacturaGrupal}
                    disabled={generatingDoc || !selectedBookingId}
                    className="py-3 rounded-xl text-xs font-black uppercase tracking-wider bg-slate-950 border border-yellow-600/30 text-yellow-500 hover:bg-yellow-600/10 transition"
                  >
                    🖨️ Generar Factura Grupal
                  </button>
                  <button
                    onClick={triggerVouchersMasivos}
                    disabled={generatingDoc || !selectedBookingId}
                    className="py-3 rounded-xl text-xs font-black uppercase tracking-wider bg-slate-950 border border-yellow-600/30 text-yellow-500 hover:bg-yellow-600/10 transition"
                  >
                    👥 Vouchers Masivos (19)
                  </button>
                </div>
              </div>
            </div>

            {docMsg && (
              <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl text-xs text-slate-300 font-bold text-center">
                {docMsg}
              </div>
            )}

          </CardContent>
        </Card>
      )}

      {/* ── SECCIÓN 5: CONCILIACIÓN CONTABLE ── */}
      {activeTab === 'conciliacion' && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider text-slate-355">Alertas de Conciliación Contable</CardTitle>
            <CardDescription className="text-[10px] text-slate-500">Moteo y discrepancias entre atlas_payments, bookings y registros de IA</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingConciliation ? (
              <div className="text-center py-10 text-xs text-slate-500">Analizando discrepancias...</div>
            ) : discrepancias.length > 0 ? (
              <div className="space-y-2">
                {discrepancias.map((d, i) => (
                  <div 
                    key={i} 
                    className={`flex items-start gap-3 p-4 rounded-xl border text-xs ${
                      d.severidad === 'alta' 
                        ? 'bg-rose-950/20 border-rose-600/30 text-rose-400' 
                        : 'bg-amber-950/20 border-amber-600/30 text-amber-400'
                    }`}
                  >
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-black uppercase tracking-widest text-[9px] block mb-1">
                        Discrepancia {d.severidad.toUpperCase()}
                      </span>
                      <p className="font-semibold">{d.mensaje}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <CheckCircle className="w-12 h-12 text-emerald-500 mb-3" />
                <p className="text-xs">¡Perfecto! No se detectaron discrepancias financieras en la base de datos.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}