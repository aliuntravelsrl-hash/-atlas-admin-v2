import { useBooking } from '../../context/BookingContext'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarDays, Users, BedDouble, AlertCircle, CheckCircle2 } from 'lucide-react'

const VIEW_LABELS = { GARDEN: '🌿 Jardín', POOL: '🏊 Piscina', OCEAN: '🌊 Mar', SWIMUP: '💦 Swim-Up', FAMILY: '👨‍👩‍👧 Familiar' }
const SEASON_COLORS = { FER: 'text-red-400', ALT: 'text-amber-400', MED: 'text-blue-400', BAJ: 'text-green-400', ESP: 'text-purple-400', BASE: 'text-slate-400' }

export default function BookingSummary({ step = 1 }) {
  const { state, nights } = useBooking()
  const { hotel, dates, guests, quotation } = state

  if (!hotel) return null

  const isDop = state.nationality_code === 'DO'
  const exchangeRate = state.exchangeRate || 58.50

  const formatPrice = (usdAmount) => {
    const num = parseFloat(usdAmount) || 0
    if (isDop) {
      const dopAmount = Math.round(num * exchangeRate)
      return `RD$ ${dopAmount.toLocaleString('es-DO')}`
    }
    return `$${num.toFixed(2)} USD`
  }

  const depVal = quotation ? (quotation.total_usd * 0.30) : 0
  const salVal = quotation ? (quotation.total_usd * 0.70) : 0

  return (
    <aside className="bg-slate-900 border border-slate-700 rounded-3xl p-6 sticky top-6 space-y-5">
      {/* Hotel */}
      <div>
        <p className="text-xs text-slate-500 font-black uppercase tracking-widest mb-1">Tu reserva</p>
        <h3 className="text-lg font-black text-white uppercase italic leading-tight">{hotel.name}</h3>
        <p className="text-xs text-slate-400">{hotel.location} · {'⭐'.repeat(hotel.stars || 5)}</p>
      </div>

      {/* Fechas */}
      {dates.checkIn && (
        <div className="flex items-start gap-3 text-sm">
          <CalendarDays size={16} className="text-blue-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-white font-bold">
              {format(new Date(dates.checkIn), 'dd MMM', { locale: es })} →{' '}
              {format(new Date(dates.checkOut), 'dd MMM yyyy', { locale: es })}
            </p>
            <p className="text-slate-400">{nights} noche{nights !== 1 ? 's' : ''}</p>
          </div>
        </div>
      )}

      {/* Huéspedes */}
      <div className="flex items-center gap-3 text-sm">
        <Users size={16} className="text-blue-400 shrink-0" />
        <p className="text-white">{guests.adults} adulto{guests.adults !== 1 ? 's' : ''}
          {guests.children > 0 && ` · ${guests.children} niño${guests.children !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Habitación seleccionada */}
      {quotation?.room_name && (
        <div className="flex items-start gap-3 text-sm">
          <BedDouble size={16} className="text-blue-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-white font-bold">{quotation.room_name}</p>
            <p className="text-slate-400">{VIEW_LABELS[quotation.view_category] || quotation.view_category}</p>
          </div>
        </div>
      )}

      {/* Desglose de precio */}
      {quotation?.success && (
        <div className="border-t border-slate-700 pt-4 space-y-2 text-sm">
          <div className="flex justify-between text-slate-400">
            <span>Tarifa base</span>
            <span>{formatPrice(quotation.base_rate_usd)}/noche</span>
          </div>
          <div className={`flex justify-between ${SEASON_COLORS[quotation.season_code] || 'text-slate-400'}`}>
            <span>Temporada {quotation.season_name}</span>
            <span>×{quotation.season_multiplier}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Vista {VIEW_LABELS[quotation.view_category]}</span>
            <span>×{quotation.view_multiplier}</span>
          </div>
          <div className="flex justify-between text-white font-bold border-t border-slate-700 pt-2">
            <span>{formatPrice(quotation.price_per_night_usd)}/noche</span>
            <span>{nights} noches</span>
          </div>
          <div className="flex justify-between text-xl font-black text-white pt-1">
            <span>TOTAL</span>
            <span>{formatPrice(quotation.total_usd)}</span>
          </div>
          {/* Depósito */}
          {depVal > 0 && (
            <div className="bg-blue-900/40 border border-blue-700/50 rounded-2xl p-3 space-y-1 mt-2">
              <div className="flex justify-between text-blue-300 text-xs font-bold">
                <span>Depósito hoy (30%)</span>
                <span>{formatPrice(depVal)}</span>
              </div>
              <div className="flex justify-between text-slate-400 text-xs">
                <span>Saldo en destino (70%)</span>
                <span>{formatPrice(salVal)}</span>
              </div>
            </div>
          )}
          {/* ITBIS */}
          <p className="text-xs text-green-400 font-bold">{quotation.itbis_note}</p>
        </div>
      )}

      {/* Min stay warning */}
      {quotation?.min_stay_nights > 1 && (
        <div className="flex items-center gap-2 bg-amber-900/30 border border-amber-700/50 rounded-2xl p-3 text-xs text-amber-300">
          <AlertCircle size={14} className="shrink-0" />
          Estancia mínima {quotation.min_stay_nights} noches en {quotation.season_name}
        </div>
      )}

      {/* Confirmación requerida */}
      {quotation?.confirmation_required && (
        <div className="flex items-center gap-2 bg-slate-800 rounded-2xl p-3 text-xs text-slate-400">
          <AlertCircle size={14} className="shrink-0 text-amber-400" />
          Sujeto a confirmación de disponibilidad y precio
        </div>
      )}

      {/* Pasos */}
      <div className="flex gap-2 pt-2">
        {[1, 2, 3].map(s => (
          <div key={s} className={`h-1 flex-1 rounded-full transition-all duration-500 ${s <= step ? 'bg-blue-500' : 'bg-slate-700'}`} />
        ))}
      </div>
    </aside>
  )
}
