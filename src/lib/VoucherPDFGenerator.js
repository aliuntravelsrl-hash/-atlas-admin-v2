/**
 * Generador de PDF de Voucher de Reserva utilizando Gotenberg en el servidor (n8n Webhook)
 */
export const generateVoucherPDF = async (booking) => {
    try {
        if (!booking) throw new Error("No hay datos de reserva para generar el voucher.");
        
        console.log("🚀 Iniciando generación de Voucher con Gotenberg en n8n...", booking);

        // Mapear product_type dinámicamente si la reserva es de excursión o hotel
        const isExcursion = booking.booking_type === 'excursion' || !!booking.excursions;
        const productType = isExcursion ? 'excursion' : 'hotel';
        
        // Mapear campos consistentes con la firma de n8n
        const payload = {
            product_type:     productType,
            adults:           booking.adults || 2,
            check_in:         booking.check_in,
            check_out:        booking.check_out,
            children:         booking.children || 0,
            hotel_slug:       booking.hotel_code || booking.hotels_master?.slug || booking.hotels?.slug || '',
            id_reserva:       booking.booking_reference || booking.voucher_code || 'PENDIENTE',
            noches:           booking.nights || (booking.check_in && booking.check_out ? Math.round((new Date(booking.check_out) - new Date(booking.check_in)) / 86400000) : 1),
            nombre:           booking.lead_guest_name || booking.guest_name || 'Huésped Principal',
            provider_locator: booking.hotel_confirmation_no || booking.provider_locator || 'PENDIENTE',
            regimen:          booking.regimen || booking.plan || 'Todo Incluido',
            room_name:        booking.room_name || booking.room_types?.name || 'Habitación Estándar',
            send_telegram:    true,
            telegram_chat_id: '683265740'
        };

        const res = await fetch('https://n8n-n8n.xaruuo.easypanel.host/webhook/aliun-voucher', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            throw new Error(`Error en el servidor de vouchers (Status: ${res.status})`);
        }

        const data = await res.json();

        if (data.pdf_url) {
            window.open(data.pdf_url, '_blank');
            return { success: true, pdf_url: data.pdf_url };
        } else {
            throw new Error(data.message || "El servidor de vouchers no retornó una URL válida.");
        }
    } catch (error) {
        console.error("❌ Gotenberg voucher error:", error);
        throw error;
    }
};