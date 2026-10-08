import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Edit2, Trash2, MapPin, Eye, Search, AlertTriangle, CheckCircle, X, Navigation, Loader2, Compass, Map as MapIcon, ChevronRight } from 'lucide-react';
import { stopsAPI } from '../services/api';
import { Card, Table, Tr, Td, Pagination, SearchInput, Button, Select, StatusBadge, Modal, ConfirmDialog, ErrorState, Badge } from '../components/ui';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// Fix for default marker icon in Leaflet with React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface PhysicalStop {
  id: number;
  stop_name: string;
  stop_code?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  landmark?: string;
  status: string;
  usage_count: number;
  routes?: { id: number; route_code: string; route_name: string }[];
  created_at?: string;
}

interface StopsPageProps {
  onNotify: (msg: string, type?: any) => void;
}

// ── Map Click & Center Handler Component ─────────────────────
const MapClickHandler: React.FC<{
  onMapClick: (lat: number, lng: number) => void;
  center?: [number, number];
}> = ({ onMapClick, center }) => {
  const map = useMap();

  useEffect(() => {
    if (center && center[0] && center[1] && !isNaN(center[0]) && !isNaN(center[1])) {
      map.setView(center, Math.max(map.getZoom(), 15), { animate: true });
    }
  }, [map, center]);

  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });

  return null;
};

export const StopsPage: React.FC<StopsPageProps> = ({ onNotify }) => {
  const [stops, setStops] = useState<PhysicalStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, limit: 15 });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<PhysicalStop | null>(null);
  const [editStop, setEditStop] = useState<PhysicalStop | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PhysicalStop | null>(null);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [mapSearchQuery, setMapSearchQuery] = useState('');

  // Autocomplete Suggestions State
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const searchInputRef = useRef<HTMLDivElement>(null);
  const userTypingRef = useRef(false);

  const [nearbyWarning, setNearbyWarning] = useState<any[]>([]);

  const [form, setForm] = useState({
    stop_name: '',
    stop_code: '',
    latitude: '22.4824724',
    longitude: '88.3508133',
    address: '',
    landmark: '',
    status: 'Active',
  });

  const [mapCenter, setMapCenter] = useState<[number, number]>([22.4824724, 88.3508133]);

  const fetchStops = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const resp = await stopsAPI.list({ page, limit: 15, search, status: statusFilter });
      setStops(resp.data.data || []);
      setPagination(resp.data.pagination || { total: 0, pages: 1, limit: 15 });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load stops');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchStops();
  }, [fetchStops]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  // Live debounced place search suggestions list as user types in place search bar
  useEffect(() => {
    if (!mapSearchQuery || mapSearchQuery.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(mapSearchQuery.trim())}&limit=5&addressdetails=1`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setSuggestions(data);
            setShowSuggestions(true);
          } else {
            setSuggestions([]);
          }
        }
      } catch {
        // Ignore network errors
      } finally {
        setLoadingSuggestions(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [mapSearchQuery]);

  // Handle click outside suggestions dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchInputRef.current && !searchInputRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const checkNearby = async (latStr: string, lngStr: string) => {
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (!isNaN(lat) && !isNaN(lng)) {
      try {
        const resp = await stopsAPI.nearbyCheck(lat, lng, 100);
        if (resp.data?.has_nearby) {
          setNearbyWarning(resp.data.data || []);
        } else {
          setNearbyWarning([]);
        }
      } catch {
        setNearbyWarning([]);
      }
    } else {
      setNearbyWarning([]);
    }
  };

  // Reverse Geocode: Lat/Lng -> Address
  const reverseGeocode = async (lat: number, lng: number) => {
    setGeocoding(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.display_name) {
          setForm((prev) => ({
            ...prev,
            address: data.display_name,
          }));
        }
      }
    } catch {
      // Ignore network / rate limit errors
    } finally {
      setGeocoding(false);
    }
  };

  // Select place from live search suggestions list
  const handleSelectSuggestion = (item: any) => {
    userTypingRef.current = false;
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    if (!isNaN(lat) && !isNaN(lng)) {
      const latFixed = lat.toFixed(7);
      const lngFixed = lng.toFixed(7);
      const placeName = item.display_name.split(',')[0];

      setForm((prev) => ({
        ...prev,
        stop_name: prev.stop_name || placeName,
        latitude: latFixed,
        longitude: lngFixed,
        address: item.display_name,
      }));
      setMapCenter([lat, lng]);
      setMapSearchQuery(placeName);
      setShowSuggestions(false);
      checkNearby(latFixed, lngFixed);
    }
  };

  // Forward Geocode: Name / Query -> Lat/Lng & Address
  const handleSearchMapLocation = async (queryText?: string) => {
    userTypingRef.current = false;
    const query = queryText || mapSearchQuery || form.stop_name;
    if (!query || !query.trim()) {
      onNotify('Please enter a location or stop name to search', 'error');
      return;
    }

    setGeocoding(true);
    setShowSuggestions(false);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          handleSelectSuggestion(data[0]);
          return;
        }
        onNotify('Location not found on map, please try a different query or click the map', 'error');
      }
    } catch {
      onNotify('Geocoding service unavailable', 'error');
    } finally {
      setGeocoding(false);
    }
  };

  // Map Click Event Handler
  const handleMapClick = (lat: number, lng: number) => {
    const latFixed = lat.toFixed(7);
    const lngFixed = lng.toFixed(7);
    setForm((prev) => ({
      ...prev,
      latitude: latFixed,
      longitude: lngFixed,
    }));
    setMapCenter([lat, lng]);
    checkNearby(latFixed, lngFixed);
    reverseGeocode(lat, lng);
  };

  // Marker Drag Handler
  const handleMarkerDragEnd = (e: any) => {
    const latlng = e.target.getLatLng();
    if (latlng) {
      handleMapClick(latlng.lat, latlng.lng);
    }
  };

  // Device GPS Location Handler
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      onNotify('Geolocation is not supported by your browser', 'error');
      return;
    }
    setGeocoding(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        handleMapClick(lat, lng);
        setGeocoding(false);
        onNotify('Centered map to your current GPS position');
      },
      () => {
        setGeocoding(false);
        onNotify('Unable to retrieve your current location', 'error');
      }
    );
  };

  const openCreate = () => {
    userTypingRef.current = false;
    setEditStop(null);
    const defaultLat = '22.4824724';
    const defaultLng = '88.3508133';
    setForm({
      stop_name: '',
      stop_code: '',
      latitude: defaultLat,
      longitude: defaultLng,
      address: '',
      landmark: '',
      status: 'Active',
    });
    setMapCenter([parseFloat(defaultLat), parseFloat(defaultLng)]);
    setMapSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
    setNearbyWarning([]);
    setShowCreateModal(true);
  };

  const openEdit = (s: PhysicalStop) => {
    userTypingRef.current = false;
    setEditStop(s);
    const latStr = s.latitude != null ? String(s.latitude) : '22.4824724';
    const lngStr = s.longitude != null ? String(s.longitude) : '88.3508133';
    setForm({
      stop_name: s.stop_name || '',
      stop_code: s.stop_code || '',
      latitude: latStr,
      longitude: lngStr,
      address: s.address || '',
      landmark: s.landmark || '',
      status: s.status || 'Active',
    });
    const latNum = parseFloat(latStr);
    const lngNum = parseFloat(lngStr);
    if (!isNaN(latNum) && !isNaN(lngNum)) {
      setMapCenter([latNum, lngNum]);
    }
    setMapSearchQuery(s.stop_name || '');
    setSuggestions([]);
    setShowSuggestions(false);
    setNearbyWarning([]);
    setShowCreateModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.stop_name.trim()) {
      onNotify('Stop Name is required', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editStop) {
        await stopsAPI.update(editStop.id, form);
        onNotify('Physical stop updated successfully');
      } else {
        await stopsAPI.create(form);
        onNotify('Physical stop created successfully');
      }
      setShowCreateModal(false);
      fetchStops();
    } catch (err: any) {
      onNotify(err.response?.data?.message || 'Failed to save stop', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await stopsAPI.delete(deleteTarget.id);
      onNotify('Physical stop deactivated successfully');
      setDeleteTarget(null);
      fetchStops();
    } catch (err: any) {
      onNotify(err.response?.data?.message || 'Action failed', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const HEADERS = ['ID', 'Stop Name', 'Code', 'Coordinates (Lat, Lng)', 'Address', 'Routes Using Stop', 'Status', 'Actions'];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Physical Bus Stop Master</h2>
          <p className="text-slate-400 text-sm">{pagination.total} unique physical bus stops registered</p>
        </div>
        <Button onClick={openCreate} icon={Plus}>
          Add New Stop
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search stop name, code, address, landmark..."
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'Active', label: 'Active' },
            { value: 'Inactive', label: 'Inactive' },
          ]}
          placeholder="All Statuses"
        />
      </div>

      <Card padding={false}>
        {error ? (
          <ErrorState message={error} onRetry={fetchStops} />
        ) : (
          <>
            <Table
              headers={HEADERS}
              loading={loading}
              empty={!loading && stops.length === 0}
              emptyMessage="No physical bus stops found"
            >
              {stops.map((stop) => (
                <Tr key={stop.id}>
                  <Td className="text-slate-400 font-mono text-xs">{stop.id}</Td>
                  <Td>
                    <div className="text-white font-medium text-sm flex items-center gap-1.5">
                      <MapPin size={14} className="text-indigo-400 shrink-0" />
                      {stop.stop_name}
                    </div>
                  </Td>
                  <Td>
                    {stop.stop_code ? (
                      <span className="font-mono text-xs text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40">
                        {stop.stop_code}
                      </span>
                    ) : (
                      <span className="text-slate-500 text-xs">—</span>
                    )}
                  </Td>
                  <Td className="text-slate-300 text-xs font-mono">
                    {stop.latitude && stop.longitude ? `${stop.latitude}, ${stop.longitude}` : '—'}
                  </Td>
                  <Td className="text-slate-300 text-xs max-w-xs truncate">{stop.address || '—'}</Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => setShowDetailModal(stop)}
                      className="hover:opacity-80 transition-opacity"
                    >
                      <Badge color={stop.usage_count > 0 ? 'emerald' : 'slate'}>
                        Used by {stop.usage_count} route{stop.usage_count === 1 ? '' : 's'}
                      </Badge>
                    </button>
                  </Td>
                  <Td>
                    <StatusBadge status={stop.status} />
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => setShowDetailModal(stop)} title="View Usage">
                        <Eye size={13} className="text-cyan-400" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(stop)} title="Edit Stop">
                        <Edit2 size={13} className="text-slate-300" />
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleteTarget(stop)} title="Deactivate">
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Table>
            <Pagination
              page={page}
              pages={pagination.pages}
              total={pagination.total}
              limit={pagination.limit}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      {/* Stop Detail Modal (Routes Using Stop) */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <MapPin size={18} className="text-indigo-400" />
                <h3 className="text-base font-semibold text-white">{showDetailModal.stop_name}</h3>
              </div>
              <button onClick={() => setShowDetailModal(null)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs text-slate-300">
              <div>
                <span className="text-slate-500 block">Coordinates:</span>
                <span className="font-mono text-white">
                  {showDetailModal.latitude && showDetailModal.longitude
                    ? `${showDetailModal.latitude}, ${showDetailModal.longitude}`
                    : 'Not configured'}
                </span>
              </div>
              {showDetailModal.address && (
                <div>
                  <span className="text-slate-500 block">Address:</span>
                  <span className="text-white">{showDetailModal.address}</span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-800">
                <span className="text-slate-400 font-semibold block mb-2">
                  Routes using this physical stop ({showDetailModal.routes?.length || 0}):
                </span>
                {showDetailModal.routes && showDetailModal.routes.length > 0 ? (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {showDetailModal.routes.map((r) => (
                      <div key={r.id} className="flex items-center justify-between bg-slate-800/60 px-3 py-2 rounded border border-slate-700/40">
                        <span className="font-medium text-white">{r.route_name}</span>
                        <span className="font-mono text-[10px] text-cyan-400 bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-800/40">
                          {r.route_code}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 py-2">No routes currently attach to this stop</p>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <Button variant="ghost" onClick={() => setShowDetailModal(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Big Create / Edit Stop Modal with Interactive Leaflet Map & Live Autocomplete ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <MapPin size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {editStop ? 'Edit Physical Stop' : 'Create New Physical Stop'}
                    <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Compass size={12} /> Interactive Map Active
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Type a place name to auto-locate on map or click anywhere on map to pin exact location.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body - 2 Columns (Form Left, Map Right) */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* ── Left Column: Form Controls (5 cols) ── */}
                <div className="lg:col-span-5 space-y-4">
                  {/* Stop Name */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-200">
                        Stop Name <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleSearchMapLocation(form.stop_name)}
                        disabled={geocoding || !form.stop_name}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 disabled:opacity-50"
                      >
                        {geocoding ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                        Find on Map
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. RANIKUTHI- MADHUMITA RESTAURANT"
                      value={form.stop_name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm((prev) => ({ ...prev, stop_name: val }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (form.stop_name.trim()) {
                            handleSearchMapLocation(form.stop_name);
                          }
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-800/90 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-medium"
                    />
                  </div>

                  {/* Stop Code */}
                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1">Stop Code</label>
                    <input
                      type="text"
                      placeholder="e.g. RNK-001"
                      value={form.stop_code}
                      onChange={(e) => setForm({ ...form, stop_code: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800/90 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  {/* Latitude & Longitude */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">Latitude</label>
                      <input
                        type="text"
                        placeholder="22.4824724"
                        value={form.latitude}
                        onChange={(e) => {
                          const latVal = e.target.value;
                          setForm({ ...form, latitude: latVal });
                          const latNum = parseFloat(latVal);
                          const lngNum = parseFloat(form.longitude);
                          if (!isNaN(latNum) && !isNaN(lngNum)) {
                            setMapCenter([latNum, lngNum]);
                            checkNearby(latVal, form.longitude);
                          }
                        }}
                        className="w-full px-3 py-2 bg-slate-800/90 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">Longitude</label>
                      <input
                        type="text"
                        placeholder="88.3508133"
                        value={form.longitude}
                        onChange={(e) => {
                          const lngVal = e.target.value;
                          setForm({ ...form, longitude: lngVal });
                          const latNum = parseFloat(form.latitude);
                          const lngNum = parseFloat(lngVal);
                          if (!isNaN(latNum) && !isNaN(lngNum)) {
                            setMapCenter([latNum, lngNum]);
                            checkNearby(form.latitude, lngVal);
                          }
                        }}
                        className="w-full px-3 py-2 bg-slate-800/90 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                      />
                    </div>
                  </div>

                  {/* Address */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-200">Address</label>
                      {geocoding && (
                        <span className="text-[10px] text-amber-400 flex items-center gap-1 font-semibold">
                          <Loader2 size={10} className="animate-spin" /> Auto-fetching address...
                        </span>
                      )}
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Street address or junction detail"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800/90 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 leading-relaxed"
                    />
                  </div>

                  {/* Landmark */}
                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1">Landmark</label>
                    <input
                      type="text"
                      placeholder="e.g. Near Reliance Digital"
                      value={form.landmark}
                      onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800/90 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Status */}
                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1">Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800/90 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>

                  {/* Nearby Proximity Warning */}
                  {nearbyWarning.length > 0 && (
                    <div className="p-3 bg-amber-950/60 border border-amber-800/80 rounded-xl text-xs text-amber-300 space-y-1 shadow-sm">
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                        Existing Physical Stop Nearby!
                      </div>
                      {nearbyWarning.slice(0, 3).map((item) => (
                        <div key={item.id} className="text-[11px] text-amber-200/90 pl-5">
                          • <span className="font-semibold text-white">{item.stop_name}</span> ({item.distance_meters}m away)
                        </div>
                      ))}
                      <div className="text-[10px] text-amber-400/80 pt-1">
                        Please verify to avoid creating duplicate physical stops.
                      </div>
                    </div>
                  )}

                  {/* Form Action Buttons */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                    <Button variant="ghost" type="button" onClick={() => setShowCreateModal(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" loading={saving} icon={MapPin}>
                      {editStop ? 'Save Changes' : 'Create Physical Stop'}
                    </Button>
                  </div>
                </div>

                {/* ── Right Column: Large Interactive Leaflet Map & Live Autocomplete Search (7 cols) ── */}
                <div className="lg:col-span-7 flex flex-col space-y-3">
                  
                  {/* Live Place Search Bar with Suggestions Dropdown */}
                  <div className="relative" ref={searchInputRef}>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Type place or landmark (e.g. Ranikuthi, 14 No, Jadavpur)..."
                          value={mapSearchQuery}
                          onChange={(e) => {
                            const val = e.target.value;
                            userTypingRef.current = true;
                            setMapSearchQuery(val);
                            setShowSuggestions(true);
                          }}
                          onFocus={() => {
                            if (suggestions.length > 0) setShowSuggestions(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (suggestions.length > 0) {
                                handleSelectSuggestion(suggestions[0]);
                              } else {
                                handleSearchMapLocation();
                              }
                            }
                          }}
                          className="w-full pl-8 pr-8 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-medium"
                        />
                        {loadingSuggestions && (
                          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-indigo-400" />
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSearchMapLocation()}
                        disabled={geocoding}
                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                      >
                        {geocoding ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                        Find
                      </button>

                      <button
                        type="button"
                        onClick={handleUseCurrentLocation}
                        disabled={geocoding}
                        className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white rounded-lg transition-colors shrink-0"
                        title="Use My Current GPS Position"
                      >
                        <Navigation size={16} />
                      </button>
                    </div>

                    {/* Autocomplete Floating Suggestions Dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-[2000] mt-1 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-slate-800 text-xs">
                        <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-950/60">
                          Matching Map Places (Click to select & center)
                        </div>
                        {suggestions.map((item, idx) => {
                          const title = item.display_name.split(',')[0];
                          return (
                            <div
                              key={idx}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleSelectSuggestion(item);
                              }}
                              className="p-2.5 hover:bg-indigo-950/80 cursor-pointer flex items-start gap-2 text-slate-200 hover:text-white transition-colors"
                            >
                              <MapPin size={15} className="text-indigo-400 mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-white truncate flex items-center justify-between">
                                  <span>{title}</span>
                                  <ChevronRight size={13} className="text-slate-500" />
                                </div>
                                <div className="text-[11px] text-slate-400 truncate mt-0.5">
                                  {item.display_name}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Leaflet Map Box */}
                  <div className="relative flex-1 min-h-[380px] rounded-xl overflow-hidden border border-slate-700/80 shadow-inner">
                    <MapContainer
                      center={mapCenter}
                      zoom={15}
                      style={{ height: '100%', width: '100%', minHeight: '380px' }}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://tile.openstreetmap.de/{z}/{x}/{y}.png"
                      />
                      
                      <Marker
                        position={mapCenter}
                        draggable={true}
                        eventHandlers={{ dragend: handleMarkerDragEnd }}
                      >
                        <Popup>
                          <div className="text-xs">
                            <strong className="text-indigo-900 block">{form.stop_name || 'Selected Stop Location'}</strong>
                            <span className="font-mono text-slate-600">{form.latitude}, {form.longitude}</span>
                          </div>
                        </Popup>
                      </Marker>

                      <MapClickHandler onMapClick={handleMapClick} center={mapCenter} />
                    </MapContainer>

                    {/* Geocoding Loading Indicator Overlay */}
                    {geocoding && (
                      <div className="absolute top-3 right-3 z-[1000] bg-slate-900/90 border border-indigo-500/50 text-indigo-300 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg backdrop-blur-sm">
                        <Loader2 size={14} className="animate-spin text-indigo-400" />
                        Updating map location...
                      </div>
                    )}
                  </div>

                  {/* Map Hint Footer */}
                  <div className="p-3 bg-slate-800/80 border border-slate-700/60 rounded-xl text-xs text-slate-300 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <MapIcon size={15} className="text-indigo-400 shrink-0" />
                      <span className="truncate">
                        <strong>Type place or click map</strong> to position pin. Latitude, Longitude & Address auto-fill.
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-indigo-300 bg-indigo-950/80 border border-indigo-800/50 px-2 py-0.5 rounded shrink-0">
                      {form.latitude}, {form.longitude}
                    </span>
                  </div>
                </div>

              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete / Deactivate Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Deactivate Physical Stop"
        message={`Are you sure you want to deactivate stop "${deleteTarget?.stop_name}"?`}
        loading={deleting}
      />
    </div>
  );
};
