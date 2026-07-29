import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'

export function useMarketingKPIs() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    async function fetchAll() {
      try {
        const [funnel, pipeline, swarmRes, bookingsRes, chatsRes, rates, revenueRes, excBks, openRouterLogs, swarmTasks] = await Promise.all([
          supabase.rpc('funnel_conversion'),
          supabase.rpc('crm_pipeline_stats'),
          supabase.from('personal_ia')
            .select('nombre_agente, estado, ultimo_heartbeat')
            .in('nombre_agente', ['Hermes Marketing','Hermes Commercial','Ariadne Data','Hermes Ops','Hermes-QA']),
          supabase.from('bookings')
            .select('booking_reference, lead_guest_name, total_amount, payment_status, check_in')
            .not('status', 'in', '("cancelled","completed")')
            .order('created_at', { ascending: false }).limit(10),
          supabase.from('conversaciones')
            .select('canal, timestamp, top_score')
            .order('timestamp', { ascending: false }).limit(200),
          supabase.from('exchange_rates').select('rate_sell').limit(1),
          supabase.rpc('revenue_by_hotel'),
          supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('booking_type', 'excursion'),
          supabase.from('logs_operativos').select('*').eq('evento', 'OPENROUTER_CRITICO').order('created_at', { ascending: false }).limit(3),
          supabase.from('atlas_tasks')
            .select('*')
            .in('asignado_a', ['hermes-marketing', 'hermes-commercial'])
            .order('created_at', { ascending: false }).limit(5)
        ])

        const fData   = funnel.data   || {}
        const fStages = fData.stages  || {}
        const fRates  = fData.conversion_rates || {}

        const chats = chatsRes.data || []
        const channelCounts = {}
        let totalScore = 0, scoredCount = 0
        chats.forEach(c => {
          const ch = c.canal || 'web'
          channelCounts[ch] = (channelCounts[ch] || 0) + 1
          if (c.top_score > 0) { totalScore += c.top_score; scoredCount++ }
        })

        const activeRate = rates.data && rates.data.length > 0 ? parseFloat(rates.data[0].rate_sell) : 58.5
        const totalRevUSD = (revenueRes.data || []).reduce((sum, h) => sum + parseFloat(h.revenue_usd || 0), 0)

        setData({
          kpis: {
            leads_total:      fData.total || 0,
            conversion_pct:   fRates.overall_conversion_pct || 0,
            cotizados:        fStages.cotizado || 0,
            confirmadas:      fStages.confirmada || 0,
            reservas_activas: bookingsRes.data?.length || 0,
            chats_total:      chats.length,
            avg_rag_score:    scoredCount > 0 ? (totalScore / scoredCount).toFixed(2) : 0,
            excursions_count: excBks.count || 0,
            revenue_usd:      totalRevUSD,
            revenue_dop:      totalRevUSD * activeRate,
            exchange_rate:    activeRate
          },
          funnel:    fData,
          pipeline:  pipeline.data || {},
          swarm:     swarmRes.data || [],
          bookings:  bookingsRes.data || [],
          chatwoot:  { chats, channelCounts },
          openrouter: openRouterLogs.data || [],
          tasks:     swarmTasks.data || []
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
