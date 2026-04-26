import React, { useEffect } from 'react';
import { ArrowLeft, MapPin } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import type { Pessoa } from './PeopleForm';

// Corrige o problema de ícones do Leaflet não carregando corretamente em ambiente React/Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Componente para ajustar o mapa para caber todos os marcadores
const MapBounds = ({ markers }: { markers: Pessoa[] }) => {
  const map = useMap();

  // Dependência baseada nas IDs para não acionar o bounds a cada re-render
  const markersHash = markers.map(m => m.id).join(',');

  useEffect(() => {
    if (markers.length === 0) return;

    const bounds = L.latLngBounds(markers.map(m => [m.latitude!, m.longitude!]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });

    // Timeout para esperar animações ou montagens
    const timeout = setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }, 300);

    return () => clearTimeout(timeout);
  }, [map, markersHash]); // Usar o hash como dependência em vez do array de objetos

  return null;
};

interface PeopleMapFormProps {
  onClose: () => void;
  people: Pessoa[];
}

const PeopleMapForm: React.FC<PeopleMapFormProps> = ({ onClose, people }) => {
  // Filtra as pessoas para garantir que tenham lat/lng válidos
  const mappedPeople = people.filter(p => p.latitude != null && p.longitude != null);

  // Centro padrão caso não haja pessoas
  const defaultCenter: [number, number] = [-23.5505, -46.6333];

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] animate-in fade-in zoom-in-95 duration-200 bg-white dark:bg-[#1C2434] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 bg-white dark:bg-[#1C2434] z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg transition-colors"
            title="Voltar para a listagem"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-2xl font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <MapPin className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              Mapa Demográfico de Pessoas
            </h2>
            <p className="text-sm font-sans text-slate-500 dark:text-slate-400 mt-1">
              Visualização geográfica de {mappedPeople.length} registro(s) listado(s).
            </p>
          </div>
        </div>
      </div>

      {/* Map Content */}
      <div className="flex-1 bg-slate-100 dark:bg-slate-800 relative z-0">
        {mappedPeople.length > 0 ? (
          <MapContainer
            center={defaultCenter}
            zoom={13}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%', zIndex: 0 }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapBounds markers={mappedPeople} />
            
            {mappedPeople.map(p => (
              <Marker key={p.id} position={[p.latitude!, p.longitude!]}>
                <Popup>
                  <div className="font-semibold text-slate-800 uppercase">{p.full_name}</div>
                  <div className="text-xs text-slate-600 mt-1">
                    {p.address ? `${p.address}` : 'Sem endereço'}
                  </div>
                  <div className="text-xs text-slate-600">
                    {p.neighborhood && `${p.neighborhood}, `}{p.city}
                  </div>
                  <div className="text-[10px] inline-block mt-1.5 px-1.5 py-0.5 rounded-md font-medium bg-blue-100 text-blue-700 border border-blue-200">
                    {p.person_type || 'Pessoa'}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 p-6 text-center">
            <MapPin className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">Nenhuma localização encontrada</p>
            <p className="max-w-md">
              Dos <strong>{people.length}</strong> registro(s) listado(s) com os filtros atuais, nenhum possui <strong>Latitude</strong> e <strong>Longitude</strong> cadastrados.
            </p>
            <p className="max-w-md mt-2 text-sm opacity-80">
              Edite o cadastro da pessoa e clique no botão de geolocalização no mapa para definir as coordenadas.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PeopleMapForm;
