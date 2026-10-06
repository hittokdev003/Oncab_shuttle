import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, MapPin, Eye, Search, AlertTriangle, CheckCircle, X } from 'lucide-react';
import { stopsAPI } from '../services/api';
import { Card, Table, Tr, Td, Pagination, SearchInput, Button, Select, StatusBadge, Modal, ConfirmDialog, ErrorState, Badge } from '../components/ui';

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

  const [nearbyWarning, setNearbyWarning] = useState<any[]>([]);

  const [form, setForm] = useState({
    stop_name: '',
    stop_code: '',
    latitude: '',
    longitude: '',
    address: '',
    landmark: '',
    status: 'Active',
  });

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

  const openCreate = () => {
    setEditStop(null);
    setForm({
      stop_name: '',
      stop_code: '',
      latitude: '',
      longitude: '',
      address: '',
      landmark: '',
      status: 'Active',
    });
    setNearbyWarning([]);
    setShowCreateModal(true);
  };

  const openEdit = (s: PhysicalStop) => {
    setEditStop(s);
    setForm({
      stop_name: s.stop_name || '',
      stop_code: s.stop_code || '',
      latitude: s.latitude != null ? String(s.latitude) : '',
      longitude: s.longitude != null ? String(s.longitude) : '',
      address: s.address || '',
      landmark: s.landmark || '',
      status: s.status || 'Active',
    });
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

      {/* Create / Edit Stop Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-6 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-semibold text-white">
                {editStop ? 'Edit Physical Stop' : 'Create New Physical Stop'}
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5 pt-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Stop Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. RANIKUTHI- MADHUMITA RESTAURANT"
                  value={form.stop_name}
                  onChange={(e) => setForm({ ...form, stop_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Stop Code</label>
                <input
                  type="text"
                  placeholder="e.g. RNK-001"
                  value={form.stop_code}
                  onChange={(e) => setForm({ ...form, stop_code: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Latitude</label>
                  <input
                    type="text"
                    placeholder="22.4824724"
                    value={form.latitude}
                    onChange={(e) => {
                      setForm({ ...form, latitude: e.target.value });
                      checkNearby(e.target.value, form.longitude);
                    }}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Longitude</label>
                  <input
                    type="text"
                    placeholder="88.3508133"
                    value={form.longitude}
                    onChange={(e) => {
                      setForm({ ...form, longitude: e.target.value });
                      checkNearby(form.latitude, e.target.value);
                    }}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* Nearby Proximity Warning */}
              {nearbyWarning.length > 0 && (
                <div className="p-3 bg-amber-950/50 border border-amber-800/60 rounded-lg text-xs text-amber-300 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                    An existing stop is nearby!
                  </div>
                  {nearbyWarning.slice(0, 2).map((item) => (
                    <div key={item.id} className="text-[11px] text-amber-200/90 pl-5">
                      • {item.stop_name} ({item.distance_meters}m away)
                    </div>
                  ))}
                  <div className="text-[10px] text-amber-400/80 pt-1">
                    Please verify if you want to reuse an existing stop instead of creating a duplicate.
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Address</label>
                <input
                  type="text"
                  placeholder="Street address or junction detail"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Landmark</label>
                <input
                  type="text"
                  placeholder="e.g. Near Reliance Digital"
                  value={form.landmark}
                  onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <Button variant="ghost" type="button" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving}>
                  Save Physical Stop
                </Button>
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
