import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { BookingProvider } from '../features/bookings/source-horizons/context/BookingContext'
import RoomSelection from '../features/bookings/source-horizons/pages/Booking/RoomSelection'
import GuestDetails  from '../features/bookings/source-horizons/pages/Booking/GuestDetails'
import ReviewBooking from '../features/bookings/source-horizons/pages/Booking/ReviewBooking'

// Horizons components
import HorizonsLayout from './marketing/HorizonsLayout'
import DashboardHome from './marketing/DashboardHome'
import MarketingOffersPanel from './marketing/MarketingOffersPanel'
import CreateOfferForm from './marketing/CreateOfferForm'

// Phase 2 components
import DashboardV26 from './marketing/DashboardV26'
import WarRoomV41 from './marketing/WarRoomV41'
import IntegrityMonitor from './marketing/IntegrityMonitor'
import MissionControlLive from './marketing/MissionControlLive'
import PipelineKanban from './marketing/PipelineKanban'
import CrmDashboard from './marketing/CrmDashboard'
import ApiToolbox from '../features/api-toolbox/pages/ApiToolbox'

// Admin Core 2 Components & Pages
import AdminDashboardPage from '../pages/admin/AdminDashboardPage'
import MarketingMissionControl from '../pages/admin/MarketingMissionControl'
import AriadnePanel           from '../pages/admin/AriadnePanel'
import BookingOpsPanel from '../pages/admin/BookingOpsPanel'
import AdminHotelsPage from '../pages/admin/AdminHotelsPage'
import PaymentGatewayPage from '@/components/admin/PaymentGatewayPage';
import AdminBookingsPanel from './admin/AdminBookingsPanel'
import AdminExcursionBookingsPanel from './admin/AdminExcursionBookingsPanel'
import AdminSalesPage from '../pages/admin/AdminSalesPage'
import AdminExcursionsPage from '../pages/admin/AdminExcursionsPage'
import HotelKnowledgePanel from '../pages/admin/HotelKnowledgePanel'
import AdminAccountingPage from '../pages/admin/AdminAccountingPage'

import { AdminAuthProvider } from '@/contexts/AdminAuthContext'
import React from 'react'

// ── ErrorBoundary para capturar errores de render en /mission ────────────────
class MissionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('[MissionControl ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          background: '#0f172a', color: '#f1f5f9', padding: '2rem',
          borderRadius: '1rem', border: '1px solid #ef4444', margin: '1rem',
          fontFamily: 'monospace', fontSize: '13px'
        }}>
          <h2 style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '18px' }}>
            ⚠ Mission Control — Error de Render
          </h2>
          <pre style={{
            background: '#1e293b', padding: '1rem', borderRadius: '0.5rem',
            overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            color: '#fca5a5', marginBottom: '1rem'
          }}>
            {this.state.error?.toString()}
          </pre>
          {this.state.info?.componentStack && (
            <details>
              <summary style={{ color: '#94a3b8', cursor: 'pointer', marginBottom: '0.5rem' }}>
                Component Stack
              </summary>
              <pre style={{
                background: '#1e293b', padding: '1rem', borderRadius: '0.5rem',
                overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                color: '#94a3b8', fontSize: '11px'
              }}>
                {this.state.info.componentStack}
              </pre>
            </details>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null, info: null })}
            style={{
              marginTop: '1rem', padding: '0.5rem 1.5rem', background: '#3b82f6',
              color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer',
              fontWeight: 'bold', fontSize: '13px'
            }}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AppShell() {
  return (
    <BrowserRouter>
      <AdminAuthProvider>
        <BookingProvider>
          <Routes>
            {/* Ruta base envuelta en HorizonsLayout maestro */}
            <Route path="/" element={<HorizonsLayout />}>
              {/* Dashboard Home en / */}
              <Route index element={<DashboardHome />} />
              
              {/* Phase 2 Modules */}
              <Route path="dashboard26" element={<BookingOpsPanel />} />
              <Route path="marketing" element={<MarketingMissionControl />} />
              <Route path="ariadne"   element={<AriadnePanel />} />
              <Route path="warroom" element={<WarRoomV41 />} />
              <Route path="integrity" element={<IntegrityMonitor />} />
              <Route path="mission" element={
                <MissionErrorBoundary>
                  <MissionControlLive />
                </MissionErrorBoundary>
              } />
              <Route path="crm/pipeline" element={<PipelineKanban />} />
              <Route path="crm/dashboard" element={<CrmDashboard />} />
              <Route path="api-toolbox" element={<ApiToolbox />} />

              {/* Admin Core 2 Routes */}
              <Route path="admin/hotels" element={<AdminHotelsPage />} />
              <Route path="admin/excursions" element={<AdminExcursionsPage />} />
              <Route path="admin/bookings" element={<AdminBookingsPanel />} />
              <Route path="admin/payments/:bookingRef" element={<PaymentGatewayPage />} />
              <Route path="admin/excursion-bookings" element={<AdminExcursionBookingsPanel />} />
              <Route path="admin/knowledge" element={<HotelKnowledgePanel />} />


            {/* Rutas de Marketing */}
            <Route path="marketing/offers" element={<MarketingOffersPanel />} />
            <Route path="marketing/offers/new" element={<CreateOfferForm />} />
            
            {/* Rutas placeholders para las otras secciones de Horizons */}
            <Route path="sales/offers" element={<AdminSalesPage />} />
            <Route path="sales/bloqueos" element={
              <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800">Sección de Bloqueos de Cupos</h2>
                <p className="text-gray-500 mt-2">Módulo en desarrollo. Esta sección permitirá gestionar inventario bloqueado con hoteles.</p>
              </div>
            } />
            <Route path="sales/confirmaciones" element={<AdminBookingsPanel />} />
            <Route path="financial/dashboard" element={<AdminAccountingPage />} />
            <Route path="financial/reports" element={
              <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800">Reportes Financieros Exportables</h2>
                <p className="text-gray-500 mt-2">Módulo en desarrollo. Permite descargar reportes fiscales en formato CSV/Excel.</p>
              </div>
            } />
            <Route path="intelligence/scores" element={
              <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800">Estadísticas de Atractividad de Hoteles (Scores)</h2>
                <p className="text-gray-500 mt-2">Módulo en desarrollo. Utiliza IA para predecir qué hotel se venderá más en base a su precio.</p>
              </div>
            } />
            <Route path="intelligence/investment" element={
              <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800">Análisis de ROI de Campañas</h2>
                <p className="text-gray-500 mt-2">Módulo en desarrollo. Evalúa la inversión publicitaria versus ingresos generados.</p>
              </div>
            } />
            <Route path="settings" element={
              <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800">Configuraciones del Sistema</h2>
                <p className="text-gray-500 mt-2">Módulo en desarrollo. Ajustes de pasarelas de pago y roles de usuario.</p>
              </div>
            } />

            {/* Horizons Booking Legacy integrado dentro del layout maestro */}
            <Route path="booking" element={<RoomSelection />} />
            <Route path="hotel/:hotelSlug/reservar" element={<RoomSelection />} />
            <Route path="hotel/:hotelSlug/huespedes" element={<GuestDetails />} />
            <Route path="hotel/:hotelSlug/confirmar" element={<ReviewBooking />} />
            
            {/* Fallbacks */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BookingProvider>
     </AdminAuthProvider>
    </BrowserRouter>
  )
}

export default AppShell;
