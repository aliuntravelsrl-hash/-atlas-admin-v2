/**
 * Generador de PDF a través del motor Gotenberg en el servidor (n8n Webhook)
 */
export const generateQuotePDF = async ({ 
    hotelName, 
    guestName, 
    checkIn, 
    checkOut, 
    adults, 
    children, 
    roomName, 
    roomTypeName,
    totalPrice, 
    id,
    created_at,
    breakdown = []
}) => {
    try {
        console.log("🚀 Iniciando generación de Cotización con Gotenberg en n8n...");
        
        const payload = {
            hotel_name:       hotelName || 'Hotel Seleccionado',
            guest_name:       guestName || 'Huésped Principal',
            check_in:         checkIn,
            check_out:        checkOut,
            adults:           adults || 2,
            children:         children || 0,
            room_name:        roomName || roomTypeName || 'Habitación Estándar',
            total_price:      totalPrice,
            id_reserva:       id ? id.slice(0, 8).toUpperCase() : 'BORRADOR',
            created_at:       created_at || new Date().toISOString(),
            breakdown:        breakdown
        };

        const res = await fetch('https://n8n-n8n.xaruuo.easypanel.host/webhook/aliun-cotizacion-individual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            throw new Error(`Error en el servidor de PDFs (Status: ${res.status})`);
        }

        const data = await res.json();
        
        if (data.pdf_url) {
            window.open(data.pdf_url, '_blank');
            return { success: true, pdf_url: data.pdf_url };
        } else {
            throw new Error(data.message || "El servidor de PDFs no retornó una URL válida.");
        }
    } catch (error) {
        console.error("❌ Gotenberg error:", error);
        throw error;
    }
};