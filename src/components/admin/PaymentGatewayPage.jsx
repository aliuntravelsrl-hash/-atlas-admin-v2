/**
 * PaymentGatewayPage.jsx
 * Página de gestión de pagos — /admin/payments/:bookingRef
 * 
 * Arquitectura:
 *   Fase 1 (actual) → pago manual: efectivo / transferencia bancaria
 *   Fase 2          → integración AZUL (tarjeta local RD)
 *   Fase 3          → integración Ratehawk pago en destino
 * 
 * Aliun Travel SRL · ATLAS-TECH
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// ── Paleta Aliun ──────────────────────────────────────────────────
const C = {
  navy:    '#0A1628',
  gold:    '#C19A6B',
  dark:    '#0D1B2A',
  slate:   '#1E293B',
  muted:   '#64748B',
  border:  '#1E2D3D',
  success: '#059669',
  danger:  '#DC2626',
  warn:    '#D97706',
};

// ── Helpers ───────────────────────────────────────────────────────
const fmtDate = (d) => d ? format(new Date(d + 'T12:00:00'), 'dd MMM yyyy', { locale: es }) : '—';
const fmtMoney = (n, cur = 'USD') => {
  const num = parseFloat(n || 0);
  if (cur === 'DOP') return 'RD$ ' + num.toLocaleString('es-DO', { minimumFractionDigits: 0 });
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' USD';
};

// ── Métodos de pago disponibles ───────────────────────────────────
const METODOS = [
  { value: 'transferencia_bancaria', label: 'Transferencia Bancaria',  icon: '🏦', available: true  },
  { value: 'efectivo',              label: 'Efectivo en Oficina',      icon: '💵', available: true  },
  { value: 'azul',                  label: 'Tarjeta AZUL / Carnet',    icon: '💳', available: false },
  { value: 'ratehawk',              label: 'Pago en Destino (Ratehawk)',icon: '🏨', available: false },
];

// ── Cuentas bancarias Aliun (mock — actualizar con datos reales) ──
const BANCOS = {
  DOP: [
    { banco: 'Banco Popular Dominicano', titular: 'Aliun Travel SRL', cuenta: '812-345678-9',     tipo: 'Cta. Corriente', rnc: '1-32-XXXXX-X' },
    { banco: 'Banreservas',              titular: 'Aliun Travel SRL', cuenta: '910-234567-8',     tipo: 'Cta. Corriente', rnc: '1-32-XXXXX-X' },
  ],
  USD: [
    { banco: 'Banco Popular Dominicano', titular: 'Aliun Travel SRL', cuenta: '812-345678-9 USD', swift: 'BPDHDOMX',    iban: 'DO00BPDH0000812345678', branch: 'Av. John F. Kennedy, Santo Domingo' },
  ],
};

// ══════════════════════════════════════════════════════════════════
export default function PaymentGatewayPage() {
  const { bookingRef } = useParams();
  const navigate = useNavigate();
  const { rate: exchangeRate } = useExchangeRate();

  const [booking,   setBooking]   = useState(null);
  const [payments,  setPayments]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const [metodo,    setMetodo]    = useState('transferencia_bancaria');
  const [form,      setForm]      = useState({ amount: '', reference: '', bank: '', payer_name: '', date: '', remarks: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitOk,  setSubmitOk]  = useState(false);
  const [generandoDoc, setGenerandoDoc] = useState(false);
  const [docOk, setDocOk] = useState(false);

  // ── Generar recibo/estado de cuenta con abono ────────────────────
  const [generandoRecibo, setGenerandoRecibo] = useState(false);
  const [reciboOk, setReciboOk] = useState(false);

  const generarRecibo = async () => {
    if (!booking || paidUSD <= 0) return;
    setGenerandoRecibo(true);
    setReciboOk(false);
    try {
      const isDOP  = booking.currency === 'DOP';
      const montoDep = isDOP ? paidDisplay : paidUSD;
      const saldo    = isDOP ? Math.max(0, totalDisplay - paidDisplay) : Math.max(0, parseFloat(booking.total_amount || 0) - paidUSD);
      // WF-RECIBO-ABONO-v1 — webhook: aliun-recibo-abono
      // WF más completo: foto hotel, historial pagos, async, sin tocar payment_status
      await fetch('https://n8n-n8n.xaruuo.easypanel.host/webhook/aliun-recibo-abono', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_reference:      booking.booking_reference,
          lead_guest_name:        booking.lead_guest_name,
          lead_phone:             booking.lead_phone || '',
          hotel_name:             booking.hotels_master?.name || booking.hotel_code || '',
          hotel_zone:             booking.hotels_master?.zone || '',
          check_in:               booking.check_in,
          check_out:              booking.check_out,
          adults:                 booking.adults || 2,
          children:               booking.children || 0,
          room_name:              booking.room_name || 'Estándar',
          meal_plan:              'Todo Incluido',
          hotel_confirmation_no:  booking.hotel_confirmation_no || '',
          total_amount:           parseFloat(booking.total_amount || 0),
          total:                  parseFloat(booking.total_amount || 0),
          abono:                  parseFloat(isDOP ? paidDisplay : paidUSD),
          paid:                   parseFloat(isDOP ? paidDisplay : paidUSD),
          currency:               isDOP ? 'DOP' : 'USD',
          status:                 booking.status || 'confirmed',
          payments:               payments.map(p => ({
            method:     p.method || 'transferencia',
            amount:     isDOP ? Math.round(parseFloat(p.amount) * rate) : parseFloat(p.amount),
            currency:   isDOP ? 'DOP' : 'USD',
            created_at: p.created_at,
          })),
        })
      });
      setReciboOk(true);
    } catch(e) {
      console.error('Error generando recibo:', e);
    } finally {
      setGenerandoRecibo(false);
    }
  };

  // ── Generar documento según estado de la reserva ─────────────────
  // 1. Sin abono  → Cotización     (WF-COTIZACION-GOTENBERG-v2, aliun-cotizacion-individual)
  // 2. Con abono  → Estado Cuenta  (WF-RECIBO-ABONO-v1, aliun-recibo-abono)
  // 3. Pagado     → Voucher        (WF-VOUCHER-GOTENBERG-v1, aliun-voucher)
  const generarFactura = async () => {
    if (!booking) return;
    setGenerandoDoc(true);
    setDocOk(false);
    try {
      const isDOP  = booking.currency === 'DOP';
      const total  = parseFloat(booking.total_amount || 0);
      const slug   = booking.hotel_code || booking.hotels_master?.slug || '';
      const nights = booking.nights || Math.round((new Date(booking.check_out) - new Date(booking.check_in)) / 86400000);

      let webhook, payload;

      if (isPaid) {
        // ── VOUCHER — pagado completo, sin datos contables ─────────
        webhook = 'https://n8n-n8n.xaruuo.easypanel.host/webhook/aliun-voucher';
        payload = {
          id_reserva:       booking.booking_reference,
          hotel_slug:       slug,
          nombre:           booking.lead_guest_name,
          lead_guest_name:  booking.lead_guest_name,
          lead_phone:       booking.lead_phone || '',
          check_in:         booking.check_in,
          check_out:        booking.check_out,
          noches:           nights,
          nights:           nights,
          adults:           booking.adults || 2,
          children:         booking.children || 0,
          room_name:        booking.room_name || 'Estándar',
          habitacion:       booking.room_name || 'Estándar',
          regimen:          'Todo Incluido',
          provider_locator: booking.hotel_confirmation_no || 'PENDIENTE',
        };
      } else if (paidUSD > 0) {
        // ── ESTADO DE CUENTA — hay abono registrado ────────────────
        webhook = 'https://n8n-n8n.xaruuo.easypanel.host/webhook/aliun-recibo-abono';
        payload = {
          booking_reference:     booking.booking_reference,
          lead_guest_name:       booking.lead_guest_name,
          lead_phone:            booking.lead_phone || '',
          hotel_name:            booking.hotels_master?.name || booking.hotel_code || '',
          hotel_zone:            booking.hotels_master?.zone || '',
          check_in:              booking.check_in,
          check_out:             booking.check_out,
          adults:                booking.adults || 2,
          children:              booking.children || 0,
          room_name:             booking.room_name || 'Estándar',
          meal_plan:             'Todo Incluido',
          hotel_confirmation_no: booking.hotel_confirmation_no || '',
          total:                 totalDisplay,
          total_amount:          totalDisplay,
          abono:                 paidDisplay,
          paid:                  paidDisplay,
          currency:              isDOP ? 'DOP' : 'USD',
          status:                booking.status || 'confirmed',
          payments:              payments.map(p => ({
            method:     p.method || 'transferencia',
            amount:     isDOP ? Math.round(parseFloat(p.amount) * rate) : parseFloat(p.amount),
            currency:   isDOP ? 'DOP' : 'USD',
            created_at: p.created_at,
          })),
        };
      } else {
        // ── COTIZACIÓN — sin abono ─────────────────────────────────
        webhook = 'https://n8n-n8n.xaruuo.easypanel.host/webhook/aliun-cotizacion-individual';
        payload = {
          cotizacion_id:    booking.booking_reference,
          hotel_slug:       slug,
          hotel_name:       booking.hotels_master?.name || booking.hotel_code || '',
          cliente_nombre:   booking.lead_guest_name,
          check_in:         booking.check_in,
          check_out:        booking.check_out,
          pax_adultos:      booking.adults || 2,
          pax_ninos:        booking.children || 0,
          habitaciones:     1,
          plan_alimenticio: 'Todo Incluido',
          tipo_hab:         booking.room_name || 'Estándar',
          precio_total_dop: isDOP ? total : 0,
          precio_total_usd: isDOP ? 0 : total,
          moneda:           isDOP ? 'DOP' : 'USD',
          tipo_documento:   'COTIZACION',
          deposito_usd:     0,
          deposito_dop:     0,
          saldo_usd:        isDOP ? 0 : total,
          saldo_dop:        isDOP ? total : 0,
        };
      }

      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setDocOk(true);
    } catch(e) {
      console.error('Error generando documento:', e);
    } finally {
      setGenerandoDoc(false);
    }
  };
  const [submitErr, setSubmitErr] = useState(null);

  // ── Cargar reserva y pagos ─────────────────────────────────────
  useEffect(() => {
    if (!bookingRef) return;
    const load = async () => {
      setLoading(true);
      const { data: bk } = await supabase
        .from('bookings')
        .select(`
          id, booking_reference, lead_guest_name, lead_email, lead_phone,
          nationality, currency, total_amount, total_amount_dop,
          deposit_amount, deposit_amount_dop, payment_status,
          status, fulfillment_status, check_in, check_out, nights,
          room_name, adults, children, hotel_confirmation_no, hotel_code,
          hotels_master ( name, zone, stars )
        `)
        .eq('booking_reference', bookingRef)
        .single();

      const { data: pgs } = await supabase
        .from('atlas_payments')
        .select('id, amount, currency, method, payment_type, reference, payer_name, created_at, status')
        .eq('booking_id', bk?.id)
        .in('status', ['approved', 'confirmed'])
        .order('created_at', { ascending: false });

      setBooking(bk || null);
      setPayments(pgs || []);
      if (bk) {
        setForm(f => ({ ...f, amount: '', payer_name: bk.lead_guest_name || '' }));
      }
      setLoading(false);
    };
    load();
  }, [bookingRef]);

  // ── Cálculos financieros ───────────────────────────────────────
  const cur      = booking?.currency || 'USD';
  const isDOP    = cur === 'DOP';
  const total    = parseFloat(booking?.total_amount || 0);
  const rate     = exchangeRate || 60;

  const paidUSD  = payments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const paidDisplay  = isDOP ? Math.round(paidUSD * rate) : paidUSD;
  const totalDisplay = isDOP ? Math.round(total) : parseFloat(booking?.total_amount || 0);
  const balance      = Math.max(0, totalDisplay - paidDisplay);
  const pct          = totalDisplay > 0 ? Math.min(100, Math.round((paidDisplay / totalDisplay) * 100)) : 0;
  const isPaid       = pct >= 100;

  const bancos = BANCOS[isDOP ? 'DOP' : 'USD'] || [];

  // ── Registrar pago ─────────────────────────────────────────────
  const handleSubmit = async () => {
    const rawAmount = parseFloat(form.amount);
    if (!rawAmount || rawAmount <= 0) { setSubmitErr('Ingresa el monto.'); return; }
    if (!metodo) { setSubmitErr('Selecciona un método de pago.'); return; }

    setSubmitting(true);
    setSubmitErr(null);
    setSubmitOk(false);

    const amountUSD = isDOP ? parseFloat((rawAmount / rate).toFixed(2)) : rawAmount;
    const amountDOP = isDOP ? Math.round(rawAmount) : Math.round(rawAmount * rate);
    const totalUSD  = isDOP ? parseFloat((total / rate).toFixed(2)) : total;
    const newPaid   = paidUSD + amountUSD;
    const newStatus = newPaid >= totalUSD ? 'paid' : 'partial';

    const { error: e1 } = await supabaseAdmin.from('atlas_payments').insert({
      booking_id:   booking.id,
      amount:       amountUSD,
      currency:     'USD',
      method:       metodo,
      payment_type: 'deposito',
      reference:    form.reference || null,
      payer_name:   form.payer_name || null,
      status:       'approved',
      approved_by:  'admin',
      approved_at:  new Date().toISOString(),
      evidence: {
        manual: true, registered_by: 'payment_gateway_page',
        original_currency: cur, original_amount: rawAmount,
        exchange_rate: rate, amount_dop: amountDOP,
        bank: form.bank || null, date: form.date || null, remarks: form.remarks || null,
      },
    });

    if (e1) { setSubmitting(false); setSubmitErr('Error: ' + e1.message); return; }

    const newDepositDOP = parseFloat(booking.deposit_amount_dop || 0) + amountDOP;
    await supabaseAdmin.from('bookings').update({
      payment_status:     newStatus,
      deposit_amount:     parseFloat((paidUSD + amountUSD).toFixed(2)),
      deposit_amount_dop: newDepositDOP,
      updated_at:         new Date().toISOString(),
    }).eq('id', booking.id);

    setPayments(prev => [
      { id: Date.now(), amount: amountUSD, currency: 'USD', method: metodo,
        reference: form.reference, payer_name: form.payer_name,
        created_at: new Date().toISOString(), status: 'approved' },
      ...prev
    ]);
    setForm(f => ({ ...f, amount: '', reference: '', bank: '', date: '', remarks: '' }));
    setSubmitOk(true);
    setSubmitting(false);
  };

  // ── Loading / Error ────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: C.gold }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${C.gold}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' }}>Cargando reserva...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  if (!booking) return (
    <div style={{ minHeight: '100vh', background: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#fff' }}>
        <p style={{ fontSize: 32, marginBottom: 8 }}>⚠️</p>
        <p style={{ fontSize: 14, color: C.muted }}>Reserva <strong style={{ color: '#fff' }}>{bookingRef}</strong> no encontrada.</p>
        <button onClick={() => navigate('/admin/bookings')} style={{ marginTop: 20, padding: '10px 24px', background: C.gold, color: C.navy, border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
          ← Volver a Reservas
        </button>
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.dark, fontFamily: 'Inter, system-ui, sans-serif', color: '#fff' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        .pay-input { background: #0F1E30; border: 1.5px solid #1E2D3D; border-radius: 10px; padding: 10px 14px; color: #fff; font-size: 14px; width: 100%; outline: none; transition: border-color .2s; }
        .pay-input:focus { border-color: #C19A6B; }
        .pay-input::placeholder { color: #475569; }
        .pay-select { background: #0F1E30; border: 1.5px solid #1E2D3D; border-radius: 10px; padding: 10px 14px; color: #fff; font-size: 14px; width: 100%; outline: none; cursor: pointer; }
        .method-card { background: #0F1E30; border: 1.5px solid #1E2D3D; border-radius: 12px; padding: 14px 18px; cursor: pointer; transition: all .2s; display: flex; align-items: center; gap: 12px; }
        .method-card:hover { border-color: #C19A6B44; }
        .method-card.active { border-color: #C19A6B; background: #0A1628; }
        .method-card.disabled { opacity: 0.4; cursor: not-allowed; }
        .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .badge-paid    { background: #05966920; color: #059669; border: 1px solid #05966940; }
        .badge-partial { background: #D9770620; color: #D97706; border: 1px solid #D9770640; }
        .badge-unpaid  { background: #DC262620; color: #DC2626; border: 1px solid #DC262640; }
        .copy-field { cursor: pointer; user-select: all; }
        .copy-field:hover { color: #C19A6B; text-decoration: underline; }
        .progress-bar { height: 6px; background: #1E2D3D; border-radius: 999px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 999px; transition: width .6s ease; }
        .section-title { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #64748B; margin-bottom: 16px; }
        .divider { border: none; border-top: 1px solid #1E2D3D; margin: 24px 0; }
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div style={{ background: C.navy, borderBottom: `1px solid ${C.border}`, padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <button onClick={() => navigate('/admin/bookings')} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>←</button>
          <div>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2 }}>Gestión de Pago</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: 1 }}>{booking.booking_reference}</span>
              <span className={`badge badge-${booking.payment_status === 'paid' ? 'paid' : booking.payment_status === 'partial' ? 'partial' : 'unpaid'}`}>
                {booking.payment_status === 'paid' ? '✓ Pagado' : booking.payment_status === 'partial' ? 'Parcial' : 'Pendiente'}
              </span>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Saldo pendiente</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: isPaid ? C.success : C.gold }}>
            {fmtMoney(balance, cur)}
          </div>
        </div>
      </div>

      {/* ── BODY ───────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 28, alignItems: 'start' }}>

        {/* ── COL IZQUIERDA ─────────────────────────────────────── */}
        <div>

          {/* Resumen de la reserva */}
          <div style={{ background: C.navy, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 24 }}>
            <div className="section-title">Detalle de la Reserva</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 32px' }}>
              {[
                ['Hotel',        booking.hotels_master?.name || booking.hotel_code || '—'],
                ['Huésped',      booking.lead_guest_name],
                ['Check-in',     fmtDate(booking.check_in)],
                ['Check-out',    fmtDate(booking.check_out)],
                ['Habitación',   booking.room_name || '—'],
                ['Ocupación',    `${booking.adults || 0} adultos${booking.children ? ' · ' + booking.children + ' niños' : ''}`],
                ['Conf. Hotel',  booking.hotel_confirmation_no || 'Pendiente'],
                ['Email',        booking.lead_email || '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#E2E8F0' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Resumen financiero */}
          <div style={{ background: C.navy, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 24 }}>
            <div className="section-title">Resumen Financiero</div>

            {/* Barra de progreso */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: C.muted }}>Progreso de cobro</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: isPaid ? C.success : C.gold }}>{pct}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${pct}%`, background: isPaid ? C.success : C.gold }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              {[
                ['Total',    fmtMoney(totalDisplay, cur), '#94A3B8'],
                ['Cobrado',  fmtMoney(paidDisplay,  cur), C.success],
                ['Pendiente',fmtMoney(balance,      cur), isPaid ? C.success : C.gold],
              ].map(([label, value, color]) => (
                <div key={label} style={{ background: '#0F1E30', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Historial de pagos */}
          <div style={{ background: C.navy, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
            <div className="section-title">Historial de Pagos</div>
            {payments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: 13 }}>
                Sin pagos registrados aún.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Fecha', 'Método', 'Referencia', 'Pagador', 'Monto'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, i) => (
                    <tr key={p.id || i} style={{ borderBottom: `1px solid ${C.border}`, transition: 'background .15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#0F1E30'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '12px 12px', color: '#94A3B8' }}>{p.created_at ? format(new Date(p.created_at), 'dd MMM yyyy', { locale: es }) : '—'}</td>
                      <td style={{ padding: '12px 12px', color: '#E2E8F0', fontWeight: 600 }}>{p.method?.replace('_', ' ') || '—'}</td>
                      <td style={{ padding: '12px 12px', color: '#94A3B8', fontFamily: 'monospace', fontSize: 12 }}>{p.reference || '—'}</td>
                      <td style={{ padding: '12px 12px', color: '#94A3B8' }}>{p.payer_name || '—'}</td>
                      <td style={{ padding: '12px 12px', fontWeight: 700, color: C.success, textAlign: 'right' }}>
                        {fmtMoney(isDOP ? parseFloat(p.amount) * rate : parseFloat(p.amount), cur)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── BOTÓN GENERAR FACTURA ── */}
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button
              onClick={generarFactura}
              disabled={generandoDoc}
              style={{
                flex: 1, padding: '12px 16px', borderRadius: 12,
                fontWeight: 800, fontSize: 13, cursor: generandoDoc ? 'wait' : 'pointer',
                border: `1.5px solid ${C.gold}`, background: C.navy, color: C.gold,
                letterSpacing: 1, transition: 'all .2s',
                opacity: generandoDoc ? 0.6 : 1,
              }}
            >
              {generandoDoc ? '⏳ Generando...' :
                isPaid    ? '🏨 Voucher Hotel' :
                paidUSD > 0 ? '🧾 Estado de Cuenta' :
                              '📋 Cotización'}
            </button>
          </div>
          {docOk && (
          </div>
          {docOk && (
            <div style={{
              marginTop: 8, padding: '10px 14px', borderRadius: 10,
              background: '#05966915', border: '1px solid #05966940',
              fontSize: 12, color: '#059669', textAlign: 'center'
            }}>
              ✅ Documento generado — revisa Telegram 683265740
            </div>
          )}
        </div>

        {/* ── COL DERECHA ───────────────────────────────────────── */}
        <div style={{ position: 'sticky', top: 80 }}>

          {isPaid ? (
            <div style={{ background: C.navy, border: `1px solid ${C.success}40`, borderRadius: 16, padding: 28, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.success, marginBottom: 8 }}>Reserva Saldada</div>
              <p style={{ fontSize: 13, color: C.muted }}>Esta reserva tiene el pago completo registrado.</p>
              <button onClick={() => navigate('/admin/bookings')} style={{ marginTop: 20, width: '100%', padding: '12px', background: C.gold, color: C.navy, border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer', letterSpacing: 1 }}>
                Ver en Reservas →
              </button>
            </div>
          ) : (
            <>
              {/* Métodos de pago */}
              <div style={{ background: C.navy, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 20 }}>
                <div className="section-title">Método de Pago</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {METODOS.map(m => (
                    <div key={m.value}
                      className={`method-card ${!m.available ? 'disabled' : metodo === m.value ? 'active' : ''}`}
                      onClick={() => m.available && setMetodo(m.value)}
                    >
                      <span style={{ fontSize: 22 }}>{m.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: metodo === m.value ? C.gold : '#E2E8F0' }}>{m.label}</div>
                        {!m.available && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Próximamente — Fase 2</div>}
                      </div>
                      {m.available && (
                        <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${metodo === m.value ? C.gold : C.border}`, background: metodo === m.value ? C.gold : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s' }}>
                          {metodo === m.value && <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.navy }} />}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Formulario de pago */}
              <div style={{ background: C.navy, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 20 }}>
                <div className="section-title">Detalles del Pago</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>
                      Monto ({isDOP ? 'RD$' : 'USD'}) *
                    </label>
                    <input className="pay-input" type="number" step={isDOP ? '1' : '0.01'}
                      placeholder={isDOP ? 'Ej: 5,000' : '0.00'}
                      value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                    {form.amount > 0 && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                        ≈ {isDOP ? `$${(parseFloat(form.amount)/rate).toFixed(2)} USD` : `RD$ ${Math.round(parseFloat(form.amount)*rate).toLocaleString('es-DO')}`}
                        {'  ·  Tasa: '}{rate} DOP/USD
                      </div>
                    )}
                  </div>

                  {metodo === 'transferencia_bancaria' && (
                    <div>
                      <label style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>N° Comprobante / Referencia</label>
                      <input className="pay-input" placeholder="Ej: BHD 223399674"
                        value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Nombre del Pagador</label>
                    <input className="pay-input" placeholder="Quién realizó el pago"
                      value={form.payer_name} onChange={e => setForm(f => ({ ...f, payer_name: e.target.value }))} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Fecha</label>
                      <input className="pay-input" type="date"
                        value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Banco</label>
                      <input className="pay-input" placeholder="BHD, Popular..."
                        value={form.bank} onChange={e => setForm(f => ({ ...f, bank: e.target.value }))} />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Notas / Observaciones</label>
                    <textarea className="pay-input" rows={2} placeholder="Observaciones opcionales..."
                      value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                      style={{ resize: 'vertical', minHeight: 60 }} />
                  </div>

                  {submitErr && (
                    <div style={{ background: '#DC262615', border: '1px solid #DC262640', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#DC2626' }}>⚠️ {submitErr}</div>
                  )}
                  {submitOk && (
                    <div style={{ background: '#05966915', border: '1px solid #05966940', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: C.success }}>✅ Pago registrado correctamente.</div>
                  )}

                  <button onClick={handleSubmit} disabled={submitting} style={{
                    width: '100%', padding: '14px', borderRadius: 12, fontWeight: 800, fontSize: 14,
                    letterSpacing: 1, cursor: submitting ? 'wait' : 'pointer', border: `1.5px solid ${C.gold}`,
                    background: submitting ? C.slate : C.navy, color: C.gold, transition: 'all .2s',
                  }}>
                    {submitting ? '⏳ Registrando...' : '💳 Confirmar Pago'}
                  </button>
                </div>
              </div>

              {/* Datos bancarios Aliun */}
              <div style={{ background: C.navy, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ background: '#0A1628', padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, color: C.gold, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2 }}>Transferir a</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Datos para {isDOP ? 'RD$' : 'USD'} · Aliun Travel SRL</div>
                </div>
                {bancos.map((b, i) => (
                  <div key={i} style={{ padding: 20, borderBottom: i < bancos.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    <div style={{ fontWeight: 700, color: '#E2E8F0', marginBottom: 12, fontSize: 13 }}>{b.banco}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                      {Object.entries(b).filter(([k]) => k !== 'banco').map(([key, val]) => (
                        <div key={key}>
                          <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
                            {key === 'titular' ? 'Titular' : key === 'cuenta' ? 'N° Cuenta' : key === 'tipo' ? 'Tipo' : key === 'rnc' ? 'RNC' : key === 'swift' ? 'SWIFT' : key === 'iban' ? 'IBAN' : key === 'branch' ? 'Sucursal' : key}
                          </div>
                          <div className="copy-field" style={{ fontSize: 12, fontWeight: 700, color: '#CBD5E1', fontFamily: ['cuenta','iban','swift'].includes(key) ? 'monospace' : 'inherit' }}
                               title="Clic para copiar" onClick={() => navigator.clipboard?.writeText(val)}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ padding: '10px 20px', background: '#0F1E30', borderTop: `1px solid ${C.border}` }}>
                  <p style={{ fontSize: 10, color: C.muted, textAlign: 'center' }}>
                    Referencia de pago: <strong style={{ color: '#94A3B8', cursor: 'pointer' }} onClick={() => navigator.clipboard?.writeText(booking.booking_reference)}>{booking.booking_reference}</strong>
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
