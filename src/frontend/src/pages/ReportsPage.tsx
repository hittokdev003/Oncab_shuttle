import React, { useState, useEffect, useCallback } from 'react';
import { dashboardAPI } from '../services/api';
import { Card, Table, Tr, Td, Button, ErrorState, LoadingState, Select } from '../components/ui';
import { BarChart3, TrendingUp, Users, Calendar, DollarSign, Bus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { hasRole } from '../utils/roles';

interface ReportsPageProps {
  onNotify: (msg: string, type?: any) => void;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ onNotify }) => {
  const [period, setPeriod] = useState('monthly');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [revenueData, setRevenueData] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const isAdmin = hasRole(user, 'admin');

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params: Record<string, string> = { period };
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (isAdmin && ownerFilter) params.owner_id = ownerFilter;
      const [revRes, statsRes] = await Promise.all([
        dashboardAPI.revenueReport(params),
        dashboardAPI.stats(),
      ]);
      setRevenueData(revRes.data.data || revRes.data);
      setStats(statsRes.data.data || statsRes.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load report analytics');
    } finally {
      setLoading(false);
    }
  }, [period, fromDate, toDate, ownerFilter, isAdmin]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  if (loading && !revenueData) return <LoadingState message="Loading revenue report..." />;

  const reportRows = revenueData?.report || [];
  const ownerRows = revenueData?.owner_breakdown || [];
  const routeRows = revenueData?.route_breakdown || [];
  const tripRows = revenueData?.trip_breakdown || [];
  const bookingRevenueRows = revenueData?.booking_revenue_breakdown || [];
  const bookingRevenueTotals = revenueData?.booking_revenue_totals || { bookings: 0, seats: 0, gross_revenue: 0, net_revenue: 0 };
  const ownerOptions = revenueData?.owner_options || [];
  const ownerNameById = new Map(ownerOptions.map((owner: any) => [String(owner.owner_id), owner.owner_name]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Reports & Analytics</h2>
          <p className="text-slate-400 text-sm">{isAdmin ? 'Compare revenue before and after coupon discounts' : 'Owner revenue counts distinct seats from confirmed, paid, boarded bookings; coupons do not reduce it'}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'daily', label: 'Last 7 days' },
              { value: 'weekly', label: 'Last 4 weeks' },
              { value: 'monthly', label: 'Last 6 months' },
            ]}
          />
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <Calendar size={14} /> From
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white" />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            To
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white" />
          </label>
          {isAdmin && <Select
            value={ownerFilter}
            onChange={setOwnerFilter}
            options={[{ value: '', label: 'All owners' }, ...ownerOptions.map((owner: any) => ({ value: String(owner.owner_id), label: owner.owner_name }))]}
          />}
          <Button variant="secondary" onClick={fetchReports}>
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={fetchReports} />
      ) : (
        <>
          {/* Metrics summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">{isAdmin ? 'Revenue before coupons' : 'Revenue earned'}</span>
                <DollarSign className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-white">
                ₹{Number((isAdmin ? revenueData?.gross_revenue : revenueData?.total) || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-xs text-emerald-400 flex items-center gap-1 mt-1">
                {isAdmin ? `After coupons: ₹${Number(revenueData?.net_revenue || 0).toLocaleString('en-IN')}` : <><TrendingUp className="w-3.5 h-3.5" /> {Number(revenueData?.distinct_seats || 0).toLocaleString('en-IN')} distinct seats</>}
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Trips</span>
                <Bus className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="text-2xl font-bold text-white">
                {stats?.summary?.trips?.total || 0}
              </div>
              <div className="text-xs text-slate-400 mt-1">Operational routes active</div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Bookings</span>
                <BarChart3 className="w-5 h-5 text-indigo-400" />
              </div>
              <div className="text-2xl font-bold text-white">
                {stats?.summary?.bookings?.total || 0}
              </div>
              <div className="text-xs text-indigo-400 mt-1">Tickets & Shuttle Passes</div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Registered Passengers</span>
                <Users className="w-5 h-5 text-amber-400" />
              </div>
              <div className="text-2xl font-bold text-white">
                {stats?.summary?.passengers?.total || 0}
              </div>
              <div className="text-xs text-slate-400 mt-1">Active customer accounts</div>
            </div>
          </div>

          {/* Revenue Breakdown */}
          <Card title="Revenue Breakdown & Trend">
            {reportRows.length > 0 ? (
              <div className="space-y-4">
                <div className="h-64 flex items-end gap-3 pt-6 pb-2 px-4 border-b border-slate-700/50">
                  {reportRows.map((item: any, idx: number) => {
                    const grossRevenue = Number(item.gross_revenue ?? item.revenue ?? item.total_amount ?? 0);
                    const netRevenue = Number(item.net_revenue ?? item.revenue ?? item.total_amount ?? 0);
                    const maxRev = Math.max(...reportRows.flatMap((row: any) => [Number(row.gross_revenue ?? row.revenue ?? row.total_amount ?? 0), Number(row.net_revenue ?? row.revenue ?? row.total_amount ?? 0)]), 1);
                    const primaryRevenue = grossRevenue;
                    const primaryHeight = Math.max(12, Math.round((primaryRevenue / maxRev) * 100));
                    const netHeight = Math.max(12, Math.round((netRevenue / maxRev) * 100));
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                        <div className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isAdmin ? `Before ₹${grossRevenue} · After ₹${netRevenue}` : `₹${primaryRevenue}`}
                        </div>
                        <div className="flex w-full items-end justify-center gap-1" style={{ height: '100%' }}>
                          <div className="flex-1 bg-cyan-600 rounded-t-sm transition-all duration-300 group-hover:brightness-125" style={{ height: `${primaryHeight}%` }} />
                          {isAdmin && <div className="flex-1 bg-emerald-500 rounded-t-sm transition-all duration-300 group-hover:brightness-125" style={{ height: `${netHeight}%` }} />}
                        </div>
                        <div className="text-xs text-slate-400 truncate w-full text-center">
                          {item.period || item.label || item.date || `P${idx+1}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 text-sm">
                No revenue trend data available for the chosen timeframe.
              </div>
            )}
          </Card>
          {isAdmin && <div className="flex items-center justify-end gap-4 text-xs text-slate-400"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-cyan-600" />Before coupons</span><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />After coupons</span></div>}

          <Card title={isAdmin ? 'Revenue by Owner' : 'My Revenue by Route'}>
            <Table
              headers={isAdmin ? ['Owner', 'Trips', 'Distinct seats', 'Before coupons', 'After coupons'] : ['Route', 'Trips', 'Distinct seats', 'Avg. historical fare', 'Revenue earned']}
              loading={loading}
              empty={isAdmin ? ownerRows.length === 0 : routeRows.length === 0}
              emptyMessage="No booked seats match these filters"
            >
              {isAdmin ? ownerRows.map((owner: any) => (
                <Tr key={owner.owner_id}>
                  <Td className="font-medium text-white">{owner.owner_name}</Td>
                  <Td>{owner.trips}</Td>
                  <Td>{owner.distinct_seats}</Td>
                  <Td>₹{Number(owner.gross_revenue || 0).toLocaleString('en-IN')}</Td>
                  <Td className="font-semibold text-emerald-300">₹{Number(owner.net_revenue || 0).toLocaleString('en-IN')}</Td>
                </Tr>
              )) : routeRows.map((route: any) => (
                <Tr key={`${route.owner_id}-${route.route_id}`}>
                  <Td className="font-medium text-white">{route.route_name}</Td>
                  <Td>{route.trips}</Td>
                  <Td>{route.distinct_seats}</Td>
                  <Td>₹{Number(route.fare_per_seat || 0).toLocaleString('en-IN')}</Td>
                  <Td className="font-semibold text-emerald-300">₹{Number(route.revenue || 0).toLocaleString('en-IN')}</Td>
                </Tr>
              ))}
            </Table>
          </Card>

          {isAdmin && <Card title="Route Revenue">
            <Table headers={['Owner', 'Route', 'Trips', 'Distinct seats', 'Avg. historical fare', 'Before coupons', 'After coupons']} loading={loading} empty={routeRows.length === 0} emptyMessage="No route revenue matches these filters">
              {routeRows.map((route: any) => (
                <Tr key={`${route.owner_id}-${route.route_id}`}>
                  <Td>{ownerNameById.get(String(route.owner_id)) || `Owner #${route.owner_id}`}</Td>
                  <Td className="font-medium text-white">{route.route_name}</Td>
                  <Td>{route.trips}</Td>
                  <Td>{route.distinct_seats}</Td>
                  <Td>₹{Number(route.fare_per_seat || 0).toLocaleString('en-IN')}</Td>
                  <Td>₹{Number(route.revenue || 0).toLocaleString('en-IN')}</Td>
                  <Td className="font-semibold text-emerald-300">₹{Number(route.net_revenue || 0).toLocaleString('en-IN')}</Td>
                </Tr>
              ))}
            </Table>
          </Card>}

          <Card title="Trip, Vehicle & Driver Analysis">
            <Table
              headers={[
                ...(isAdmin ? ['Owner'] : []),
                'Trip / Date',
                'Route',
                'Vehicle',
                'Driver',
                'Distinct seats',
                'Bookings',
                'Trip status',
                ...(isAdmin ? ['Before coupons', 'After coupons'] : ['Revenue earned']),
              ]}
              loading={loading}
              empty={tripRows.length === 0}
              emptyMessage="No trip, vehicle, or driver details match this period"
            >
              {tripRows.map((trip: any) => (
                <Tr key={`${trip.trip_id}-${trip.travel_date}`}>
                  {isAdmin && <Td>{ownerNameById.get(String(trip.owner_id)) || `Owner #${trip.owner_id}`}</Td>}
                  <Td>
                    <div className="font-medium text-white">{trip.schedule_code || `Trip #${trip.trip_id}`}</div>
                    <div className="text-xs text-slate-400">{trip.travel_date || trip.trip_date || 'Date not set'} · {String(trip.departure_time || '').slice(0, 5) || 'Time not set'}</div>
                  </Td>
                  <Td>
                    <div className="font-medium text-white">{trip.route_name}</div>
                    <div className="text-xs text-slate-400">{trip.route_code || '—'} · {trip.origin_city || '—'} → {trip.destination_city || '—'}</div>
                  </Td>
                  <Td>
                    <div className="font-medium text-white">{trip.vehicle?.registration_number || 'Not assigned'}</div>
                    <div className="text-xs text-slate-400">{trip.vehicle?.model || 'Model not set'} · {trip.vehicle?.status || '—'}</div>
                  </Td>
                  <Td>
                    <div className="font-medium text-white">{trip.driver?.name || 'Not assigned'}</div>
                    <div className="text-xs text-slate-400">{trip.driver?.mobile || 'No phone'} · {trip.driver?.status || '—'}</div>
                  </Td>
                  <Td>{trip.distinct_seats}</Td>
                  <Td>{trip.booking_count}</Td>
                  <Td>{trip.status || '—'}</Td>
                  {isAdmin ? <>
                    <Td>₹{Number(trip.gross_revenue || 0).toLocaleString('en-IN')}</Td>
                    <Td className="font-semibold text-emerald-300">₹{Number(trip.net_revenue || 0).toLocaleString('en-IN')}</Td>
                  </> : <Td className="font-semibold text-emerald-300">₹{Number(trip.revenue || 0).toLocaleString('en-IN')}</Td>}
                </Tr>
              ))}
            </Table>
          </Card>

          {isAdmin && <Card title="Super Admin Booking Revenue">
            <Table
              headers={['Owner', 'Trip / Date', 'Seats booked', 'Total bookings', 'Before coupons', 'After coupons']}
              loading={loading}
              empty={bookingRevenueRows.length === 0}
              emptyMessage="No bookings match this report period"
            >
              {bookingRevenueRows.map((row: any) => (
                <Tr key={`${row.owner_id}-${row.trip_id}-${row.travel_date}`}>
                  <Td className="font-medium text-white">{row.owner_id ? ownerNameById.get(String(row.owner_id)) || `Owner #${row.owner_id}` : 'Unassigned'}</Td>
                  <Td>
                    <div className="font-medium text-white">{row.schedule_code || `Trip #${row.trip_id}`}</div>
                    <div className="text-xs text-slate-400">{row.route_name} · {row.travel_date}</div>
                  </Td>
                  <Td>{row.seats.toLocaleString('en-IN')}</Td>
                  <Td>{row.bookings.toLocaleString('en-IN')}</Td>
                  <Td>₹{Number(row.gross_revenue || 0).toLocaleString('en-IN')}</Td>
                  <Td className="font-semibold text-emerald-300">₹{Number(row.net_revenue || 0).toLocaleString('en-IN')}</Td>
                </Tr>
              ))}
              <Tr>
                <Td className="font-bold text-white">Total</Td>
                <Td>All matching trips</Td>
                <Td className="font-bold text-white">{Number(bookingRevenueTotals.seats || 0).toLocaleString('en-IN')}</Td>
                <Td className="font-bold text-white">{Number(bookingRevenueTotals.bookings || 0).toLocaleString('en-IN')}</Td>
                <Td className="font-bold text-white">₹{Number(bookingRevenueTotals.gross_revenue || 0).toLocaleString('en-IN')}</Td>
                <Td className="font-bold text-emerald-300">₹{Number(bookingRevenueTotals.net_revenue || 0).toLocaleString('en-IN')}</Td>
              </Tr>
            </Table>
          </Card>}
        </>
      )}
    </div>
  );
};
