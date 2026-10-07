import React, { useState, useEffect, useCallback } from 'react';
import { bookingsAPI } from '../services/api';
import { Card, Table, Tr, Td, Pagination, SearchInput, Button, Select, StatusBadge, Modal, ConfirmDialog, ErrorState, Badge } from '../components/ui';
import { XCircle, Eye, Calendar, MapPin, User, CreditCard, Ticket, Phone, ArrowRight, CheckCircle2, Tag, RefreshCw, Navigation, Compass, Radio, Loader2, ShieldCheck, Bus } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix for default marker icon in Leaflet with React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom DivIcons for Bus and Stop Pins
const createBusDivIcon = () =>
  L.divIcon({
    className: 'custom-bus-marker',
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px;">
        <div style="position: absolute; width: 40px; height: 40px; border-radius: 9999px; background-color: #6366f1; opacity: 0.4; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="position: relative; width: 34px; height: 34px; border-radius: 9999px; background: linear-gradient(135deg, #4f46e5, #4338ca); border: 2px solid white; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; color: white;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M16 6v6"/><path d="M2 12h20"/><path d="M18 18h2a1 1 0 0 0 1-1V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });

const createStopDivIcon = (bgColor: string, textLabel: string) =>
  L.divIcon({
    className: 'custom-stop-marker',
    html: `
      <div style="width: 32px; height: 32px; border-radius: 9999px; background-color: ${bgColor}; border: 2.5px solid white; box-shadow: 0 8px 12px -2px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 11px; font-family: monospace;">
        ${textLabel}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

// Dynamic Map Bounds Handler
const MapBoundsHandler: React.FC<{
  busPos?: [number, number] | null;
  boardingPos?: [number, number] | null;
  destPos?: [number, number] | null;
}> = ({ busPos, boardingPos, destPos }) => {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [];
    if (busPos && !isNaN(busPos[0]) && !isNaN(busPos[1])) points.push(busPos);
    if (boardingPos && !isNaN(boardingPos[0]) && !isNaN(boardingPos[1])) points.push(boardingPos);
    if (destPos && !isNaN(destPos[0]) && !isNaN(destPos[1])) points.push(destPos);

    if (points.length > 1) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    } else if (points.length === 1) {
      map.setView(points[0], 15);
    }
  }, [map, busPos, boardingPos, destPos]);

  return null;
};

interface BookingsPageProps {
  onNotify: (msg: string, type?: any) => void;
}

export const BookingsPage: React.FC<BookingsPageProps> = ({ onNotify }) => {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [bookingStatusFilter, setBookingStatusFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, limit: 15 });

  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [cancelling, setCancelling] = useState(false);

  // Detail Modal State
  const [viewBooking, setViewBooking] = useState<any>(null);
  const [fullBookingDetail, setFullBookingDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Live Tracking Modal State
  const [trackTarget, setTrackTarget] = useState<any>(null);
  const [trackingData, setTrackingData] = useState<any>(null);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchBookings = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const resp = await bookingsAPI.list({
        page,
        limit: 15,
        search,
        booking_status: bookingStatusFilter,
        payment_status: paymentStatusFilter,
      });
      setBookings(resp.data.data);
      setPagination(resp.data.pagination);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [page, search, bookingStatusFilter, paymentStatusFilter]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    setPage(1);
  }, [search, bookingStatusFilter, paymentStatusFilter]);

  const fetchTracking = useCallback(async (bookingId: number) => {
    try {
      setLoadingTrack(true);
      const resp = await bookingsAPI.track(bookingId);
      if (resp.data?.data) {
        setTrackingData(resp.data.data);
      }
    } catch (err: any) {
      console.error('Failed to load tracking data:', err);
    } finally {
      setLoadingTrack(false);
    }
  }, []);

  const handleOpenTrack = (b: any) => {
    setTrackTarget(b);
    setTrackingData(null);
    fetchTracking(b.id);
  };

  useEffect(() => {
    if (!trackTarget || !autoRefresh) return;
    const interval = setInterval(() => {
      fetchTracking(trackTarget.id);
    }, 8000);
    return () => clearInterval(interval);
  }, [trackTarget, autoRefresh, fetchTracking]);

  const handleOpenDetail = async (b: any) => {
    setViewBooking(b);
    setFullBookingDetail(b);
    setLoadingDetail(true);
    try {
      const resp = await bookingsAPI.show(b.id);
      if (resp.data?.data) {
        setFullBookingDetail(resp.data.data);
      }
    } catch (err: any) {
      console.error('Failed to load full booking details:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await bookingsAPI.cancel(cancelTarget.id, 'Cancelled by admin');
      onNotify('Booking cancelled successfully');
      setCancelTarget(null);
      if (viewBooking?.id === cancelTarget.id) {
        setViewBooking(null);
      }
      fetchBookings();
    } catch (err: any) {
      onNotify(err.response?.data?.message || 'Cancel failed', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const parseSeats = (seatVal: any) => {
    if (!seatVal) return [];
    if (Array.isArray(seatVal)) return seatVal;
    if (typeof seatVal === 'string') {
      try {
        const parsed = JSON.parse(seatVal);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return seatVal.split(',').map((s) => s.trim()).filter(Boolean);
      }
      return [seatVal];
    }
    return [String(seatVal)];
  };

  const HEADERS = [
    'Booking Reference',
    'Passenger Details',
    'Trip & Route',
    'Pickup → Dropoff',
    'Date & Seats',
    'Fare Amount',
    'Payment',
    'Status',
    'Actions',
  ];

  const detail = fullBookingDetail || viewBooking;
  const seatList = detail ? parseSeats(detail.seat_numbers) : [];

  // Positions for map rendering inside tracking modal
  const busPos: [number, number] | null =
    trackingData?.bus_location?.latitude && trackingData?.bus_location?.longitude
      ? [trackingData.bus_location.latitude, trackingData.bus_location.longitude]
      : null;

  const boardingPos: [number, number] | null =
    trackingData?.boarding_stop?.latitude && trackingData?.boarding_stop?.longitude
      ? [trackingData.boarding_stop.latitude, trackingData.boarding_stop.longitude]
      : null;

  const destPos: [number, number] | null =
    trackingData?.destination_stop?.latitude && trackingData?.destination_stop?.longitude
      ? [trackingData.destination_stop.latitude, trackingData.destination_stop.longitude]
      : null;

  const polylineCoords: [number, number][] = [
    ...(busPos ? [busPos] : []),
    ...(boardingPos ? [boardingPos] : []),
    ...(destPos ? [destPos] : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-xl flex items-center gap-2">
            <Ticket className="text-indigo-400" size={22} />
            Booking Management
          </h2>
          <p className="text-slate-400 text-sm">
            View complete booking details, ticket info, boarding passes, and live bus pickup tracking
          </p>
        </div>
        <div className="text-slate-400 text-xs font-mono bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
          Total: {pagination.total} bookings
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search reference, pass code, name, mobile, email..."
        />
        <Select
          value={bookingStatusFilter}
          onChange={setBookingStatusFilter}
          options={[
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'completed', label: 'Completed' },
            { value: 'pending', label: 'Pending' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
          placeholder="All Booking Statuses"
        />
        <Select
          value={paymentStatusFilter}
          onChange={setPaymentStatusFilter}
          options={[
            { value: 'paid', label: 'Paid' },
            { value: 'pending', label: 'Pending' },
            { value: 'failed', label: 'Failed' },
            { value: 'refunded', label: 'Refunded' },
          ]}
          placeholder="Payment Status"
        />
        {(search || bookingStatusFilter || paymentStatusFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setBookingStatusFilter('');
              setPaymentStatusFilter('');
            }}
          >
            Reset Filters
          </Button>
        )}
      </div>

      <Card padding={false}>
        {error ? (
          <ErrorState message={error} onRetry={fetchBookings} />
        ) : (
          <>
            <Table
              headers={HEADERS}
              loading={loading}
              empty={!loading && bookings.length === 0}
              emptyMessage="No bookings found"
            >
              {bookings.map((b) => {
                const seats = parseSeats(b.seat_numbers);
                return (
                  <Tr key={b.id}>
                    <Td>
                      <div className="text-white text-sm font-mono font-bold flex items-center gap-1.5">
                        <Ticket size={14} className="text-indigo-400 shrink-0" />
                        {b.booking_reference}
                      </div>
                      {b.boarding_pass_code && (
                        <div className="text-slate-400 text-xs font-mono mt-0.5">
                          Pass: <span className="text-slate-200">{b.boarding_pass_code}</span>
                          {b.boarding_pin && <span className="ml-1 text-indigo-400">(PIN: {b.boarding_pin})</span>}
                        </div>
                      )}
                    </Td>
                    <Td>
                      <div className="text-white text-sm font-medium flex items-center gap-1">
                        <User size={13} className="text-slate-400" />
                        {b.passenger_name}
                      </div>
                      <div className="text-slate-400 text-xs flex items-center gap-1 mt-0.5">
                        <Phone size={11} className="text-slate-500" />
                        {b.passenger_mobile}
                      </div>
                      {b.passenger_email && (
                        <div className="text-slate-500 text-xs truncate max-w-[140px]">{b.passenger_email}</div>
                      )}
                    </Td>
                    <Td>
                      <div className="text-white text-xs font-semibold">
                        {b.trip?.route?.route_name || b.trip?.schedule_code || `Trip #${b.trip_id}`}
                      </div>
                      <div className="text-slate-400 text-xs mt-0.5">{b.trip?.schedule_code || '—'}</div>
                    </Td>
                    <Td>
                      <div className="text-slate-200 text-xs font-medium flex items-center gap-1">
                        <MapPin size={12} className="text-emerald-400 shrink-0" />
                        <span className="truncate max-w-[110px]">{b.origin_stop?.stop_name || 'Pickup'}</span>
                      </div>
                      <div className="text-slate-400 text-xs flex items-center gap-1 mt-0.5">
                        <ArrowRight size={10} className="text-slate-500 shrink-0" />
                        <span className="truncate max-w-[110px]">{b.destination_stop?.stop_name || 'Dropoff'}</span>
                      </div>
                    </Td>
                    <Td>
                      <div className="text-white text-xs font-medium flex items-center gap-1">
                        <Calendar size={12} className="text-indigo-400" />
                        {b.travel_date}
                      </div>
                      <div className="text-slate-400 text-xs mt-0.5 flex items-center gap-1">
                        <span>
                          {seats.length > 0 ? `Seats: ${seats.join(', ')}` : `${b.total_seats || 1} seat(s)`}
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <div className="text-emerald-400 text-sm font-bold">₹{b.final_amount}</div>
                      {b.discount_amount > 0 && (
                        <div className="text-slate-400 text-xs">
                          <span className="line-through">₹{b.total_fare}</span> (-₹{b.discount_amount})
                        </div>
                      )}
                    </Td>
                    <Td>
                      <div className="space-y-1">
                        <StatusBadge status={b.payment_status} />
                        {b.payment_method && (
                          <div className="text-slate-400 text-[11px] capitalize">{b.payment_method}</div>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <div className="space-y-1">
                        <StatusBadge status={b.booking_status} />
                        {b.boarding_status && (
                          <div className="text-[11px]">
                            <Badge
                              color={
                                b.boarding_status === 'boarded'
                                  ? 'green'
                                  : b.boarding_status === 'no_show'
                                  ? 'red'
                                  : 'gray'
                              }
                            >
                              {b.boarding_status.replace('_', ' ')}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenTrack(b)}
                          title="Track Assigned Bus & Pickup Location"
                        >
                          <Navigation size={13} className="text-emerald-400 mr-1" /> Track
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDetail(b)}
                          title="View Complete Details"
                        >
                          <Eye size={13} />
                        </Button>
                        {b.booking_status !== 'cancelled' && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setCancelTarget(b)}
                            title="Cancel Booking"
                          >
                            <XCircle size={13} />
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
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

      {/* ── LIVE BUS & PICKUP LOCATION TRACKING MODAL ────────────────────────── */}
      {trackTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Navigation size={22} className="animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Live Bus & Boarding Location Tracking
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Radio size={12} className="animate-ping" /> LIVE GPS
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Booking #{trackTarget.booking_reference} • Passenger: {trackTarget.passenger_name} ({trackTarget.passenger_mobile})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTrackTarget(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <XCircle size={22} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {loadingTrack && !trackingData ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                  <Loader2 size={32} className="animate-spin text-emerald-400" />
                  <p className="text-sm font-medium">Connecting to bus GPS & evaluating pickup proximity...</p>
                </div>
              ) : trackingData ? (
                <>
                  {/* Status Banner */}
                  <div
                    className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm ${
                      trackingData.tracking_status === 'ARRIVED'
                        ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-200'
                        : trackingData.tracking_status === 'ARRIVING_SOON'
                        ? 'bg-amber-950/80 border-amber-500/60 text-amber-200'
                        : trackingData.tracking_status === 'EN_ROUTE'
                        ? 'bg-indigo-950/80 border-indigo-500/60 text-indigo-200'
                        : 'bg-slate-900 border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-black/40 flex items-center justify-center shrink-0">
                        {trackingData.tracking_status === 'ARRIVED' ? (
                          <CheckCircle2 size={20} className="text-emerald-400" />
                        ) : trackingData.tracking_status === 'ARRIVING_SOON' ? (
                          <Compass size={20} className="text-amber-400 animate-spin" />
                        ) : (
                          <Bus size={20} className="text-indigo-400" />
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider opacity-80">Live Pickup Proximity</div>
                        <div className="text-sm font-bold text-white mt-0.5">
                          {trackingData.tracking_status_message}
                        </div>
                      </div>
                    </div>
                    {trackingData.distance_text !== 'N/A' && (
                      <div className="px-3 py-1.5 rounded-lg bg-black/50 border border-white/10 text-right shrink-0">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Distance to Pickup</div>
                        <div className="text-lg font-mono font-bold text-white">{trackingData.distance_text}</div>
                      </div>
                    )}
                  </div>

                  {/* Metrics Cards Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* Bus / Driver Info */}
                    <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Assigned Driver</span>
                      <span className="font-semibold text-white text-xs block truncate">
                        {trackingData.bus_location?.driver_name || 'Not Assigned'}
                      </span>
                      {trackingData.bus_location?.driver_mobile ? (
                        <a
                          href={`tel:${trackingData.bus_location.driver_mobile}`}
                          className="text-[11px] text-emerald-400 font-mono font-semibold flex items-center gap-1 hover:underline"
                        >
                          <Phone size={10} /> {trackingData.bus_location.driver_mobile}
                        </a>
                      ) : (
                        <span className="text-[11px] text-slate-500">—</span>
                      )}
                    </div>

                    {/* Vehicle Registration */}
                    <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Bus Vehicle</span>
                      <span className="font-mono font-bold text-cyan-400 text-xs block truncate">
                        {trackingData.bus_location?.vehicle_registration || '—'}
                      </span>
                      <span className="text-[11px] text-slate-400 block truncate">
                        Speed: {trackingData.bus_location?.speed_kmh || 0} km/h
                      </span>
                    </div>

                    {/* Boarding Stop */}
                    <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block flex items-center gap-1">
                        <MapPin size={10} /> Pickup Stop
                      </span>
                      <span className="font-semibold text-white text-xs block truncate">
                        {trackingData.boarding_stop?.stop_name || 'Pickup Stop'}
                      </span>
                      <span className="text-[11px] text-slate-400 block truncate font-mono">
                        {trackingData.boarding_stop?.latitude ? `${trackingData.boarding_stop.latitude}, ${trackingData.boarding_stop.longitude}` : 'No coords'}
                      </span>
                    </div>

                    {/* Dropoff Stop */}
                    <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider block flex items-center gap-1">
                        <MapPin size={10} /> Dropoff Stop
                      </span>
                      <span className="font-semibold text-white text-xs block truncate">
                        {trackingData.destination_stop?.stop_name || 'Dropoff Stop'}
                      </span>
                      <span className="text-[11px] text-slate-400 block truncate font-mono">
                        {trackingData.destination_stop?.latitude ? `${trackingData.destination_stop.latitude}, ${trackingData.destination_stop.longitude}` : 'No coords'}
                      </span>
                    </div>
                  </div>

                  {/* Leaflet Map Box */}
                  <div className="relative h-[360px] rounded-xl overflow-hidden border border-slate-700/80 shadow-inner">
                    <MapContainer
                      center={busPos || boardingPos || [22.4824724, 88.3508133]}
                      zoom={14}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://tile.openstreetmap.de/{z}/{x}/{y}.png"
                      />

                      {/* Bus / Driver Marker */}
                      {busPos && (
                        <Marker position={busPos} icon={createBusDivIcon()}>
                          <Popup>
                            <div className="text-xs">
                              <strong className="text-indigo-900 block font-bold">
                                🚌 {trackingData.bus_location?.vehicle_registration || 'Bus'} ({trackingData.bus_location?.driver_name})
                              </strong>
                              <span className="text-slate-600 block">
                                Speed: {trackingData.bus_location?.speed_kmh} km/h
                              </span>
                              <span className="font-mono text-slate-500">
                                {busPos[0]}, {busPos[1]}
                              </span>
                            </div>
                          </Popup>
                        </Marker>
                      )}

                      {/* Boarding Pickup Stop Marker */}
                      {boardingPos && (
                        <Marker position={boardingPos} icon={createStopDivIcon('#10b981', 'P')}>
                          <Popup>
                            <div className="text-xs">
                              <strong className="text-emerald-800 block font-bold">
                                📍 Pickup Stop: {trackingData.boarding_stop?.stop_name}
                              </strong>
                              {trackingData.boarding_stop?.address && (
                                <span className="text-slate-600 block">{trackingData.boarding_stop.address}</span>
                              )}
                              <span className="font-mono text-slate-500">
                                {boardingPos[0]}, {boardingPos[1]}
                              </span>
                            </div>
                          </Popup>
                        </Marker>
                      )}

                      {/* Destination Dropoff Stop Marker */}
                      {destPos && (
                        <Marker position={destPos} icon={createStopDivIcon('#f43f5e', 'D')}>
                          <Popup>
                            <div className="text-xs">
                              <strong className="text-rose-800 block font-bold">
                                🏁 Dropoff Stop: {trackingData.destination_stop?.stop_name}
                              </strong>
                              {trackingData.destination_stop?.address && (
                                <span className="text-slate-600 block">{trackingData.destination_stop.address}</span>
                              )}
                              <span className="font-mono text-slate-500">
                                {destPos[0]}, {destPos[1]}
                              </span>
                            </div>
                          </Popup>
                        </Marker>
                      )}

                      {/* Connecting Route Polyline */}
                      {polylineCoords.length >= 2 && (
                        <Polyline
                          positions={polylineCoords}
                          pathOptions={{ color: '#6366f1', weight: 4, opacity: 0.8, dashArray: '8, 8' }}
                        />
                      )}

                      <MapBoundsHandler busPos={busPos} boardingPos={boardingPos} destPos={destPos} />
                    </MapContainer>

                    {/* Geocoding Loading Indicator Overlay */}
                    {loadingTrack && (
                      <div className="absolute top-3 right-3 z-[1000] bg-slate-900/90 border border-emerald-500/50 text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg backdrop-blur-sm">
                        <Loader2 size={14} className="animate-spin text-emerald-400" />
                        Refreshing GPS position...
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-emerald-600 focus:ring-0"
                />
                <span className="flex items-center gap-1 font-medium">
                  <RefreshCw size={12} className={autoRefresh ? 'text-emerald-400 animate-spin' : 'text-slate-500'} />
                  Auto-refresh location every 8 sec
                </span>
              </label>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => trackTarget && fetchTracking(trackTarget.id)}
                  loading={loadingTrack}
                  icon={RefreshCw}
                >
                  Refresh Now
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setTrackTarget(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── COMPLETE BOOKING DETAILS MODAL ────────────────────────── */}
      <Modal
        open={!!viewBooking}
        onClose={() => setViewBooking(null)}
        title={`Booking Details — ${detail?.booking_reference || ''}`}
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <div>
              {detail && detail.booking_status !== 'cancelled' && (
                <Button variant="danger" size="sm" onClick={() => setCancelTarget(detail)}>
                  <XCircle size={14} className="mr-1.5" /> Cancel Booking
                </Button>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setViewBooking(null)}>
              Close
            </Button>
          </div>
        }
      >
        {loadingDetail && !fullBookingDetail ? (
          <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <RefreshCw size={24} className="animate-spin text-indigo-400" />
            <p className="text-sm">Fetching full booking parameters & payment details...</p>
          </div>
        ) : detail ? (
          <div className="space-y-6">
            {/* Status & Pass Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="space-y-1">
                <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider">
                  Booking Status
                </span>
                <div>
                  <StatusBadge status={detail.booking_status} />
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider">
                  Payment Status
                </span>
                <div className="flex items-center gap-2">
                  <StatusBadge status={detail.payment_status} />
                  {detail.payment_method && (
                    <span className="text-xs text-slate-300 capitalize">({detail.payment_method})</span>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider">
                  Boarding Status
                </span>
                <div>
                  <Badge
                    color={
                      detail.boarding_status === 'boarded'
                        ? 'green'
                        : detail.boarding_status === 'no_show'
                        ? 'red'
                        : 'gray'
                    }
                  >
                    {detail.boarding_status ? detail.boarding_status.replace('_', ' ').toUpperCase() : 'NOT BOARDED'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Boarding Pass & Codes Box */}
            <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/20 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs text-indigo-400 font-semibold uppercase tracking-wider">
                  Boarding Pass & Token
                </div>
                <div className="text-lg font-mono font-bold text-white mt-0.5">
                  {detail.boarding_pass_code || 'N/A'}
                </div>
              </div>
              {detail.boarding_pin && (
                <div className="bg-indigo-900/40 px-3 py-1.5 rounded-lg border border-indigo-500/30">
                  <div className="text-[11px] text-indigo-300">Boarding PIN</div>
                  <div className="text-base font-mono font-bold text-indigo-200">{detail.boarding_pin}</div>
                </div>
              )}
              {detail.qr_token && (
                <div className="text-xs font-mono text-slate-400 max-w-xs truncate" title={detail.qr_token}>
                  QR Token: <span className="text-slate-200">{detail.qr_token}</span>
                </div>
              )}
            </div>

            {/* Grid 1: Passenger & Ticket Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Passenger Box */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                  <User size={14} className="text-indigo-400" /> Passenger Details
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Name:</span>
                    <span className="font-semibold text-white">{detail.passenger_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Mobile:</span>
                    <span className="font-mono text-slate-200">{detail.passenger_mobile}</span>
                  </div>
                  {detail.passenger_email && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Email:</span>
                      <span className="text-slate-200">{detail.passenger_email}</span>
                    </div>
                  )}
                  {detail.passenger_id && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Passenger ID:</span>
                      <span className="font-mono text-slate-400">#{detail.passenger_id}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Trip & Route Box */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                  <Ticket size={14} className="text-indigo-400" /> Trip & Route Details
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Route Name:</span>
                    <span className="font-semibold text-indigo-300">
                      {detail.trip?.route?.route_name || detail.trip?.route_name || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Schedule Code:</span>
                    <span className="font-mono text-slate-200">
                      {detail.trip?.schedule_code || `Trip #${detail.trip_id}`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Travel Date:</span>
                    <span className="font-medium text-white">{detail.travel_date}</span>
                  </div>
                  {detail.trip?.departure_time && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Departure Time:</span>
                      <span className="font-mono text-slate-300">{detail.trip.departure_time}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Stop Pair Details & Live Tracking Button */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <MapPin size={14} className="text-emerald-400" /> Boarding & Alighting Stops
                </h4>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const b = detail;
                    setViewBooking(null);
                    handleOpenTrack(b);
                  }}
                >
                  <Navigation size={13} className="mr-1.5" /> Track Live Bus Location
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1">
                  <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 size={12} /> Pickup / Boarding Stop
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {detail.origin_stop?.stop_name || 'Default Origin'}
                  </div>
                  {detail.boarding_time && (
                    <div className="text-xs text-slate-400">Boarding Time: {detail.boarding_time}</div>
                  )}
                  {detail.boarded_at && (
                    <div className="text-xs text-emerald-300">
                      Boarded At: {new Date(detail.boarded_at).toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1">
                  <div className="text-xs text-rose-400 font-semibold flex items-center gap-1">
                    <MapPin size={12} /> Dropoff / Alighting Stop
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {detail.destination_stop?.stop_name || 'Default Destination'}
                  </div>
                  {detail.dropped_at && (
                    <div className="text-xs text-rose-300">
                      Dropped At: {new Date(detail.dropped_at).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Seats & Fare Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Seat Details */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                  <Ticket size={14} className="text-indigo-400" /> Seat Reservation
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Total Seats Booked:</span>
                    <span className="font-bold text-white">
                      {detail.total_seats || seatList.length || 1}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block mb-1.5">Seat Numbers:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {seatList.length > 0 ? (
                        seatList.map((st: any, i: number) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-500/30 text-xs font-mono font-bold"
                          >
                            Seat {st}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 text-xs italic">
                          No specific seat numbers assigned
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                  <CreditCard size={14} className="text-emerald-400" /> Payment & Fare Breakdown
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Base Fare:</span>
                    <span className="font-mono text-slate-200">₹{detail.total_fare || 0}</span>
                  </div>
                  {detail.discount_amount > 0 && (
                    <div className="flex justify-between text-rose-400">
                      <span className="flex items-center gap-1">
                        <Tag size={12} /> Coupon Discount{' '}
                        {detail.coupon?.code ? `(${detail.coupon.code})` : ''}:
                      </span>
                      <span className="font-mono">-₹{detail.discount_amount}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-800 pt-2 text-base font-bold">
                    <span className="text-white">Final Amount Paid:</span>
                    <span className="text-emerald-400 font-mono">₹{detail.final_amount}</span>
                  </div>
                  {detail.transaction_id && (
                    <div className="flex justify-between text-xs text-slate-400 pt-1">
                      <span>Txn ID:</span>
                      <span className="font-mono text-slate-300">{detail.transaction_id}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Cancellation Details if Cancelled */}
            {detail.booking_status === 'cancelled' && (
              <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/20 space-y-2">
                <div className="text-xs text-rose-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <XCircle size={14} /> Cancellation Record
                </div>
                <div className="text-sm text-rose-200">
                  <span className="text-slate-400">Reason: </span>
                  {detail.cancellation_reason || 'No cancellation reason specified'}
                </div>
                {detail.cancelled_at && (
                  <div className="text-xs text-slate-400">
                    Cancelled on: {new Date(detail.cancelled_at).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {/* Special Requests */}
            {detail.special_requests && (
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                  Special Requests / Notes
                </div>
                <div className="text-sm text-slate-200 italic">{detail.special_requests}</div>
              </div>
            )}

            {/* Payment Transactions & Refunds History */}
            {((detail.payments && detail.payments.length > 0) ||
              (detail.refunds && detail.refunds.length > 0)) && (
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
                  Transaction & Refund History
                </h4>
                {detail.payments && detail.payments.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs text-slate-400 font-semibold">Payment Attempts:</span>
                    {detail.payments.map((p: any) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between text-xs p-2 rounded bg-slate-950 border border-slate-800"
                      >
                        <div>
                          <span className="font-mono text-slate-200">
                            {p.transaction_reference || p.gateway_order_id}
                          </span>
                          <span className="text-slate-500 ml-2">({p.payment_method || 'gateway'})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-emerald-400">₹{p.amount}</span>
                          <Badge color={p.status === 'success' ? 'green' : 'red'}>{p.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {detail.refunds && detail.refunds.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <span className="text-xs text-slate-400 font-semibold">Refunds:</span>
                    {detail.refunds.map((r: any) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between text-xs p-2 rounded bg-slate-950 border border-slate-800"
                      >
                        <div>
                          <span className="font-mono text-slate-200">{r.refund_reference}</span>
                          <span className="text-slate-400 ml-2">({r.reason})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-rose-400">₹{r.refund_amount}</span>
                          <Badge color={r.status === 'processed' ? 'green' : 'yellow'}>
                            {r.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
        title="Cancel Booking"
        message={`Cancel booking "${cancelTarget?.booking_reference}" for passenger ${cancelTarget?.passenger_name}? A refund transaction will be initiated if payment was completed.`}
        confirmLabel="Cancel Booking"
        loading={cancelling}
      />
    </div>
  );
};
