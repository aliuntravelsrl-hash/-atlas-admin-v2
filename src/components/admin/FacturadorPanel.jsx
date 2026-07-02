/**
 * FacturadorPanel.jsx
 * Generador de facturas individuales y grupales via Gotenberg.
 * El Director puede generar ambos tipos sin depender de ATLAS-TECH.
 * Quedan registradas en Supabase Storage + logs_operativos.
 */
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

const N8N_BASE = 'https://n8n-n8n.xaruuo.easypanel.host';
const NAVY = '#0A1628';
const GOLD = '#B8860B';

// ── helpers ────────────────────────────────────────────────────────
const fmtDOP = (n) => 'RD$ ' + parseFloat(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 0 });
const fmtDate = (iso) => {
  if (!iso) return '';
  const m = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  const d = new Date(iso + 'T12:00:00');
  return d.getDate() + ' ' + m[d.getMonth()] + ' ' + d.getFullYear();
};
const genRef = (prefix) => prefix + '-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-4);

// ── Sub-componente: fila de habitación en modo grupal ──────────────
const HabRow = ({ hab, idx, onChange, onRemove }) => (
  <div className="grid grid-cols-12 gap-2 items-center py-2 border-b border-slate-800">
    <div className="col-span-1 text-center text-xs font-black text-slate-500">{idx + 1}</div>
    <input
      className="col-span-3 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-yellow-600"
      placeholder="Nombre huésped"
      value={hab.huesped}
      onChange={e => onChange(idx, 'huesped', e.target.value)}
    />
    <select
      className="col-span-2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-yellow-600"
      value={hab.tipo}
      onChange={e => onChange(idx, 'tipo', e.target.value)}
    >
      <option value="Doble">Doble</option>
      <option value="Triple">Triple</option>
      <option value="Single">Single</option>
      <option value="Suite">Suite</option>
      <option value="Junior Suite">Junior Suite</option>
    </select>
    <input
      className="col-span-3 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-yellow-600"
      placeholder="PAX (ej: 2 adultos + 1 niño)"
      value={hab.pax}
      onChange={e => onChange(idx, 'pax', e.target.value)}
    />
    <input
      type="number"
      className="col-span-2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-yellow-600"
      placeholder="Precio DOP"
      value={hab.precio}
      onChange={e => onChange(idx, 'precio', e.target.value)}
    />
    <button
      onClick={() => onRemove(idx)}
      className="col-span-1 text-rose-500 hover:text-rose-400 text-lg font-black text-center"
    >✕</button>
  </div>
);

// ── Componente principal ────────────────────────────────────────────
export default function FacturadorPanel({ booking }) {
  const [modo, setModo] = useState('individual'); // 'individual' | 'grupal'
  const [generando, setGenerando] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [error, setError] = useState(null);

  // ── Estado individual ─────────────────────────────────────────────
  const [indiv, setIndiv] = useState({
    factura_num: '',
    hotel: '',
    hotel_slug: '',
    check_in: '',
    check_out: '',
    guest_lider: '',
    tipo_hab: 'Doble',
    plan: 'Todo Incluido',
    pax_adultos: 2,
    pax_ninos: 0,
    habitaciones: 1,
    precio_total_dop: '',
    precio_total_usd: '',
    notas: ''
  });

  // ── Estado grupal ─────────────────────────────────────────────────
  const [grupal, setGrupal] = useState({
    factura_num: '',
    hotel: '',
    check_in: '',
    check_out: '',
    guest_lider: '',
    plan: 'Todo Incluido',
    validez: '',
    deposito_pct: 50
  });
  const [habitaciones, setHabitaciones] = useState([
    { huesped: '', tipo: 'Doble', pax: '2 Adultos', precio: '' }
  ]);

  // Pre-cargar datos de la reserva seleccionada en modo individual
  useEffect(() => {
    if (!booking) return;
    const hotelName = booking.hotels_master?.name || booking.hotel_name || '';
    const hotelSlug = booking.hotels_master?.slug || booking.hotel_slug || '';
    setIndiv(prev => ({
      ...prev,
      factura_num: genRef('FAC'),
      hotel: hotelName,
      hotel_slug: hotelSlug,
      check_in: booking.check_in || '',
      check_out: booking.check_out || '',
      guest_lider: booking.lead_guest_name || booking.guest_name || '',
      tipo_hab: booking.room_type || 'Doble',
      plan: booking.meal_plan || 'Todo Incluido',
      pax_adultos: booking.adults || 2,
      pax_ninos: booking.children || 0,
      precio_total_dop: booking.total_amount_dop || '',
      precio_total_usd: booking.total_amount || ''
    }));
    setGrupal(prev => ({
      ...prev,
      factura_num: genRef('FAC-GROUP'),
      hotel: hotelName,
      check_in: booking.check_in || '',
      check_out: booking.check_out || '',
      guest_lider: booking.lead_guest_name || booking.guest_name || ''
    }));
  }, [booking?.id]);

  // ── Calcular noches ───────────────────────────────────────────────
  const calcNoches = (ci, co) => {
    if (!ci || !co) return 0;
    return Math.round((new Date(co) - new Date(ci)) / 86400000);
  };

  // ── Total grupal ──────────────────────────────────────────────────
  const totalGrupal = habitaciones.reduce((s, h) => s + parseFloat(h.precio || 0), 0);
  const noches = modo === 'individual'
    ? calcNoches(indiv.check_in, indiv.check_out)
    : calcNoches(grupal.check_in, grupal.check_out);

  // ── Habitaciones: add / update / remove ──────────────────────────
  const addHab = () => setHabitaciones(p => [...p, { huesped: '', tipo: 'Doble', pax: '2 Adultos', precio: '' }]);
  const updateHab = (idx, field, val) => setHabitaciones(p => p.map((h, i) => i === idx ? { ...h, [field]: val } : h));
  const removeHab = (idx) => setHabitaciones(p => p.filter((_, i) => i !== idx));

  // ── Log en Supabase ───────────────────────────────────────────────
  const logFactura = async (tipo, ref, url, hotel) => {
    try {
      await supabase.from('logs_operativos').insert({
        nivel: 'INFO',
        origen: 'FACTURADOR-ADMIN',
        evento: tipo === 'individual' ? 'FACTURA_INDIVIDUAL_GENERADA' : 'FACTURA_GRUPAL_GENERADA',
        mensaje: `${tipo.toUpperCase()} — ${ref} | Hotel: ${hotel} | PDF: ${url}`,
        resuelto: true
      });
    } catch (e) { console.error('Log error:', e); }
  };

  // ── Generar factura INDIVIDUAL ────────────────────────────────────
  const generarIndividual = async () => {
    const isUSD = !indiv.precio_total_dop && !!indiv.precio_total_usd;
    if (!indiv.hotel || !indiv.check_in || !indiv.check_out) {
      setError('Completa hotel y fechas.');
      return;
    }
    if (!indiv.precio_total_dop && !indiv.precio_total_usd) {
      setError('Ingresa el precio total (DOP o USD).');
      return;
    }
    setGenerando(true);
    setError(null);
    setPdfUrl(null);
    try {
      const ref = indiv.factura_num || genRef('FAC');
      const payload = {
        cotizacion_id: ref,
        hotel_slug: indiv.hotel_slug || indiv.hotel.toLowerCase().replace(/\s+/g, '-'),
        hotel_name: indiv.hotel,
        cliente_nombre: indiv.guest_lider,
        check_in: indiv.check_in,
        check_out: indiv.check_out,
        pax_adultos: parseInt(indiv.pax_adultos) || 2,
        pax_ninos: parseInt(indiv.pax_ninos) || 0,
        habitaciones: parseInt(indiv.habitaciones) || 1,
        plan_alimenticio: indiv.plan,
        tipo_hab: indiv.tipo_hab,
        precio_total_dop: parseFloat(indiv.precio_total_dop) || 0,
        precio_total_usd: parseFloat(indiv.precio_total_usd) || 0,
        moneda: isUSD ? 'USD' : 'DOP'
      };

      const res = await fetch(`${N8N_BASE}/webhook/aliun-cotizacion-individual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      const url = data.pdf_url || data.url;
      if (!url) throw new Error('No se recibió URL del PDF');
      setPdfUrl(url);
      await logFactura('individual', ref, url, indiv.hotel);
    } catch (e) {
      setError('Error generando factura: ' + e.message);
    } finally {
      setGenerando(false);
    }
  };

  // ── Generar factura GRUPAL ────────────────────────────────────────
  const generarGrupal = async () => {
    if (!grupal.hotel || !grupal.check_in || !grupal.check_out) {
      setError('Completa hotel y fechas.');
      return;
    }
    if (habitaciones.some(h => !h.huesped || !h.precio)) {
      setError('Todas las habitaciones deben tener huésped y precio.');
      return;
    }
    setGenerando(true);
    setError(null);
    setPdfUrl(null);
    try {
      const ref = grupal.factura_num || genRef('FAC-GROUP');
      const payload = {
        factura_num: ref,
        hotel: grupal.hotel,
        check_in: grupal.check_in,
        check_out: grupal.check_out,
        noches: calcNoches(grupal.check_in, grupal.check_out),
        plan: grupal.plan,
        guest_lider: grupal.guest_lider,
        validez: grupal.validez,
        deposito_pct: grupal.deposito_pct,
        habitaciones: habitaciones.map((h, i) => ({
          num: i + 1,
          huesped: h.huesped,
          tipo: h.tipo,
          pax: h.pax,
          precio: parseFloat(h.precio) || 0
        })),
        condiciones: [
          `${grupal.deposito_pct}% de depósito requerido para confirmar las reservas del grupo.`,
          'Saldo restante debe liquidarse antes del check-in.',
          `Precios en pesos dominicanos (DOP). Incluyen impuestos y plan ${grupal.plan}.`,
          'Política de cancelación según contrato con el proveedor.'
        ]
      };

      const res = await fetch(`${N8N_BASE}/webhook/factura-grupal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      const url = data.pdf_url || data.url;
      if (!url) throw new Error('No se recibió URL del PDF');
      setPdfUrl(url);
      await logFactura('grupal', ref, url, grupal.hotel);
    } catch (e) {
      setError('Error generando factura: ' + e.message);
    } finally {
      setGenerando(false);
    }
  };

  // ── Input helper ──────────────────────────────────────────────────
  const Field = ({ label, children }) => (
    <div>
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{label}</label>
      {children}
    </div>
  );
  const Input = ({ value, onChange, placeholder, type = 'text' }) => (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-600"
    />
  );
  const Select = ({ value, onChange, options }) => (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-600"
    >
      {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
    </select>
  );

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 py-2">

      {/* Selector de modo */}
      <div className="flex gap-2">
        {['individual', 'grupal'].map(m => (
          <button
            key={m}
            onClick={() => { setModo(m); setPdfUrl(null); setError(null); }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition border ${
              modo === m
                ? 'bg-yellow-600/15 border-yellow-600/50 text-yellow-500'
                : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'
            }`}
          >
            {m === 'individual' ? '📄 Factura Individual' : '📋 Factura Grupal'}
          </button>
        ))}
      </div>

      {/* ── MODO INDIVIDUAL ────────────────────────────────────────── */}
      {modo === 'individual' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="N° Factura">
              <Input value={indiv.factura_num} onChange={v => setIndiv(p => ({...p, factura_num: v}))} placeholder="FAC-2026-..." />
            </Field>
            <Field label="Hotel">
              <Input value={indiv.hotel} onChange={v => setIndiv(p => ({...p, hotel: v}))} placeholder="Nombre del hotel" />
            </Field>
            <Field label="Check-in">
              <Input type="date" value={indiv.check_in} onChange={v => setIndiv(p => ({...p, check_in: v}))} />
            </Field>
            <Field label="Check-out">
              <Input type="date" value={indiv.check_out} onChange={v => setIndiv(p => ({...p, check_out: v}))} />
            </Field>
            <Field label="Huésped principal">
              <Input value={indiv.guest_lider} onChange={v => setIndiv(p => ({...p, guest_lider: v}))} placeholder="Nombre completo" />
            </Field>
            <Field label="Plan alimenticio">
              <Select value={indiv.plan} onChange={v => setIndiv(p => ({...p, plan: v}))}
                options={['Todo Incluido','Solo Alojamiento','Desayuno Incluido','Media Pensión']} />
            </Field>
            <Field label="Tipo habitación">
              <Select value={indiv.tipo_hab} onChange={v => setIndiv(p => ({...p, tipo_hab: v}))}
                options={['Doble','Triple','Single','Junior Suite','Suite']} />
            </Field>
            <Field label="Adultos">
              <Input type="number" value={indiv.pax_adultos} onChange={v => setIndiv(p => ({...p, pax_adultos: v}))} />
            </Field>
            <Field label="Niños">
              <Input type="number" value={indiv.pax_ninos} onChange={v => setIndiv(p => ({...p, pax_ninos: v}))} />
            </Field>
            <Field label="Habitaciones">
              <Input type="number" value={indiv.habitaciones} onChange={v => setIndiv(p => ({...p, habitaciones: v}))} />
            </Field>
            <Field label="Moneda de factura">
              <Select
                value={indiv.precio_total_dop ? 'DOP' : 'USD'}
                onChange={v => {
                  if (v === 'DOP') setIndiv(p => ({...p, precio_total_usd: ''}));
                  else setIndiv(p => ({...p, precio_total_dop: ''}));
                }}
                options={[{value:'DOP',label:'🇩🇴 DOP — Cliente dominicano'},{value:'USD',label:'🇺🇸 USD — Cliente extranjero'}]}
              />
            </Field>
            {(indiv.precio_total_dop || !indiv.precio_total_usd) && (
              <Field label="Total DOP">
                <Input type="number" value={indiv.precio_total_dop} onChange={v => setIndiv(p => ({...p, precio_total_dop: v, precio_total_usd: ''}))} placeholder="Ej: 35300" />
              </Field>
            )}
            <Field label={indiv.precio_total_dop ? 'Total USD (opcional)' : 'Total USD'}>
              <Input type="number" value={indiv.precio_total_usd} onChange={v => setIndiv(p => ({...p, precio_total_usd: v, precio_total_dop: ''}))} placeholder="Ej: 670" />
            </Field>
          </div>

          {/* Resumen */}
          {indiv.check_in && indiv.check_out && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-400 flex gap-6">
              <span>🌙 {noches} {noches === 1 ? 'noche' : 'noches'}</span>
              {indiv.precio_total_dop && <span>💰 {fmtDOP(indiv.precio_total_dop)}</span>}
              {indiv.precio_total_usd && !indiv.precio_total_dop && <span>💵 ${parseFloat(indiv.precio_total_usd).toLocaleString('en-US', {minimumFractionDigits: 2})} USD</span>}
            </div>
          )}
        </div>
      )}

      {/* ── MODO GRUPAL ────────────────────────────────────────────── */}
      {modo === 'grupal' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="N° Factura">
              <Input value={grupal.factura_num} onChange={v => setGrupal(p => ({...p, factura_num: v}))} placeholder="FAC-GROUP-..." />
            </Field>
            <Field label="Hotel">
              <Input value={grupal.hotel} onChange={v => setGrupal(p => ({...p, hotel: v}))} placeholder="Nombre del hotel" />
            </Field>
            <Field label="Check-in">
              <Input type="date" value={grupal.check_in} onChange={v => setGrupal(p => ({...p, check_in: v}))} />
            </Field>
            <Field label="Check-out">
              <Input type="date" value={grupal.check_out} onChange={v => setGrupal(p => ({...p, check_out: v}))} />
            </Field>
            <Field label="Guest líder (nombre del grupo)">
              <Input value={grupal.guest_lider} onChange={v => setGrupal(p => ({...p, guest_lider: v}))} placeholder="Ej: FAMILIA GARCÍA" />
            </Field>
            <Field label="Plan alimenticio">
              <Select value={grupal.plan} onChange={v => setGrupal(p => ({...p, plan: v}))}
                options={['Todo Incluido','Solo Alojamiento','Desayuno Incluido','Media Pensión']} />
            </Field>
            <Field label="% Depósito requerido">
              <Select value={String(grupal.deposito_pct)} onChange={v => setGrupal(p => ({...p, deposito_pct: parseInt(v)}))}
                options={[{value:'30',label:'30%'},{value:'50',label:'50%'},{value:'100',label:'100% (pago total)'}]} />
            </Field>
            <Field label="Válida hasta (opcional)">
              <Input type="date" value={grupal.validez} onChange={v => setGrupal(p => ({...p, validez: v}))} />
            </Field>
          </div>

          {/* Tabla de habitaciones */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-yellow-600 uppercase tracking-wider">
                Habitaciones ({habitaciones.length})
              </span>
              <button
                onClick={addHab}
                className="text-xs font-black px-3 py-1 rounded-lg bg-yellow-600/15 border border-yellow-600/30 text-yellow-500 hover:bg-yellow-600/25 transition"
              >
                + Agregar habitación
              </button>
            </div>

            {/* Headers */}
            <div className="grid grid-cols-12 gap-2 pb-1 border-b border-slate-700">
              {['#','Huésped','Tipo','PAX','Precio DOP',''].map((h, i) => (
                <span key={i} className={`text-[9px] font-black text-slate-500 uppercase ${
                  i === 0 ? 'col-span-1 text-center' :
                  i === 1 ? 'col-span-3' :
                  i === 2 ? 'col-span-2' :
                  i === 3 ? 'col-span-3' :
                  i === 4 ? 'col-span-2' : 'col-span-1'
                }`}>{h}</span>
              ))}
            </div>

            {habitaciones.map((h, i) => (
              <HabRow key={i} hab={h} idx={i} onChange={updateHab} onRemove={removeHab} />
            ))}

            {/* Total */}
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-yellow-600/30">
              <span className="text-xs font-bold text-slate-400">
                {habitaciones.length} habitación{habitaciones.length !== 1 ? 'es' : ''} · {noches} noche{noches !== 1 ? 's' : ''}
              </span>
              <span className="text-sm font-black text-yellow-500">
                TOTAL: {fmtDOP(totalGrupal)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Botón generar ─────────────────────────────────────────── */}
      <button
        onClick={modo === 'individual' ? generarIndividual : generarGrupal}
        disabled={generando}
        className="w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition"
        style={{ background: generando ? '#334155' : NAVY, border: `1.5px solid ${GOLD}`, color: GOLD }}
      >
        {generando ? '⏳ Generando PDF...' : `🖨️ Generar ${modo === 'individual' ? 'Factura Individual' : 'Factura Grupal'}`}
      </button>

      {/* ── Error ─────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-400 font-semibold">
          ⚠️ {error}
        </div>
      )}

      {/* ── PDF listo ─────────────────────────────────────────────── */}
      {pdfUrl && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 text-lg">✅</span>
            <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">PDF Generado y guardado en Supabase Storage</span>
          </div>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center py-2.5 rounded-lg font-black text-sm uppercase tracking-wider text-white transition"
            style={{ background: NAVY, border: `1px solid ${GOLD}` }}
          >
            📥 Abrir / Descargar PDF
          </a>
          <p className="text-[10px] text-slate-500 text-center break-all">{pdfUrl}</p>
        </div>
      )}
    </div>
  );
}
