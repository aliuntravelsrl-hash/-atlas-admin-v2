import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const GOLD = '#B8860B', TEAL = '#2DD4BF', GRAY = '#475569', RED = '#EF4444', GREEN = '#10B981'

export default function AriadnePanel() {
  const [kpis,    setKpis]    = useState(null)
  const [stale,   setStale]   = useState([])
  const [hotels,  setHotels]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  // Nuevos estados para telemetría real (F3-MKT-UI-001)
  const [excCount, setExcCount] = useState(0)
  const [vpsData, setVpsData] = useState([])
  const [pendingTasks, setPendingTasks] = useState([])
  const [recentLogs, setRecentLogs] = useState([])
  const [exchangeRate, setExchangeRate] = useState(58.5)

  useEffect(() => {
    async function load() {
      try {
        const [funnel, staleRes, hotelRes, excBks, vpsMetrics, tasks, logs, rates] = await Promise.all([
          supabase.rpc('funnel_conversion'),
          supabase.rpc('stale_leads'),
          supabase.rpc('revenue_by_hotel'),
          supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('booking_type', 'excursion'),
          supabase.from('vps_metrics').select('vps_id, mem_pct, timestamp').order('timestamp', { ascending: false }).limit(6),
          supabase.from('atlas_tasks').select('*').eq('estado', 'pendiente').order('prioridad', { ascending: false }).limit(5),
          supabase.from('logs_operativos').select('*').order('created_at', { ascending: false }).limit(5),
          supabase.from('exchange_rates').select('rate_sell').limit(1)
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
      } catch(e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:400 }}>
      <p style={{ color: TEAL, fontSize:14 }}>⏳ Ariadne cargando análisis...</p>
    </div>
  )

  if (error) return (
    <div style={{ padding:24 }}>
      <p style={{ color: RED }}>Error: {error}</p>
    </div>
  )

  const stages = Object.entries(kpis?.stages || {}).map(([k,v]) => ({ stage:k, count:v })).filter(s => s.count > 0)
  const rates  = kpis?.conversion_rates || {}

  return (
    <div style={{ padding:24, maxWidth:1100 }}>
      <div style={{ marginBottom:28, borderBottom:`1px solid ${TEAL}44`, paddingBottom:16 }}>
        <h1 style={{ color:'#F8FAFC', fontSize:22, fontWeight:700, margin:0 }}>🧠 Ariadne Data — Panel Analítico</h1>
        <p style={{ color:GRAY, fontSize:13, marginTop:4 }}>F2-Backend Core · RPCs y Telemetría en caliente</p>
      </div>

      {/* Grid de KPIs principales */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:16, marginBottom:24 }}>
        {[
          { label:'Leads Totales',           value: kpis?.total || '—',                                              color:GOLD  },
          { label:'Conversión Global',        value: rates.overall_conversion_pct ? rates.overall_conversion_pct+'%' : '—', color:GOLD  },
          { label:'Reservas Excursión',       value: excCount,                                                       color:TEAL  },
          { label:'Tasa de Cambio (USD/DOP)', value: `RD$ ${exchangeRate}`,                                           color:GREEN },
          { label:'Leads Estancados (+7d)',   value: stale.length, color: stale.length > 0 ? RED : GREEN },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background:'#111827', border:`1px solid ${GRAY}33`, borderRadius:12, padding:'18px 20px' }}>
            <p style={{ color:GRAY, fontSize:11, textTransform:'uppercase', letterSpacing:2, margin:'0 0 8px' }}>{label}</p>
            <p style={{ color, fontSize:26, fontWeight:700, margin:0 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Gráficos principales */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(340px, 1fr))', gap:20, marginBottom:20 }}>
        <div style={{ background:'#111827', border:`1px solid ${GRAY}33`, borderRadius:12, padding:20 }}>
          <p style={{ color:TEAL, fontSize:12, fontWeight:700, textTransform:'uppercase', marginBottom:14 }}>Distribución del Funnel</p>
          {stages.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stages} layout="vertical">
                <XAxis type="number" tick={{ fill:GRAY, fontSize:11 }} />
                <YAxis dataKey="stage" type="category" tick={{ fill:'#CBD5E1', fontSize:11 }} width={100} />
                <Tooltip contentStyle={{ background:'#1E293B', border:'none', fontSize:12 }} />
                <Bar dataKey="count" fill={TEAL} radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p style={{ color:GRAY, fontSize:13 }}>Sin datos de funnel aún</p>}
        </div>

        <div style={{ background:'#111827', border:`1px solid ${GRAY}33`, borderRadius:12, padding:20 }}>
          <p style={{ color:TEAL, fontSize:12, fontWeight:700, textTransform:'uppercase', marginBottom:14 }}>Revenue por Hotel</p>
          {hotels.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hotels}>
                <XAxis dataKey="hotel" tick={{ fill:GRAY, fontSize:9 }} />
                <YAxis tick={{ fill:GRAY, fontSize:11 }} />
                <Tooltip contentStyle={{ background:'#1E293B', border:'none', fontSize:12 }} />
                <Bar dataKey="revenue" fill={GOLD} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p style={{ color:GRAY, fontSize:13 }}>Sin datos de revenue aún</p>}
        </div>
      </div>

      {/* Sección 3: Telemetría VPS y Tareas del Swarm */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(340px, 1fr))', gap:20, marginBottom:20 }}>
        {/* Tendencias de Servidores / VPS */}
        <div style={{ background:'#111827', border:`1px solid ${GRAY}33`, borderRadius:12, padding:20 }}>
          <p style={{ color:TEAL, fontSize:12, fontWeight:700, textTransform:'uppercase', marginBottom:14 }}>Salud de Servidores (VPS)</p>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {vpsData.length > 0 ? vpsData.map((vps, i) => (
              <div key={i} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <div style={{ display:'flex', justifyContent:'between', fontSize:11, color:'#E2E8F0' }}>
                  <span style={{ fontWeight:700 }}>{vps.vps_id}</span>
                  <span style={{ color:GRAY, marginLeft:'auto', fontFamily:'monospace' }}>{vps.mem_pct}% RAM</span>
                </div>
                <div style={{ width:'100%', height:6, background:'#1F2937', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ 
                    height:'100%', 
                    width:`${vps.mem_pct}%`, 
                    background: vps.mem_pct > 80 ? RED : vps.mem_pct > 60 ? GOLD : GREEN,
                    borderRadius:3 
                  }}></div>
                </div>
              </div>
            )) : <p style={{ color:GRAY, fontSize:13 }}>Sin registros de VPS recientes</p>}
          </div>
        </div>

        {/* Tareas Pendientes del Swarm */}
        <div style={{ background:'#111827', border:`1px solid ${GRAY}33`, borderRadius:12, padding:20 }}>
          <p style={{ color:TEAL, fontSize:12, fontWeight:700, textTransform:'uppercase', marginBottom:14 }}>Tareas Pendientes (Swarm)</p>
          {pendingTasks.length > 0 ? (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {pendingTasks.map((task, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:12, background:'#1F2937/40', padding:'8px 10px', borderRadius:8, border:`1px solid ${GRAY}22` }}>
                  <div>
                    <span style={{ color:GOLD, fontWeight:700, marginRight:6 }}>{task.codigo}</span>
                    <span style={{ color:'#E2E8F0' }}>{task.titulo}</span>
                  </div>
                  <span style={{ 
                    fontSize:9, 
                    fontWeight:'bold', 
                    padding:'2px 6px', 
                    borderRadius:4, 
                    background: task.prioridad === 'alta' ? `${RED}22` : `${GOLD}22`,
                    color: task.prioridad === 'alta' ? RED : GOLD
                  }}>{task.prioridad.toUpperCase()}</span>
                </div>
              ))}
            </div>
          ) : <p style={{ color:GRAY, fontSize:13 }}>Sin tareas pendientes asignadas</p>}
        </div>
      </div>

      {/* Logs Operativos Recientes */}
      <div style={{ background:'#111827', border:`1px solid ${GRAY}33`, borderRadius:12, padding:20, marginBottom:20 }}>
        <p style={{ color:TEAL, fontSize:12, fontWeight:700, textTransform:'uppercase', marginBottom:14 }}>Logs de Operación Recientes</p>
        {recentLogs.length > 0 ? (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {recentLogs.map((log, i) => (
              <div key={i} style={{ display:'flex', alignItems:'start', gap:12, fontSize:12, borderBottom:`1px solid ${GRAY}22`, paddingBottom:8 }}>
                <span style={{ color:GRAY, fontFamily:'monospace', fontSize:11 }}>
                  {new Date(log.created_at).toLocaleTimeString('es-DO')}
                </span>
                <span style={{ 
                  fontSize:9, 
                  fontWeight:800, 
                  padding:'1px 5px', 
                  borderRadius:3, 
                  background: log.nivel === 'ERROR' || log.nivel === 'CRITICAL' ? `${RED}22` : log.nivel === 'WARNING' ? `${GOLD}22` : '#1F2937',
                  color: log.nivel === 'ERROR' || log.nivel === 'CRITICAL' ? RED : log.nivel === 'WARNING' ? GOLD : '#94A3B8'
                }}>{log.nivel}</span>
                <span style={{ color:'#E2E8F0', flex:1 }}>{log.mensaje}</span>
                <span style={{ color:GOLD, fontFamily:'monospace', fontSize:11 }}>{log.origen}</span>
              </div>
            ))}
          </div>
        ) : <p style={{ color:GRAY, fontSize:13 }}>Sin logs operativos registrados</p>}
      </div>

      {/* Leads Estancados */}
      {stale.length > 0 && (
        <div style={{ background:'#111827', border:`1px solid ${RED}44`, borderRadius:12, padding:20 }}>
          <p style={{ color:RED, fontSize:12, fontWeight:700, textTransform:'uppercase', marginBottom:12 }}>
            ⚠️ {stale.length} Lead{stale.length > 1 ? 's' : ''} Estancado{stale.length > 1 ? 's' : ''} (+7 días)
          </p>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr>{['Nombre','Canal','Días','Stage'].map(h => (
                <th key={h} style={{ color:GRAY, textAlign:'left', padding:'6px 10px', borderBottom:`1px solid ${GRAY}33` }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {stale.map((l,i) => (
                <tr key={i}>
                  <td style={{ padding:'7px 10px', color:'#E2E8F0' }}>{l.nombre || l.full_name || '—'}</td>
                  <td style={{ padding:'7px 10px', color:GRAY }}>{l.canal || '—'}</td>
                  <td style={{ padding:'7px 10px', color:RED, fontWeight:600 }}>{l.dias_sin_actividad || '—'}</td>
                  <td style={{ padding:'7px 10px', color:GOLD }}>{l.stage || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
