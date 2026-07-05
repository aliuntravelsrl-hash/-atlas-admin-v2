import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { 
  Search, FileText, Calendar, Lock, CheckCircle, Clock, 
  User, Phone, Mail, Building, MapPin, DollarSign, ExternalLink, ShieldAlert, AlertTriangle, Download, MessageCircle 
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/lib/customSupabaseClient';
import FacturadorPanel from './FacturadorPanel';
import { useExchangeRate, EXCHANGE_RATE_FALLBACK } from '@/hooks/useExchangeRate';

// ── Moneda por nacionalidad ───────────────────────────────────
// TASA: dinámica desde exchange_rates (hook). Rate se pasa como parámetro.
const getCurrency = (nat) => nat === 'DO' ? 'DOP' : 'USD'
const fmtMoney = (amountUsd, nat, rate = EXCHANGE_RATE_FALLBACK) => {
  if (!amountUsd && amountUsd !== 0) return '—'
  return getCurrency(nat) === 'DOP'
    ? `RD$ ${Math.round((parseFloat(amountUsd) || 0) * rate).toLocaleString('es-DO')}`
    : `$${parseFloat(amountUsd).toFixed(2)} USD`
}

// ── Webhooks documentos ───────────────────────────────────────
const N8N = 'https://n8n-n8n.xaruuo.easypanel.host/webhook'
const WF_VOUCHER       = `${N8N}/aliun-voucher`
const WF_COTIZACION    = `${N8N}/aliun-cotizacion-individual`
const WF_EXCURSION_DOC = `${N8N}/aliun-excursion-doc`

// Detecta tipo de documento según estado de la reserva
const getDocType = (booking, payments) => {
  const total  = parseFloat(booking?.total_amount || 0)
  const paid   = (payments || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0)
  const balance = total - paid
  if (balance <= 0 && paid > 0) return 'voucher'
  if (booking?.status === 'confirmed') return 'confirmacion'
  return 'cotizacion'
}

const AdminBookingsPanel = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [selectedBooking, setSelectedBooking] = useState(null);

  // ── Tasa de cambio dinámica desde exchange_rates ──────────────
  const { rate: EXCHANGE_RATE } = useExchangeRate();

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState('details');
  const [crmLead, setCrmLead] = useState(null);
  const [crmLoading, setCrmLoading] = useState(false);

  // Form states for Selected Booking
  const [hotelConfirmationNo, setHotelConfirmationNo] = useState('');
  const [statusVal, setStatusVal] = useState('');
  const [paymentStatusVal, setPaymentStatusVal] = useState('');
  
  // Action states
  const [savingSettings, setSavingSettings] = useState(false);
  const [confirmingDeposit, setConfirmingDeposit] = useState(false);
  const [releasingVoucher, setReleasingVoucher] = useState(false);
  const [sendingRaceCondition, setSendingRaceCondition] = useState(false);
  const [generandoDoc, setGenerandoDoc] = useState(false);

  // ── Generar documento oficial ─────────────────────────────────
  const handleGenerarDocumento = async (booking, paymentsData) => {
    if (!booking) return
    setGenerandoDoc(true)
    const nat     = booking.nationality || 'DO'
    const total   = parseFloat(booking.total_amount || 0)
    const paid    = (paymentsData || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0)
    const balance = total - paid
    const docType = getDocType(booking, paymentsData)
    const isExc   = booking.booking_type === 'excursion'
    const sr      = booking.special_requests || {}

    let wfUrl, payload
    if (isExc) {
      wfUrl = WF_EXCURSION_DOC
      payload = {
        booking_ref:      booking.booking_reference,
        excursion_slug:   booking.hotel_code || sr.excursion_slug || '',
        plan_id:          sr.plan_id || '',
        tipo_documento:   docType === 'voucher' ? 'VOUCHER' : docType === 'confirmacion' ? 'CONFIRMACION' : 'COTIZACION',
        cliente_nombre:   booking.lead_guest_name,
        cliente_telefono: booking.lead_phone || '',
        fecha:            booking.check_in,
        pax_adultos:      booking.adults || 2,
        pax_ninos:        booking.children || 0,
        nationality:      nat,
        total_dop:        Math.round(total * EXCHANGE_RATE),
        deposito_dop:     Math.round(paid * EXCHANGE_RATE),
        saldo_dop:        Math.round(balance * EXCHANGE_RATE),
      }
    } else {
      wfUrl = docType === 'voucher' ? WF_VOUCHER : WF_COTIZACION
      payload = {
        booking_ref:      booking.booking_reference,
        id_reserva:       booking.booking_reference,
        cotizacion_id:    booking.booking_reference,
        hotel_slug:       booking.hotels_master?.slug || booking.hotel_code || '',
        hotel_name:       booking.hotels_master?.name || '',
        cliente_nombre:   booking.lead_guest_name,
        cliente_telefono: booking.lead_phone || '',
        cliente_email:    booking.lead_email || '',
        check_in:         booking.check_in,
        check_out:        booking.check_out,
        habitacion:       booking.room_name || 'Estándar',
        tipo_hab:         booking.room_name || 'Estándar',
        regimen:          'Todo Incluido',
        pax_adultos:      booking.adults || 2,
        pax_ninos:        booking.children || 0,
        tipo_documento:   docType === 'confirmacion' ? 'CONFIRMACION' : 'COTIZACION',
        precio_total_dop: Math.round(total * EXCHANGE_RATE),
        deposito_dop:     Math.round(paid * EXCHANGE_RATE),
        saldo_dop:        Math.round(balance * EXCHANGE_RATE),
        provider_locator: hotelConfirmationNo || booking.hotel_confirmation_no || booking.booking_reference,
      }
    }

    try {
      const res  = await fetch(wfUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (data.pdf_url) window.open(data.pdf_url, '_blank')
      toast({ title: `✅ ${isExc ? 'Excursión' : 'Hotel'} — ${docType.charAt(0).toUpperCase()+docType.slice(1)} generado`, description: 'PDF enviado a Telegram del Director.' })
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' })
    } finally {
      setGenerandoDoc(false)
    }
  }

  // Quick Filter States
  const [filterRef, setFilterRef] = useState('');
  const [filterHotelConf, setFilterHotelConf] = useState('');
  const [filterGuestName, setFilterGuestName] = useState('');
  const [filterHotelName, setFilterHotelName] = useState('');
  const [filterDestination, setFilterDestination] = useState('');
  const [filterCheckIn, setFilterCheckIn] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [filterCoreType, setFilterCoreType] = useState('all');
  const [filterSource, setFilterSource] = useState('all');

  const { toast } = useToast();

  // --- Initial Load & Realtime Subscription ---
  useEffect(() => {
    loadBookings();

    const subscription = supabase
      .channel('admin_bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, (payload) => {
        console.log('Realtime update received:', payload);
        loadBookings(); // Reload to fetch relations correctly
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  // Sync selected booking details if bookings list updates in background
  useEffect(() => {
    if (selectedBooking) {
      const updated = bookings.find(b => b.id === selectedBooking.id);
      if (updated) {
        setSelectedBooking(updated);
        // Sync inputs if they are not dirty or if status changed in DB
        setHotelConfirmationNo(updated.hotel_confirmation_no || '');
        setStatusVal(updated.status || '');
        setPaymentStatusVal(updated.payment_status || '');
      }
    }
  }, [bookings]);

  // ── Emitir voucher de entrada al hotel ──────────────────────────
  const [emitiendo, setEmitiendo] = useState(false);
  const emitirVoucher = async (booking) => {
    if (emitiendo) return;
    setEmitiendo(booking.id);
    try {
      // WF-VOUCHER-GOTENBERG-v1 — webhook: aliun-voucher
      const res = await fetch('https://n8n-n8n.xaruuo.easypanel.host/webhook/aliun-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adults:           booking.adults || 2,
          check_in:         booking.check_in,
          check_out:        booking.check_out,
          children:         booking.children || 0,
          hotel_slug:       booking.hotel_code || booking.hotels_master?.slug || '',
          id_reserva:       booking.booking_reference,
          noches:           booking.nights || Math.round((new Date(booking.check_out) - new Date(booking.check_in)) / 86400000),
          nombre:           booking.lead_guest_name,
          provider_locator: booking.hotel_confirmation_no || 'PENDIENTE',
          regimen:          'Todo Incluido',
          room_name:        booking.room_name || 'Habitación Estándar',
          send_telegram:    true,
          telegram_chat_id: '683265740',
        })
      });
      // Actualizar fulfillment_status en DB
      const { supabase: sb } = await import('@/lib/customSupabaseClient').catch(() => ({ supabase: null }));
      if (sb) {
        await sb.from('bookings').update({
          fulfillment_status: 'voucher_issued',
          voucher_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', booking.id);
      }
      loadBookings();
    } catch (e) {
      console.error('Error emitiendo voucher:', e);
    } finally {
      setEmitiendo(false);
    }
  };

  const notificarHermesQA = async (booking) => {
    try {
      await fetch('https://n8n-n8n.xaruuo.easypanel.host/webhook/hermes-qa-seguimiento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_reference: booking.booking_reference,
          hotel_name:        booking.hotels_master?.name || booking.room_name || '',
          hotel_conf_no:     booking.hotel_confirmation_no,
          lead_name:         booking.lead_guest_name,
          lead_phone:        booking.lead_phone || '',
          lead_email:        booking.lead_email || '',
          check_in:          booking.check_in,
          check_out:         booking.check_out,
          total_amount:      booking.total_amount,
          currency:          booking.currency || 'USD',
          tipo:              'seguimiento_cobro_72h',
          fuente:            'admin_bookings_panel',
        })
      });
    } catch (e) {
      console.warn('Hermes-QA notificación fallida (no crítico):', e.message);
    }
  };

  const loadBookings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          hotels_master (name, zone, about_image)
        `)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setBookings(data || []);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      toast({
        title: "Error de Sincronización",
        description: "No se pudieron obtener las reservas de Supabase.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // --- CRM Lead Link Lookup ---
  const fetchCrmLead = async (guestName) => {
    if (!guestName) return;
    setCrmLoading(true);
    setCrmLead(null);
    try {
      const { data, error } = await supabase
        .from('crm_leads')
        .select('*')
        .ilike('full_name', `%${guestName}%`)
        .eq('source', 'web_booking')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setCrmLead(data);
    } catch (error) {
      console.error("Error fetching CRM Lead:", error);
    } finally {
      setCrmLoading(false);
    }
  };

  const handleOpenDetail = async (booking, defaultTab = 'details') => {
    setSelectedBooking(booking);
    setHotelConfirmationNo(booking.hotel_confirmation_no || '');
    setStatusVal(booking.status || '');
    setPaymentStatusVal(booking.payment_status || '');
    setDetailTab(defaultTab);
    setIsDetailOpen(true);
    fetchCrmLead(booking.lead_guest_name);
    const esPendienteCobro = booking.hotel_confirmation_no &&
      booking.hotel_confirmation_no.trim() !== '' &&
      booking.status !== 'cancelled' &&
      booking.fulfillment_status !== 'voucher_issued' &&
      booking.payment_status !== 'paid';
    if (esPendienteCobro) notificarHermesQA(booking);

    if (booking.room_id && !booking.room_name) {
      try {
        const { data: roomData, error: roomError } = await supabase
          .from('rooms')
          .select('name')
          .eq('id', booking.room_id)
          .maybeSingle();

        if (!roomError && roomData) {
          setSelectedBooking(prev => prev ? { ...prev, room_name: roomData.name } : null);
        }
      } catch (err) {
        console.error("Error fetching room name:", err);
      }
    }
  };

  // --- WhatsApp Sharing Helper ---
  const handleShareWhatsApp = (booking) => {
    if (!booking) return;
    const phone = booking.lead_phone ? booking.lead_phone.replace(/\D/g, '') : '';
    const name = booking.lead_guest_name || 'Cliente';
    const hotel = booking.hotels_master?.name || booking.room_name || 'Hotel Seleccionado';
    const pdfUrl = booking.voucher_pdf_url || '';
    
    const message = `¡Hola *${name}*! 👋 Te saludamos de Aliun Travel. Aquí tienes el enlace para ver y descargar tu voucher oficial de confirmación para tu estadía en *${hotel}*:\n\n🔗 ${pdfUrl}\n\n¡Que tengas un excelente viaje! 🌴`;
    
    let targetPhone = phone;
    if (phone && phone.length === 10) {
      targetPhone = '1' + phone;
    }

    const waUrl = targetPhone 
      ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/18299648443?text=${encodeURIComponent(message)}`;
      
    window.open(waUrl, '_blank');
  };

  // --- Actions ---

  // Save manual status change & localizer
  const handleSaveSettings = async () => {
    if (!selectedBooking) return;
    setSavingSettings(true);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          hotel_confirmation_no: hotelConfirmationNo || null,
          status: statusVal,
          payment_status: paymentStatusVal,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedBooking.id);

      if (error) throw error;

      toast({
        title: "Reserva Actualizada",
        description: "Los cambios fueron guardados exitosamente en la base de datos.",
      });
      loadBookings();
    } catch (error) {
      console.error("Error saving booking details:", error);
      toast({
        title: "Error al Guardar",
        description: "No se pudieron actualizar los datos de la reserva.",
        variant: "destructive"
      });
    } finally {
      setSavingSettings(false);
    }
  };

  // Confirm Deposit validation
  const handleConfirmDeposit = async () => {
    if (!selectedBooking) return;
    setConfirmingDeposit(true);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          payment_status: 'deposit_received',
          validated_by: 'director',
          validated_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedBooking.id);

      if (error) throw error;

      toast({
        title: "Depósito Confirmado",
        description: "El pago inicial del 30% fue marcado como recibido por el Director.",
      });
      loadBookings();
    } catch (error) {
      console.error("Error confirming deposit:", error);
      toast({
        title: "Error de Validación",
        description: "No se pudo registrar la validación del depósito.",
        variant: "destructive"
      });
    } finally {
      setConfirmingDeposit(false);
    }
  };

  // Send Solicitud Race Condition (Supplier Request)
  const handleSendRaceCondition = async (booking) => {
    if (!booking) return;
    setSendingRaceCondition(true);
    try {
      const response = await fetch('https://n8n-n8n.xaruuo.easypanel.host/webhook/provider-solicitud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_reference: booking.booking_reference,
          hotel_name: booking.hotels_master?.name || booking.room_name || 'Hotel Aliun',
          check_in: booking.check_in,
          check_out: booking.check_out,
          lead_name: booking.lead_guest_name
        })
      });

      if (!response.ok) throw new Error("Webhook error");

      toast({
        title: "Solicitud Enviada",
        description: "Se disparó la solicitud de prevención de Cupo (Race Condition) en n8n.",
      });
    } catch (error) {
      console.error("Error sending provider request:", error);
      toast({
        title: "Error de Comunicación",
        description: "No se pudo disparar el webhook de solicitud al proveedor.",
        variant: "destructive"
      });
    } finally {
      setSendingRaceCondition(false);
    }
  };

  // Release and send Voucher via Gotenberg
  const handleReleaseVoucher = async () => {
    if (!selectedBooking) return;
    
    if (!hotelConfirmationNo || hotelConfirmationNo.trim() === "") {
      toast({
        title: "Localizador Faltante",
        description: "Debes ingresar el número de confirmación del hotel para emitir el voucher.",
        variant: "destructive"
      });
      return;
    }

    setReleasingVoucher(true);

    // Idempotency: Check if URL already exists locally
    if (selectedBooking.voucher_pdf_url) {
      toast({
        title: "Voucher Ya Emitido",
        description: "Esta reserva ya cuenta con un voucher. Usando el enlace existente.",
      });
      setReleasingVoucher(false);
      return;
    }

    // Timeout Promise to abort UI lock at 30 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://n8n-n8n.xaruuo.easypanel.host/webhook/aliun-deposito-aprobado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          booking_reference: selectedBooking.booking_reference,
          hotel_confirmation_no: hotelConfirmationNo,
          monto_deposito: selectedBooking.total_amount ? Number(selectedBooking.total_amount) * 0.3 : 0,
          email_cliente: selectedBooking.lead_email || "reservas@aliuntravelsrl.com",
          hotel_name: selectedBooking.hotels_master?.name || "Hotel Seleccionado",
          check_in: selectedBooking.check_in,
          check_out: selectedBooking.check_out,
          lead_name: selectedBooking.lead_guest_name
        })
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Error en servidor: ${response.statusText}`);
      }

      const result = await response.json();
      const pdfUrl = result.pdf_url || result.url || result.pdf;

      if (!pdfUrl) {
        throw new Error("No se recibió la URL del PDF del voucher.");
      }

      // Update Supabase with voucher issued state
      const { error: dbError } = await supabase
        .from('bookings')
        .update({
          fulfillment_status: 'voucher_issued',
          voucher_pdf_url: pdfUrl,
          status: 'confirmed',
          payment_status: 'paid',
          hotel_confirmation_no: hotelConfirmationNo,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedBooking.id);

      if (dbError) throw dbError;

      toast({
        title: "Voucher Liberado ✅",
        description: "El voucher PDF fue generado con Gotenberg y enviado por correo.",
      });
      loadBookings();

    } catch (error) {
      console.error("Error releasing voucher:", error);
      const isTimeout = error.name === 'AbortError';
      toast({
        title: isTimeout ? "Timeout de Generación" : "Error al Liberar",
        description: isTimeout 
          ? "El renderizado de Gotenberg demoró más de 30s. Intenta nuevamente." 
          : error.message || "Ocurrió un error al disparar el webhook de vouchers.",
        variant: "destructive"
      });
    } finally {
      setReleasingVoucher(false);
    }
  };

  // Cancel booking action
  const handleCancelBooking = async (booking) => {
    if (!booking) return;
    if (!window.confirm(`¿Estás seguro de que deseas cancelar la reserva ${booking.booking_reference}?`)) return;
    
    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', booking.id);

      if (error) throw error;

      toast({
        title: "Reserva Cancelada",
        description: `La reserva ${booking.booking_reference} fue marcada como Cancelada.`,
      });
      loadBookings();
    } catch (error) {
      console.error("Error cancelling booking:", error);
      toast({
        title: "Error al Cancelar",
        description: "No se pudo cancelar la reserva en Supabase.",
        variant: "destructive"
      });
    }
  };

  // --- Filtering ---
  const filteredBookings = bookings.filter(b => {
    // Search Term
    const matchesSearch = searchTerm === '' ? true : (
      b.lead_guest_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      b.booking_reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.hotels_master?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Advanced Filters
    const matchesRef = filterRef === '' ? true : b.booking_reference?.toLowerCase().includes(filterRef.toLowerCase());
    const matchesHotelConf = filterHotelConf === '' ? true : b.hotel_confirmation_no?.toLowerCase().includes(filterHotelConf.toLowerCase());
    const matchesGuestName = filterGuestName === '' ? true : b.lead_guest_name?.toLowerCase().includes(filterGuestName.toLowerCase());
    const matchesHotelName = filterHotelName === '' ? true : b.hotels_master?.name?.toLowerCase().includes(filterHotelName.toLowerCase());
    const matchesDestination = filterDestination === '' ? true : b.hotels_master?.zone?.toLowerCase().includes(filterDestination.toLowerCase());
    const matchesCheckIn = filterCheckIn === '' ? true : b.check_in === filterCheckIn;
    
    const matchesStatus = filterStatus === 'all' ? true : b.status === filterStatus;
    const matchesPayment = filterPayment === 'all' ? true : b.payment_status === filterPayment;

    // Core Type
    let bCoreType = 'Manual';
    if (b.offer_id) bCoreType = 'Core 2';
    else if (b.room_id) bCoreType = 'Core 1';
    const matchesCoreType = filterCoreType === 'all' ? true : bCoreType === filterCoreType;
    const matchesSource = filterSource === 'all' ? true : b.source === filterSource;

    // Si hay filtros activos en el Quick Filter, ignorar restricción de tab
    const hasActiveFilters = filterRef !== '' || filterHotelConf !== '' || filterGuestName !== '' ||
      filterHotelName !== '' || filterDestination !== '' || filterCheckIn !== '' ||
      filterSource !== 'all';

    // Tabs — lógica real basada en estado del documento
    let matchesTab = true;
    if (!hasActiveFilters) {
      if (activeTab === 'pending_validation') {
        // Confirmada por proveedor (tiene conf. no.) + pago pendiente o parcial
        matchesTab = b.hotel_confirmation_no &&
                     b.hotel_confirmation_no.trim() !== '' &&
                     b.status !== 'cancelled' &&
                     b.fulfillment_status !== 'voucher_issued' &&
                     b.payment_status !== 'paid';
      } else if (activeTab === 'waiting_confirmation') {
        // Sin localizador del proveedor Y pago pendiente (esperando confirmación del hotel)
        matchesTab = (!b.hotel_confirmation_no || b.hotel_confirmation_no.trim() === '') &&
                     b.status !== 'cancelled' &&
                     b.fulfillment_status !== 'voucher_issued' &&
                     b.payment_status !== 'paid';
      } else if (activeTab === 'completed') {
        // Pagado (cualquier origen: manual o proveedor) → listo para emitir voucher
        matchesTab = b.payment_status === 'paid' &&
                     b.fulfillment_status !== 'voucher_issued' &&
                     b.status !== 'cancelled';
      } else if (activeTab === 'voucher_issued') {
        matchesTab = b.fulfillment_status === 'voucher_issued';
      } else if (activeTab === 'cancelled') {
        matchesTab = b.status === 'cancelled';
      }
    }

    return matchesSearch && matchesRef && matchesHotelConf && matchesGuestName && 
           matchesHotelName && matchesDestination && matchesCheckIn && 
           matchesStatus && matchesPayment && matchesCoreType && matchesSource && matchesTab;
  });

  const handleClearFilters = () => {
    setFilterRef('');
    setFilterHotelConf('');
    setFilterGuestName('');
    setFilterHotelName('');
    setFilterDestination('');
    setFilterCheckIn('');
    setFilterStatus('all');
    setFilterPayment('all');
    setFilterCoreType('all');
    setFilterSource('all');
    setSearchTerm('');
  };

  // --- Core Type Helper (Correction 2) ---
  const getCoreType = (booking) => {
    if (booking.offer_id) return 'Core 2';      // bloque proveedor local
    if (booking.room_id)  return 'Core 1';      // tarifa MANUAL directa
    return 'Manual';                             // ingreso directo admin
  };

  const getCoreTypeLabel = (type) => {
    switch (type) {
      case 'Core 2': return 'Proveedor Local';
      case 'Core 1': return 'Tarifa Directa';
      case 'Manual':
      default:
        return 'Admin';
    }
  };

  // --- Trip Name Helper (Correction 4) ---
  const getTripName = (booking) => {
    try {
      if (!booking.lead_guest_name) return 'N/A';
      
      const lastName = booking.lead_guest_name
        .trim()
        .split(' ')
        .slice(-1)[0]
        .toUpperCase();
        
      const checkInDate = booking.check_in ? new Date(booking.check_in + 'T00:00:00') : new Date();
      const dateStr = format(checkInDate, 'ddMMM');
      
      const hotelName = booking.hotels_master?.name || booking.room_name || 'Hotel';
      const hotelWord = hotelName.trim().split(' ')[0];
      
      return `${lastName}_${dateStr}_${hotelWord}`;
    } catch (e) {
      console.error(e);
      return 'N/A';
    }
  };

  const getCancellationDate = (checkInStr) => {
    try {
      if (!checkInStr) return 'N/A';
      const checkInDate = new Date(checkInStr + 'T00:00:00');
      checkInDate.setDate(checkInDate.getDate() - 15);
      return format(checkInDate, 'dd-MMM-yyyy', { locale: es });
    } catch (e) {
      console.error(e);
      return 'N/A';
    }
  };

  const formatDateReadable = (dateStr) => {
    try {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      return format(date, 'EEE dd-MMM-yyyy', { locale: es });
    } catch (e) {
      return dateStr;
    }
  };

  // --- Badges & Styles Helper ---
  const getStatusBadge = (status) => {
    switch(status) {
      case 'confirmed': 
        return <Badge className="bg-green-600 text-white hover:bg-green-700">Confirmada</Badge>;
      case 'waiting_confirmation':
        return <Badge className="bg-orange-500 text-white hover:bg-orange-600">En Espera</Badge>;
      case 'pending_validation': 
        return <Badge className="bg-yellow-500 text-black hover:bg-yellow-600">Pendiente Pago</Badge>;
      case 'cancelled': 
        return <Badge className="bg-red-600 text-white hover:bg-red-700">Cancelada</Badge>;
      default: 
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getFulfillmentBadge = (fStatus) => {
    switch(fStatus) {
      case 'voucher_issued':
        return <Badge variant="outline" className="border-green-600 text-green-600 bg-green-50">Voucher Emitido</Badge>;
      case 'completed':
        return <Badge variant="outline" className="border-blue-600 text-blue-600 bg-blue-50">Completada</Badge>;
      case 'pending':
      default:
        return <Badge variant="outline" className="border-gray-400 text-gray-500">Pendiente Voucher</Badge>;
    }
  };

  const getPaymentStatusBadge = (pStatus) => {
    switch(pStatus) {
      case 'paid':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Pagado ✅</Badge>;
      case 'deposit_received':
        return <Badge className="bg-sky-100 text-sky-800 border-sky-200">Depósito Recibido 🟢</Badge>;
      case 'unpaid':
      default:
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Por Pagar ⚠️</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-6 px-4 space-y-6 max-w-7xl">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Confirmaciones de Venta</h1>
          <p className="text-slate-500 mt-1">Monitorea ingresos y aprueba la emisión de vouchers de hotel en tiempo real (Estilo OTA).</p>
        </div>
        
        <div className="relative w-full lg:w-72">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Buscar por referencia, cliente..." 
            className="pl-9 h-11 border-slate-200 bg-white shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-xl w-full flex overflow-x-auto justify-start border border-slate-200">
          <TabsTrigger value="all" className="rounded-lg py-2">Todos</TabsTrigger>
          <TabsTrigger value="pending_validation" className="rounded-lg py-2">Pendientes de Pago</TabsTrigger>
          <TabsTrigger value="waiting_confirmation" className="rounded-lg py-2">En Espera</TabsTrigger>
          <TabsTrigger value="voucher_issued" className="rounded-lg py-2">Voucher Emitido</TabsTrigger>
          <TabsTrigger value="completed" className="rounded-lg py-2">Completadas</TabsTrigger>
          <TabsTrigger value="cancelled" className="rounded-lg py-2">Canceladas</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <div className="w-8 h-8 border-4 border-[#C19A6B] border-t-transparent rounded-full animate-spin"></div>
              <span className="text-slate-500 font-medium">Sincronizando con Bóveda de Datos...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
              {/* LISTA DE TARJETAS (Izquierda) */}
              <div className="lg:col-span-3 space-y-4">
                {filteredBookings.length === 0 ? (
                  <div className="text-center py-20 bg-slate-50 border border-dashed rounded-3xl space-y-2">
                    <ShieldAlert className="w-12 h-12 text-slate-300 mx-auto" />
                    <h3 className="text-lg font-semibold text-slate-700">No se encontraron reservas</h3>
                    <p className="text-slate-500 max-w-sm mx-auto">No hay registros de venta que coincidan con la búsqueda o el filtro actual.</p>
                  </div>
                ) : (
                  filteredBookings.map(booking => {
                    const isPending = booking.status === 'pending_validation';
                    const isConfirmed = booking.status === 'confirmed';
                    const isCancelled = booking.status === 'cancelled';
                    
                    const tripName = getTripName(booking);
                    const cancellationDate = getCancellationDate(booking.check_in);
                    const coreType = getCoreType(booking);
                    const coreLabel = getCoreTypeLabel(coreType);

                    return (
                      <Card 
                        key={booking.id} 
                        onClick={() => handleOpenDetail(booking, 'details')}
                        className={`overflow-hidden hover:shadow-lg transition-all duration-200 border bg-white ${
                          isPending ? 'border-l-4 border-l-yellow-500' : isConfirmed ? 'border-l-4 border-l-green-600' : isCancelled ? 'border-l-4 border-l-red-600' : 'border-l-4 border-l-slate-300'
                        }`}
                      >
                        {/* CONTENIDO DE TARJETA ESTILO TBO */}
                        <div className="flex flex-col lg:flex-row gap-6 p-6">
                          {/* COLUMNA 1 — Agencia y Hotel */}
                          <div className="flex-1 space-y-4 text-left">
                            <div>
                              <span className="text-[#0A3A6B] font-bold text-xs hover:underline block uppercase tracking-wider">
                                Aliun Travel SRL. (Mesa de Control)
                              </span>
                              <h3 className="font-extrabold text-base text-[#0A3A6B] hover:underline cursor-pointer mt-1">
                                {booking.hotels_master?.name || booking.room_name || 'Hotel en Caribe'}
                              </h3>
                              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                                📍 {booking.hotels_master?.zone || 'Caribe'}
                              </p>
                            </div>
                            
                            <div className="text-xs text-slate-600 font-bold">
                              Booked: {formatDateReadable(booking.created_at)}
                            </div>
                          </div>

                          {/* COLUMNA 2 — Estado y Estadía */}
                          <div className="flex-1 space-y-3 border-t lg:border-t-0 lg:border-l border-slate-100 pt-4 lg:pt-0 lg:pl-6 text-left">
                            <div className="text-xs font-semibold text-slate-700">
                              Hotel Booking: {getStatusBadge(booking.status)}
                            </div>
                            
                            {booking.check_in && !isCancelled && (
                              <div className="text-[11px] font-bold text-red-600">
                                Last Cancellation Date: {cancellationDate}
                              </div>
                            )}

                            <div className="text-xs text-slate-600 space-y-1 font-medium pt-2">
                              <div><strong>Check In:</strong> {booking.check_in}</div>
                              <div><strong>Check Out:</strong> {booking.check_out}</div>
                              <div className="text-slate-500 font-semibold">{booking.nights} noches</div>
                            </div>
                          </div>

                          {/* COLUMNA 3 — Confirmaciones e Importe */}
                          <div className="w-full lg:w-96 bg-slate-50 border border-slate-100 p-4 rounded-xl text-xs space-y-2 text-left">
                            <div className="flex justify-between items-center pb-1 border-b border-slate-200">
                              <span className="font-bold text-slate-500">Hotel Conf No:</span>
                              <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                                booking.hotel_confirmation_no ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {booking.hotel_confirmation_no || "To Be Updated ⚠️"}
                              </span>
                            </div>

                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-slate-500">TBOH Conf No:</span>
                              <span className="font-mono font-bold text-slate-800">{booking.booking_reference}</span>
                            </div>

                            <div className="flex justify-between items-center pt-1">
                              <span className="font-bold text-slate-500 text-sm">IMPORTE:</span>
                              <span className="font-extrabold text-xl text-[#C19A6B]">
                                ${Number(booking.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} {booking.currency || 'USD'}
                              </span>
                            </div>

                            <div className="pt-2 border-t border-slate-200 space-y-1 text-slate-600 font-medium">
                              <div><strong>Trip Id:</strong> {booking.id ? booking.id.substring(0, 5).toUpperCase() : 'N/A'}</div>
                              <div><strong>Trip Name:</strong> {tripName}</div>
                              <div><strong>Lead Guest:</strong> {booking.lead_guest_name}</div>
                              <div><strong>Nationality:</strong> {booking.nationality || 'Dominican Republic'}</div>
                              <div><strong>No. Of Guests:</strong> {Number(booking.adults || 2) + Number(booking.children || 0)}</div>
                              <div><strong>Room 1:</strong> {booking.adults} Adult(s) {booking.children} Children</div>
                            </div>
                          </div>
                        </div>

                        {/* ACCIONES INFERIORES */}
                        <div className="bg-slate-50/50 px-6 py-3 border-t border-slate-100 flex flex-wrap justify-between items-center gap-3">
                          {/* Izquierda: Raise Request & Core Type */}
                          <div className="flex items-center gap-3">
                            {booking.fulfillment_status !== 'voucher_issued' && (
                            <Button
                              size="sm"
                              className="bg-[#0A3A6B] hover:bg-[#082D54] text-white font-bold text-xs"
                              onClick={(e) => { e.stopPropagation(); handleSendRaceCondition(booking); }}
                              disabled={sendingRaceCondition || isCancelled}
                            >
                              {sendingRaceCondition ? "Enviando..." : "Raise a Request 🔔"}
                            </Button>
                            )}
                            {booking.fulfillment_status === 'voucher_issued' && (
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1"
                              onClick={(e) => { e.stopPropagation(); window.open(booking.voucher_pdf_url, '_blank'); }}
                            >
                              📄 Ver Voucher
                            </Button>
                            )}
                            {booking.fulfillment_status === 'voucher_issued' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-blue-300 text-blue-700 hover:bg-blue-50 font-bold text-xs"
                              onClick={(e) => { e.stopPropagation(); handleShareWhatsApp(booking); }}
                            >
                              💬 WhatsApp
                            </Button>
                            )}
                            {booking.payment_status === 'paid' && booking.fulfillment_status !== 'voucher_issued' && (
                            <Button
                              size="sm"
                              className="bg-[#C19A6B] hover:bg-[#B08050] text-black font-bold text-xs gap-1"
                              onClick={(e) => { e.stopPropagation(); emitirVoucher(booking); }}
                              disabled={emitiendo === booking.id}
                            >
                              {emitiendo === booking.id ? '⏳ Emitiendo...' : '🏨 Emitir Voucher'}
                            </Button>
                            )}
                            
                            <Badge className={`font-semibold text-xs ${
                              coreType === 'Core 2' ? 'bg-purple-100 text-purple-800 hover:bg-purple-200 border-purple-200' : 
                              coreType === 'Core 1' ? 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200' : 
                              'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-200'
                            }`}>
                              {coreLabel}
                            </Badge>
                          </div>

                          {/* Derecha: Cancel, Open, PayCart, CRM */}
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-red-200 text-red-600 hover:bg-red-50 font-bold text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelBooking(booking);
                              }}
                              disabled={isCancelled}
                            >
                              Cancel Booking
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDetail(booking, 'details');
                              }}
                            >
                              Open | 📄
                            </Button>

                            <Button
                              size="sm"
                              className="bg-[#0A3A6B] hover:bg-[#082D54] text-white font-bold text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDetail(booking, 'payment');
                              }}
                            >
                              Add to PayCart 🛒
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`/admin/crm/leads?name=${encodeURIComponent(booking.lead_guest_name)}`, '_blank');
                              }}
                            >
                              Ver CRM
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>

              {/* FILTROS LATERALES (Derecha) */}
              <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden sticky top-24 text-left">
                <div className="bg-[#0A3A6B] text-white px-4 py-3 font-bold text-sm flex justify-between items-center">
                  <span>— Quick Filter</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-white hover:text-white/80 hover:bg-[#082D54] h-7 text-xs px-2"
                    onClick={handleClearFilters}
                  >
                    Limpiar
                  </Button>
                </div>
                
                <div className="p-4 space-y-4 text-xs">
                  <div className="space-y-1">
                    <Label className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">TBOH Conf No</Label>
                    <Input 
                      placeholder="Ej: ALN-1B3ZCL" 
                      value={filterRef} 
                      onChange={e => setFilterRef(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Hotel Conf No</Label>
                    <Input 
                      placeholder="Localizador Hotel" 
                      value={filterHotelConf} 
                      onChange={e => setFilterHotelConf(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Destination (City/Country)</Label>
                    <Input 
                      placeholder="Destino" 
                      value={filterDestination} 
                      onChange={e => setFilterDestination(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Guest Name</Label>
                    <Input 
                      placeholder="Nombre del Huésped" 
                      value={filterGuestName} 
                      onChange={e => setFilterGuestName(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Hotel Name</Label>
                    <Input 
                      placeholder="Nombre del Hotel" 
                      value={filterHotelName} 
                      onChange={e => setFilterHotelName(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Check-in Date</Label>
                    <Input 
                      type="date"
                      value={filterCheckIn} 
                      onChange={e => setFilterCheckIn(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Status</Label>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="pending_validation">Pendiente Pago</SelectItem>
                        <SelectItem value="waiting_confirmation">En Espera</SelectItem>
                        <SelectItem value="confirmed">Confirmada</SelectItem>
                        <SelectItem value="cancelled">Cancelada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Payment Status</Label>
                    <Select value={filterPayment} onValueChange={setFilterPayment}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="unpaid">Por Pagar ⚠️</SelectItem>
                        <SelectItem value="deposit_received">Depósito Recibido 🟢</SelectItem>
                        <SelectItem value="paid">Pagado ✅</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Proveedor</Label>
                    <Select value={filterSource} onValueChange={setFilterSource}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="goglobal">GoGlobal / Yanolja</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="tbo">TBO</SelectItem>
                        <SelectItem value="ratehawk">Ratehawk</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Core Type</Label>
                    <Select value={filterCoreType} onValueChange={setFilterCoreType}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="Core 2">Proveedor Local (Core 2)</SelectItem>
                        <SelectItem value="Core 1">Tarifa Directa (Core 1)</SelectItem>
                        <SelectItem value="Manual">Admin (Manual)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* --- Details Modal Dialog --- */}
      {selectedBooking && (
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-2xl bg-white rounded-3xl p-6 shadow-2xl border text-left">
            <DialogHeader className="border-b pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-2xl font-bold font-playfair text-slate-800">
                    Detalle de Reserva
                  </DialogTitle>
                  <p className="text-xs font-mono font-bold text-[#C19A6B] mt-0.5">
                    REF: #{selectedBooking.booking_reference}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {getStatusBadge(selectedBooking.status)}
                  {getFulfillmentBadge(selectedBooking.fulfillment_status)}
                </div>
              </div>
            </DialogHeader>

            <Tabs value={detailTab} onValueChange={setDetailTab} className="w-full mt-4">
              <TabsList className="grid grid-cols-5 bg-slate-100 p-1 rounded-xl">
                <TabsTrigger value="details" className="rounded-lg text-xs py-1.5">Detalle</TabsTrigger>
                <TabsTrigger value="customer" className="rounded-lg text-xs py-1.5">Cliente</TabsTrigger>
                <TabsTrigger value="provider" className="rounded-lg text-xs py-1.5">Proveedor</TabsTrigger>
                <TabsTrigger value="payment" className="rounded-lg text-xs py-1.5 font-bold text-[#C19A6B]">Pagos</TabsTrigger>
                <TabsTrigger value="factura" className="rounded-lg text-xs py-1.5 font-bold text-yellow-600">🖨️ Factura</TabsTrigger>
              </TabsList>

              {/* TAB: DETAILS */}
              <TabsContent value="details" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border text-sm text-slate-600">
                  <div className="space-y-1">
                    <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">Hotel</span>
                    <span className="font-bold text-slate-800 text-base block">
                      {selectedBooking.hotels_master?.name || 'Hotel en Caribe'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">Habitación</span>
                    <span className="font-bold text-slate-800 block">
                      {selectedBooking.room_name || 'Habitación no especificada (N/A)'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">Fechas de Estadía</span>
                    <span className="font-semibold text-slate-700 block">
                      {selectedBooking.check_in} al {selectedBooking.check_out} ({selectedBooking.nights || 0} Noches)
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">Ocupación</span>
                    <span className="font-semibold text-slate-700 block">
                      {selectedBooking.occupancy_desc || `${selectedBooking.adults} adultos`}
                    </span>
                  </div>
                  <div className="col-span-2 border-t pt-2 space-y-1">
                    <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">Monto Total de Venta</span>
                    <span className="font-extrabold text-[#C19A6B] text-xl block">
                      ${Number(selectedBooking.total_amount || 0).toFixed(2)} {selectedBooking.currency || 'USD'}
                    </span>
                  </div>
                </div>

                {selectedBooking.voucher_pdf_url && (
                  <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-emerald-800 text-sm">Voucher PDF Emitido</h4>
                      <p className="text-xs text-emerald-600 mt-0.5">El documento está cargado públicamente en el storage.</p>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <Button 
                        variant="outline" 
                        className="border-emerald-600 text-emerald-600 hover:bg-emerald-100 font-bold gap-2 text-xs flex-1 sm:flex-initial"
                        onClick={() => window.open(selectedBooking.voucher_pdf_url, '_blank')}
                      >
                        <Download className="w-4 h-4" /> Descargar Voucher
                      </Button>
                      <Button 
                        className="bg-green-600 hover:bg-green-700 text-white font-bold gap-2 text-xs flex-1 sm:flex-initial"
                        onClick={() => handleShareWhatsApp(selectedBooking)}
                      >
                        <MessageCircle className="w-4 h-4" /> Enviar por WhatsApp
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* TAB: CUSTOMER */}
              <TabsContent value="customer" className="space-y-4 pt-4">
                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border text-sm text-slate-700">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" />
                    <strong>Titular:</strong> {selectedBooking.lead_guest_name}
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <strong>Email:</strong> {selectedBooking.lead_email || 'N/A'}
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <strong>Teléfono:</strong> {selectedBooking.lead_phone || 'N/A'}
                  </div>
                  {selectedBooking.nationality && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-400" />
                      <strong>Nacionalidad:</strong> {selectedBooking.nationality}
                    </div>
                  )}
                </div>

                <div className="border border-slate-200 p-4 rounded-2xl bg-white space-y-3">
                  <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-[#C19A6B]" /> Vinculación al CRM de Supabase
                  </h4>
                  {crmLoading ? (
                    <p className="text-xs text-slate-400 animate-pulse">Buscando lead en crm_leads...</p>
                  ) : crmLead ? (
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <p className="font-semibold text-slate-700">Lead encontrado: {crmLead.full_name}</p>
                        <p className="text-slate-500">Etapa actual: <span className="font-bold uppercase text-[#C19A6B]">{crmLead.stage}</span></p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-xs gap-1"
                        onClick={() => window.open(`/admin/crm/leads?name=${encodeURIComponent(selectedBooking.lead_guest_name)}`, '_blank')}
                      >
                        Ver en CRM <ExternalLink className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      No se encontró un lead correspondiente en crm_leads para el cliente "{selectedBooking.lead_guest_name}".
                    </p>
                  )}
                </div>
              </TabsContent>

              {/* TAB: PROVIDER */}
              <TabsContent value="provider" className="space-y-4 pt-4">
                {/* Check if voucher already issued */}
                {['voucher_issued', 'completed'].includes(selectedBooking.fulfillment_status) ? (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-2.5 text-xs text-amber-800 mb-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Datos de Proveedor Bloqueados</p>
                      <p className="mt-0.5">El voucher ya fue emitido y enviado al cliente. Los campos de confirmación del proveedor son solo de lectura.</p>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border">
                  <div className="space-y-2">
                    <Label htmlFor="hotel_locator" className="font-bold text-xs text-slate-600 uppercase">
                      Localizador de Confirmación de Hotel
                    </Label>
                    <Input 
                      id="hotel_locator"
                      placeholder="Ingrese el número o localizador provisto por el hotel..."
                      className="bg-white border-slate-200 h-10"
                      value={hotelConfirmationNo}
                      onChange={(e) => setHotelConfirmationNo(e.target.value)}
                      disabled={['voucher_issued', 'completed'].includes(selectedBooking.fulfillment_status)}
                    />
                  </div>
                  
                  <div className="flex gap-3">
                    <Button 
                      className="flex-1 text-xs font-semibold py-5" 
                      onClick={handleSaveSettings}
                      disabled={savingSettings}
                    >
                      {savingSettings ? "Guardando..." : "Guardar Localizador"}
                    </Button>

                    <Button 
                      variant="outline" 
                      className="flex-1 text-xs font-semibold py-5 border-slate-200 hover:bg-slate-100"
                      onClick={() => handleSendRaceCondition(selectedBooking)}
                      disabled={sendingRaceCondition || ['voucher_issued', 'completed'].includes(selectedBooking.fulfillment_status)}
                    >
                      {sendingRaceCondition ? "Disparando..." : "Enviar Solicitud Race Condition"}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* TAB: PAYMENTS & RELEASE */}
              <TabsContent value="payment" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border text-sm text-slate-700 mb-2">
                  <div>
                    <strong>Estado de Pago:</strong>
                    <div className="mt-1">{getPaymentStatusBadge(selectedBooking.payment_status)}</div>
                  </div>
                  <div>
                    <strong>Estado de Reserva:</strong>
                    <div className="mt-1">{getStatusBadge(selectedBooking.status)}</div>
                  </div>
                  {selectedBooking.validated_at && (
                    <div className="col-span-2 border-t pt-2 text-xs text-slate-500">
                      Depósito validado por <strong>{selectedBooking.validated_by || 'Director'}</strong> el {format(new Date(selectedBooking.validated_at), 'dd/MM/yyyy HH:mm')}.
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {/* STEP 1: Validate Deposit */}
                  {selectedBooking.payment_status === 'unpaid' && (
                    <div className="border border-dashed border-sky-300 p-4 rounded-2xl bg-sky-50/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                      <div>
                        <h4 className="font-bold text-sky-900 text-sm">Paso 1: Confirmar Depósito</h4>
                        <p className="text-xs text-sky-700 mt-0.5">El cliente ha enviado su comprobante y requiere aprobación inicial.</p>
                      </div>
                      <Button 
                        className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs h-10 px-4"
                        onClick={handleConfirmDeposit}
                        disabled={confirmingDeposit}
                      >
                        {confirmingDeposit ? "Confirmando..." : "Confirmar Depósito Recibido"}
                      </Button>
                    </div>
                  )}

                  {/* STEP 2: Release Voucher */}
                  <div className="border border-slate-200 p-5 rounded-2xl bg-white space-y-4">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">Paso 2: Liberar y Enviar Voucher Oficial</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Esta acción generará el PDF final mediante Gotenberg, lo subirá al storage de Supabase y enviará el voucher por correo al cliente.
                      </p>
                    </div>

                    {/* Validation Warnings */}
                    {selectedBooking.payment_status === 'unpaid' ? (
                      <div className="bg-amber-50 border border-amber-200 text-xs text-amber-800 p-3 rounded-xl flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>El depósito del 30% o pago total debe ser confirmado antes de liberar el voucher.</span>
                      </div>
                    ) : null}
                    
                    {!hotelConfirmationNo ? (
                      <div className="bg-amber-50 border border-amber-200 text-xs text-amber-800 p-3 rounded-xl flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Debes ingresar el localizador de confirmación del hotel en la pestaña "Proveedor".</span>
                      </div>
                    ) : null}

                    {selectedBooking.fulfillment_status === 'voucher_issued' && (
                      <div className="bg-green-50 border border-green-200 text-xs text-green-800 p-3 rounded-xl flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                        <span>El voucher ya ha sido emitido con éxito para esta reserva.</span>
                      </div>
                    )}

                    {selectedBooking.fulfillment_status === 'voucher_issued' ? (
                      <Button 
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-extrabold text-sm py-6 gap-2"
                        onClick={() => handleShareWhatsApp(selectedBooking)}
                      >
                        <MessageCircle className="w-5 h-5" /> Enviar Voucher por WhatsApp 💬
                      </Button>
                    ) : (
                      <Button 
                        className="w-full bg-[#C19A6B] hover:bg-[#A98256] text-black font-extrabold text-sm py-6 gap-2"
                        onClick={handleReleaseVoucher}
                        disabled={
                          releasingVoucher || 
                          selectedBooking.payment_status === 'unpaid' ||
                          !hotelConfirmationNo
                        }
                      >
                        {releasingVoucher ? (
                          <>
                            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                            Generando y Enviando Voucher (Gotenberg)...
                          </>
                        ) : "Liberar Voucher al Cliente"}
                      </Button>
                    )}

                    {/* Botón inteligente — documento oficial según estado */}
                    <Button
                      className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold text-sm py-5 gap-2 mt-2"
                      onClick={() => handleGenerarDocumento(selectedBooking, [])}
                      disabled={generandoDoc}
                    >
                      {generandoDoc ? (
                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>Generando...</>
                      ) : (() => {
                        const dt = getDocType(selectedBooking, [])
                        const isExc = selectedBooking.booking_type === 'excursion'
                        if (dt === 'voucher')       return isExc ? '🌊 Voucher Excursión' : '🏨 Voucher Hotel'
                        if (dt === 'confirmacion')  return isExc ? '✅ Confirmación Exc.' : '✅ Confirmación'
                        return isExc ? '📄 Cotización Exc.' : '📄 Cotización'
                      })()}
                    </Button>
                  </div>
                </div>

                {/* ── PASO 3: INFORMACIÓN BANCARIA PARA COBRO AL CLIENTE ── */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden mt-2">
                  <div className="bg-[#0A1628] px-5 py-3 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-[#C19A6B] text-sm tracking-wide">
                        Paso 3 — Datos para Transferencia al Cliente
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Comparte estos datos para recibir el pago de la reserva
                      </p>
                    </div>
                    <span className="text-xs bg-emerald-700 text-white px-2 py-1 rounded font-bold">ACTIVO</span>
                  </div>

                  {/* Selector de moneda */}
                  <div className="px-5 pt-4 pb-2 bg-slate-50 border-b border-slate-200">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Moneda de pago: <span className="text-[#C19A6B]">
                        {selectedBooking?.nationality === 'DO' || selectedBooking?.currency === 'DOP' ? 'DOP' : 'USD'}
                      </span>
                    </p>
                  </div>

                  {/* Cuentas bancarias */}
                  <div className="divide-y divide-slate-100">
                    {/* Cuenta DOP */}
                    {(selectedBooking?.nationality === 'DO' || selectedBooking?.currency === 'DOP') && (
                    <div className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">🇩🇴</span>
                        <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Pesos Dominicanos (DOP)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                        {[
                          ['Banco',           'Banco Popular Dominicano'],
                          ['Nombre cuenta',   'Aliun Travel SRL'],
                          ['N° de cuenta',    '812-345678-9'],
                          ['Tipo',            'Cuenta Corriente'],
                          ['RNC',             '1-32-XXXXX-X'],
                        ].map(([label, value]) => (
                          <div key={label} className="flex flex-col">
                            <span className="text-slate-400 font-semibold">{label}</span>
                            <span className="font-bold text-slate-800 mt-0.5 select-all">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    )}

                    {/* Cuenta USD */}
                    {(selectedBooking?.nationality !== 'DO' && selectedBooking?.currency !== 'DOP') && (
                    <div className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">🇺🇸</span>
                        <span className="text-xs font-black text-slate-700 uppercase tracking-wider">US Dollars (USD)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                        {[
                          ['Bank Name',       'Banco Popular Dominicano'],
                          ['Account Name',    'Aliun Travel SRL'],
                          ['Account Number',  '812-345678-9 USD'],
                          ['SWIFT Code',      'BPDHDOMX'],
                          ['IBAN',            'DO00BPDH0000812345678'],
                          ['Branch',          'Santo Domingo, RD'],
                        ].map(([label, value]) => (
                          <div key={label} className="flex flex-col">
                            <span className="text-slate-400 font-semibold">{label}</span>
                            <span className="font-bold text-slate-800 mt-0.5 select-all">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    )}

                    {/* Mostrar ambas si hay dudas de moneda */}
                    {!selectedBooking?.nationality && !selectedBooking?.currency && (
                    <div className="px-5 py-3 bg-amber-50">
                      <p className="text-xs text-amber-700 font-semibold">
                        ⚠️ Reserva sin moneda definida — registra la nacionalidad del cliente para mostrar la cuenta correcta.
                      </p>
                    </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="bg-slate-50 px-5 py-3 border-t border-slate-200">
                    <p className="text-[10px] text-slate-400 text-center">
                      Aliun Travel SRL · aliuntravelgroup@gmail.com · +1 829 964 8443
                      {' · '}Ref de pago: <strong>{selectedBooking?.booking_reference}</strong>
                    </p>
                  </div>
                </div>

              </TabsContent>

              {/* TAB: FACTURACIÓN */}
              <TabsContent value="factura" className="pt-4">
                <FacturadorPanel booking={selectedBooking} />
              </TabsContent>

            </Tabs>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default AdminBookingsPanel;