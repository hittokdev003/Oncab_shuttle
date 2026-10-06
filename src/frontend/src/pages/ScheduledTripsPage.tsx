import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Download, Upload, Eye, FileSpreadsheet, X, CheckCircle2, Clock } from 'lucide-react';
import { tripsAPI, routesAPI, driversAPI, vehiclesAPI } from '../services/api';
import { Card, Table, Tr, Td, Pagination, Button, StatusBadge, ConfirmDialog, ErrorState } from '../components/ui';

interface ScheduledTripsPageProps {
  onNotify: (msg: string, type?: any) => void;
}

export const ScheduledTripsPage: React.FC<ScheduledTripsPageProps> = ({ onNotify }) => {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, limit: 15 });

  // Single Trip Creation Form (Screenshot 2)
  const [singleForm, setSingleForm] = useState({
    route_id: '',
    driver_id: '',
    vehicle_id: '',
    bus_type_id: '',
    trip_date: '',
    departure_time: '',
    seat_capacity: '',
  });
  const [creatingSingle, setCreatingSingle] = useState(false);

  // Bulk CSV Upload State (Screenshot 2)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvPreviewData, setCsvPreviewData] = useState<any[] | null>(null);
  const [uploadingBulk, setUploadingBulk] = useState(false);

  // Edit / Delete State
  const [editSchedule, setEditSchedule] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const resp = await tripsAPI.list({ page, limit: 15 });
      setSchedules(resp.data.data || []);
      setPagination(resp.data.pagination || { total: 0, pages: 1, limit: 15 });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load scheduled trips');
    } finally {
      setLoading(false);
    }
  }, [page]);

  const loadDropdowns = async () => {
    try {
      const [rRes, dRes, vRes] = await Promise.all([
        routesAPI.list({ limit: 100 }),
        driversAPI.list({ limit: 100 }),
        vehiclesAPI.list({ limit: 100 }),
      ]);
      setRoutes(rRes.data.data || []);
      setDrivers(dRes.data.data || []);
      setVehicles(vRes.data.data || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchSchedules();
    loadDropdowns();
  }, [fetchSchedules]);

  // Handle Single Trip Creation
  const handleCreateSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleForm.route_id || !singleForm.departure_time) {
      onNotify('Route and Departure Time are required', 'error');
      return;
    }

    setCreatingSingle(true);
    try {
      const scheduleCode = `SCH-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const payload: any = {
        schedule_code: scheduleCode,
        route_id: parseInt(singleForm.route_id),
        driver_id: singleForm.driver_id ? parseInt(singleForm.driver_id) : null,
        vehicle_id: singleForm.vehicle_id ? parseInt(singleForm.vehicle_id) : null,
        bus_type_id: singleForm.bus_type_id
          ? parseInt(singleForm.bus_type_id)
          : (vehicles.find((vehicle) => String(vehicle.id) === singleForm.vehicle_id)?.bus_type_id
            || vehicles.find((vehicle) => String(vehicle.id) === singleForm.vehicle_id)?.bus_type?.id
            || null),
        trip_date: singleForm.trip_date || new Date().toISOString().split('T')[0],
        departure_time: singleForm.departure_time,
        seat_capacity: singleForm.seat_capacity ? parseInt(singleForm.seat_capacity) : 40,
        status: 'Scheduled',
      };

      await tripsAPI.create(payload);
      onNotify('Trip created successfully');
      setSingleForm({
        route_id: '',
        driver_id: '',
        vehicle_id: '',
        bus_type_id: '',
        trip_date: '',
        departure_time: '',
        seat_capacity: '',
      });
      fetchSchedules();
    } catch (err: any) {
      onNotify(err.response?.data?.message || 'Failed to create trip', 'error');
    } finally {
      setCreatingSingle(false);
    }
  };

  // Quick Time Selector
  const handleQuickTimeChange = (timeValue: string) => {
    if (timeValue) {
      setSingleForm((prev) => ({ ...prev, departure_time: timeValue }));
    }
  };

  // Download Sample Template CSV
  const handleDownloadTemplate = () => {
    const csvContent = 'schedule_code,route_id,driver_id,vehicle_id,trip_date,departure_time,seat_capacity\nSCH-2026-101,1,1,1,2026-09-30,06:30,40\nSCH-2026-102,2,2,2,2026-09-30,08:00,35';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'bulk_trip_creation_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onNotify('Sample CSV Template downloaded');
  };

  // Handle CSV File Selection & Preview
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handlePreviewCSV = () => {
    if (!selectedFile) {
      onNotify('Please choose a CSV file first', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(Boolean);
      if (lines.length <= 1) {
        onNotify('CSV file is empty or has only headers', 'error');
        return;
      }
      const headers = lines[0].split(',').map((h) => h.trim());
      const dataRows = lines.slice(1).map((line) => {
        const values = line.split(',').map((v) => v.trim());
        const rowObj: any = {};
        headers.forEach((h, i) => {
          rowObj[h] = values[i] || '';
        });
        return rowObj;
      });
      setCsvPreviewData(dataRows);
    };
    reader.readAsText(selectedFile);
  };

  const handleUploadBulk = async () => {
    if (!selectedFile) {
      onNotify('Please select a CSV file to upload', 'error');
      return;
    }

    setUploadingBulk(true);
    try {
      // If preview data exists, create trips sequentially
      if (csvPreviewData && csvPreviewData.length > 0) {
        for (const item of csvPreviewData) {
          try {
            await tripsAPI.create({
              schedule_code: item.schedule_code || `SCH-${Date.now().toString().slice(-4)}`,
              route_id: parseInt(item.route_id || '1'),
              driver_id: item.driver_id ? parseInt(item.driver_id) : null,
              vehicle_id: item.vehicle_id ? parseInt(item.vehicle_id) : null,
              trip_date: item.trip_date || new Date().toISOString().split('T')[0],
              departure_time: item.departure_time || '08:00',
              seat_capacity: item.seat_capacity ? parseInt(item.seat_capacity) : 40,
              status: 'Scheduled',
            });
          } catch {
            // continue
          }
        }
      }
      onNotify('Bulk trips processed successfully');
      setSelectedFile(null);
      setCsvPreviewData(null);
      fetchSchedules();
    } catch (err: any) {
      onNotify('Bulk upload encountered errors', 'error');
    } finally {
      setUploadingBulk(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await tripsAPI.delete(deleteTarget.id);
      onNotify('Trip schedule deleted successfully');
      setDeleteTarget(null);
      fetchSchedules();
    } catch (err: any) {
      onNotify(err.response?.data?.message || 'Delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Card 1: Create Single Trip (Screenshot 2) ── */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          Create Single Trip
        </h3>

        <form onSubmit={handleCreateSingle} className="space-y-4">
          {/* Row 1: Route, Driver, Vehicle, Date, Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* ROUTE */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 tracking-wider uppercase">
                ROUTE <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={singleForm.route_id}
                onChange={(e) => setSingleForm({ ...singleForm, route_id: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select a route</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.route_code || `R${r.id}`} - {r.route_name}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-slate-400 mt-1 block">Lists routes from /api/routes</span>
            </div>

            {/* DRIVER */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 tracking-wider uppercase">
                DRIVER
              </label>
              <select
                value={singleForm.driver_id}
                onChange={(e) => setSingleForm({ ...singleForm, driver_id: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select a driver</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.driver_user_id || `D-${d.id}`})
                  </option>
                ))}
              </select>
            </div>

            {/* VEHICLE */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 tracking-wider uppercase">
                VEHICLE
              </label>
              <select
                value={singleForm.vehicle_id}
                onChange={(e) => {
                  const vehicleId = e.target.value;
                  const selectedVehicle = vehicles.find((vehicle) => String(vehicle.id) === vehicleId);
                  setSingleForm((previous) => ({
                    ...previous,
                    vehicle_id: vehicleId,
                    bus_type_id: selectedVehicle?.bus_type_id || selectedVehicle?.bus_type?.id
                      ? String(selectedVehicle.bus_type_id || selectedVehicle.bus_type.id)
                      : '',
                  }));
                }}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select a vehicle</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registration_number || v.vehicle_number} ({v.bus_type?.name || 'Bus'})
                  </option>
                ))}
              </select>
            </div>

            {/* DATE */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 tracking-wider uppercase">
                DATE
              </label>
              <input
                type="date"
                value={singleForm.trip_date}
                onChange={(e) => setSingleForm({ ...singleForm, trip_date: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* TIME + Quick Times */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 tracking-wider uppercase">
                TIME <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="time"
                  required
                  value={singleForm.departure_time}
                  onChange={(e) => setSingleForm({ ...singleForm, departure_time: e.target.value })}
                  className="w-1/2 px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
                <select
                  onChange={(e) => handleQuickTimeChange(e.target.value)}
                  className="w-1/2 px-2 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  defaultValue=""
                >
                  <option value="" disabled>Quick Times</option>
                  <option value="06:00">06:00 AM</option>
                  <option value="07:30">07:30 AM</option>
                  <option value="08:00">08:00 AM</option>
                  <option value="09:30">09:30 AM</option>
                  <option value="17:30">05:30 PM</option>
                  <option value="18:30">06:30 PM</option>
                  <option value="20:00">08:00 PM</option>
                </select>
              </div>
            </div>
          </div>

          {/* Row 2: SEAT CAPACITY (OPTIONAL) */}
          {/* <div className="max-w-xs">
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 tracking-wider uppercase">
              SEAT CAPACITY (OPTIONAL)
            </label>
            <input
              type="number"
              placeholder="e.g. 40"
              value={singleForm.seat_capacity}
              onChange={(e) => setSingleForm({ ...singleForm, seat_capacity: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div> */}

          {/* Create Trip Action Button */}
          <div>
            <button
              type="submit"
              disabled={creatingSingle}
              className="px-6 py-2 bg-[#0c2e59] hover:bg-[#082040] text-white text-xs font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50"
            >
              {creatingSingle ? 'Creating...' : 'Create Trip'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Card 2: Bulk Trip Creation (Screenshot 2) ── */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Bulk Trip Creation
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Upload a CSV file to create multiple trips at once.
          </p>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 tracking-wider uppercase">
            CSV FILE
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[280px]">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="w-full text-xs text-slate-700 dark:text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-800 dark:file:text-slate-200 hover:file:bg-slate-200 cursor-pointer border border-slate-300 dark:border-slate-700 rounded-lg p-1 bg-slate-50 dark:bg-slate-800/60"
              />
            </div>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors"
            >
              Download Template
            </button>

            <button
              type="button"
              onClick={handlePreviewCSV}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors"
            >
              Preview CSV
            </button>

            <button
              type="button"
              onClick={handleUploadBulk}
              disabled={uploadingBulk || !selectedFile}
              className="px-5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {uploadingBulk ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>

        {/* CSV Preview Modal / Table */}
        {csvPreviewData && (
          <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 dark:border-slate-700">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Preview ({csvPreviewData.length} records in CSV)
              </span>
              <button
                onClick={() => setCsvPreviewData(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-500 font-mono text-[11px] border-b border-slate-200 dark:border-slate-700">
                    <th className="p-1.5">Schedule Code</th>
                    <th className="p-1.5">Route ID</th>
                    <th className="p-1.5">Driver ID</th>
                    <th className="p-1.5">Date</th>
                    <th className="p-1.5">Time</th>
                    <th className="p-1.5">Seats</th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreviewData.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-100 dark:border-slate-800 font-mono">
                      <td className="p-1.5 text-slate-900 dark:text-white">{row.schedule_code || '—'}</td>
                      <td className="p-1.5 text-slate-600 dark:text-slate-400">{row.route_id || '—'}</td>
                      <td className="p-1.5 text-slate-600 dark:text-slate-400">{row.driver_id || '—'}</td>
                      <td className="p-1.5 text-slate-600 dark:text-slate-400">{row.trip_date || '—'}</td>
                      <td className="p-1.5 text-slate-600 dark:text-slate-400">{row.departure_time || '—'}</td>
                      <td className="p-1.5 text-slate-600 dark:text-slate-400">{row.seat_capacity || '40'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Scheduled Trips Table ── */}
      <Card padding={false}>
        {error ? (
          <ErrorState message={error} onRetry={fetchSchedules} />
        ) : (
          <>
            <Table
              headers={[
                'ID',
                'SCHEDULE CODE',
                'ROUTE',
                'DRIVER',
                'VEHICLE',
                'DATE & TIME',
                'CAPACITY',
                'STATUS',
                'ACTIONS',
              ]}
              loading={loading}
              empty={!loading && schedules.length === 0}
              emptyMessage="No scheduled trips found"
            >
              {schedules.map((schedule) => (
                <Tr key={schedule.id}>
                  <Td className="font-mono text-xs text-slate-400">{schedule.id}</Td>
                  <Td className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                    {schedule.schedule_code}
                  </Td>
                  <Td className="text-xs">
                    {schedule.route ? (
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {schedule.route.route_name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {schedule.route.origin_city} → {schedule.route.destination_city}
                        </div>
                      </div>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {schedule.driver?.name || 'Unassigned'}
                  </Td>
                  <Td className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {schedule.vehicle?.registration_number || 'Unassigned'}
                  </Td>
                  <Td className="text-xs font-mono text-slate-700 dark:text-slate-300">
                    <div>{schedule.trip_date || 'Daily'}</div>
                    <div className="text-slate-500 text-[11px]">{schedule.departure_time}</div>
                  </Td>
                  <Td className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {schedule.seat_capacity || 40} Seats
                  </Td>
                  <Td>
                    <StatusBadge status={schedule.status || 'Scheduled'} />
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Button variant="danger" size="sm" onClick={() => setDeleteTarget(schedule)}>
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

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Trip Schedule"
        message={`Are you sure you want to delete trip schedule "${deleteTarget?.schedule_code}"?`}
        loading={deleting}
      />
    </div>
  );
};
