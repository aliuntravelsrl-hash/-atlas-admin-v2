/**
 * BookingOpsPanel.jsx
 * Panel Operativo de Reservas — Aliun Travel SRL
 * Core 2: Gestión manual de reservas de hoteles y excursiones
 * Ruta: /dashboard26
 *
 * Tabs:
 *   1 — Nueva reserva (hotel)
 *   2 — Reservas (listado)
 *   3 — Registrar pago
 *   4 — Recibo
 *   5 — Reserva de excursión (nuevo)
 *
 * ATLAS-TECH · 11 JUN 2026
 */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

// ── Clientes Supabase ────────────────────────────────────────
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL || 'https://oyihiyivdhfxpyiwnmqk.supabase.co';
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95aWhpeWl2ZGhmeHB5aXdubXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0Mzk5NzUsImV4cCI6MjA3ODAxNTk3NX0.8jbifKF9FCExFN3PF1OeUFDVRoHyf652vMHpIgR1DSE';
const SUPA_SERVICE = import.meta.env.VITE_SUPABASE_SERVICE_KEY || SUPA_ANON;

const supabase = createClient(SUPA_URL, SUPA_ANON)
const supabaseAdmin = createClient(SUPA_URL, SUPA_SERVICE)

// ── Moneda por nacionalidad ───────────────────────────────────
// TASA: se lee de exchange_rates via useExchangeRate() dentro del componente
// Estas funciones reciben 'rate' como parámetro para ser puras y dinámicas
const getCurrency = (nat) => nat === 'DO' ? 'DOP' : 'USD'
const fmtMoney = (amountUsd, nat, rate = 58.5) => {
  if (getCurrency(nat) === 'DOP') return `RD$ ${Math.round((parseFloat(amountUsd) || 0) * rate).toLocaleString('es-DO')}`
  return `$${(parseFloat(amountUsd) || 0).toFixed(2)} USD`
}
// Convierte input del usuario a USD canónico para guardar en DB
// DOP: el usuario ingresa en pesos → dividir por tasa para obtener USD
// USD: el usuario ingresa en dólares → guardar directo
const toUSD = (amount, nat, rate = 58.5) =>
  getCurrency(nat) === 'DOP'
    ? parseFloat(((parseFloat(amount) || 0) / rate).toFixed(2))
    : (parseFloat(amount) || 0)

// ── Webhooks de documentos ────────────────────────────────────
import { useExchangeRate } from '@/hooks/useExchangeRate'

const N8N_BASE = 'https://n8n-n8n.xaruuo.easypanel.host/webhook'
const WF_VOUCHER        = `${N8N_BASE}/aliun-voucher`
const WF_CONFIRMACION   = `${N8N_BASE}/aliun-cotizacion-individual`
const WF_COTIZACION     = `${N8N_BASE}/aliun-cotizacion-individual`
const WF_EXCURSION_DOC  = `${N8N_BASE}/aliun-excursion-doc`
const WF_RECIBO         = `${N8N_BASE}/aliun-recibo-abono`

// ── Utilidades ───────────────────────────────────────────────
const fmt = (n) => parseFloat(n || 0).toFixed(2)
// FIX 2026-07-08 (ATLAS-TECH): antes usaba solo Date.now(), que colisiona
// cuando se generan varias referencias en el mismo milisegundo (reservas
// grupales con rows.map). Esto provocaba violación del UNIQUE(booking_reference)
// y el rollback silencioso de TODO el insert grupal. Ahora se agrega un
// componente aleatorio por llamada para garantizar unicidad dentro del batch.
const genRef = () => {
  const rand = Math.random().toString(36).toUpperCase().slice(2, 5)
  return 'ALN-' + Date.now().toString(36).toUpperCase().slice(-4) + rand
}
const calcNights = (ci, co) =>
  ci && co ? Math.round((new Date(co) - new Date(ci)) / 86400000) : 0

// ── Tab Bar ──────────────────────────────────────────────────
const TABS = [
  { id: 'nueva',      label: '+ Nueva reserva' },
  { id: 'listado',    label: 'Reservas' },
  { id: 'pago',       label: 'Registrar pago' },
  { id: 'recibo',     label: 'Recibo' },
  { id: 'excursion',  label: '🌴 Excursión' },
]

// ── Métodos de pago ──────────────────────────────────────────
const METODOS_DO = [
  { value: 'transferencia', label: 'Transferencia bancaria (Azul/Popular)' },
  { value: 'efectivo',      label: 'Efectivo en oficina' },
  { value: 'enlace_pago',   label: 'Enlace de pago' },
]
const METODOS_USD = [
  { value: 'zelle',         label: 'Zelle' },
  { value: 'paypal',        label: 'PayPal' },
  { value: 'tarjeta',       label: 'Tarjeta (Stripe)' },
  { value: 'transferencia', label: 'Transferencia internacional' },
]
const getMetodos = (nationality) => getCurrency(nationality) === 'DOP' ? METODOS_DO : METODOS_USD
// Compatibilidad con usos directos de METODOS
const METODOS = [...METODOS_DO, ...METODOS_USD]

// ════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════
export default function BookingOpsPanel() {
  const [activeTab, setActiveTab]           = useState('nueva')
  const [toast, setToast]                   = useState(null)
  const [bookings, setBookings]             = useState([])
  const [hotels, setHotels]                 = useState([])
  const [reciboBookingId, setReciboBookingId] = useState('')
  const [crmLeads, setCrmLeads]             = useState([])

  // ── Tasa de cambio dinámica desde exchange_rates ──────────────
  const { rate: EXCHANGE_RATE } = useExchangeRate()

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  // Cargar hoteles y reservas al montar
  useEffect(() => {
    supabase
      .from('hotels_master')
      .select('id, slug, name, zone')
      .eq('is_active', true)
      .order('zone')
      .then(({ data }) => setHotels(data || []))

    loadBookings()
    loadCrmLeads()
  }, [])

  const loadCrmLeads = useCallback(async () => {
    const { data } = await supabaseAdmin
      .from('crm_leads')
      .select('id, full_name, phone, email')
      .order('updated_at', { ascending: false })
    setCrmLeads(data || [])
  }, [])

  const loadBookings = useCallback(async () => {
    const { data } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(60)
    setBookings(data || [])
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Operaciones · Reservas Core 2</h1>
          <p className="text-sm text-gray-400 mt-0.5">Panel manual · Aliun Travel SRL</p>
        </div>
        <span className="text-xs text-emerald-400 border border-emerald-800 px-3 py-1 rounded-full">
          ● Conectado
        </span>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
          toast.type === 'success'
            ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-800'
            : 'bg-red-900/50 text-red-300 border border-red-800'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-gray-800 mb-6">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-white text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      {activeTab === 'nueva' && (
        <TabNuevaReserva
          hotels={hotels}
          crmLeads={crmLeads}
          onRefreshLeads={loadCrmLeads}
          onCreated={(ref) => {
            showToast(`✓ Reserva creada: ${ref}`)
            loadBookings()
            setActiveTab('listado')
          }}
          onError={(e) => showToast(e, 'error')}
        />
      )}

      {activeTab === 'listado' && (
        <TabListado
          bookings={bookings}
          hotels={hotels}
          onConfirm={async (id, ref) => {
            await supabaseAdmin.from('bookings').update({
              status: 'confirmed',
              fulfillment_status: 'confirmed',
              validated_by: 'admin',
              validated_at: new Date().toISOString(),
            }).eq('id', id)
            showToast(`✓ Reserva ${ref} confirmada`)
            loadBookings()
          }}
          onCancel={async (id, ref) => {
            if (!confirm(`¿Cancelar la reserva ${ref}?`)) return
            await supabaseAdmin.from('bookings').update({
              status: 'cancelled',
              payment_status: 'cancelled',
            }).eq('id', id)
            showToast(`Reserva ${ref} cancelada`, 'error')
            loadBookings()
          }}
          onPago={(id) => setActiveTab('pago')}
          onRecibo={(id) => { setActiveTab('recibo'); setReciboBookingId(id); }}
        />
      )}

      {activeTab === 'pago' && (
        <TabPago
          bookings={bookings}
          onRegistered={async () => {
            showToast('✓ Abono registrado correctamente')
            await loadBookings()
          }}
          onError={(e) => showToast(e, 'error')}
        />
      )}

      {activeTab === 'recibo' && (
        <TabRecibo bookings={bookings} hotels={hotels} initialBookingId={reciboBookingId} />
      )}

      {activeTab === 'excursion' && (
        <TabExcursion
          crmLeads={crmLeads}
          onRefreshLeads={loadCrmLeads}
          onCreated={(ref) => {
            showToast(`✓ Reserva de excursión creada: ${ref}`)
            loadBookings()
            setActiveTab('listado')
          }}
          onError={(e) => showToast(e, 'error')}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// TAB 1 — NUEVA RESERVA (HOTEL)
// ════════════════════════════════════════════════════════════
// Bloque de una habitación dentro del formulario multi-room
function HabitacionBlock({ idx, hab, rooms, onChange, onRemove, canRemove, nationality }) {
  const cur = getCurrency(nationality)
  const priceLbl = `Precio de esta habitación (${cur}) *`
  return (
    <div className="bg-gray-900 rounded-lg p-4 space-y-3 border border-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Habitación {idx + 1}</span>
        {canRemove && (
          <button onClick={() => onRemove(idx)} className="text-red-500 hover:text-red-400 text-sm font-bold">✕ Quitar</button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Tipo de habitación">
          <select className={selectCls} value={hab.room_id} onChange={e => onChange(idx, 'room_id', e.target.value)}>
            <option value="">Sin habitación específica</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Nombre del huésped (esta hab.)">
          <input className={inputCls} type="text" placeholder="Juan Pérez" value={hab.guest_name} onChange={e => onChange(idx, 'guest_name', e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Adultos *">
          <input className={inputCls} type="number" min="1" value={hab.adults} onChange={e => onChange(idx, 'adults', e.target.value)} />
        </Field>
        <Field label="Niños (2–11)">
          <input className={inputCls} type="number" min="0" value={hab.children} onChange={e => onChange(idx, 'children', e.target.value)} />
        </Field>
        <Field label="Infantes (0–1)">
          <input className={inputCls} type="number" min="0" value={hab.infants} onChange={e => onChange(idx, 'infants', e.target.value)} />
        </Field>
      </div>
      <Field label={priceLbl}>
        <input className={inputCls} type="number" step="0.01" min="0" placeholder="0.00" value={hab.precio} onChange={e => onChange(idx, 'precio', e.target.value)} />
      </Field>
    </div>
  )
}

const blankHab = () => ({ room_id: '', guest_name: '', adults: 2, children: 0, infants: 0, precio: '' })

function TabNuevaReserva({ hotels, crmLeads = [], onRefreshLeads, onCreated, onError }) {
  const [form, setForm] = useState({
    hotel_id: '', check_in: '', check_out: '',
    lead_guest_name: '', lead_email: '', lead_phone: '', nationality: 'DO',
    deposit_amount: '', payment_method: '', internal_notes: '',
    lead_id: '',
    crear_lead_nuevo: true,
    special_requests: '',
  })
  const [habitaciones, setHabitaciones] = useState([blankHab()])
  const [rooms, setRooms]   = useState([])
  const [loading, setLoading] = useState(false)

  const nights = calcNights(form.check_in, form.check_out)
  const dep    = parseFloat(form.deposit_amount) || 0
  const isGrupal = habitaciones.length > 1
  const total  = habitaciones.reduce((s, h) => s + (parseFloat(h.precio) || 0), 0)
  const totalAdults  = habitaciones.reduce((s, h) => s + (parseInt(h.adults) || 0), 0)
  const totalChildren= habitaciones.reduce((s, h) => s + (parseInt(h.children) || 0), 0)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const loadRooms = async (hotelId) => {
    if (!hotelId) { setRooms([]); return }
    const { data } = await supabase
      .from('rooms')
      .select('id, name')
      .eq('hotel_id', hotelId)
    setRooms(data || [])
  }

  const addHabitacion = () => setHabitaciones(h => [...h, blankHab()])
  const removeHabitacion = (idx) => setHabitaciones(h => h.filter((_, i) => i !== idx))
  const updateHabitacion = (idx, field, val) =>
    setHabitaciones(h => h.map((hab, i) => i === idx ? { ...hab, [field]: val } : hab))

  const handleSubmit = async () => {
    if (!form.hotel_id || !form.lead_guest_name || !form.check_in || !form.check_out) {
      onError('Completa: hotel, huésped principal y fechas.')
      return
    }
    if (habitaciones.some(h => !h.precio || parseFloat(h.precio) <= 0)) {
      onError('Cada habitación necesita un precio mayor a 0.')
      return
    }
    setLoading(true)
    const hotel = hotels.find(h => h.id === form.hotel_id)
    const groupId = isGrupal ? crypto.randomUUID() : null
    const depositoPorHabRaw = isGrupal && dep > 0 ? dep / habitaciones.length : dep
    const monedaDeposito = getCurrency(form.nationality)
    const depositoUsdPorHab = monedaDeposito === 'DOP'
      ? toUSD(depositoPorHabRaw, form.nationality, EXCHANGE_RATE)
      : depositoPorHabRaw
    const depositoDopPorHab = monedaDeposito === 'DOP'
      ? Math.round(depositoPorHabRaw)
      : Math.round(depositoPorHabRaw * EXCHANGE_RATE)

    let targetLeadId = form.lead_id || null

    // ── Sincronización del CRM: Crear o Actualizar Lead ──────────────
    if (!targetLeadId && form.crear_lead_nuevo) {
      // Creación en frío: Insertar lead manual nuevo si está activo el checkbox
      targetLeadId = crypto.randomUUID()
      const { error: errLead } = await supabaseAdmin.from('crm_leads').insert({
        id: targetLeadId,
        full_name: form.lead_guest_name,
        phone: form.lead_phone || null,
        email: form.lead_email || null,
        source: 'manual',
        stage: 'confirmada',
        hotel_interest: hotel?.name || null,
        message: 'Creado automáticamente al registrar reserva manual.' + (form.special_requests ? `\n🛎️ Peticiones especiales: ${form.special_requests}` : '')
      })
      if (errLead) {
        setLoading(false)
        onError('Error al crear lead en CRM: ' + errLead.message)
        return
      }
    } else if (targetLeadId) {
      // Actualizar etapa de lead existente a confirmada
      const { error: errLeadUpdate } = await supabaseAdmin
        .from('crm_leads')
        .update({
          stage: 'confirmada',
          hotel_interest: hotel?.name || null,
          message: form.special_requests ? `🛎️ Peticiones especiales: ${form.special_requests}` : 'Actualizado automáticamente al registrar reserva manual.',
          updated_at: new Date().toISOString()
        })
        .eq('id', targetLeadId)
      if (errLeadUpdate) {
        console.error('Error actualizando lead stage:', errLeadUpdate.message)
      }
    }

    const rows = habitaciones.map((hab, i) => {
      const room = rooms.find(r => r.id === hab.room_id)
      const precioHab = parseFloat(hab.precio) || 0
      const monedaHab = getCurrency(form.nationality)
      const totalUsdHab = monedaHab === 'DOP' ? toUSD(precioHab, form.nationality, EXCHANGE_RATE) : precioHab
      const totalDopHab = monedaHab === 'DOP' ? Math.round(precioHab) : Math.round(precioHab * EXCHANGE_RATE)
      return {
        booking_reference:   genRef(),
        lead_id:             targetLeadId, // Enlazar lead
        hotel_id:            form.hotel_id,
        hotel_code:          hotel?.slug || null,
        room_id:             hab.room_id || null,
        room_name:           room?.name || null,
        lead_guest_name:     'Mr/Ms ' + (hab.guest_name || form.lead_guest_name),
        lead_email:          form.lead_email || null,
        lead_phone:          form.lead_phone || null,
        nationality:         form.nationality || 'DO',
        check_in:            form.check_in,
        check_out:           form.check_out,
        nights,
        adults:              parseInt(hab.adults) || 1,
        children:            parseInt(hab.children) || 0,
        infants:             parseInt(hab.infants) || 0,
        total_amount:        totalUsdHab,
        currency:            monedaHab,
        total_amount_dop:    totalDopHab,
        exchange_rate:       EXCHANGE_RATE,
        deposit_amount:      depositoUsdPorHab > 0 ? depositoUsdPorHab : null,
        deposit_amount_dop:  depositoDopPorHab > 0 ? depositoDopPorHab : null,
        payment_method:      form.payment_method || null,
        payment_status:      'unpaid',
        status:              'pending_validation',
        booking_type:        isGrupal ? 'group' : 'individual',
        booking_source:      'admin_manual',
        source:              'admin_manual',
        internal_notes:      form.internal_notes || null,
        special_requests:    form.special_requests ? [form.special_requests] : [], // Guardar peticiones
        group_id:            groupId,
        group_room_number:   isGrupal ? i + 1 : null,
      }
    })

    const { error } = await supabaseAdmin.from('bookings').insert(rows)

    setLoading(false)
    if (error) { onError('Error: ' + error.message); return }
    if (onRefreshLeads) await onRefreshLeads()
    onCreated(rows.map(r => r.booking_reference).join(', '))
    setForm({
      hotel_id: '', check_in: '', check_out: '',
      lead_guest_name: '', lead_email: '', lead_phone: '', nationality: 'DO',
      deposit_amount: '', payment_method: '', internal_notes: '',
      lead_id: '',
      special_requests: '',
    })
    setHabitaciones([blankHab()])
  }

  // Zonas para agrupar hoteles
  const zones = [...new Set(hotels.map(h => h.zone))].sort()

  return (
    <div className="max-w-2xl space-y-6">
      {/* Hotel + Fechas */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Hotel *">
          <select
            className={selectCls}
            value={form.hotel_id}
            onChange={e => { set('hotel_id', e.target.value); loadRooms(e.target.value) }}
          >
            <option value="">Seleccionar hotel...</option>
            {zones.map(z => (
              <optgroup key={z} label={z}>
                {hotels.filter(h => h.zone === z).map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Nacionalidad">
          <select className={selectCls} value={form.nationality} onChange={e => set('nationality', e.target.value)}>
            <option value="DO">🇩🇴 Dominicana (DOP)</option>
            <option value="US">🇺🇸 USA (USD)</option>
            <option value="PR">🇵🇷 Puerto Rico (USD)</option>
            <option value="OTHER">🌍 Otra (USD)</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Check-in *">
          <input className={inputCls} type="date" value={form.check_in} onChange={e => set('check_in', e.target.value)} />
        </Field>
        <Field label="Check-out *">
          <input className={inputCls} type="date" value={form.check_out} onChange={e => set('check_out', e.target.value)} />
        </Field>
        <Field label="Noches">
          <input className={inputCls + ' opacity-50'} type="number" value={nights} readOnly />
        </Field>
      </div>

      {/* Huésped principal */}
      <div className="bg-gray-900/40 border border-gray-800/80 rounded-xl p-4 space-y-4">
        <span className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-1">
          Información del Huésped & Enlace CRM
        </span>
        <Field label="Asociar Lead del CRM (WhatsApp)">
          <select
            className={selectCls}
            value={form.lead_id}
            onChange={e => {
              const leadId = e.target.value
              const lead = crmLeads.find(l => l.id === leadId)
              if (lead) {
                setForm(f => ({
                  ...f,
                  lead_id: leadId,
                  lead_guest_name: lead.full_name,
                  lead_email: lead.email || '',
                  lead_phone: lead.phone || '',
                  crear_lead_nuevo: false,
                }))
              } else {
                setForm(f => ({
                  ...f,
                  lead_id: '',
                  lead_guest_name: '',
                  lead_email: '',
                  lead_phone: '',
                  crear_lead_nuevo: true,
                }))
              }
            }}
          >
            <option value="">-- No asociar lead existente (Crear nuevo o dejar huérfano) --</option>
            {crmLeads.map(l => (
              <option key={l.id} value={l.id}>
                {l.full_name} ({l.phone || 'Sin teléfono'})
              </option>
            ))}
          </select>
        </Field>

        {!form.lead_id && (
          <div className="flex items-center gap-2 mt-1 bg-gray-950/60 p-2.5 rounded-lg border border-gray-800/80">
            <input
              type="checkbox"
              id="chk_crear_lead_hotel"
              className="rounded border-gray-700 bg-gray-950 text-amber-500 focus:ring-amber-500 h-4 w-4 cursor-pointer"
              checked={form.crear_lead_nuevo}
              onChange={e => set('crear_lead_nuevo', e.target.checked)}
            />
            <label htmlFor="chk_crear_lead_hotel" className="text-xs text-gray-400 select-none cursor-pointer">
              Crear automáticamente un nuevo Lead manual en el pipeline (Etapa "Confirmada")
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre del huésped principal *">
            <input className={inputCls} type="text" placeholder="Juan Pérez" value={form.lead_guest_name} onChange={e => set('lead_guest_name', e.target.value)} />
          </Field>
          <Field label="Email">
            <input className={inputCls} type="email" placeholder="juan@email.com" value={form.lead_email} onChange={e => set('lead_email', e.target.value)} />
          </Field>
          <Field label="Teléfono">
            <input className={inputCls} type="text" placeholder="+1 809 000 0000" value={form.lead_phone} onChange={e => set('lead_phone', e.target.value)} />
          </Field>
        </div>
      </div>

      <hr className="border-gray-800" />

      {/* HABITACIONES — multi-room */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-white">
            Habitaciones ({habitaciones.length}){isGrupal && <span className="ml-2 text-xs text-amber-400 font-black uppercase">Reserva Grupal</span>}
          </span>
          <button onClick={addHabitacion} className="text-xs font-black px-3 py-1.5 rounded-lg bg-amber-600/15 border border-amber-600/30 text-amber-500 hover:bg-amber-600/25 transition">
            + Agregar habitación
          </button>
        </div>
        <div className="space-y-3">
          {habitaciones.map((hab, i) => (
            <HabitacionBlock
              key={i} idx={i} hab={hab} rooms={rooms}
              onChange={updateHabitacion} onRemove={removeHabitacion}
              canRemove={habitaciones.length > 1}
              nationality={form.nationality}
            />
          ))}
        </div>
      </div>

      <hr className="border-gray-800" />

      {/* Pago */}
      <div className="grid grid-cols-2 gap-4">
        <Field label={isGrupal ? `Depósito total (${getCurrency(form.nationality)})` : `Depósito requerido (${getCurrency(form.nationality)})`}>
          <input className={inputCls} type="number" step="0.01" min="0" placeholder="0.00" value={form.deposit_amount} onChange={e => set('deposit_amount', e.target.value)} />
        </Field>
        <Field label="Método de pago">
          <select className={selectCls} value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
            <option value="">Seleccionar...</option>
            {getMetodos(form.nationality).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="Notas internas">
          <input className={inputCls} type="text" placeholder="Observaciones internas..." value={form.internal_notes} onChange={e => set('internal_notes', e.target.value)} />
        </Field>
        <Field label="🛎️ Peticiones especiales (Huésped)">
          <input className={inputCls} type="text" placeholder="Cama king, piso alto, habitaciones juntas..." value={form.special_requests} onChange={e => set('special_requests', e.target.value)} />
        </Field>
      </div>

      {/* Preview totales */}
      {total > 0 && (
        <div className="bg-gray-900 rounded-lg p-4 text-sm space-y-1">
          {isGrupal && <Row label="Habitaciones" value={`${habitaciones.length} (${totalAdults} adultos, ${totalChildren} niños)`} />}
          <Row label="Total acordado"   value={fmtMoney(total, form.nationality)} />
          <Row label="Depósito"         value={dep > 0 ? fmtMoney(dep, form.nationality) : '—'} />
          <Row label="Saldo pendiente"  value={fmtMoney(total - dep, form.nationality)} />
          {getCurrency(form.nationality) === 'USD' && (
            <Row label="Equivalente DOP" value={`RD$ ${Math.round(total * EXCHANGE_RATE).toLocaleString()}`} />
          )}
        </div>
      )}

      <button onClick={handleSubmit} disabled={loading} className={btnPrimary}>
        {loading ? 'Creando...' : isGrupal ? `Crear ${habitaciones.length} reservas (grupo)` : 'Crear reserva'}
      </button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// TAB 2 — LISTADO DE RESERVAS
// ════════════════════════════════════════════════════════════
function TabListado({ bookings, hotels, onConfirm, onCancel, onPago, onRecibo }) {
  const [q, setQ]   = useState('')
  const [st, setSt] = useState('')

  const filtered = bookings.filter(b => {
    const mq = !q || (b.booking_reference || '').toLowerCase().includes(q.toLowerCase()) ||
      (b.lead_guest_name || '').toLowerCase().includes(q.toLowerCase())
    const ms = !st || b.status === st
    return mq && ms
  })

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <input
          className={inputCls + ' flex-1'}
          placeholder="Buscar por referencia o huésped..."
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <select className={selectCls + ' w-48'} value={st} onChange={e => setSt(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="pending_validation">Pendiente</option>
          <option value="confirmed">Confirmado</option>
          <option value="cancelled">Cancelado</option>
        </select>
      </div>

      {filtered.length === 0 && (
        <p className="text-center py-12 text-gray-500">No hay reservas</p>
      )}

      <div className="space-y-3">
        {filtered.map(b => {
          const hotel = hotels.find(h => h.id === b.hotel_id)
          const isExc = b.booking_type === 'excursion'
          return (
            <div key={b.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-medium text-white text-sm">
                    {b.booking_reference} · {b.lead_guest_name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {isExc ? '🌴 ' : '🏨 '}{hotel?.name || b.hotel_code || '—'}
                    {b.room_name ? ` · ${b.room_name}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge status={b.status} />
                  <Badge status={b.payment_status} />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-gray-400 mb-3">
                <span>{b.check_in} → {b.check_out}</span>
                <span>{b.nights || 0} noches · {b.adults || 0}A {b.children || 0}N</span>
                <span className="text-white font-medium">${fmt(b.total_amount)}</span>
              </div>

              <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-800">
                {b.status !== 'confirmed' && b.status !== 'cancelled' && (
                  <button onClick={() => onConfirm(b.id, b.booking_reference)} className={btnSuccess}>
                    Confirmar
                  </button>
                )}
                {b.status !== 'cancelled' && (
                  <button onClick={() => onCancel(b.id, b.booking_reference)} className={btnDanger}>
                    Cancelar
                  </button>
                )}
                <button onClick={() => onPago(b.id)} className={btnSecondary}>Pago</button>
                <button onClick={() => onRecibo(b.id)} className={btnSecondary}>Recibo</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// TAB 3 — REGISTRAR PAGO
// ════════════════════════════════════════════════════════════
function TabPago({ bookings, onRegistered, onError }) {
  const [bookingId, setBookingId] = useState('')
  const [payments, setPayments]   = useState([])
  const [form, setForm]           = useState({ amount: '', method: '', reference: '', payer_name: '' })
  const [loading, setLoading]     = useState(false)

  // Tasa de cambio dinámica — reutiliza el mismo hook del archivo
  const { rate: exchangeRate, dopToUsd } = useExchangeRate()

  const booking  = bookings.find(b => b.id === bookingId)
  const nat      = booking?.nationality || 'DO'
  const cur      = booking?.currency || getCurrency(nat)  // leer currency REAL de la reserva
  const isDOP    = cur === 'DOP'

  // Leer el total en la moneda correcta de la reserva
  // Si currency='DOP' → total_amount ya está en DOP, no convertir
  // Si currency='USD' → total_amount en USD, convertir para mostrar en DOP
  const totalUSD = isDOP
    ? parseFloat((parseFloat(booking?.total_amount || 0) / exchangeRate).toFixed(2))
    : parseFloat(booking?.total_amount || 0)

  // Recalcular el pagado acumulado en USD y DOP respetando la moneda de cada abono
  const paidUSD = payments.reduce((s, p) => {
    const amt = parseFloat(p.amount || 0);
    const pCur = p.currency || 'USD';
    if (pCur === 'DOP') {
      return s + parseFloat((amt / exchangeRate).toFixed(2));
    }
    return s + amt;
  }, 0);

  const paidDOP = payments.reduce((s, p) => {
    const amt = parseFloat(p.amount || 0);
    const pCur = p.currency || 'USD';
    if (pCur === 'DOP') {
      return s + amt;
    }
    return s + Math.round(amt * exchangeRate);
  }, 0);

  // Para display: si reserva es DOP mostramos en DOP; si USD mostramos en USD
  const total   = isDOP ? parseFloat(booking?.total_amount || 0) : totalUSD
  const paid    = isDOP ? paidDOP : paidUSD
  const balance = Math.max(0, total - paid)
  const pct     = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0

  // Para el insert en atlas_payments siempre necesitamos USD
  const paidUSDAccum = paidUSD

  useEffect(() => {
    if (!bookingId) { setPayments([]); return }
    supabaseAdmin
      .from('atlas_payments')
      .select('amount, method, created_at, reference, status, currency')
      .eq('booking_id', bookingId)
      .in('status', ['approved', 'confirmed'])
      .then(({ data }) => {
        setPayments(data || [])
        const b = bookings.find(x => x.id === bookingId)
        setForm(f => ({ ...f, amount: '', payer_name: b?.lead_guest_name || '' }))
      })
  }, [bookingId])

  const handlePago = async () => {
    const rawAmount = parseFloat(form.amount)
    if (!bookingId || rawAmount <= 0 || !form.method) {
      onError('Completa reserva, monto y método de pago.')
      return
    }

    // ── CONVERSIÓN ───────────────────────────────────────────
    // El usuario ingresa en la moneda de la reserva (DOP o USD)
    // La DB guarda en USD (unidad canónica)
    const amountUSD = isDOP ? dopToUsd(rawAmount) : rawAmount
    const amountDOP = isDOP ? Math.round(rawAmount) : Math.round(rawAmount * exchangeRate)

    setLoading(true)
    const isPaidComplete = isDOP
      ? (paidDOP + amountDOP) >= total
      : (paidUSD + amountUSD) >= total
    const newStatus = isPaidComplete ? 'paid' : 'partial'

    const { error: e1 } = await supabaseAdmin.from('atlas_payments').insert({
      booking_id:   bookingId,
      amount:       amountUSD,              // siempre en USD
      currency:     'USD',
      method:       form.method,
      payment_type: 'deposito',             // ← FIX: constraint acepta 'deposito' no 'deposit'
      reference:    form.reference || null,
      payer_name:   form.payer_name || null,
      status:       'approved',
      approved_by:  'admin',
      approved_at:  new Date().toISOString(),
      evidence:     {
        manual: true,
        registered_by: 'admin_panel',
        original_currency: cur,
        original_amount:   rawAmount,
        exchange_rate:     exchangeRate,
        amount_dop:        amountDOP,
      },
    })

    if (e1) { setLoading(false); onError('Error: ' + e1.message); return }

    // Actualizar deposit_amount_dop en bookings también
    const newDepositDOP = (parseFloat(booking?.deposit_amount_dop || 0)) + amountDOP
    await supabaseAdmin
      .from('bookings')
      .update({
        payment_status:    newStatus,
        deposit_amount:    parseFloat((paid + amountUSD).toFixed(2)),
        deposit_amount_dop: newDepositDOP,
      })
      .eq('id', bookingId)

    // ATL-013 / OPS-265: Actualizar etapa del Lead reactivamente
    if (booking?.lead_id) {
      const newLeadStage = newStatus === 'paid' ? 'ganado' : 'cotizado'
      await supabaseAdmin
        .from('crm_leads')
        .update({ stage: newLeadStage })
        .eq('id', booking.lead_id)
    }

    setLoading(false)
    setPayments(prev => [...prev, {
      amount: amountUSD, method: form.method,
      created_at: new Date().toISOString(), status: 'approved', currency: 'USD'
    }])
    setForm(f => ({ ...f, amount: '', reference: '' }))
    onRegistered()
  }

  return (
    <div className="max-w-lg space-y-5">
      <Field label="Reserva *">
        <select className={selectCls} value={bookingId} onChange={e => setBookingId(e.target.value)}>
          <option value="">Seleccionar reserva...</option>
          {bookings.filter(b => b.status !== 'cancelled').map(b => (
            <option key={b.id} value={b.id}>
              {b.booking_reference} · {b.lead_guest_name} · ${fmt(b.total_amount)}
            </option>
          ))}
        </select>
      </Field>

      {booking && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-sm">
          <p className="font-medium text-white mb-1">{booking.booking_reference} · {booking.lead_guest_name}</p>
          {/* Mostrar siempre en la moneda del cliente */}
          {isDOP ? (
            <p className="text-gray-400 text-xs mb-3">
              Total: RD$ {(total || 0).toLocaleString('es-DO')} ·
              Pagado: <span className="text-emerald-400">RD$ {(paid || 0).toLocaleString('es-DO')}</span> ·
              Pendiente: <span className="text-red-400">RD$ {(balance || 0).toLocaleString('es-DO')}</span>
            </p>
          ) : (
            <p className="text-gray-400 text-xs mb-3">
              Total: ${fmt(total)} USD ·
              Pagado: <span className="text-emerald-400">${fmt(paid)} USD</span> ·
              Pendiente: <span className="text-red-400">${fmt(balance)} USD</span>
            </p>
          )}
          <div className="bg-gray-800 rounded-full h-2 overflow-hidden">
            <div className="bg-emerald-500 h-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-1">{pct}% cobrado</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label={`Monto (${cur}) *`}>
          <input className={inputCls} type="number" step={isDOP ? '1' : '0.01'} min="0.01"
            placeholder={isDOP ? 'Ej: 5000' : '0.00'}
            value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          {/* Preview de conversión en tiempo real */}
          {form.amount > 0 && isDOP && (
            <span className="text-xs text-gray-500 mt-1">
              ≈ ${dopToUsd(form.amount).toFixed(2)} USD @ {exchangeRate} DOP/USD
            </span>
          )}
          {form.amount > 0 && !isDOP && (
            <span className="text-xs text-gray-500 mt-1">
              ≈ RD$ {Math.round(form.amount * exchangeRate).toLocaleString('es-DO')} DOP
            </span>
          )}
        </Field>
        <Field label="Método *">
          <select className={selectCls} value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}>
            <option value="">Seleccionar...</option>
            {getMetodos(nat).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="Referencia / comprobante">
          <input className={inputCls} type="text" placeholder="Nro. transferencia..."
            value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
        </Field>
        <Field label="Nombre del pagador">
          <input className={inputCls} type="text" placeholder="Quién realizó el pago"
            value={form.payer_name} onChange={e => setForm(f => ({ ...f, payer_name: e.target.value }))} />
        </Field>
      </div>

      <button onClick={handlePago} disabled={loading} className={btnPrimary}>
        {loading ? 'Registrando...' : 'Registrar abono'}
      </button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// TAB 4 — RECIBO (rewrite limpio)
// ════════════════════════════════════════════════════════════
function TabRecibo({ bookings, hotels, initialBookingId = '' }) {
  const [bookingId, setBookingId] = useState(initialBookingId)
  const [payments,  setPayments]  = useState([])
  const [loading,   setLoading]   = useState(false)
  // FIX 2026-07-08 (ATLAS-TECH): antes usaba una tasa hardcodeada (RATE=61)
  // solo para el display. Ahora usa la tasa dinamica del hook (misma fuente
  // que el resto del panel) como fallback, priorizando el exchange_rate real
  // guardado en la reserva cuando existe.
  const { rate: EXCHANGE_RATE } = useExchangeRate()

  // Pre-seleccionar cuando viene del listado
  useEffect(() => {
    if (initialBookingId) setBookingId(initialBookingId)
  }, [initialBookingId])

  const booking = bookings.find(b => b.id === bookingId) || null

  // FIX 2026-07-08 (ATLAS-TECH): TabRecibo solo conocia UNA habitacion por id,
  // asi que un recibo de reserva grupal (varias filas con el mismo group_id)
  // mostraba y enviaba a Gotenberg solo los datos de una habitacion, no el
  // total consolidado del grupo. Ahora, si la reserva tiene group_id, se
  // agrupan todas las filas hermanas para totales y pagos.
  const groupRows = booking?.group_id
    ? bookings.filter(b => b.group_id === booking.group_id)
    : (booking ? [booking] : [])
  const isGroupReceipt = groupRows.length > 1
  const groupBookingIds = groupRows.map(b => b.id)

  // Cargar pagos cuando cambia el booking (o su grupo completo)
  useEffect(() => {
    if (!bookingId || groupBookingIds.length === 0) { setPayments([]); return }
    setLoading(true)
    supabaseAdmin
      .from('atlas_payments')
      .select('*')
      .in('booking_id', groupBookingIds)
      .order('created_at', { ascending: true })
      .then(({ data }) => { setPayments(data || []); setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, groupRows.length])

  const hotel    = booking ? (hotels.find(h => h.id === booking.hotel_id) || null) : null
  const currency = booking?.currency || 'USD'  // moneda REAL de la reserva, no hardcodeada
  const rate     = parseFloat(booking?.exchange_rate) || EXCHANGE_RATE
  const total    = groupRows.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0)
  const totalDop = groupRows.reduce((s, b) => s + parseFloat(b.total_amount_dop || 0), 0)
  const paid     = payments.reduce((s, p) => s + parseFloat(p.amount || 0), 0)
  const balance  = total - paid
  const fmt      = n => parseFloat(n || 0).toFixed(2)
  const fmtDOP   = n => Math.round(parseFloat(n || 0) * rate).toLocaleString('es-DO')
  const money    = n => currency === 'DOP'
    ? `RD$ ${Math.round(parseFloat(n || 0)).toLocaleString('es-DO')}`
    : `$${fmt(n)} USD`

  const handleImprimir = async () => {
    if (!booking) return

    // Llamar WF-RECIBO-ABONO-v1 con Gotenberg + Telegram
    try {
      const res = await fetch(WF_RECIBO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_reference:     isGroupReceipt
                                    ? groupRows.map(b => b.booking_reference).join(' / ')
                                    : booking.booking_reference,
          is_group:               isGroupReceipt,
          group_id:               booking.group_id || null,
          rooms:                  groupRows.map(b => ({
            booking_reference: b.booking_reference,
            room_name:         b.room_name || 'Estandar',
            guest_name:        b.lead_guest_name,
            adults:            b.adults || 2,
            children:          b.children || 0,
            total_amount:      parseFloat(b.total_amount || 0),
            total_amount_dop:  parseFloat(b.total_amount_dop || 0),
          })),
          lead_guest_name:       booking.lead_guest_name,
          lead_phone:            booking.lead_phone || '',
          hotel_name:            hotel?.name || booking.hotel_code || '',
          hotel_zone:            hotel?.zone || '',
          check_in:              booking.check_in,
          check_out:             booking.check_out,
          adults:                groupRows.reduce((s, b) => s + (b.adults || 0), 0) || booking.adults || 2,
          children:              groupRows.reduce((s, b) => s + (b.children || 0), 0) || booking.children || 0,
          room_name:             isGroupReceipt ? `${groupRows.length} habitaciones` : (booking.room_name || 'Estandar'),
          meal_plan:             'Todo Incluido',
          hotel_confirmation_no: booking.hotel_confirmation_no || '',
          status:                booking.status,
          currency:              currency,
          exchange_rate:         rate,
          total_amount:          total,
          total_amount_dop:      totalDop,
          total:                 total,
          paid:                  paid,
          abono:                 paid,
          payments:              payments.map(p => ({
            amount:     p.amount,
            currency:   p.currency || currency,
            method:     p.method || 'Transferencia',
            created_at: p.created_at,
            reference:  p.reference || ''
          }))
        })
      })
      const data = await res.json()
      alert('\u2705 Recibo enviado a Telegram. El PDF estara listo en ~15 segundos.')
      if (data.pdf_url) window.open(data.pdf_url, '_blank')
    } catch (err) {
      alert('Error generando recibo: ' + err.message)
    }
  }

  const _legacyHtml = () => {
    if (!booking) return ''
    const fmt = n => parseFloat(n || 0).toFixed(2)
    const pRows = payments.map(p =>
      '<tr>' +
      '<td>' + new Date(p.created_at).toLocaleDateString('es-DO') + '</td>' +
      '<td>' + (p.method || '—') + '</td>' +
      '<td>+$' + fmt(p.amount) + '</td>' +
      '</tr>'
    ).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Recibo ${booking.booking_reference}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:560px;margin:30px auto;color:#111;font-size:13px;padding:0 20px}
  h2{margin:0 0 4px}
  hr{border:none;border-top:1px solid #e5e7eb;margin:14px 0}
  table{width:100%;border-collapse:collapse}
  td{padding:5px 0;vertical-align:top}
  td:first-child{color:#666;width:150px}
  .total-box{background:#fff7e6;border:2px solid #b8860b;border-radius:8px;padding:10px 14px;margin:14px 0;display:flex;justify-content:space-between;align-items:center}
  .conf{background:#f0fdf4;border:1px solid #16a34a;color:#16a34a;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;text-align:center;margin:8px 0}
  @media print{.no-print{display:none}}
  .btn{display:block;width:100%;background:#0a1628;color:white;border:none;padding:11px;border-radius:8px;font-weight:700;cursor:pointer;margin-top:14px;font-size:13px}
</style></head><body>
<div style="border-bottom:2px solid #0a1628;padding-bottom:14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end">
  <div><h2>ALIUN TRAVEL SRL</h2><p style="margin:0;color:#666;font-size:11px">Comprobante de Reserva</p></div>
  <div style="text-align:right"><strong style="color:#b8860b">${booking.booking_reference}</strong><br/><span style="font-size:11px;color:#666">${new Date().toLocaleDateString('es-DO',{year:'numeric',month:'long',day:'numeric'})}</span></div>
</div>
<div class="conf">${booking.status === 'confirmed' ? '✓ RESERVA CONFIRMADA' : '⏳ PENDIENTE DE CONFIRMACIÓN'}</div>
<table>
  <tr><td>Huésped</td><td><strong>${booking.lead_guest_name || '—'}</strong></td></tr>
  <tr><td>Referencia</td><td>${booking.booking_reference}</td></tr>
  ${booking.hotel_confirmation_no ? `<tr><td>Conf. proveedor</td><td>${booking.hotel_confirmation_no}</td></tr>` : ''}
</table>
<hr>
<table>
  <tr><td>${booking.booking_type === 'excursion' ? 'Excursión' : 'Hotel'}</td><td><strong>${hotel?.name || booking.hotel_code || '—'}</strong></td></tr>
  <tr><td>Habitación</td><td>${booking.room_name || 'Estándar'}</td></tr>
  <tr><td>Check-in</td><td><strong>${booking.check_in || '—'}</strong></td></tr>
  <tr><td>Check-out</td><td><strong>${booking.check_out || '—'}</strong></td></tr>
  <tr><td>PAX</td><td>${booking.adults || 0} adultos${(booking.children > 0) ? ', ' + booking.children + ' niños' : ''}</td></tr>
</table>
${payments.length > 0 ? `<hr><p style="font-weight:700;margin:0 0 6px">Historial de pagos</p><table>${pRows}</table>` : ''}
<hr>
<table>
  <tr><td>Total acordado</td><td style="text-align:right">$${fmt(total)} USD (RD$${fmtDOP(total)})</td></tr>
  <tr><td>Abonado</td><td style="text-align:right;color:#16a34a">$${fmt(paid)} USD</td></tr>
</table>
<div class="total-box">
  <strong>SALDO PENDIENTE</strong>
  <strong style="font-size:16px;color:${balance > 0 ? '#dc2626' : '#16a34a'}">${balance <= 0 ? '✓ Saldado' : '$' + fmt(balance) + ' USD'}</strong>
</div>
<p style="text-align:center;color:#999;font-size:10px;margin-top:16px">Aliun Travel SRL · aliuntravelsrl.com</p>
<button class="btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
</body></html>`

    try {
      const blob = new Blob([html], { type: 'text/html' })
      const url  = URL.createObjectURL(blob)
      const w    = window.open(url, '_blank')
      if (!w) {
        const a = document.createElement('a')
        a.href = url
        a.download = `recibo-${booking.booking_reference}.html`
        a.click()
      } else {
        setTimeout(() => URL.revokeObjectURL(url), 8000)
      }
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  return (
    <div className="max-w-xl space-y-5">

      {/* Selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Reserva</label>
        <select
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
          value={bookingId}
          onChange={e => setBookingId(e.target.value)}
        >
          <option value="">— Seleccionar reserva —</option>
          {bookings.map(b => (
            <option key={b.id} value={b.id}>
              {b.booking_reference} · {b.lead_guest_name}
            </option>
          ))}
        </select>
      </div>

      {/* Estado vacío */}
      {!bookingId && (
        <p className="text-center py-10 text-gray-500 text-sm">
          Selecciona una reserva para generar el recibo
        </p>
      )}

      {/* Loading */}
      {bookingId && loading && (
        <p className="text-center py-6 text-gray-500 text-sm animate-pulse">Cargando datos...</p>
      )}

      {/* Preview recibo */}
      {bookingId && !loading && booking && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4 text-sm">

          {/* Header */}
          <div className="border-b border-gray-700 pb-3 flex justify-between items-start">
            <div>
              <p className="font-bold text-white text-base">ALIUN TRAVEL SRL</p>
              <p className="text-gray-400 text-xs mt-0.5">Comprobante de reserva</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-amber-400">
                {isGroupReceipt ? `${groupRows.length} habitaciones (grupo)` : booking.booking_reference}
              </p>
              <p className="text-gray-500 text-xs">{new Date().toLocaleDateString('es-DO')}</p>
            </div>
          </div>

          {isGroupReceipt && (
            <div className="text-xs text-amber-400 font-bold uppercase tracking-wide bg-amber-900/20 border border-amber-800/40 rounded-lg px-3 py-1.5">
              Recibo consolidado · {groupRows.map(b => b.booking_reference).join(' / ')}
            </div>
          )}

          {/* Estado */}
          <div className={`text-center text-xs font-bold py-1.5 rounded-lg ${booking.status === 'confirmed' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-amber-900/40 text-amber-400'}`}>
            {booking.status === 'confirmed' ? '✓ RESERVA CONFIRMADA' : '⏳ PENDIENTE DE CONFIRMACIÓN'}
          </div>

          {/* Datos cliente */}
          <div className="space-y-1.5">
            {[
              ['Huésped', booking.lead_guest_name],
              ['Hotel',    hotel?.name || booking.hotel_code || '—'],
              ['Habitación', booking.room_name || 'Estándar'],
              ['Check-in',  booking.check_in],
              ['Check-out', booking.check_out],
              ['PAX', `${booking.adults || 0} adultos${booking.children > 0 ? ', ' + booking.children + ' niños' : ''}`],
              ...(booking.hotel_confirmation_no ? [['Conf. proveedor', booking.hotel_confirmation_no]] : [])
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-gray-400">{k}</span>
                <span className="text-white font-medium text-right max-w-[55%]">{v}</span>
              </div>
            ))}
          </div>

          {/* Pagos */}
          {payments.length > 0 && (
            <>
              <hr className="border-gray-700" />
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Historial de pagos</p>
              {payments.map((p, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-gray-400">{new Date(p.created_at).toLocaleDateString('es-DO')} · {p.method || '—'}</span>
                  <span className="text-emerald-400 font-semibold">+{money(p.amount)}</span>
                </div>
              ))}
            </>
          )}

          {/* Totales */}
          <hr className="border-gray-700" />
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Total acordado{isGroupReceipt ? ' (grupo)' : ''}</span>
              <span className="text-white">{money(total)}{currency === 'USD' && <span className="text-gray-500"> (RD$ {fmtDOP(total)})</span>}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Abonado</span>
              <span className="text-emerald-400 font-semibold">{money(paid)}</span>
            </div>
          </div>
          <div className={`flex justify-between items-center p-3 rounded-lg font-bold ${balance <= 0 ? 'bg-emerald-900/30 border border-emerald-800' : 'bg-amber-900/30 border border-amber-800'}`}>
            <span className="text-sm">Saldo pendiente</span>
            <span className={`text-base ${balance <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {balance <= 0 ? '✓ Saldado' : money(balance)}
            </span>
          </div>

          {/* Botón imprimir */}
          <button
            onClick={handleImprimir}
            className="w-full py-2.5 rounded-lg font-bold text-sm transition"
            style={{background:'#0A1628',color:'#B8860B'}}
          >
            🧾 Generar Recibo PDF → Telegram
          </button>
        </div>
      )}

      {/* Booking no encontrado */}
      {bookingId && !loading && !booking && (
        <p className="text-center py-6 text-gray-500 text-sm">
          Reserva no encontrada. Intenta recargar la página.
        </p>
      )}

    </div>
  )
}

// ════════════════════════════════════════════════════════════
// TAB 5 — RESERVA DE EXCURSIÓN (NUEVO)
// ════════════════════════════════════════════════════════════
function TabExcursion({ crmLeads = [], onRefreshLeads, onCreated, onError }) {
  const [excursions, setExcursions] = useState([])
  const [plans, setPlans]           = useState([])
  const [form, setForm]             = useState({
    excursion_id: '', excursion_slug: '', excursion_name: '',
    plan_id: '', plan_name: '', plan_price_adult: 0, plan_price_child: 0,
    fecha: '', adults: 2, children: 0, infants: 0,
    total_amount: '', lead_guest_name: '', lead_email: '', lead_phone: '',
    nationality: 'DO', payment_method: '', internal_notes: '',
    lead_id: '',
    crear_lead_nuevo: true,
    special_requests: '',
  })
  const [loading, setLoading] = useState(false)

  // Cargar excursiones activas
  useEffect(() => {
    supabase
      .from('excursions')
      .select('id, slug, name, zone, confirmation_type')
      .eq('is_active', true)
      .order('zone')
      .then(({ data }) => setExcursions(data || []))
  }, [])

  // Cargar planes al seleccionar excursión
  const handleExcursionChange = async (excursionId) => {
    const exc = excursions.find(e => e.id === excursionId)
    setForm(f => ({
      ...f,
      excursion_id:   excursionId,
      excursion_slug: exc?.slug || '',
      excursion_name: exc?.name || '',
      plan_id: '', plan_name: '', plan_price_adult: 0, plan_price_child: 0,
      total_amount: '',
    }))
    if (!excursionId) { setPlans([]); return }
    const { data } = await supabase
      .from('excursion_plans')
      .select('id, slug, name, price_adult_usd, price_child_usd, duration_label')
      .eq('excursion_id', excursionId)
      .eq('is_active', true)
      .order('sort_order')
    setPlans(data || [])
  }

  const handlePlanChange = (planId) => {
    const plan = plans.find(p => p.id === planId)
    const adults   = parseInt(form.adults) || 2
    const children = parseInt(form.children) || 0
    const totalUSD = plan
      ? (adults * plan.price_adult_usd) + (children * plan.price_child_usd)
      : 0
    const total = getCurrency(form.nationality) === 'DOP'
      ? Math.round(totalUSD * EXCHANGE_RATE)
      : totalUSD
    setForm(f => ({
      ...f,
      plan_id:          planId,
      plan_name:        plan?.name || '',
      plan_price_adult: plan?.price_adult_usd || 0,
      plan_price_child: plan?.price_child_usd || 0,
      total_amount:     total > 0 ? total.toString() : '',
    }))
  }

  // Recalcular total cuando cambian PAX
  const recalcTotal = (adults, children) => {
    if (!form.plan_id) return
    const totalUSD = (parseInt(adults) * form.plan_price_adult) +
                     (parseInt(children) * form.plan_price_child)
    const total = getCurrency(form.nationality) === 'DOP'
      ? Math.round(totalUSD * EXCHANGE_RATE)
      : totalUSD
    setForm(f => ({ ...f, total_amount: total.toString() }))
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.excursion_id || !form.plan_id || !form.fecha || !form.lead_guest_name) {
      onError('Completa: excursión, plan, fecha y nombre del huésped.')
      return
    }
    const total = parseFloat(form.total_amount) || 0
    if (total <= 0) { onError('El precio total debe ser mayor a 0.'); return }

    setLoading(true)
    const ref = genRef()
    let targetLeadId = form.lead_id || null

    // ── Sincronización del CRM: Crear o Actualizar Lead ──────────────
    if (!targetLeadId && form.crear_lead_nuevo) {
      targetLeadId = crypto.randomUUID()
      const { error: errLead } = await supabaseAdmin.from('crm_leads').insert({
        id: targetLeadId,
        full_name: form.lead_guest_name,
        phone: form.lead_phone || null,
        email: form.lead_email || null,
        source: 'manual',
        stage: 'confirmada',
        hotel_interest: form.excursion_name || null,
        message: 'Creado automáticamente al registrar excursión manual.' + (form.special_requests ? `\n🛎️ Peticiones especiales: ${form.special_requests}` : '')
      })
      if (errLead) {
        setLoading(false)
        onError('Error al crear lead en CRM: ' + errLead.message)
        return
      }
    } else if (targetLeadId) {
      const { error: errLeadUpdate } = await supabaseAdmin
        .from('crm_leads')
        .update({
          stage: 'confirmada',
          hotel_interest: form.excursion_name || null,
          message: form.special_requests ? `🛎️ Peticiones especiales: ${form.special_requests}` : 'Actualizado automáticamente al registrar excursión manual.',
          updated_at: new Date().toISOString()
        })
        .eq('id', targetLeadId)
      if (errLeadUpdate) {
        console.error('Error actualizando lead stage:', errLeadUpdate.message)
      }
    }

    const { error } = await supabaseAdmin.from('bookings').insert({
      booking_reference:  ref,
      booking_type:       'excursion',
      source:             'manual_admin',
      lead_id:            targetLeadId,
      hotel_code:         form.excursion_slug,
      room_name:          form.plan_name,
      check_in:           form.fecha,
      check_out:          form.fecha,
      nights:             0,
      adults:             parseInt(form.adults),
      children:           parseInt(form.children),
      infants:            parseInt(form.infants),
      lead_guest_name:    'Mr/Ms ' + form.lead_guest_name,
      lead_email:         form.lead_email || null,
      lead_phone:         form.lead_phone || null,
      total_amount:       getCurrency(form.nationality) === 'DOP' ? toUSD(total, form.nationality) : total,
      currency:           getCurrency(form.nationality),
      total_amount_dop:   getCurrency(form.nationality) === 'DOP' ? Math.round(total) : Math.round(total * EXCHANGE_RATE),
      nationality:        form.nationality,
      exchange_rate:      EXCHANGE_RATE,
      payment_method:     form.payment_method || null,
      payment_status:     'unpaid',
      status:             'pending_validation',
      internal_notes:     form.internal_notes || null,
      special_requests:   {
        excursion_id:   form.excursion_id,
        excursion_name: form.excursion_name,
        plan_id:        form.plan_id,
        plan_name:      form.plan_name,
        notes:          form.special_requests || null,
      },
    })

    setLoading(false)
    if (error) { onError('Error: ' + error.message); return }
    if (onRefreshLeads) await onRefreshLeads()
    onCreated(ref)
    setForm({
      excursion_id: '', excursion_slug: '', excursion_name: '',
      plan_id: '', plan_name: '', plan_price_adult: 0, plan_price_child: 0,
      fecha: '', adults: 2, children: 0, infants: 0,
      total_amount: '', lead_guest_name: '', lead_email: '', lead_phone: '',
      nationality: 'DO', payment_method: '', internal_notes: '',
      lead_id: '',
      special_requests: '',
    })
    setPlans([])
  }

  const total    = parseFloat(form.total_amount) || 0
  const excursion = excursions.find(e => e.id === form.excursion_id)

  return (
    <div className="max-w-2xl space-y-6">
      {/* Aviso on_request */}
      {excursion?.confirmation_type === 'on_request' && (
        <div className="bg-amber-900/30 border border-amber-700 rounded-lg px-4 py-3 text-sm text-amber-300">
          ⚠️ Esta excursión requiere confirmación manual con el operador. Respuesta en máx. 24h.
        </div>
      )}

      {/* Excursión + Plan */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Excursión *">
          <select
            className={selectCls}
            value={form.excursion_id}
            onChange={e => handleExcursionChange(e.target.value)}
          >
            <option value="">Seleccionar excursión...</option>
            {excursions.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Plan *">
          <select
            className={selectCls}
            value={form.plan_id}
            onChange={e => handlePlanChange(e.target.value)}
            disabled={!form.excursion_id}
          >
            <option value="">Seleccionar plan...</option>
            {plans.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} — ${p.price_adult_usd}A / ${p.price_child_usd}N
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Fecha + PAX */}
      <div className="grid grid-cols-4 gap-4">
        <Field label="Fecha *" className="col-span-1">
          <input className={inputCls} type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} />
        </Field>
        <Field label="Adultos *">
          <input className={inputCls} type="number" min="1" value={form.adults}
            onChange={e => { set('adults', e.target.value); recalcTotal(e.target.value, form.children) }} />
        </Field>
        <Field label="Niños (2–11)">
          <input className={inputCls} type="number" min="0" value={form.children}
            onChange={e => { set('children', e.target.value); recalcTotal(form.adults, e.target.value) }} />
        </Field>
        <Field label="Infantes">
          <input className={inputCls} type="number" min="0" value={form.infants}
            onChange={e => set('infants', e.target.value)} />
        </Field>
      </div>

      {/* Huésped */}
      <div className="bg-gray-900/40 border border-gray-800/80 rounded-xl p-4 space-y-4">
        <span className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-1">
          Información del Cliente & Enlace CRM
        </span>
        <Field label="Asociar Lead del CRM (WhatsApp)">
          <select
            className={selectCls}
            value={form.lead_id}
            onChange={e => {
              const leadId = e.target.value
              const lead = crmLeads.find(l => l.id === leadId)
              if (lead) {
                setForm(f => ({
                  ...f,
                  lead_id: leadId,
                  lead_guest_name: lead.full_name,
                  lead_email: lead.email || '',
                  lead_phone: lead.phone || '',
                  crear_lead_nuevo: false,
                }))
              } else {
                setForm(f => ({
                  ...f,
                  lead_id: '',
                  lead_guest_name: '',
                  lead_email: '',
                  lead_phone: '',
                  crear_lead_nuevo: true,
                }))
              }
            }}
          >
            <option value="">-- No asociar lead existente (Crear nuevo o dejar huérfano) --</option>
            {crmLeads.map(l => (
              <option key={l.id} value={l.id}>
                {l.full_name} ({l.phone || 'Sin teléfono'})
              </option>
            ))}
          </select>
        </Field>

        {!form.lead_id && (
          <div className="flex items-center gap-2 mt-1 bg-gray-950/60 p-2.5 rounded-lg border border-gray-800/80">
            <input
              type="checkbox"
              id="chk_crear_lead_excursion"
              className="rounded border-gray-700 bg-gray-950 text-amber-500 focus:ring-amber-500 h-4 w-4 cursor-pointer"
              checked={form.crear_lead_nuevo}
              onChange={e => set('crear_lead_nuevo', e.target.checked)}
            />
            <label htmlFor="chk_crear_lead_excursion" className="text-xs text-gray-400 select-none cursor-pointer">
              Crear automáticamente un nuevo Lead manual en el pipeline (Etapa "Confirmada")
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre del huésped *">
            <input className={inputCls} type="text" placeholder="Juan Pérez"
              value={form.lead_guest_name} onChange={e => set('lead_guest_name', e.target.value)} />
          </Field>
          <Field label="Nacionalidad">
            <select className={selectCls} value={form.nationality} onChange={e => {
              set('nationality', e.target.value)
              // Recalcular total con nueva moneda si ya hay plan
              if (form.plan_id) recalcTotal(form.adults, form.children)
            }}>
              <option value="DO">🇩🇴 Dominicana (DOP)</option>
              <option value="US">🇺🇸 USA (USD)</option>
              <option value="PR">🇵🇷 Puerto Rico (USD)</option>
              <option value="OTHER">🌍 Otra (USD)</option>
            </select>
          </Field>
          <Field label="Email">
            <input className={inputCls} type="email" placeholder="juan@email.com"
              value={form.lead_email} onChange={e => set('lead_email', e.target.value)} />
          </Field>
          <Field label="Teléfono">
            <input className={inputCls} type="text" placeholder="+1 809 000 0000"
              value={form.lead_phone} onChange={e => set('lead_phone', e.target.value)} />
          </Field>
          <Field label="Método de pago">
            <select className={selectCls} value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
              <option value="">Seleccionar...</option>
              {getMetodos(form.nationality).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* Precio + Notas */}
      <div className="grid grid-cols-3 gap-4">
        <Field label={`Precio total acordado (${getCurrency(form.nationality)}) *`}>
          <input className={inputCls} type="number" step="0.01" min="0" placeholder="0.00"
            value={form.total_amount} onChange={e => set('total_amount', e.target.value)} />
        </Field>
        <Field label="Notas internas">
          <input className={inputCls} type="text" placeholder="Observaciones internas..."
            value={form.internal_notes} onChange={e => set('internal_notes', e.target.value)} />
        </Field>
        <Field label="🛎️ Peticiones especiales (Cliente)">
          <input className={inputCls} type="text" placeholder="Requerimientos o notas adicionales..."
            value={form.special_requests} onChange={e => set('special_requests', e.target.value)} />
        </Field>
      </div>

      {/* Preview totales */}
      {total > 0 && (
        <div className="bg-gray-900 rounded-lg p-4 text-sm space-y-1">
          {form.excursion_name && <Row label="Excursión" value={form.excursion_name} />}
          {form.plan_name && <Row label="Plan" value={form.plan_name} />}
          {form.fecha && <Row label="Fecha" value={form.fecha} />}
          <Row label="Total acordado" value={fmtMoney(total, form.nationality)} />
          {getCurrency(form.nationality) === 'USD' && (
            <Row label="Equivalente DOP" value={`RD$ ${Math.round(total * EXCHANGE_RATE).toLocaleString()}`} />
          )}
        </div>
      )}

      <button onClick={handleSubmit} disabled={loading} className={btnPrimary}>
        {loading ? 'Creando...' : 'Crear reserva de excursión'}
      </button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// COMPONENTES AUXILIARES
// ════════════════════════════════════════════════════════════
function Field({ label, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

function Row({ label, value, valueClass = 'text-white' }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  )
}

function InfoGrid({ data }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
      {data.map(([k, v]) => (
        <>
          <span key={k + '_k'} className="text-gray-400">{k}</span>
          <span key={k + '_v'} className="text-white font-medium">{v}</span>
        </>
      ))}
    </div>
  )
}

function Badge({ status }) {
  const map = {
    confirmed:          'bg-emerald-900/50 text-emerald-400 border-emerald-800',
    cancelled:          'bg-red-900/50 text-red-400 border-red-800',
    pending_validation: 'bg-amber-900/50 text-amber-400 border-amber-800',
    paid:               'bg-emerald-900/50 text-emerald-400 border-emerald-800',
    partial:            'bg-amber-900/50 text-amber-400 border-amber-800',
    unpaid:             'bg-red-900/50 text-red-400 border-red-800',
  }
  const labels = {
    confirmed: 'Confirmado', cancelled: 'Cancelado',
    pending_validation: 'Pendiente', paid: 'Pagado',
    partial: 'Parcial', unpaid: 'Sin pago',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${map[status] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
      {labels[status] || status}
    </span>
  )
}

// ── Clases base ──────────────────────────────────────────────
const inputCls   = 'w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500'
const selectCls  = inputCls
const btnPrimary = 'bg-white text-gray-950 font-medium text-sm px-5 py-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50'
const btnSecondary = 'bg-gray-800 text-gray-300 text-sm px-4 py-2 rounded-lg border border-gray-700 hover:bg-gray-700 transition-colors disabled:opacity-50'
const btnSuccess = 'text-emerald-400 text-xs px-3 py-1.5 rounded-lg border border-emerald-800 hover:bg-emerald-900/30 transition-colors'
const btnDanger  = 'text-red-400 text-xs px-3 py-1.5 rounded-lg border border-red-800 hover:bg-red-900/30 transition-colors'
