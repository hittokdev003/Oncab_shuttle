import React, { useEffect, useState } from 'react';
import { 
  Users, Truck, Ticket, TrendingUp, CreditCard, RefreshCcw, UserRound, Bus,
  CheckCircle, XCircle, ArrowUpRight
} from 'lucide-react';
import { dashboardAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { StatCard, Card, LoadingState, ErrorState, StatusBadge } from '../components/ui';
import { hasRole } from '../utils/roles';

interface DashboardStats {
  summary: {
    trips: { total: number; today: number; active: number };
    bookings: { total: number; today: number; confirmed: number; cancelled: number };
    drivers: { total: number; active: number };
    vehicles: { total: number; active: number };
    passengers: { total: number };
    revenue?: { total: number; today: number };
    refunds?: { pending: number; pendingAmount: number; completedAmount: number };
  };
  charts?: {
    vehicleStatus?: any[];
    driverStatus?: any[];
    tripStatus?: any[];
  };
  recentBookings: any[];
  topRoutes: any[];
}

const formatCurrency = (amount: number) => `₹${(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const isOwner = hasRole(user, 'owner');
  const isAdmin = hasRole(user, 'admin');

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError('');
      const resp = await dashboardAPI.stats();
      setStats(resp.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  if (loading) return <LoadingState message="Loading dashboard..." />;
  if (error) return <ErrorState message={error} onRetry={fetchStats} />;
  if (!stats) return null;

  const { summary, recentBookings = [], topRoutes = [] } = stats;

  const renderChartCard = (title: string, rows: any[], labelKey: string, valueKey: string, color: string) => {
    const values = rows.map((row) => Number(row[valueKey] || 0));
    const maxValue = Math.max(...values, 1);
    return (
      <Card key={title}>
        <h3 className="text-white font-semibold text-sm mb-4">{title}</h3>
        <div className="space-y-3">
          {rows.length === 0 ? (
            <div className="text-sm text-slate-500">No data</div>
          ) : rows.map((row, index) => (
            <div key={`${title}-${index}`}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">{row[labelKey] || 'Unknown'}</span>
                <span className="text-slate-200">{row[valueKey] || 0}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-800/80">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${((Number(row[valueKey] || 0) / maxValue) * 100)}%`, background: color }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  };

  if (isOwner) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(59, 130, 246, 0.12) 100%)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
          <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full opacity-10" style={{ background: 'radial-gradient(#10b981, transparent)' }} />
          <div className="relative">
            <p className="text-slate-300 text-sm font-medium">Owner Fleet Overview</p>
            <h2 className="text-3xl font-bold text-white mt-1">{summary.vehicles.total} vehicles • {summary.drivers.total} drivers</h2>
            <div className="flex items-center gap-4 mt-3 text-sm">
              <span className="text-emerald-400">{summary.vehicles.active} active vehicles</span>
              <span className="text-slate-500">•</span>
              <span className="text-indigo-300">{summary.drivers.active} active drivers</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard title="My Vehicles" value={summary.vehicles.total} icon={Truck} color="#f59e0b" subtitle={`${summary.vehicles.active} active`} />
          <StatCard title="My Drivers" value={summary.drivers.total} icon={UserRound} color="#8b5cf6" subtitle={`${summary.drivers.active} active`} />
          <StatCard title="Active Trips" value={summary.trips.active} icon={Bus} color="#10b981" subtitle={`${summary.trips.today} today`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {renderChartCard('Vehicle Status', stats.charts?.vehicleStatus || [], 'status', 'count', '#f59e0b')}
          {renderChartCard('Driver Status', stats.charts?.driverStatus || [], 'status', 'count', '#8b5cf6')}
          {renderChartCard('Trip Status', stats.charts?.tripStatus || [], 'status', 'count', '#10b981')}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card padding={false}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(99, 102, 241, 0.1)' }}>
              <h3 className="text-white font-semibold text-sm">Fleet Activity</h3>
            </div>
            <div className="space-y-4 p-5">
              {[
                { label: 'Confirmed bookings', value: summary.bookings.confirmed, color: '#10b981' },
                { label: 'Cancelled bookings', value: summary.bookings.cancelled, color: '#ef4444' },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">{item.label}</span>
                    <span className="text-slate-200">{item.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800/80">
                    <div className="h-full rounded-full" style={{ width: `${Math.min((item.value / Math.max(summary.bookings.total, 1)) * 100, 100)}%`, background: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card padding={false}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(99, 102, 241, 0.1)' }}>
              <h3 className="text-white font-semibold text-sm">Top Routes</h3>
            </div>
            <div className="divide-y p-2">
              {topRoutes.length === 0 ? (
                <div className="py-4 text-center text-slate-500 text-xs">No route data</div>
              ) : topRoutes.slice(0, 5).map((r: any, i: number) => (
                <div key={r.trip_id} className="flex items-center gap-3 p-3 rounded-lg">
                  <span className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-white" style={{ background: i === 0 ? '#10b981' : i === 1 ? '#6366f1' : '#8b5cf6' }}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-medium truncate">{r.trip?.route?.route_name || r.trip?.schedule_code}</p>
                    <p className="text-slate-500 text-xs">{r.trip?.route?.origin_city} → {r.trip?.route?.destination_city}</p>
                  </div>
                  <span className="text-indigo-300 text-xs font-semibold">{r.booking_count}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isAdmin && (
        <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%)', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
          <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full opacity-10" style={{ background: 'radial-gradient(#6366f1, transparent)' }} />
          <div className="relative">
            <p className="text-slate-400 text-sm font-medium">Total Revenue</p>
            <h2 className="text-4xl font-bold text-white mt-1">{formatCurrency(summary.revenue?.total || 0)}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
              <div className="flex items-center gap-1.5 text-emerald-400 text-sm">
                <ArrowUpRight size={16} />
                <span>{formatCurrency(summary.revenue?.today || 0)} today</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400 text-sm">
                <RefreshCcw size={14} />
                <span>{formatCurrency(summary.refunds?.pendingAmount || 0)} pending refunds</span>
              </div>
              <div className="flex items-center gap-1.5 text-amber-300 text-sm">
                <CreditCard size={14} />
                <span>{formatCurrency(summary.refunds?.completedAmount || 0)} refunded</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Trips" value={summary.trips.total} icon={Bus} color="#6366f1" subtitle={`${summary.trips.today} today • ${summary.trips.active} active`} />
        <StatCard title="Total Bookings" value={summary.bookings.total} icon={Ticket} color="#10b981" subtitle={`${summary.bookings.today} today`} />
        <StatCard title="Active Drivers" value={`${summary.drivers.active}/${summary.drivers.total}`} icon={UserRound} color="#8b5cf6" />
        <StatCard title="Active Vehicles" value={`${summary.vehicles.active}/${summary.vehicles.total}`} icon={Truck} color="#f59e0b" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Passengers" value={summary.passengers.total} icon={Users} color="#06b6d4" />
        <StatCard title="Confirmed" value={summary.bookings.confirmed} icon={CheckCircle} color="#10b981" />
        <StatCard title="Cancelled" value={summary.bookings.cancelled} icon={XCircle} color="#ef4444" />
        {isAdmin && <StatCard title="Pending Refunds" value={summary.refunds?.pending || 0} icon={RefreshCcw} color="#f97316" subtitle={`${formatCurrency(summary.refunds?.pendingAmount || 0)} pending`} />}
      </div>

      {/* Recent Bookings + Top Routes */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Recent Bookings */}
        <Card className="lg:col-span-3" padding={false}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(99, 102, 241, 0.1)' }}>
            <h3 className="text-white font-semibold text-sm">Recent Bookings</h3>
            <span className="text-slate-500 text-xs">{recentBookings.length} records</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'rgba(99, 102, 241, 0.06)' }}>
            {recentBookings.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">No recent bookings</div>
            ) : recentBookings.slice(0, 8).map((booking: any) => (
              <div key={booking.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(99, 102, 241, 0.1)' }}>
                  <Ticket size={14} style={{ color: '#818cf8' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{booking.passenger_name}</p>
                  <p className="text-slate-500 text-xs">{booking.booking_reference}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {isAdmin && <p className="text-emerald-400 text-sm font-medium">₹{booking.final_amount}</p>}
                  <StatusBadge status={booking.booking_status} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Top Routes + Quick Stats */}
        <div className="lg:col-span-2 space-y-4">
          <Card padding={false}>
            <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(99, 102, 241, 0.1)' }}>
              <h3 className="text-white font-semibold text-sm">Top Routes</h3>
            </div>
            <div className="divide-y p-2" style={{ borderColor: 'rgba(99, 102, 241, 0.06)' }}>
              {topRoutes.length === 0 ? (
                <div className="py-4 text-center text-slate-500 text-xs">No route data</div>
              ) : topRoutes.map((r: any, i: number) => (
                <div key={r.trip_id} className="flex items-center gap-3 p-3 rounded-lg">
                  <span className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : '#a16207' }}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-medium truncate">{r.trip?.route?.route_name || r.trip?.schedule_code}</p>
                    <p className="text-slate-500 text-xs">{r.trip?.route?.origin_city} → {r.trip?.route?.destination_city}</p>
                  </div>
                  <span className="text-indigo-400 text-xs font-semibold">{r.booking_count} bkgs</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick Status */}
          <Card>
            <h3 className="text-white font-semibold text-sm mb-3">Booking Overview</h3>
            <div className="space-y-2.5">
              {[
                { label: 'Confirmed', value: summary.bookings.confirmed, total: summary.bookings.total, color: '#10b981' },
                { label: 'Cancelled', value: summary.bookings.cancelled, total: summary.bookings.total, color: '#ef4444' },
              ].map(({ label, value, total, color }) => (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">{label}</span>
                    <span className="text-slate-300">{value}</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'rgba(99, 102, 241, 0.1)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: total > 0 ? `${(value / total) * 100}%` : '0%', background: color }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
