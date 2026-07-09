import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const GOLD = '#B8860B', TEAL = '#2DD4BF', GRAY = '#475569', RED = '#EF4444', GREEN = '#10B981'

export default function AriadnePanel() {
  const [kpis,    setKpis]    = useState(null)
  const [stale,   setStale]   = useState([])
  const [hotels,  setHotels]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [funnel, staleRes, hotelRes] = await Promise.all([
        supabase.rpc('funnel_conversion'),
        supabase.rpc('stale_leads').catch(() => ({ data: [] })),
        supabase.rpc('revenue_by_hotel').catch(() => ({ data: [] })),
      ])
      const f = funnel.data || {}
      setKpis(f)
      setStale(staleRes.data || [])
      setHotels((hotelRes.data || []).slice(0, 8))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
      <p style={{ color: TEAL, fontSize: 14 }}>⏳ Ariadne cargando análisis...</p>
    </div>
  )

  const stages = Object.entries(kpis?.stages || {}).map(([k, v]) => ({ stage: k, count: v })).filter(s => s.count > 0)
  const rates  = kpis?.conversion_rates || {}

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ marginBottom: 28, borderBottom: `1px solid ${TEAL}44`, paddingBottom: 16 }}>
        <h1 style={{ color: '#F8FAFC', fontSize: 22, fontWeight: 700, margin: 0 }}>🧠 Ariadne Data — Panel Analítico</h1>
        <p style={{ color: GRAY, fontSize: 13, marginTop: 4 }}>F2-Backend Core · RPCs en tiempo real · funnel + revenue + leads estancados</p>
      </div>

      {/* Tasas de conversión */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Leads Totales',            value: kpis?.total || '—',                                     color: GOLD  },
          { label: 'Nuevo → Cotizado',          value: rates.nuevo_to_cotizado_pct  ? rates.nuevo_to_cotizado_pct + '%' : '—',  color: TEAL  },
          { label: 'Cotizado → Confirmado',     value: rates.cotizado_to_confirmada_pct ? rates.cotizado_to_confirmada_pct + '%' : '—', color: GREEN },
          { label: 'Conversión Global',         value: rates.overall_conversion_pct ? rates.overall_conversion_pct + '%' : '—', color: GOLD  },
          { label: 'Leads Estancados (+7d)',    value: stale.length,                                           color: stale.length > 0 ? RED : GREEN },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: '18px 20px' }}>
            <p style={{ color: GRAY, fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 8px' }}>{label}</p>
            <p style={{ color, fontSize: 26, fontWeight: 700, margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Funnel stages */}
        <div style={{ background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: 20 }}>
          <p style={{ color: TEAL, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 14 }}>Distribución del Funnel</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stages} layout="vertical">
              <XAxis type="number" tick={{ fill: GRAY, fontSize: 11 }} />
              <YAxis dataKey="stage" type="category" tick={{ fill: '#CBD5E1', fontSize: 11 }} width={100} />
              <Tooltip contentStyle={{ background: '#1E293B', border: 'none', fontSize: 12 }} />
              <Bar dataKey="count" fill={TEAL} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue por hotel */}
        <div style={{ background: '#111827', border: `1px solid ${GRAY}33`, borderRadius: 12, padding: 20 }}>
          <p style={{ color: TEAL, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 14 }}>Revenue por Hotel (top 8)</p>
          {hotels.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hotels}>
                <XAxis dataKey="hotel" tick={{ fill: GRAY, fontSize: 9 }} />
                <YAxis tick={{ fill: GRAY, fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1E293B', border: 'none', fontSize: 12 }} />
                <Bar dataKey="revenue" fill={GOLD} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p style={{ color: GRAY, fontSize: 13 }}>Sin datos de revenue por hotel aún</p>}
        </div>
      </div>

      {/* Leads estancados */}
      {stale.length > 0 && (
        <div style={{ background: '#111827', border: `1px solid ${RED}44`, borderRadius: 12, padding: 20 }}>
          <p style={{ color: RED, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>
            ⚠️ {stale.length} Lead{stale.length > 1 ? 's' : ''} Estancado{stale.length > 1 ? 's' : ''} (+7 días sin actividad)
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>{['Nombre','Canal','Días sin actividad','Stage'].map(h => (
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
  )
}
