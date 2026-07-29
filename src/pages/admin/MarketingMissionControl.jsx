import { useMarketingKPIs } from '../../hooks/marketing/useMarketingKPIs'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const GOLD = '#B8860B'
const TEAL = '#2DD4BF'
const GREEN = '#10B981'
const RED = '#EF4444'
const GRAY = '#475569'

function KPICard({ label, value, sub, color = GOLD }) {
  return (
    <div style={{ background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: '20px 24px' }}>
      <p style={{ color: GRAY, fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 8px' }}>{label}</p>
      <p style={{ color, fontSize: 28, fontWeight: 700, margin: 0 }}>{value}</p>
      {sub && <p style={{ color: GRAY, fontSize: 11, marginTop: 6 }}>{sub}</p>}
    </div>
  )
}

function SwarmStatus({ swarm }) {
  const agents = [
    { key: 'Hermes Marketing',  label: 'H. Marketing'  },
    { key: 'Hermes Commercial', label: 'H. Commercial' },
    { key: 'Ariadne Data',      label: 'Ariadne'       },
    { key: 'Hermes Ops',        label: 'H. Ops'        },
    { key: 'Hermes-QA',         label: 'QA'            },
  ]
  return (
    <div style={{ background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: 20 }}>
      <p style={{ color: GOLD, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>Estado Swarm F3</p>
      {agents.map(({ key, label }) => {
        const a = swarm?.find(s => s.nombre_agente === key)
        const online = a?.estado === 'online'
        const hb = a?.ultimo_heartbeat ? new Date(a.ultimo_heartbeat).toLocaleTimeString('es-DO') : '—'
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${GRAY}22` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: online ? GREEN : GRAY, boxShadow: online ? `0 0 6px ${GREEN}` : 'none' }} />
              <span style={{ color: '#E2E8F0', fontSize: 13 }}>{label}</span>
            </div>
            <span style={{ color: GRAY, fontSize: 11 }}>{hb}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function MarketingMissionControl() {
  const { data, loading, error } = useMarketingKPIs()

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
      <p style={{ color: GOLD, fontSize: 14 }}>⏳ Cargando datos de Ariadne...</p>
    </div>
  )

  if (error) return (
    <div style={{ padding: 24 }}>
      <p style={{ color: '#EF4444' }}>Error al cargar datos: {error}</p>
    </div>
  )

  const kpis = data?.kpis || {}
  const funnelStages = Object.entries(data?.funnel?.stages || {})
    .map(([stage, count]) => ({ stage, count }))
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count)

  const channelData = Object.entries(data?.chatwoot?.channelCounts || {})
    .map(([canal, count]) => ({ canal, count }))

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 28, borderBottom: `1px solid ${GOLD}44`, paddingBottom: 16 }}>
        <h1 style={{ color: '#F8FAFC', fontSize: 22, fontWeight: 700, margin: 0 }}>📢 Marketing Mission Control</h1>
        <p style={{ color: GRAY, fontSize: 13, marginTop: 4 }}>F3-Atracción · Datos unificados DOP/USD en tiempo real</p>
      </div>

      {/* ── SECCIÓN 1: KPIs y Finanzas (F3-MKT-UI-001) ── */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ color: TEAL, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', trackingSpacing: 2, marginBottom: 12 }}>
          📊 KPIs y Métricas Financieras
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <KPICard label="Leads CRM" value={kpis.leads_total || '—'} sub="Todos los stages del funnel" />
          <KPICard label="Excursiones" value={kpis.excursions_count || '0'} sub="Reservas excursiones" color={TEAL} />
          <KPICard label="Monto Facturado (USD)" value={`$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(kpis.revenue_usd || 0)}`} sub="Total reservas confirmadas" color={GREEN} />
          <KPICard label="Equivalente (DOP)" value={`RD$ ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(kpis.revenue_dop || 0)}`} sub={`Tasa de cambio: RD$ ${kpis.exchange_rate}`} color={GREEN} />
          <KPICard label="Conversión Global" value={kpis.conversion_pct ? kpis.conversion_pct + '%' : '—'} sub="Porcentaje de éxito" />
        </div>
      </div>

      {/* ── SECCIÓN 2: Salud e Infraestructura ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 24 }}>
        {/* Alertas OpenRouter */}
        <div style={{ background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: 20 }}>
          <p style={{ color: GOLD, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 14 }}>Alertas OpenRouter & IA</p>
          {data.openrouter && data.openrouter.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.openrouter.map((log, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'start', gap: 10, fontSize: 12, background: `${RED}11`, border: `1px solid ${RED}33`, padding: 10, borderRadius: 8 }}>
                  <span style={{ color: RED, fontWeight: 700 }}>⚠️</span>
                  <div>
                    <span style={{ color: '#F8FAFC', fontWeight: 650, block: 'true' }}>{log.mensaje}</span>
                    <span style={{ color: GRAY, fontSize: 10, display: 'block', marginTop: 3 }}>
                      {new Date(log.created_at).toLocaleString('es-DO')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: GREEN, fontSize: 13, background: `${GREEN}11`, border: `1px solid ${GREEN}33`, padding: 12, borderRadius: 8 }}>
              <span>🟢</span>
              <span>Créditos y conexión de OpenRouter estables.</span>
            </div>
          )}
        </div>

        {/* Tareas del Swarm de Marketing / Comercial */}
        <div style={{ background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: 20 }}>
          <p style={{ color: GOLD, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 14 }}>Tareas Swarm (Marketing / Comercial)</p>
          {data.tasks && data.tasks.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.tasks.map((task, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, background: '#1F2937/40', padding: 8, borderRadius: 8, border: `1px solid ${GRAY}22` }}>
                  <div>
                    <span style={{ color: GOLD, fontWeight: 700, marginRight: 6 }}>{task.codigo}</span>
                    <span style={{ color: '#E2E8F0' }}>{task.titulo}</span>
                  </div>
                  <span style={{ 
                    fontSize: 9, 
                    fontWeight: 'bold', 
                    padding: '2px 5px', 
                    borderRadius: 4, 
                    background: task.estado === 'completado' ? `${GREEN}22` : `${GOLD}22`,
                    color: task.estado === 'completado' ? GREEN : GOLD
                  }}>{task.estado.toUpperCase()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: GRAY, fontSize: 13 }}>Sin tareas recientes asignadas.</p>
          )}
        </div>
      </div>

      {/* ── SECCIÓN 3: Gráficos de Conversión y Canales ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 280px', gap: 20 }}>
        {/* Funnel */}
        <div style={{ background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: 20 }}>
          <p style={{ color: GOLD, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 16 }}>Funnel CRM</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={funnelStages} layout="vertical">
              <XAxis type="number" tick={{ fill: GRAY, fontSize: 11 }} />
              <YAxis dataKey="stage" type="category" tick={{ fill: '#E2E8F0', fontSize: 11 }} width={90} />
              <Tooltip contentStyle={{ background: '#1E293B', border: 'none', fontSize: 12 }} />
              <Bar dataKey="count" fill={GOLD} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Canales Chatwoot */}
        <div style={{ background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: 20 }}>
          <p style={{ color: GOLD, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 16 }}>Canales Chatwoot (últimas 200)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={channelData}>
              <XAxis dataKey="canal" tick={{ fill: GRAY, fontSize: 11 }} />
              <YAxis tick={{ fill: GRAY, fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1E293B', border: 'none', fontSize: 12 }} />
              <Bar dataKey="count" fill={TEAL} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Swarm Status */}
        <SwarmStatus swarm={data?.swarm} />
      </div>

      {/* Reservas recientes */}
      {data?.bookings?.length > 0 && (
        <div style={{ marginTop: 20, background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: 20 }}>
          <p style={{ color: GOLD, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>Reservas activas recientes</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>{['Ref','Huésped','Total USD','Status Pago','Check-in'].map(h => (
                  <th key={h} style={{ color: GRAY, textAlign: 'left', padding: '6px 12px', borderBottom: `1px solid ${GRAY}33` }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {data.bookings.map(b => (
                  <tr key={b.booking_reference}>
                    <td style={{ padding: '8px 12px', color: GOLD, fontWeight: 600 }}>{b.booking_reference}</td>
                    <td style={{ padding: '8px 12px', color: '#E2E8F0' }}>{b.lead_guest_name}</td>
                    <td style={{ padding: '8px 12px', color: '#E2E8F0' }}>${parseFloat(b.total_amount||0).toFixed(2)}</td>
                    <td style={{ padding: '8px 12px', color: b.payment_status==='paid' ? GREEN : '#F59E0B' }}>{b.payment_status}</td>
                    <td style={{ padding: '8px 12px', color: GRAY }}>{b.check_in}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
