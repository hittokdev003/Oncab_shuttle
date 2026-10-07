import React, { useState, useEffect } from 'react';
import {
  Bus,
  MapPin,
  Calendar,
  Clock,
  ChevronRight,
  Users,
  Search,
  CheckCircle2,
  Navigation,
  QrCode,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  X,
  CreditCard,
  Ticket
} from 'lucide-react';

interface StopInfo {
  id: number;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
  distance_km: number;
  walking_minutes: number;
  walking_label: string;
}

interface TimingResult {
  schedule_id: number;
  route_id: number;
  route_name: string;
  pickup_stop: StopInfo;
  pickup_time: string;
  drop_stop: StopInfo;
  drop_time: string;
  duration_minutes: number;
  fare: number;
  fare_currency: string;
  fare_display: string;
  available_seats: number;
  total_seats: number;
  is_direct: boolean;
  is_top_pick?: boolean;
  status: string;
  date: string;
}

interface PickupGroup {
  pickup_stop: StopInfo;
  timings_count: number;
  timings: Array<{
    schedule_id: number;
    route_id: number;
    pickup_time: string;
    drop_time: string;
    drop_stop: string;
    drop_stop_id: number;
    fare: number;
    fare_display: string;
    available_seats: number;
    status: string;
  }>;
}

interface DateTab {
  date: string;
  label: string;
  timings_count: number;
}

export const ShuttleSearchPage: React.FC = () => {
  // Search Inputs
  const [pickup, setPickup] = useState('Garia, Kolkata');
  const [dropoff, setDropoff] = useState('Bidhannagar, Kolkata');
  const [pickupLat, setPickupLat] = useState(22.4600);
  const [pickupLng, setPickupLng] = useState(88.3800);
  const [dropLat, setDropLat] = useState(22.5700);
  const [dropLng, setDropLng] = useState(88.4000);
  const [selectedDate, setSelectedDate] = useState('2026-10-05');
  const [passengers, setPassengers] = useState(1);

  // Search Results
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    top_pick?: TimingResult;
    results: TimingResult[];
    pickup_groups: PickupGroup[];
    available_dates: DateTab[];
    summary?: { total_timings: number };
  } | null>(null);

  const [errorResponse, setErrorResponse] = useState<any>(null);

  // Modals
  const [allTimingsModalStop, setAllTimingsModalStop] = useState<PickupGroup | null>(null);
  const [selectedTimingForBooking, setSelectedTimingForBooking] = useState<TimingResult | null>(null);
  const [passengerName, setPassengerName] = useState('Saikat Das');
  const [passengerMobile, setPassengerMobile] = useState('9876543210');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<any>(null);

  const performSearch = async (targetDate = selectedDate) => {
    setLoading(true);
    setErrorResponse(null);
    try {
      const response = await fetch('/api/shuttle/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup,
          dropoff,
          pickup_latitude: pickupLat,
          pickup_longitude: pickupLng,
          dropoff_latitude: dropLat,
          dropoff_longitude: dropLng,
          date: targetDate,
          passengers,
        }),
      });

      const data = await response.json();
      if (data.status) {
        setSearchResults(data);
        setErrorResponse(null);
      } else {
        setSearchResults(null);
        setErrorResponse(data);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    performSearch('2026-10-05');
  }, []);

  const handleDateTabClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    performSearch(dateStr);
  };

  const handleConfirmBooking = async () => {
    if (!selectedTimingForBooking) return;
    setBookingLoading(true);
    try {
      const res = await fetch('/api/shuttle/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule_id: selectedTimingForBooking.schedule_id,
          pickup_stop_id: selectedTimingForBooking.pickup_stop.id,
          drop_stop_id: selectedTimingForBooking.drop_stop.id,
          passengers,
          passenger_name: passengerName,
          passenger_mobile: passengerMobile,
          travel_date: selectedDate,
          payment_method: 'cash',
        }),
      });

      const data = await res.json();
      if (data.status) {
        setConfirmedBooking(data.booking);
        setSelectedTimingForBooking(null);
        performSearch(selectedDate); // Refresh availability
      } else {
        alert(data.message || 'Booking failed');
      }
    } catch (err: any) {
      alert(err.message || 'Booking failed');
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-slate-100 p-4 md:p-8" style={{ background: '#0b0f19' }}>
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between bg-slate-900/80 p-5 rounded-2xl border border-slate-800 backdrop-blur-md">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Bus className="w-6 h-6 text-slate-950 font-bold" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                OnCab Shuttle
                <span className="text-xs font-semibold uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Cityflo Experience
                </span>
              </h1>
              <p className="text-xs text-slate-400">Guaranteed AC seat, reserved stops, zero transfers</p>
            </div>
          </div>
        </div>

        {/* Search Input Card */}
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-2xl space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Pickup Input */}
            <div className="relative group">
              <label className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                <Navigation className="w-3.5 h-3.5 text-emerald-400" /> Pickup Location
              </label>
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 focus-within:border-emerald-500 transition-all">
                <MapPin className="w-5 h-5 text-emerald-400 mr-2 flex-shrink-0" />
                <input
                  type="text"
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                  placeholder="Enter pickup location"
                  className="bg-transparent text-white text-sm focus:outline-none w-full font-medium"
                />
              </div>
            </div>

            {/* Dropoff Input */}
            <div className="relative group">
              <label className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                <Navigation className="w-3.5 h-3.5 text-teal-400 rotate-90" /> Dropoff Location
              </label>
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 focus-within:border-teal-500 transition-all">
                <MapPin className="w-5 h-5 text-teal-400 mr-2 flex-shrink-0" />
                <input
                  type="text"
                  value={dropoff}
                  onChange={(e) => setDropoff(e.target.value)}
                  placeholder="Enter dropoff location"
                  className="bg-transparent text-white text-sm focus:outline-none w-full font-medium"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {/* Date Picker */}
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" /> Travel Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-xl px-3 py-2.5 focus:border-indigo-500 focus:outline-none font-medium"
              />
            </div>

            {/* Passengers */}
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-indigo-400" /> Passengers
              </label>
              <select
                value={passengers}
                onChange={(e) => setPassengers(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-xl px-3 py-2.5 focus:border-indigo-500 focus:outline-none font-medium"
              >
                <option value={1}>1 Passenger</option>
                <option value={2}>2 Passengers</option>
                <option value={3}>3 Passengers</option>
                <option value={4}>4 Passengers</option>
              </select>
            </div>

            {/* Search Button */}
            <div className="flex items-end">
              <button
                onClick={() => performSearch(selectedDate)}
                disabled={loading}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-500/25 flex items-center justify-center space-x-2 transition-all"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Search className="w-4 h-4 stroke-[2.5]" />
                    <span>SEARCH SHUTTLES</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Date Selector Tabs */}
        {searchResults?.available_dates && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {searchResults.available_dates.map((tab) => {
              const active = selectedDate === tab.date;
              return (
                <button
                  key={tab.date}
                  onClick={() => handleDateTabClick(tab.date)}
                  className={`flex-1 min-w-[140px] py-3 px-4 rounded-xl border text-center transition-all ${
                    active
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold shadow-lg shadow-emerald-500/10'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  <div className="text-sm font-semibold">{tab.label}</div>
                  <div className="text-[11px] opacity-75 mt-0.5">{tab.timings_count} timings available</div>
                </button>
              );
            })}
          </div>
        )}

        {/* Error Handling UI (Part 19) */}
        {errorResponse && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto">
              <X className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-red-400">{errorResponse.message}</h3>
            {errorResponse.suggestion && (
              <p className="text-sm text-slate-300">{errorResponse.suggestion}</p>
            )}
          </div>
        )}

        {/* TOP PICK FOR YOU Card */}
        {searchResults?.top_pick && (
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-emerald-500/30 rounded-2xl p-6 shadow-2xl shadow-emerald-950/30 space-y-4">
            <div className="absolute top-0 right-0 bg-gradient-to-l from-emerald-500 to-teal-400 text-slate-950 font-extrabold text-[11px] uppercase tracking-wider px-4 py-1.5 rounded-bl-xl shadow-md flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 fill-slate-950" /> TOP PICK FOR YOU
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <ShieldCheck className="w-4 h-4" /> Direct Shuttle • Nearest Stop Matched
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {/* Pickup Stop Info */}
              <div className="space-y-2 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Pickup Stop</span>
                    <h4 className="text-base font-bold text-white mt-0.5">{searchResults.top_pick.pickup_stop.name}</h4>
                    {searchResults.top_pick.pickup_stop.address && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-1">{searchResults.top_pick.pickup_stop.address}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-extrabold text-emerald-400">{searchResults.top_pick.pickup_time}</span>
                  </div>
                </div>
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                  <Navigation className="w-3.5 h-3.5" />
                  {searchResults.top_pick.pickup_stop.walking_label} ({searchResults.top_pick.pickup_stop.distance_meters} m)
                </div>
              </div>

              {/* Dropoff Stop Info */}
              <div className="space-y-2 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Dropoff Stop</span>
                    <h4 className="text-base font-bold text-white mt-0.5">{searchResults.top_pick.drop_stop.name}</h4>
                    {searchResults.top_pick.drop_stop.address && (
                      <p className="text-xs text-slate-400 mt-1 line-clamp-1">{searchResults.top_pick.drop_stop.address}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-extrabold text-teal-400">{searchResults.top_pick.drop_time}</span>
                  </div>
                </div>
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-lg border border-teal-500/20">
                  <Navigation className="w-3.5 h-3.5" />
                  {searchResults.top_pick.drop_stop.walking_label}
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-slate-800">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-xs text-slate-400">Total Duration</span>
                  <p className="text-sm font-bold text-white">{searchResults.top_pick.duration_minutes} mins</p>
                </div>
                <div className="h-8 w-[1px] bg-slate-800" />
                <div>
                  <span className="text-xs text-slate-400">Fare</span>
                  <p className="text-base font-extrabold text-emerald-400">{searchResults.top_pick.fare.display}</p>
                </div>
                <div className="h-8 w-[1px] bg-slate-800" />
                <div>
                  <span className="text-xs text-slate-400">Available Seats</span>
                  <p className="text-sm font-bold text-emerald-400">{searchResults.top_pick.available_seats} seats</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedTimingForBooking(searchResults.results[0])}
                className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center space-x-2 transition-all"
              >
                <span>BOOK THIS SHUTTLE</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Grouped Results by Pickup Stop */}
        {searchResults?.pickup_groups && searchResults.pickup_groups.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-emerald-400" /> Nearby Pickup Points
            </h3>

            <div className="space-y-4">
              {searchResults.pickup_groups.map((group) => (
                <div key={group.pickup_stop.id} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                    <div>
                      <h4 className="text-base font-bold text-white">{group.pickup_stop.name}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">{group.pickup_stop.address}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-lg">
                        {group.pickup_stop.walking_label}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">
                        {group.timings_count} bus timings
                      </span>
                    </div>
                  </div>

                  {/* Preview Timings */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {group.timings.slice(0, 3).map((timing) => (
                      <div
                        key={timing.schedule_id}
                        className="bg-slate-950 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-3 flex items-center justify-between transition-all cursor-pointer"
                        onClick={() => {
                          const fullTiming = searchResults.results.find(r => r.schedule_id === timing.schedule_id);
                          if (fullTiming) setSelectedTimingForBooking(fullTiming);
                        }}
                      >
                        <div>
                          <div className="text-sm font-bold text-white">{timing.pickup_time} → {timing.drop_time}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">Drop: {timing.drop_stop}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-emerald-400">{timing.fare_display}</div>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${timing.status === 'FULL' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                            {timing.status === 'FULL' ? 'FULL' : `${timing.available_seats} left`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {group.timings.length > 3 && (
                    <button
                      onClick={() => setAllTimingsModalStop(group)}
                      className="w-full text-center py-2.5 text-xs font-bold text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/20 rounded-xl transition-all"
                    >
                      View all {group.timings_count} timings
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All Timings Modal */}
        {allTimingsModalStop && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-white">Timings for {allTimingsModalStop.pickup_stop.name}</h3>
                  <p className="text-xs text-slate-400">{allTimingsModalStop.timings_count} active schedules on {selectedDate}</p>
                </div>
                <button
                  onClick={() => setAllTimingsModalStop(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                {allTimingsModalStop.timings.map((t) => (
                  <div
                    key={t.schedule_id}
                    className="bg-slate-950 border border-slate-800 hover:border-emerald-500 rounded-xl p-4 flex items-center justify-between transition-all"
                  >
                    <div>
                      <span className="text-xs text-slate-400">Departure</span>
                      <div className="text-base font-bold text-emerald-400">{t.pickup_time}</div>
                      <span className="text-xs text-slate-400">Arrival at {t.drop_stop}: {t.drop_time}</span>
                    </div>

                    <div className="text-right space-y-2">
                      <div className="text-base font-bold text-white">{t.fare_display}</div>
                      <button
                        disabled={t.status === 'FULL'}
                        onClick={() => {
                          const fullTiming = searchResults?.results.find(r => r.schedule_id === t.schedule_id);
                          if (fullTiming) {
                            setAllTimingsModalStop(null);
                            setSelectedTimingForBooking(fullTiming);
                          }
                        }}
                        className={`text-xs font-bold px-4 py-1.5 rounded-lg ${
                          t.status === 'FULL'
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md'
                        }`}
                      >
                        {t.status === 'FULL' ? 'FULL' : 'SELECT'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Booking Confirmation Dialog */}
        {selectedTimingForBooking && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-emerald-400" /> Confirm Shuttle Booking
                </h3>
                <button onClick={() => setSelectedTimingForBooking(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Route:</span>
                  <span className="font-bold text-white">{selectedTimingForBooking.route_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Pickup Stop:</span>
                  <span className="font-bold text-emerald-400">{selectedTimingForBooking.pickup_stop.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Pickup Time:</span>
                  <span className="font-bold text-white">{selectedTimingForBooking.pickup_time}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Dropoff Stop:</span>
                  <span className="font-bold text-teal-400">{selectedTimingForBooking.drop_stop.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Dropoff Time:</span>
                  <span className="font-bold text-white">{selectedTimingForBooking.drop_time}</span>
                </div>
                <div className="flex justify-between border-t border-slate-800 pt-2 text-sm">
                  <span className="font-semibold text-slate-300">Total Fare:</span>
                  <span className="font-extrabold text-emerald-400">₹{selectedTimingForBooking.fare * passengers}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-400">Passenger Name</label>
                  <input
                    type="text"
                    value={passengerName}
                    onChange={(e) => setPassengerName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400">Mobile Number</label>
                  <input
                    type="text"
                    value={passengerMobile}
                    onChange={(e) => setPassengerMobile(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <button
                onClick={handleConfirmBooking}
                disabled={bookingLoading}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-xl shadow-lg shadow-emerald-500/25 flex items-center justify-center space-x-2 transition-all"
              >
                {bookingLoading ? (
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    <span>CONFIRM & GET BOARDING PASS</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Confirmed Booking Ticket Modal */}
        {confirmedBooking && (
          <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl w-full max-w-sm p-6 text-center space-y-4 shadow-2xl">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-xl font-bold text-white">Booking Confirmed!</h3>
                <p className="text-xs text-slate-400">ID: {confirmedBooking.booking_id}</p>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-2 text-left text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Pickup:</span>
                  <span className="font-bold text-emerald-400">{confirmedBooking.pickup_stop}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Time:</span>
                  <span className="font-bold text-white">{confirmedBooking.pickup_time}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Dropoff:</span>
                  <span className="font-bold text-teal-400">{confirmedBooking.drop_stop}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Seats Reserved:</span>
                  <span className="font-bold text-white">{confirmedBooking.seat_count}</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl w-40 h-40 mx-auto flex items-center justify-center shadow-inner">
                <QrCode className="w-32 h-32 text-slate-950" />
              </div>
              <p className="text-[11px] text-slate-400">Show this QR code to the shuttle driver at boarding.</p>

              <button
                onClick={() => setConfirmedBooking(null)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl transition-all"
              >
                Close Ticket
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ShuttleSearchPage;
