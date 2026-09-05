import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { 
  Brain, 
  Radar, 
  TrendingUp, 
  DollarSign, 
  AlertTriangle, 
  Server, 
  Layers, 
  CheckCircle2, 
  ShieldCheck, 
  RefreshCw, 
  Zap, 
  Clock, 
  Eye, 
  ArrowRight, 
  Send 
} from 'lucide-react'

const GOLD = '#B8860B', TEAL = '#2DD4BF', GRAY = '#475569', RED = '#EF4444', GREEN = '#10B981', BLUE = '#38BDF8'

export default function AriadnePanel() {
  const [activeTab, setActiveTab] = useState('ariadne') // 'ariadne' | 'intel'
  const [kpis, setKpis] = useState(null)
  const [stale, setStale] = useState([])
  const [hotels, setHotels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Telemetría Ariadne
  const [excCount, setExcCount] = useState(0)
  const [vpsData, setVpsData] = useState([])
  const [pendingTasks, setPendingTasks] = useState([])
  const [recentLogs, setRecentLogs] = useState([])
  const [exchangeRate, setExchangeRate] = useState(59.0)

  // Estados específicos de Atlas Intel (Radar XML & Mercado)
  const [intelMode, setIntelMode] = useState('async') // 'sync' | 'async'
  const [competitiveFeed, setCompetitiveFeed] = useState([])
  const [isRefreshingIntel, setIsRefreshingIntel] = useState(false)

  // Muestra simulada/canónica de enrutamiento multi-proveedor XML
  const [supplierRates, setSupplierRates] = useState([
    {
      hotel: 'Lopesan Costa Bávaro Resort',
      dates: '15 Oct - 18 Oct (3N)',
      pax: '2 Adultos',
      providers: [
        { name: 'Directo Hotel (CRS)', net: 195, isBest: true },
        { name: 'Dingus / Juniper', net: 210, isBest: false },
        { name: 'Hotelbeds (Bedbank)', net: 235, isBest: false }
      ],
      publicOTA: 295, // Booking.com
      markupPVP: 265,
      profitUSD: 70,
      cancellation: 'Gratis hasta 10 Oct (Flexible)',
      rateType: 'Reembolsable'
    },
    {
      hotel: 'Occidental Punta Cana',
      dates: '22 Oct - 25 Oct (3N)',
      pax: '2 Adultos, 1 Niño',
      providers: [
        { name: 'Directo Hotel (CRS)', net: 165, isBest: false },
        { name: 'Dingus / Juniper', net: 140, isBest: true },
        { name: 'Hotelbeds (Bedbank)', net: 175, isBest: false }
      ],
      publicOTA: 215, // Expedia
      markupPVP: 185,
      profitUSD: 45,
      cancellation: 'No Reembolsable (NRF Promo)',
      rateType: 'No Reembolsable (NRF)'
    },
    {
      hotel: 'Grand Sirenis Punta Cana',
      dates: '01 Nov - 04 Nov (3N)',
      pax: '2 Adultos',
      providers: [
        { name: 'Directo Hotel (CRS)', net: 170, isBest: true },
        { name: 'Dingus / Juniper', net: 185, isBest: false },
        { name: 'Hotelbeds (Bedbank)', net: 190, isBest: false }
      ],
      publicOTA: 240,
      markupPVP: 220,
      profitUSD: 50,
      cancellation: 'Gratis hasta 25 Oct (Flexible)',
      rateType: 'Reembolsable'
    }
  ])

  // Capturas de anuncios competidores (Meta Ads Library)
  const [competitorAds, setCompetitorAds] = useState([
    {
      agency: 'Agencia Competidora A',
      hook: '¡Punta Cana por $49 USD la noche! Reserva con $500 pesos.',
      analysis: 'Tarifa trampa (no incluye impuestos 18% ni traslados). Cero todo incluido real.',
      counterAction: 'Lanzar copy: "Todo Incluido Real con Impuestos y Traslado Incluido sin Sorpresas".',
      detectedAt: 'Hace 2 horas'
    },
    {
      agency: 'Operadora Mayorista B',
      hook: 'Especial Niños Gratis en Bayahíbe - Solo este fin de semana.',
      analysis: 'Promoción real de cadena Viva Wyndham. Oportunidad de empaquetar con excursión Saona.',
      counterAction: 'Empaquetar Viva Dominicus + Tour Isla Saona con 20% OFF.',
      detectedAt: 'Hace 5 horas'
    }
  ])

  useEffect(() => {
    async function loadData() {
      try {
        const [funnel, staleRes, hotelRes, excBks, vpsMetrics, tasks, logs, rates, intelRes] = await Promise.all([
          supabase.rpc('funnel_conversion'),
          supabase.rpc('stale_leads'),
          supabase.rpc('revenue_by_hotel'),
          supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('booking_type', 'excursion'),
          supabase.from('vps_metrics').select('vps_id, mem_pct, timestamp').order('timestamp', { ascending: false }).limit(6),
          supabase.from('atlas_tasks').select('*').eq('estado', 'pendiente').order('prioridad', { ascending: false }).limit(5),
          supabase.from('logs_operativos').select('*').order('created_at', { ascending: false }).limit(5),
          supabase.from('exchange_rates').select('rate_sell').limit(1),
          supabase.from('competitive_intel').select('*').order('created_at', { ascending: false }).limit(5)
        ])
        setKpis(funnel.data || {})
        setStale(staleRes.data || [])
        setHotels((hotelRes.data || []).slice(0, 8))
        setExcCount(excBks.count || 0)
        setVpsData(vpsMetrics.data || [])
        setPendingTasks(tasks.data || [])
        setRecentLogs(logs.data || [])
        if (rates.data && rates.data.length > 0) {
          setExchangeRate(parseFloat(rates.data[0].rate_sell))
        }
        if (intelRes.data && intelRes.data.length > 0) {
          setCompetitiveFeed(intelRes.data)
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const handleSimulateSyncCheck = () => {
    setIsRefreshingIntel(true)
    setTimeout(() => {
      setIsRefreshingIntel(false)
    }, 1200)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
      <p style={{ color: TEAL, fontSize: 14 }}>⏳ Cargando Centro de Inteligencia Estratégica (Ariadne & Intel)...</p>
    </div>
  )

  if (error) return (
    <div style={{ padding: 24 }}>
      <p style={{ color: RED }}>Error: {error}</p>
    </div>
  )

  const stages = Object.entries(kpis?.stages || {}).map(([k, v]) => ({ stage: k, count: v })).filter(s => s.count > 0)
  const rates = kpis?.conversion_rates || {}

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#F8FAFC' }}>
      
      {/* CABECERA PRINCIPAL & SWITCHER DE TABS */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, borderBottom: `1px solid ${GRAY}33`, paddingBottom: 16 }}>
        <div>
          <h1 style={{ color: '#F8FAFC', fontSize: 22, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            🏛️ Centro de Mando: Data & Strategic Intelligence
          </h1>
          <p style={{ color: GRAY, fontSize: 13, marginTop: 4 }}>
            F2-Backend Core · Telemetría Interna SSOT & Radar de Mercado XML
          </p>
        </div>

        {/* SELECTOR DE PESTAÑAS (SILLA ARIADNE VS SILLA INTEL) */}
        <div style={{ display: 'flex', background: '#111827', borderRadius: 10, padding: 4, border: `1px solid ${GRAY}44`, gap: 4 }}>
          <button
            onClick={() => setActiveTab('ariadne')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              transition: 'all 0.2s',
              background: activeTab === 'ariadne' ? `${TEAL}22` : 'transparent',
              color: activeTab === 'ariadne' ? TEAL : GRAY,
              borderBottom: activeTab === 'ariadne' ? `2px solid ${TEAL}` : '2px solid transparent'
            }}
          >
            <Brain size={16} />
            Ariadne Data (Interno)
          </button>

          <button
            onClick={() => setActiveTab('intel')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              transition: 'all 0.2s',
              background: activeTab === 'intel' ? `${GOLD}22` : 'transparent',
              color: activeTab === 'intel' ? GOLD : GRAY,
              borderBottom: activeTab === 'intel' ? `2px solid ${GOLD}` : '2px solid transparent'
            }}
          >
            <Radar size={16} />
            Atlas Intel (Radar XML & Mercado)
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VISTA 1: ARIADNE DATA (INTELIGENCIA INTERNA, FUNNEL, REVENUE Y LOGS)      */}
      {/* ========================================================================= */}
      {activeTab === 'ariadne' && (
        <div>
          {/* Grid de KPIs principales */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Leads Totales', value: kpis?.total || '—', color: GOLD },
              { label: 'Conversión Global', value: rates.overall_conversion_pct ? rates.overall_conversion_pct + '%' : '—', color: GOLD },
              { label: 'Reservas Excursión', value: excCount, color: TEAL },
              { label: 'Tasa Soberana (USD/DOP)', value: `RD$ ${exchangeRate}`, color: GREEN },
              { label: 'Leads Estancados (+7d)', value: stale.length, color: stale.length > 0 ? RED : GREEN },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: '18px 20px' }}>
                <p style={{ color: GRAY, fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 8px' }}>{label}</p>
                <p style={{ color, fontSize: 26, fontWeight: 700, margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Gráficos principales */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 20 }}>
            <div style={{ background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: 20 }}>
              <p style={{ color: TEAL, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 14 }}>
                Distribución del Funnel (crm_leads)
              </p>
              {stages.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stages} layout="vertical">
                    <XAxis type="number" tick={{ fill: GRAY, fontSize: 11 }} />
                    <YAxis dataKey="stage" type="category" tick={{ fill: '#CBD5E1', fontSize: 11 }} width={100} />
                    <Tooltip contentStyle={{ background: '#1E293B', border: 'none', fontSize: 12 }} />
                    <Bar dataKey="count" fill={TEAL} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p style={{ color: GRAY, fontSize: 13 }}>Sin datos de funnel aún</p>}
            </div>

            <div style={{ background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: 20 }}>
              <p style={{ color: TEAL, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 14 }}>
                Revenue por Hotel (bookings)
              </p>
              {hotels.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={hotels}>
                    <XAxis dataKey="hotel" tick={{ fill: GRAY, fontSize: 9 }} />
                    <YAxis tick={{ fill: GRAY, fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#1E293B', border: 'none', fontSize: 12 }} />
                    <Bar dataKey="revenue" fill={GOLD} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p style={{ color: GRAY, fontSize: 13 }}>Sin datos de revenue aún</p>}
            </div>
          </div>

          {/* Sección 3: Telemetría VPS y Tareas del Swarm */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 20 }}>
            {/* Tendencias de Servidores / VPS */}
            <div style={{ background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: 20 }}>
              <p style={{ color: TEAL, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 14 }}>
                Salud de Servidores (VPS)
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {vpsData.length > 0 ? vpsData.map((vps, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#E2E8F0' }}>
                      <span style={{ fontWeight: 700 }}>{vps.vps_id}</span>
                      <span style={{ color: GRAY, fontFamily: 'monospace' }}>{vps.mem_pct}% RAM</span>
                    </div>
                    <div style={{ width: '100%', height: 6, background: '#1F2937', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${vps.mem_pct}%`,
                        background: vps.mem_pct > 80 ? RED : vps.mem_pct > 60 ? GOLD : GREEN,
                        borderRadius: 3
                      }}></div>
                    </div>
                  </div>
                )) : <p style={{ color: GRAY, fontSize: 13 }}>Sin registros de VPS recientes</p>}
              </div>
            </div>

            {/* Tareas Pendientes del Swarm */}
            <div style={{ background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: 20 }}>
              <p style={{ color: TEAL, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 14 }}>
                Tareas Pendientes (public.atlas_tasks)
              </p>
              {pendingTasks.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pendingTasks.map((task, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, background: '#1F293740', padding: '8px 10px', borderRadius: 8, border: `1px solid ${GRAY}22` }}>
                      <div>
                        <span style={{ color: GOLD, fontWeight: 700, marginRight: 6 }}>{task.codigo}</span>
                        <span style={{ color: '#E2E8F0' }}>{task.titulo}</span>
                      </div>
                      <span style={{
                        fontSize: 9,
                        fontWeight: 'bold',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: task.prioridad === 'alta' ? `${RED}22` : `${GOLD}22`,
                        color: task.prioridad === 'alta' ? RED : GOLD
                      }}>{task.prioridad.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              ) : <p style={{ color: GRAY, fontSize: 13 }}>Sin tareas pendientes asignadas</p>}
            </div>
          </div>

          {/* Logs Operativos Recientes */}
          <div style={{ background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <p style={{ color: TEAL, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 14 }}>
              Logs de Operación en Caliente (logs_operativos)
            </p>
            {recentLogs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentLogs.map((log, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'start', gap: 12, fontSize: 12, borderBottom: `1px solid ${GRAY}22`, paddingBottom: 8 }}>
                    <span style={{ color: GRAY, fontFamily: 'monospace', fontSize: 11 }}>
                      {new Date(log.created_at).toLocaleTimeString('es-DO')}
                    </span>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 800,
                      padding: '1px 5px',
                      borderRadius: 3,
                      background: log.nivel === 'ERROR' || log.nivel === 'CRITICAL' ? `${RED}22` : log.nivel === 'WARNING' ? `${GOLD}22` : '#1F2937',
                      color: log.nivel === 'ERROR' || log.nivel === 'CRITICAL' ? RED : log.nivel === 'WARNING' ? GOLD : '#94A3B8'
                    }}>{log.nivel}</span>
                    <span style={{ color: '#E2E8F0', flex: 1 }}>{log.mensaje}</span>
                    <span style={{ color: GOLD, fontFamily: 'monospace', fontSize: 11 }}>{log.origen}</span>
                  </div>
                ))}
              </div>
            ) : <p style={{ color: GRAY, fontSize: 13 }}>Sin logs operativos registrados</p>}
          </div>

          {/* Leads Estancados */}
          {stale.length > 0 && (
            <div style={{ background: '#111827', border: `1px solid ${RED}44`, borderRadius: 12, padding: 20 }}>
              <p style={{ color: RED, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>
                ⚠️ {stale.length} Lead{stale.length > 1 ? 's' : ''} Estancado{stale.length > 1 ? 's' : ''} (+7 días sin actividad comercial)
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>{['Nombre', 'Canal', 'Días', 'Stage'].map(h => (
                    <th key={h} style={{ color: GRAY, textAlign: 'left', padding: '6px 10px', borderBottom: `1px solid ${GRAY}33` }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {stale.map((l, i) => (
                    <tr key={i}>
                      <td style={{ padding: '7px 10px', color: '#E2E8F0' }}>{l.nombre || l.full_name || '—'}</td>
                      <td style={{ padding: '7px 10px', color: GRAY }}>{l.canal || '—'}</td>
                      <td style={{ padding: '7px 10px', color: RED, fontWeight: 600 }}>{l.dias_sin_actividad || '—'}</td>
                      <td style={{ padding: '7px 10px', color: GOLD }}>{l.stage || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 2: ATLAS INTEL (RADAR XML MULTI-PROVEEDOR, PARIDAD Y PRE-BOOK CHECK)*/}
      {/* ========================================================================= */}
      {activeTab === 'intel' && (
        <div>
          {/* Barra de Control de Intel: Modos Síncrono vs Asíncrono */}
          <div style={{ background: '#111827', border: `1px solid ${GOLD}44`, borderRadius: 12, padding: 18, marginBottom: 24, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ background: `${GOLD}22`, padding: 10, borderRadius: 10 }}>
                <Radar size={24} color={GOLD} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#F8FAFC' }}>
                  Atlas Intel — Radar de Arbitraje y Feeds XML
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: GRAY }}>
                  Comparativa de proveedores directos en tiempo real, paridad contra Booking y detección de ganchos
                </p>
              </div>
            </div>

            {/* Toggle Síncrono / Asíncrono */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: GRAY }}>Modo Operativo:</span>
              <div style={{ display: 'flex', background: '#1E293B', borderRadius: 8, padding: 3, border: `1px solid ${GRAY}44` }}>
                <button
                  onClick={() => setIntelMode('async')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    background: intelMode === 'async' ? `${TEAL}33` : 'transparent',
                    color: intelMode === 'async' ? TEAL : GRAY
                  }}
                >
                  ⏱️ Asíncrono (Cron 4h)
                </button>
                <button
                  onClick={() => setIntelMode('sync')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    background: intelMode === 'sync' ? `${GOLD}33` : 'transparent',
                    color: intelMode === 'sync' ? GOLD : GRAY
                  }}
                >
                  ⚡ Síncrono (On-Demand)
                </button>
              </div>

              <button
                onClick={handleSimulateSyncCheck}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: `${GOLD}22`,
                  color: GOLD,
                  border: `1px solid ${GOLD}55`,
                  padding: '7px 14px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={14} className={isRefreshingIntel ? 'animate-spin' : ''} />
                {isRefreshingIntel ? 'Consultando XMLs...' : 'Re-Check Proveedores'}
              </button>
            </div>
          </div>

          {/* WIDGET 1: ENRUTADOR MULTI-PROVEEDOR XML (BEST RATE ROUTING) */}
          <div style={{ background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEAL, textTransform: 'uppercase', letterSpacing: 1 }}>
                  🏆 Enrutador Multi-Proveedor XML (Best Net Rate)
                </h4>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: GRAY }}>
                  Comparación paralela de tarifas netas reales para seleccionar automáticamente el proveedor más económico
                </p>
              </div>
              <span style={{ fontSize: 11, background: `${GREEN}22`, color: GREEN, padding: '4px 8px', borderRadius: 6, fontWeight: 700 }}>
                ✓ Zero Price Jump Activo
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {supplierRates.map((item, idx) => (
                <div key={idx} style={{ background: '#1E293B40', border: `1px solid ${GRAY}33`, borderRadius: 10, padding: 16 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: `1px solid ${GRAY}22`, paddingBottom: 8 }}>
                    <div>
                      <span style={{ fontSize: 15, fontWeight: 800, color: '#F8FAFC' }}>{item.hotel}</span>
                      <span style={{ marginLeft: 12, fontSize: 12, color: GRAY }}>📅 {item.dates} · 👥 {item.pax}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 11, background: item.rateType === 'Reembolsable' ? `${GREEN}22` : `${GOLD}22`, color: item.rateType === 'Reembolsable' ? GREEN : GOLD, padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                        {item.rateType}
                      </span>
                      <span style={{ fontSize: 11, background: '#0F172A', color: GRAY, padding: '2px 8px', borderRadius: 4 }}>
                        {item.cancellation}
                      </span>
                    </div>
                  </div>

                  {/* Comparador de Proveedores */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
                    {item.providers.map((prov, pIdx) => (
                      <div
                        key={pIdx}
                        style={{
                          background: prov.isBest ? `${GREEN}15` : '#111827',
                          border: `1px solid ${prov.isBest ? GREEN : GRAY + '33'}`,
                          borderRadius: 8,
                          padding: '10px 12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <p style={{ margin: 0, fontSize: 11, color: prov.isBest ? GREEN : GRAY, fontWeight: 600 }}>
                            {prov.name} {prov.isBest && '👑 MEJOR TARIFA'}
                          </p>
                          <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 800, color: prov.isBest ? '#F8FAFC' : GRAY }}>
                            ${prov.net} <span style={{ fontSize: 10, fontWeight: 400 }}>USD Neto</span>
                          </p>
                        </div>
                        {prov.isBest && (
                          <CheckCircle2 size={18} color={GREEN} />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Desglose de Arbitraje Financiero (Ariadne + Intel) */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', background: '#0F172A', padding: '10px 14px', borderRadius: 8, fontSize: 12 }}>
                    <div style={{ display: 'flex', gap: 20 }}>
                      <span>Ref. Booking/Expedia: <strong style={{ color: RED, textDecoration: 'line-through' }}>${item.publicOTA} USD</strong></span>
                      <span>PVP Recomendado ALIUN: <strong style={{ color: TEAL }}>${item.markupPVP} USD</strong></span>
                      <span>Ganancia Neta por Noche: <strong style={{ color: GREEN }}>+${item.profitUSD} USD</strong></span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={{ background: `${TEAL}22`, color: TEAL, border: `1px solid ${TEAL}44`, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        Ver en Quote/Compare
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* WIDGET 2 & 3: RADAR DE ANUNCIOS META Y EVENTOS DE INTELIGENCIA */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
            {/* Radar de Creativos Meta Ads Library */}
            <div style={{ background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: 1 }}>
                  📢 Radar Meta Ads (Competencia)
                </h4>
                <span style={{ fontSize: 10, color: GRAY }}>Actualizado hoy</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {competitorAds.map((ad, i) => (
                  <div key={i} style={{ background: '#1E293B40', border: `1px solid ${GRAY}22`, borderRadius: 8, padding: 12, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: '#E2E8F0' }}>{ad.agency}</span>
                      <span style={{ fontSize: 10, color: GRAY }}>{ad.detectedAt}</span>
                    </div>
                    <p style={{ margin: '4px 0', color: GOLD, fontStyle: 'italic', background: '#0F172A', padding: '6px 8px', borderRadius: 4 }}>
                      "{ad.hook}"
                    </p>
                    <p style={{ margin: '6px 0 4px', color: '#94A3B8', fontSize: 11 }}>
                      <strong>Auditoría Intel:</strong> {ad.analysis}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, borderTop: `1px solid ${GRAY}22`, paddingTop: 8 }}>
                      <span style={{ color: TEAL, fontSize: 11 }}><strong>Contra-Ataque:</strong> {ad.counterAction}</span>
                      <button style={{ display: 'flex', alignItems: 'center', gap: 4, background: `${GOLD}22`, color: GOLD, border: `1px solid ${GOLD}44`, padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                        <Send size={10} /> Enviar a Mkt
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Eventos Recientes en public.competitive_intel */}
            <div style={{ background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: TEAL, textTransform: 'uppercase', letterSpacing: 1 }}>
                  📡 Registro de Inteligencia (competitive_intel)
                </h4>
                <span style={{ fontSize: 10, color: GRAY }}>Supabase DB</span>
              </div>

              {competitiveFeed.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {competitiveFeed.map((evt, i) => (
                    <div key={i} style={{ background: '#1E293B40', border: `1px solid ${GRAY}22`, borderRadius: 8, padding: 10, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, color: TEAL }}>{evt.tipo?.toUpperCase() || 'EVENTO'}</span>
                        <span style={{ fontSize: 10, color: GRAY }}>{new Date(evt.created_at).toLocaleTimeString('es-DO')}</span>
                      </div>
                      <p style={{ margin: 0, color: '#E2E8F0', fontSize: 11 }}>{evt.detalles || evt.mensaje || JSON.stringify(evt.datos || {})}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: GRAY, fontSize: 12 }}>
                  <ShieldCheck size={32} color={TEAL} style={{ margin: '0 auto 8px', opacity: 0.6 }} />
                  <p style={{ margin: 0 }}>Radar en escucha activa.</p>
                  <p style={{ margin: '4px 0 0', fontSize: 11 }}>Los eventos de sondeo XML (cron cada 4h) se registrarán aquí automáticamente.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
