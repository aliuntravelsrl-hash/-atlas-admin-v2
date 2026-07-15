import { supabase } from '@/lib/customSupabaseClient';

export const paymentService = {
    /**
     * Registers a new payment in the database
     */
    async createPayment(paymentData) {
        console.log("💳 Recording Payment:", paymentData);
        
        const { data, error } = await supabase
            .from('atlas_payments')
            .insert([{
                booking_id: paymentData.booking_id,
                amount: paymentData.amount,
                currency: paymentData.currency || 'USD',
                method: paymentData.payment_method, // 'transferencia', 'azul', etc.
                payment_type: paymentData.payment_type || 'deposito', // 'deposito' o 'total' según constraint
                reference: paymentData.transaction_id, // Código de transacción/referencia
                status: paymentData.status || 'approved', // 'approved', 'pending', etc.
                payer_name: paymentData.payer_name || null,
                payer_email: paymentData.payer_email || null,
                evidence: paymentData.evidence || {},
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) {
            console.error("❌ Error recording payment:", error);
            throw error;
        }

        return data;
    },

    async getPaymentsByBooking(bookingId) {
        const { data, error } = await supabase
            .from('atlas_payments')
            .select('*')
            .eq('booking_id', bookingId);
            
        if (error) throw error;
        return data;
    }
};