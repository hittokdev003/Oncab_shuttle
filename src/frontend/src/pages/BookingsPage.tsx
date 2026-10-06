import React, { useState, useEffect, useCallback } from 'react';
import { bookingsAPI } from '../services/api';
import { Card, Table, Tr, Td, Pagination, SearchInput, Button, Select, StatusBadge, Modal, ConfirmDialog, ErrorState, Badge } from '../components/ui';
import { XCircle, Eye, Calendar, MapPin, User, CreditCard, Ticket, Phone, ArrowRight, CheckCircle2, Tag, RefreshCw } from 'lucide-react';

interface BookingsPageProps { onNotify: (msg: string, type?: any) => void; }

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

  const fetchBookings = useCallback(async () => {
    try {
      setLoading(true); setError('');
      const resp = await bookingsAPI.list({ page, limit: 15, search, booking_status: bookingStatusFilter, payment_status: paymentStatusFilter });
      setBookings(resp.data.data);
      setPagination(resp.data.pagination);
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to load bookings'); }
    finally { setLoading(false); }
  }, [page, search, bookingStatusFilter, paymentStatusFilter]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);
  useEffect(() => { setPage(1); }, [search, bookingStatusFilter, paymentStatusFilter]);

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
    }
    catch (err: any) { onNotify(err.response?.data?.message || 'Cancel failed', 'error'); }
    finally { setCancelling(false); }
  };

  const parseSeats = (seatVal: any) => {
    if (!seatVal) return [];
    if (Array.isArray(seatVal)) return seatVal;
    if (typeof seatVal === 'string') {
      try {
        const parsed = JSON.parse(seatVal);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        return seatVal.split(',').map((s) => s.trim()).filter(Boolean);
      }
      return [seatVal];
    }
    return [String(seatVal)];
  };

  const HEADERS = ['Booking Reference', 'Passenger Details', 'Trip & Route', 'Pickup → Dropoff', 'Date & Seats', 'Fare Amount', 'Payment', 'Status', 'Actions'];

  const detail = fullBookingDetail || viewBooking;
  const seatList = detail ? parseSeats(detail.seat_numbers) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-xl flex items-center gap-2">
            <Ticket className="text-indigo-400" size={22} />
            Booking Management
          </h2>
          <p className="text-slate-400 text-sm">View complete booking details, ticket info, boarding passes, and payment records</p>
        </div>
        <div className="text-slate-400 text-xs font-mono bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
          Total: {pagination.total} bookings
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search reference, pass code, name, mobile, email..." />
        <Select 
          value={bookingStatusFilter} 
          onChange={setBookingStatusFilter} 
          options={[
            { value: 'confirmed', label: 'Confirmed' }, 
            { value: 'completed', label: 'Completed' }, 
            { value: 'pending', label: 'Pending' },
            { value: 'cancelled', label: 'Cancelled' }
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
            { value: 'refunded', label: 'Refunded' }
          ]} 
          placeholder="Payment Status" 
        />
        {(search || bookingStatusFilter || paymentStatusFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setBookingStatusFilter(''); setPaymentStatusFilter(''); }}>
            Reset Filters
          </Button>
        )}
      </div>

      <Card padding={false}>
        {error ? <ErrorState message={error} onRetry={fetchBookings} /> : (
          <>
            <Table headers={HEADERS} loading={loading} empty={!loading && bookings.length === 0} emptyMessage="No bookings found">
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
                        <div className="text-slate-500 text-xs truncate max-w-[140px]">
                          {b.passenger_email}
                        </div>
                      )}
                    </Td>
                    <Td>
                      <div className="text-white text-xs font-semibold">{b.trip?.route?.route_name || b.trip?.schedule_code || `Trip #${b.trip_id}`}</div>
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
                        <span>{seats.length > 0 ? `Seats: ${seats.join(', ')}` : `${b.total_seats || 1} seat(s)`}</span>
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
                            <Badge color={b.boarding_status === 'boarded' ? 'green' : b.boarding_status === 'no_show' ? 'red' : 'gray'}>
                              {b.boarding_status.replace('_', ' ')}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <Button variant="secondary" size="sm" onClick={() => handleOpenDetail(b)} title="View Complete Details">
                          <Eye size={13} className="mr-1" /> View
                        </Button>
                        {b.booking_status !== 'cancelled' && (
                          <Button variant="danger" size="sm" onClick={() => setCancelTarget(b)} title="Cancel Booking">
                            <XCircle size={13} />
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </Table>
            <Pagination page={page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} />
          </>
        )}
      </Card>

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
                <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider">Booking Status</span>
                <div><StatusBadge status={detail.booking_status} /></div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider">Payment Status</span>
                <div className="flex items-center gap-2">
                  <StatusBadge status={detail.payment_status} />
                  {detail.payment_method && <span className="text-xs text-slate-300 capitalize">({detail.payment_method})</span>}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider">Boarding Status</span>
                <div>
                  <Badge color={detail.boarding_status === 'boarded' ? 'green' : detail.boarding_status === 'no_show' ? 'red' : 'gray'}>
                    {detail.boarding_status ? detail.boarding_status.replace('_', ' ').toUpperCase() : 'NOT BOARDED'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Boarding Pass & Codes Box */}
            <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/20 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs text-indigo-400 font-semibold uppercase tracking-wider">Boarding Pass & Token</div>
                <div className="text-lg font-mono font-bold text-white mt-0.5">{detail.boarding_pass_code || 'N/A'}</div>
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
                    <span className="font-semibold text-indigo-300">{detail.trip?.route?.route_name || detail.trip?.route_name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Schedule Code:</span>
                    <span className="font-mono text-slate-200">{detail.trip?.schedule_code || `Trip #${detail.trip_id}`}</span>
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

            {/* Stop Pair Details */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
                <MapPin size={14} className="text-emerald-400" /> Boarding & Alighting Stops
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1">
                  <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 size={12} /> Pickup / Boarding Stop
                  </div>
                  <div className="text-sm font-semibold text-white">{detail.origin_stop?.stop_name || 'Default Origin'}</div>
                  {detail.boarding_time && (
                    <div className="text-xs text-slate-400">Boarding Time: {detail.boarding_time}</div>
                  )}
                  {detail.boarded_at && (
                    <div className="text-xs text-emerald-300">Boarded At: {new Date(detail.boarded_at).toLocaleString()}</div>
                  )}
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1">
                  <div className="text-xs text-rose-400 font-semibold flex items-center gap-1">
                    <MapPin size={12} /> Dropoff / Alighting Stop
                  </div>
                  <div className="text-sm font-semibold text-white">{detail.destination_stop?.stop_name || 'Default Destination'}</div>
                  {detail.dropped_at && (
                    <div className="text-xs text-rose-300">Dropped At: {new Date(detail.dropped_at).toLocaleString()}</div>
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
                    <span className="font-bold text-white">{detail.total_seats || seatList.length || 1}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 block mb-1.5">Seat Numbers:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {seatList.length > 0 ? (
                        seatList.map((st: any, i: number) => (
                          <span key={i} className="px-2.5 py-1 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-500/30 text-xs font-mono font-bold">
                            Seat {st}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 text-xs italic">No specific seat numbers assigned</span>
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
                        <Tag size={12} /> Coupon Discount {detail.coupon?.code ? `(${detail.coupon.code})` : ''}:
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
                <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Special Requests / Notes</div>
                <div className="text-sm text-slate-200 italic">{detail.special_requests}</div>
              </div>
            )}

            {/* Payment Transactions & Refunds History */}
            {((detail.payments && detail.payments.length > 0) || (detail.refunds && detail.refunds.length > 0)) && (
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
                  Transaction & Refund History
                </h4>
                {detail.payments && detail.payments.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs text-slate-400 font-semibold">Payment Attempts:</span>
                    {detail.payments.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between text-xs p-2 rounded bg-slate-950 border border-slate-800">
                        <div>
                          <span className="font-mono text-slate-200">{p.transaction_reference || p.gateway_order_id}</span>
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
                      <div key={r.id} className="flex items-center justify-between text-xs p-2 rounded bg-slate-950 border border-slate-800">
                        <div>
                          <span className="font-mono text-slate-200">{r.refund_reference}</span>
                          <span className="text-slate-400 ml-2">({r.reason})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-rose-400">₹{r.refund_amount}</span>
                          <Badge color={r.status === 'processed' ? 'green' : 'yellow'}>{r.status}</Badge>
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
