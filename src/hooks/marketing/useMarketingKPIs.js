import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'

export function useMarketingKPIs() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    async function fetchAll() {
      try {
        const now   = new Date()
        const from  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
        const to    = now.toISOString().split('T')[0]

        const [funnel, revenue, pipeline, swarmRes, bookingsRes, chatsRes] = await Promise.all([
          supabase.rpc('funnel_conversion'),
          supabase.rpc('revenue_by_period', { p_from: from, p_to: to }).catch(() => ({ data: null })),
          supabase.rpc('crm_pipeline_stats').catch(() => ({ data: null })),
          supabase.from('personal_ia')
            .select('nombre_agente, estado, ultimo_heartbeat, tarea_actual')
            .in('nombre_agente', ['Hermes Marketing','Hermes Commercial','Ariadne Data','Hermes Ops','Hermes-QA']),
          supabase.from('bookings')
            .select('booking_reference, lead_guest_name, total_amount, payment_status, status, check_in')
            .not('status', 'in', '("cancelled","completed")')
            .order('created_at', { ascending: false }).limit(10),
          supabase.from('conversaciones')
            .select('canal, timestamp, top_score, intencion')
            .order('timestamp', { ascending: false }).limit(200),
        ])

        const fData   = funnel.data   || {}
        const fStages = fData.stages  || {}
        const fRates  = fData.conversion_rates || {}
        const revData = revenue.data  || {}

        const chats = chatsRes.data || []
        const channelCounts = {}
        let totalScore = 0, scoredCount = 0
        chats.forEach(c => {
          const ch = c.canal || 'web'
          channelCounts[ch] = (channelCounts[ch] || 0) + 1
          if (c.top_score > 0) { totalScore += c.top_score; scoredCount++ }
        })

        setData({
          kpis: {
            leads_total:      fData.total || 0,
            conversion_pct:   fRates.overall_conversion_pct || 0,
            cotizados:        fStages.cotizado || 0,
            confirmadas:      fStages.confirmada || 0,
            revenue_mes_dop:  revData.total_ingresos_dop || 0,
            reservas_activas: bookingsRes.data?.length || 0,
            chats_total:      chats.length,
            avg_rag_score:    scoredCount > 0 ? (totalScore / scoredCount).toFixed(2) : 0,
          },
          funnel:        fData,
          pipeline:      pipeline.data || {},
          swarm:         swarmRes.data || [],
          bookings:      bookingsRes.data || [],
          chatwoot:      { chats, channelCounts },
        })
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
    const interval = setInterval(fetchAll, 60000)
    return () => clearInterval(interval)
  }, [])

  return { data, loading, error }
}
