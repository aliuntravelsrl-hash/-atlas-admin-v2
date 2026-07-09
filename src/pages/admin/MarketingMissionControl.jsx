import { useMarketingKPIs } from '../../hooks/marketing/useMarketingKPIs'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const NAVY = '#0A1628'
const GOLD = '#B8860B'
const TEAL = '#2DD4BF'
const GREEN = '#10B981'
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
      <p style={{ color: GOLD, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>Swarm F3</p>
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
        <p style={{ color: GRAY, fontSize: 13, marginTop: 4 }}>F3-Atracción · datos en tiempo real desde Ariadne Data</p>
      </div>

      {/* KPIs row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <KPICard label="Leads CRM" value={kpis.leads_total || '—'} sub="Todos los stages" />
        <KPICard label="Cotizados" value={kpis.cotizados || '—'} sub="Stage cotizado" color={TEAL} />
        <KPICard label="Confirmadas" value={kpis.confirmadas || '—'} sub="Reservas confirmadas" color={GREEN} />
        <KPICard label="Conversión" value={kpis.conversion_pct ? kpis.conversion_pct + '%' : '—'} sub="Global del funnel" />
        <KPICard label="Reservas activas" value={kpis.reservas_activas || '—'} sub="Últimas 10" color={TEAL} />
        <KPICard label="Chats Hermes" value={kpis.chats_total || '—'} sub={`Score prom: ${kpis.avg_rag_score}`} />
      </div>

      {/* Charts + Swarm */}
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

        {/* Swarm */}
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
