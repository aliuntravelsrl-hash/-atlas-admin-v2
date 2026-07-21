import { useState } from 'react'
import { Users, Baby, Maximize2, Wifi, Wind, Eye, Waves, Home } from 'lucide-react'
import { motion } from 'framer-motion'
import { useBooking } from '../../context/BookingContext'

const VIEW_CONFIG = {
  GARDEN: { label: 'Vista Jardín',   color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',   icon: '🌿', mult: '×1.0' },
  POOL:   { label: 'Vista Piscina',  color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',             icon: '🏊', mult: '×1.2' },
  OCEAN:  { label: 'Vista al Mar',   color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',             icon: '🌊', mult: '×1.5' },
  SWIMUP: { label: 'Swim-Up',        color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',       icon: '💦', mult: '×1.7' },
  FAMILY: { label: 'Suite Familiar', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30',       icon: '👨‍👩‍👧', mult: '×1.9' },
}

export default function RoomCard({ room, quotation, isLoading, isSelected, onSelect }) {
  const { state } = useBooking()
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

  const [imgErr, setImgErr] = useState(false)
  const view = VIEW_CONFIG[room.view_category] || VIEW_CONFIG.GARDEN

  const amenities = Array.isArray(room.amenities)
    ? room.amenities
    : typeof room.amenities === 'string'
      ? room.amenities.split(',').map(a => a.trim())
      : []

  const mainImage = !imgErr && (room.image_url || room.room_images?.[0])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-[2.5rem] border-2 overflow-hidden transition-all duration-500 cursor-pointer group
        ${isSelected ? 'border-blue-500 shadow-2xl shadow-blue-500/20 scale-[1.01]' : 'border-transparent hover:border-slate-200 hover:shadow-xl'}`}
      onClick={() => onSelect(room)}
    >
      {/* Imagen */}
      <div className="h-56 relative overflow-hidden bg-slate-100">
        {mainImage ? (
          <img
            src={mainImage}
            alt={room.name}
            onError={() => setImgErr(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[2s]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Home size={48} className="text-slate-300" />
          </div>
        )}
        {/* View badge */}
        <div className={`absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border text-xs font-black backdrop-blur-sm ${view.color}`}>
          <span>{view.icon}</span>
          <span>{view.label}</span>
          <span className="opacity-60">{view.mult}</span>
        </div>
        {/* Selected */}
        {isSelected && (
          <div className="absolute top-4 right-4 bg-blue-500 text-white px-3 py-1.5 rounded-2xl text-xs font-black">
            ✓ Seleccionada
          </div>
        )}
      </div>

      {/* Contenido */}
      <div className="p-7">
        <h3 className="text-2xl font-black uppercase italic text-slate-900 mb-1">{room.name}</h3>
        <p className="text-slate-400 text-sm mb-4 line-clamp-2">{room.description || room.room_type}</p>

        {/* Capacidad */}
        <div className="flex items-center gap-4 text-sm text-slate-500 mb-5">
          <span className="flex items-center gap-1.5">
            <Users size={14} /> {room.capacity_adults} adultos
          </span>
          {room.capacity_children > 0 && (
            <span className="flex items-center gap-1.5">
              <Baby size={14} /> {room.capacity_children} niños
            </span>
          )}
        </div>

        {/* Amenities */}
        {amenities.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {amenities.slice(0, 4).map((a, i) => (
              <span key={i} className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-500 font-medium">
                {a}
              </span>
            ))}
            {amenities.length > 4 && (
              <span className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-400">
                +{amenities.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Precio y botón */}
        <div className="flex items-end justify-between pt-5 border-t border-slate-100">
          <div>
            {isLoading ? (
              <div className="space-y-1">
                <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
                <div className="h-8 w-32 bg-slate-100 rounded animate-pulse" />
              </div>
            ) : quotation?.success ? (
              <div>
                <span className="text-xs text-slate-400 font-black uppercase block mb-0.5">
                  {quotation.price_is_estimate ? '~ Estimado' : 'Precio confirmado'}
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-slate-900">{formatPrice(quotation.price_per_night_usd)}</span>
                  <span className="text-slate-400 text-sm">/noche</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Total: {formatPrice(quotation.total_usd)}</p>
              </div>
            ) : (
              <div>
                <span className="text-xs text-slate-400 uppercase font-black block">Desde</span>
                <span className="text-4xl font-black text-slate-900">
                  {room.base_price ? formatPrice(room.base_price) : '—'}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={e => { e.stopPropagation(); onSelect(room) }}
            className={`px-7 py-4 rounded-3xl font-black uppercase text-sm transition-all duration-300
              ${isSelected
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                : 'bg-slate-900 text-white hover:bg-blue-600 hover:shadow-lg hover:shadow-blue-500/30'}`}
          >
            {isSelected ? 'Seleccionada ✓' : 'Seleccionar'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
