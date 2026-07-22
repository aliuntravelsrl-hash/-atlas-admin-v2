import React, { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Download, Calendar, User, MapPin, Bed, CreditCard, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { generateQuotePDF } from '@/lib/QuotationPDFGenerator';

import StatusUpdater from './StatusUpdater';
import WhatsAppButton from './WhatsAppButton';
import ExpiryBadge from './ExpiryBadge';

const QuotationDetailPanel = ({ quotation, open, onOpenChange, onStatusUpdate }) => {
  if (!quotation) return null;

  const { toast } = useToast();
  const [loadingPDF, setLoadingPDF] = useState(false);

  const handleDownloadPDF = async () => {
    const pdfData = {
        id: quotation.id,
        created_at: quotation.created_at,
        hotelName: quotation.hotel?.name,
        roomTypeName: quotation.room?.name,
        totalPrice: quotation.total_price,
        guestName: quotation.guest_name,
        checkIn: quotation.check_in, 
        checkOut: quotation.check_out,
        adults: quotation.adults,
        children: quotation.children
    };
    
    setLoadingPDF(true);
    try {
      await generateQuotePDF(pdfData);
      toast({
        title: "Cotización Generada ✅",
        description: "El PDF ha sido abierto en una pestaña nueva.",
        className: 'bg-emerald-600 text-white border-none'
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "Error de Cotización",
        description: "No se pudo generar el PDF con Gotenberg. Intenta nuevamente.",
        variant: "destructive"
      });
    } finally {
      setLoadingPDF(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="mb-6 text-left">
          <div className="flex justify-between items-start">
             <div>
                <SheetTitle className="text-xl">Detalle de Cotización</SheetTitle>
                <SheetDescription>
                  ID: <span className="font-mono text-xs">{quotation.id.slice(0, 8)}</span>
                </SheetDescription>
             </div>
             <ExpiryBadge 
                createdAt={quotation.created_at} 
                validUntil={quotation.valid_until} 
                status={quotation.status} 
             />
          </div>
        </SheetHeader>

        <div className="space-y-6">
            
            {/* Acciones Rápidas */}
            <div className="grid grid-cols-1 gap-3 bg-gray-50 p-4 rounded-lg border">
                <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-500">Gestión de Estado</span>
                </div>
                <div className="flex flex-col gap-2">
                    <StatusUpdater 
                        quotationId={quotation.id} 
                        currentStatus={quotation.status}
                        onUpdate={onStatusUpdate}
                    />
                    <div className="flex gap-2">
                        <WhatsAppButton 
                            className="flex-1"
                            phone={quotation.guest_phone} 
                            guestName={quotation.guest_name} 
                            hotelName={quotation.hotel?.name} 
                        />
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1" 
                            onClick={handleDownloadPDF}
                            disabled={loadingPDF}
                        >
                            <Download className="w-4 h-4 mr-2" />
                            {loadingPDF ? 'Generando...' : 'PDF'}
                        </Button>
                    </div>
                </div>
            </div>

            <Separator />

            {/* Información del Cliente */}
            <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-gray-900">
                    <User className="w-4 h-4 text-primary" /> Cliente
                </h4>
                <div className="text-sm space-y-1 pl-6">
                    <p className="font-medium">{quotation.guest_name}</p>
                    <p className="text-gray-500">{quotation.guest_email}</p>
                    <p className="text-gray-500">{quotation.guest_phone || 'Sin teléfono'}</p>
                </div>
            </div>

            <Separator />

            {/* Información del Hotel */}
            <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-gray-900">
                    <MapPin className="w-4 h-4 text-primary" /> Alojamiento
                </h4>
                <div className="text-sm space-y-1 pl-6">
                    <p className="font-medium">{quotation.hotel?.name}</p>
                    <p className="text-gray-500">{quotation.hotel?.location || 'Ubicación no disponible'}</p>
                    <div className="flex items-center gap-2 mt-2">
                        <Bed className="w-3 h-3 text-gray-400" />
                        <span>{quotation.room?.name}</span>
                    </div>
                </div>
            </div>

            <Separator />

            {/* Fechas y Ocupación */}
            <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-gray-900">
                    <Calendar className="w-4 h-4 text-primary" /> Estadía
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm pl-6">
                    <div>
                        <span className="text-xs text-gray-500 block">Check-in</span>
                        <span className="font-medium">
                            {format(new Date(quotation.check_in), 'dd MMM yyyy', { locale: es })}
                        </span>
                    </div>
                    <div>
                        <span className="text-xs text-gray-500 block">Check-out</span>
                        <span className="font-medium">
                            {format(new Date(quotation.check_out), 'dd MMM yyyy', { locale: es })}
                        </span>
                    </div>
                    <div className="col-span-2">
                        <span className="text-xs text-gray-500 block">Ocupación</span>
                        <span>{quotation.adults} Adultos, {quotation.children} Niños</span>
                    </div>
                </div>
            </div>

            <Separator />

            {/* Precios */}
            <div className="space-y-3 bg-blue-50/50 p-4 rounded-lg">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-gray-900">
                    <CreditCard className="w-4 h-4 text-primary" /> Resumen Financiero
                </h4>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-gray-600">
                        <span>Subtotal</span>
                        <span>${(Number(quotation.total_price) * 0.82).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                        <span>Impuestos (18%)</span>
                        <span>${(Number(quotation.total_price) * 0.18).toFixed(2)}</span>
                    </div>
                    <Separator className="bg-blue-200" />
                    <div className="flex justify-between font-bold text-lg text-primary">
                        <span>Total</span>
                        <span>${Number(quotation.total_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>
            </div>
            
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default QuotationDetailPanel;