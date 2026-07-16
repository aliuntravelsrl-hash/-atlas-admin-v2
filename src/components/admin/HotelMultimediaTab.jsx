import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Save, Video, Utensils, Wifi, BedDouble, Image as ImageIcon, Camera, CheckCircle2 } from 'lucide-react';
import { hotelService } from '@/services/hotelService';
import GallerySection from './GallerySection'; 
import RoomTypesSection from './RoomTypesSection';
import ImageUpload from '@/components/ui/ImageUpload'; // Using ImageUpload directly to ensure prop passing

const HotelMultimediaTab = ({ hotelId, hotelName }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hotelSlug, setHotelSlug] = useState('');
  
  const [data, setData] = useState({
    image_url: '', 
    video_id: '',
    video_url: '',
    gallery_data: [],
    restaurants_data: [],
    services_data: [],
    rooms_data: [] 
  });
  
  const { toast } = useToast();

  useEffect(() => {
    if (hotelId) fetchData();
  }, [hotelId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const hotel = await hotelService.getHotelById(hotelId);
      if (hotel) {
        setHotelSlug(hotel.slug);
        setData({
          image_url: hotel.image_url || '',
          video_id: hotel.video_id || '', 
          video_url: hotel.video_url || '',
          gallery_data: Array.isArray(hotel.gallery_data) ? hotel.gallery_data : [],
          restaurants_data: Array.isArray(hotel.restaurants_data) ? hotel.restaurants_data : [],
          services_data: Array.isArray(hotel.services_data) ? hotel.services_data : [],
          rooms_data: Array.isArray(hotel.rooms_data) ? hotel.rooms_data : []
        });
      }
    } catch (error) {
      console.error("Error fetching:", error);
      toast({ title: "Error", description: "Fallo al cargar datos.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const extractVideoId = (input) => {
      if (!input) return '';
      const regex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
      const match = input.match(regex);
      return match ? match[1] : input; 
  };

  const handleVideoIdChange = (e) => {
      const input = e.target.value;
      const extractedId = extractVideoId(input);
      setData(p => ({ ...p, video_id: extractedId }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const cleanVideoId = extractVideoId(data.video_id);
      
      const payload = {
        image_url: data.image_url,
        video_id: cleanVideoId,
        video_url: data.video_url,
        gallery_data: data.gallery_data,
        restaurants_data: data.restaurants_data,
        services_data: data.services_data,
        rooms_data: data.rooms_data,
        updated_at: new Date().toISOString()
      };

      console.log("[MultimediaTab] Guardando metadatos en Supabase:", payload);
      await hotelService.updateHotelMultimedia(hotelId, payload);
      
      setData(prev => ({ ...prev, video_id: cleanVideoId }));
      toast({ title: "Guardado Exitoso", description: "Datos multimedia sincronizados." });
    } catch (error) {
      console.error("Save error:", error);
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-12 text-center"><Loader2 className="animate-spin w-10 h-10 mx-auto mb-4 text-blue-600" />Cargando datos...</div>;
  const isValidVideoId = data.video_id && data.video_id.length === 11;

  return (
    <div className="space-y-6">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-lg shadow-sm border gap-4 sticky top-0 z-20 backdrop-blur-sm bg-white/90">
           <div>
               <h2 className="text-2xl font-bold text-slate-800">Gestión Multimedia</h2>
               <p className="text-slate-500">Editando: <span className="font-semibold text-blue-600">{hotelName}</span></p>
           </div>
           <Button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700 min-w-[160px] shadow-md">
               {saving ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />} Guardar Cambios
           </Button>
       </div>

       <Tabs defaultValue="video" className="w-full">
           <TabsList className="grid w-full grid-cols-6 bg-white border p-1 rounded-lg shadow-sm">
               <TabsTrigger value="video"><Video className="w-4 h-4 mr-2" /> Video</TabsTrigger>
               <TabsTrigger value="main"><Camera className="w-4 h-4 mr-2" /> Principal</TabsTrigger>
               <TabsTrigger value="gallery"><ImageIcon className="w-4 h-4 mr-2" /> Galería</TabsTrigger>
               <TabsTrigger value="rooms"><BedDouble className="w-4 h-4 mr-2" /> Habitaciones</TabsTrigger>
               <TabsTrigger value="restaurants"><Utensils className="w-4 h-4 mr-2" /> Gastronomía</TabsTrigger>
               <TabsTrigger value="services"><Wifi className="w-4 h-4 mr-2" /> Servicios</TabsTrigger>
           </TabsList>

           <TabsContent value="video" className="mt-6 space-y-6">
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                   <Card className="shadow-lg border-t-4 border-t-red-500">
                       <CardHeader><CardTitle className="flex items-center gap-2 text-xl"><Video className="text-red-500 w-6 h-6" /> YouTube Hero</CardTitle></CardHeader>
                       <CardContent>
                           <div className="space-y-3">
                               <label className="text-sm font-bold text-slate-700">Video ID</label>
                               <div className="relative">
                                   <Input value={data.video_id} onChange={handleVideoIdChange} placeholder="Ej: dQw4w9WgXcQ" className={`font-mono h-12 ${isValidVideoId ? 'border-green-500' : 'border-slate-300'}`}/>
                                   {isValidVideoId && <CheckCircle2 className="absolute right-3 top-3.5 w-5 h-5 text-green-500" />}
                               </div>
                           </div>
                       </CardContent>
                   </Card>
                   <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-xl">
                        {isValidVideoId ? <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${data.video_id}`} title="Preview" frameBorder="0" allowFullScreen></iframe> : <div className="flex items-center justify-center h-full text-slate-500">Sin Video</div>}
                   </div>
               </div>
           </TabsContent>

           <TabsContent value="main" className="mt-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-1 h-64">
                         <div className="h-full border rounded-lg bg-gray-50 p-4">
                             <h4 className="font-semibold mb-2 text-sm text-gray-600">Subir Imagen Principal</h4>
                             {/* UPDATED: Passing hotelId explicitly to ImageUpload */}
                             <ImageUpload 
                                value={data.image_url} 
                                onChange={(url) => setData(p => ({ ...p, image_url: url }))} 
                                hotelId={hotelId || hotelSlug} // Prioritize ID
                                folderPath="hotels/main"
                             />
                         </div>
                    </div>
                    <div className="md:col-span-2"><Card><CardHeader><CardTitle>Vista Previa</CardTitle></CardHeader><CardContent><img src={data.image_url} alt="Main" className="w-full h-64 object-cover rounded"/></CardContent></Card></div>
                </div>
           </TabsContent>

           <TabsContent value="gallery" className="mt-6">
               <GallerySection galleryData={data.gallery_data} onChange={(newData) => setData(prev => ({ ...prev, gallery_data: newData }))} hotelId={hotelId} />
           </TabsContent>

           <TabsContent value="rooms" className="mt-6">
               <RoomTypesSection hotelId={hotelId} hotelSlug={hotelSlug} />
           </TabsContent>

           <TabsContent value="restaurants" className="mt-6">
               <JsonEditor title="Restaurantes (JSON)" data={data.restaurants_data} onSave={(json) => setData(p => ({ ...p, restaurants_data: json }))} />
           </TabsContent>
            
           <TabsContent value="services" className="mt-6">
               <JsonEditor title="Servicios (JSON)" data={data.services_data} onSave={(json) => setData(p => ({ ...p, services_data: json }))} />
           </TabsContent>
       </Tabs>
    </div>
  );
};

const JsonEditor = ({ title, data, onSave }) => {
    const [value, setValue] = useState(JSON.stringify(data, null, 2));
    const [error, setError] = useState(null);
    useEffect(() => { setValue(JSON.stringify(data, null, 2)); }, [data]);
    const handleChange = (e) => {
        const newVal = e.target.value;
        setValue(newVal);
        try {
            const parsed = JSON.parse(newVal);
            if(!Array.isArray(parsed)) throw new Error("Debe ser Array []");
            onSave(parsed); setError(null);
        } catch (err) { setError(err.message); }
    };
    return (
        <Card>
            <CardHeader><CardTitle className="flex justify-between">{title} {error && <span className="text-red-500 text-sm">{error}</span>}</CardTitle></CardHeader>
            <CardContent><Textarea className={`font-mono text-xs h-[300px] ${error ? 'border-red-500' : ''}`} value={value} onChange={handleChange} /></CardContent>
        </Card>
    );
};

export default HotelMultimediaTab;