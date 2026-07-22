import React, { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Eye, MessageSquare, Download } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { generateQuotePDF } from '@/lib/QuotationPDFGenerator';
import ExpiryBadge from './ExpiryBadge';

const RecentActivityTable = ({ data, onViewDetails }) => {
  const { toast } = useToast();
  const [loadingQuoteId, setLoadingQuoteId] = useState(null);

  const handleDownload = async (e, quote) => {
    e.stopPropagation(); 
    const pdfData = {
        id: quote.id,
        created_at: quote.created_at,
        hotelName: quote.hotel?.name,
        roomTypeName: quote.room?.name,
        totalPrice: quote.total_price,
        guestName: quote.guest_name,
        checkIn: quote.check_in, 
        checkOut: quote.check_out,
        adults: quote.adults,
        children: quote.children
    };
    
    setLoadingQuoteId(quote.id);
    try {
      await generateQuotePDF(pdfData);
      toast({
        title: "Cotización Generada ✅",
        description: "El PDF ha sido abierto en una pestaña nueva.",
        className: 'bg-emerald-600 text-white border-none'
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Error al generar",
        description: "No se pudo generar el PDF con Gotenberg.",
        variant: "destructive"
      });
    } finally {
      setLoadingQuoteId(null);
    }
  };

  const handleWhatsApp = (e, quote) => {
    e.stopPropagation();
    if (!quote.guest_phone) {
        alert("Sin teléfono");
        return;
    }
    const cleanPhone = quote.guest_phone.replace(/\D/g, '');
    const message = `Hola ${quote.guest_name}, te contacto de Aliun Travels.`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="rounded-md border bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Hotel</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data && data.length > 0 ? (
            data.map((quote) => (
              <TableRow 
                key={quote.id} 
                className="cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => onViewDetails(quote)}
              >
                <TableCell className="font-medium text-xs whitespace-nowrap">
                  {format(new Date(quote.created_at), 'dd MMM HH:mm', { locale: es })}
                </TableCell>
                <TableCell className="font-medium">
                    <div className="flex flex-col">
                        <span>{quote.guest_name}</span>
                        <span className="text-[10px] text-gray-400">{quote.guest_email}</span>
                    </div>
                </TableCell>
                <TableCell className="text-xs text-gray-500 max-w-[150px] truncate" title={quote.hotel?.name}>
                    {quote.hotel?.name || 'N/A'}
                </TableCell>
                <TableCell className="font-bold text-green-700">
                   ${Number(quote.total_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell>
                  <ExpiryBadge 
                    createdAt={quote.created_at} 
                    validUntil={quote.valid_until} 
                    status={quote.status}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={(e) => { e.stopPropagation(); onViewDetails(quote); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8" 
                      onClick={(e) => handleDownload(e, quote)}
                      disabled={loadingQuoteId === quote.id}
                    >
                      <Download className={`h-4 w-4 ${loadingQuoteId === quote.id ? 'animate-bounce text-amber-500' : ''}`} />
                    </Button>
                    {quote.guest_phone && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={(e) => handleWhatsApp(e, quote)}>
                            <MessageSquare className="h-4 w-4" />
                        </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center">
                Sin actividad reciente.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default RecentActivityTable;