import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, FileText, AlertTriangle, Upload, FilePlus, Calendar, Eye, X } from 'lucide-react';
import { driversAPI, rolesAPI, usersAPI, vehiclesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Table, Tr, Td, Pagination, SearchInput, Button, Select, StatusBadge, Modal, Input, ConfirmDialog, ErrorState, Badge } from '../components/ui';
import { hasRole } from '../utils/roles';

interface Vehicle {
  id: number;
  owner_id?: number | null;
  driver_id?: number | null;
  registration_number: string;
  bus_type_id?: number | null;
  company_model: string;
  engine_type: string;
  color: string;
  total_seats: number;
  status: string;
  vehicle_img?: string | null;
  driver?: { name: string };
  bus_type?: { name: string };
  documents?: any[];
  created_at: string;
}

interface VehiclesPageProps {
  onNotify: (msg: string, type?: any) => void;
  showDocs?: boolean;
}

const HEADERS = ['Vehicle', 'Engine / Color', 'Bus Type', 'Driver', 'Seats', 'Documents', 'Status', 'Actions'];
const DOC_HEADERS = ['Vehicle', 'Doc Type', 'Doc Number', 'Issue Date', 'Expiry Date', 'Status', 'Notes'];

export const VehiclesPage: React.FC<VehiclesPageProps> = ({ onNotify, showDocs }) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [owners, setOwners] = useState<any[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [ownersLoadError, setOwnersLoadError] = useState('');
  const [drivers, setDrivers] = useState<any[]>([]);
  const [busTypes, setBusTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, limit: 15 });
  const { user } = useAuth();
  const isOwner = hasRole(user, 'owner');

  // Vehicle modal
  const [showModal, setShowModal] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    owner_id: '',
    driver_id: '',
    bus_type_id: '',
    registration_number: '',
    company_model: '',
    engine_type: '',
    color: '',
    total_seats: '24',
    status: 'Active',
    vehicle_img: '',
  });

  // Document modal & detail
  const [showDocModal, setShowDocModal] = useState(false);
  const [editDocument, setEditDocument] = useState<any | null>(null);
  const [selectedVehicleForDocs, setSelectedVehicleForDocs] = useState<Vehicle | null>(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const [docForm, setDocForm] = useState({
    vehicle_id: '',
    doc_type: 'insurance',
    doc_number: '',
    issue_date: '',
    expiry_date: '',
    status: 'Valid',
    notes: '',
    doc_img: '',
  });

  const [expiringDocs, setExpiringDocs] = useState<any[]>([]);

  const selectableDrivers = form.owner_id
    ? drivers.filter((driver) => String(driver.owner_id ?? '') === String(form.owner_id))
    : drivers.filter((driver) => isOwner ? String(driver.owner_id ?? '') === String(user?.id ?? '') : true);

  useEffect(() => {
    if (!isOwner) {
      const loadOwners = async () => {
        setOwnersLoading(true);
        setOwnersLoadError('');
        try {
          let ownerRoleId: number | undefined;
          try {
            const rolesResponse = await rolesAPI.list();
            const ownerRole = (rolesResponse.data.data || []).find((role: any) => role.name?.toLowerCase() === 'owner');
            ownerRoleId = ownerRole ? Number(ownerRole.id) : undefined;
          } catch {
            // Fall back to the user list, which includes each user's role.
          }

          const fetchUserPages = async (roleId?: number) => {
            const firstPage = await usersAPI.list({ page: 1, limit: 100, ...(roleId ? { role_id: roleId } : {}) });
            const pages = Number(firstPage.data.pagination?.pages || 1);
            const remainingPages = await Promise.all(
              Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
                usersAPI.list({ page: index + 2, limit: 100, ...(roleId ? { role_id: roleId } : {}) })
              )
            );
            return [
              ...(firstPage.data.data || []),
              ...remainingPages.flatMap((response) => response.data.data || []),
            ];
          };

          let ownerUsers = ownerRoleId
            ? await fetchUserPages(ownerRoleId)
            : (await fetchUserPages()).filter((entry: any) => entry.role?.name?.toLowerCase() === 'owner');

          if (ownerRoleId && ownerUsers.length === 0) {
            ownerUsers = (await fetchUserPages()).filter((entry: any) =>
              entry.role?.name?.toLowerCase() === 'owner' || Number(entry.role_id) === ownerRoleId
            );
          }

          setOwners(ownerUsers);
        } catch (error: any) {
          setOwners([]);
          setOwnersLoadError(error.response?.data?.message || 'Could not load owner users');
        } finally {
          setOwnersLoading(false);
        }
      };

      loadOwners();
    }

    driversAPI.list({ page: 1, limit: 200 })
      .then((response) => setDrivers(response.data.data || []))
      .catch(() => setDrivers([]));

    vehiclesAPI.busTypes()
      .then((response) => setBusTypes(response.data.data || []))
      .catch(() => setBusTypes([]));
  }, [isOwner]);

  const fetchVehicles = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const resp = await vehiclesAPI.list({ page, limit: 15, search, status: statusFilter });
      setVehicles(resp.data.data || []);
      setPagination(resp.data.pagination || { total: 0, pages: 1, limit: 15 });

      if (showDocs) {
        const docsResp = await vehiclesAPI.expiringDocs(90);
        setExpiringDocs(docsResp.data.data || []);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, showDocs]);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const openCreate = () => {
    setEditVehicle(null);
    setForm({
      owner_id: isOwner ? String(user?.id || '') : '',
      driver_id: '',
      bus_type_id: '',
      registration_number: '',
      company_model: '',
      engine_type: 'electric',
      color: 'blue',
      total_seats: '24',
      status: 'Active',
      vehicle_img: '',
    });
    setShowModal(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditVehicle(v);
    setForm({
      owner_id: isOwner ? String(user?.id || '') : String(v.owner_id || ''),
      driver_id: v.driver_id ? String(v.driver_id) : '',
      bus_type_id: v.bus_type_id ? String(v.bus_type_id) : '',
      registration_number: v.registration_number,
      company_model: v.company_model || '',
      engine_type: v.engine_type || '',
      color: v.color || '',
      total_seats: String(v.total_seats || 24),
      status: v.status || 'Active',
      vehicle_img: '',
    });
    setShowModal(true);
  };

  const openAddDocument = (vehicle?: Vehicle) => {
    setEditDocument(null);
    const targetId = vehicle?.id ? String(vehicle.id) : (vehicles[0]?.id ? String(vehicles[0].id) : '');
    setDocForm({
      vehicle_id: targetId,
      doc_type: 'insurance',
      doc_number: '',
      issue_date: new Date().toISOString().split('T')[0],
      expiry_date: '',
      status: 'Valid',
      notes: '',
      doc_img: '',
    });
    setShowDocModal(true);
  };

  const openEditDocument = (vehicle: Vehicle, document: any) => {
    setSelectedVehicleForDocs(vehicle);
    setEditDocument(document);
    setDocForm({
      vehicle_id: String(vehicle.id),
      doc_type: document.doc_type,
      doc_number: document.doc_number || '',
      issue_date: document.issue_date || '',
      expiry_date: document.expiry_date || '',
      status: document.status || 'Valid',
      notes: document.notes || '',
      doc_img: '',
    });
    setShowDocModal(true);
  };

  const readImageFile = (file: File, onRead: (dataUrl: string) => void) => {
    const reader = new FileReader();
    reader.onload = () => onRead(reader.result as string);
    reader.readAsDataURL(file);
  };

  const selectedDocVehicle = vehicles.find((vehicle) => String(vehicle.id) === docForm.vehicle_id);
  const duplicateDocType = Boolean(selectedDocVehicle?.documents?.some((document: any) =>
    document.doc_type === docForm.doc_type && document.id !== editDocument?.id
  ));
  const canManageVehicleDocuments = true;

  const handleSaveVehicle = async () => {
    if (!form.registration_number) {
      onNotify('Registration number is required', 'error');
      return;
    }
    if (!isOwner && !form.owner_id) {
      onNotify('Please select an owner', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        owner_id: isOwner ? Number(user?.id) : Number(form.owner_id),
        driver_id: form.driver_id ? Number(form.driver_id) : null,
        bus_type_id: form.bus_type_id ? Number(form.bus_type_id) : null,
        total_seats: Number(form.total_seats || 0),
      };
      if (editVehicle) {
        const response = await vehiclesAPI.update(editVehicle.id, payload);
        onNotify(response.data.message || 'Vehicle updated successfully');
      } else {
        const response = await vehiclesAPI.create(payload);
        onNotify(response.data.message || 'Vehicle created successfully');
      }
      setShowModal(false);
      fetchVehicles();
    } catch (err: any) {
      onNotify(err.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docForm.vehicle_id) {
      onNotify('Please select a vehicle', 'error');
      return;
    }
    if (!docForm.doc_number) {
      onNotify('Document number is required', 'error');
      return;
    }
    if (duplicateDocType) {
      onNotify(`A ${docForm.doc_type} document already exists for this vehicle`, 'error');
      return;
    }

    setSavingDoc(true);
    try {
      const documentPayload = {
        doc_type: docForm.doc_type,
        doc_number: docForm.doc_number,
        doc_img: docForm.doc_img || null,
        issue_date: docForm.issue_date || null,
        expiry_date: docForm.expiry_date || null,
        status: docForm.status,
        notes: docForm.notes || null,
      };
      if (editDocument) {
        await vehiclesAPI.updateDocument(parseInt(docForm.vehicle_id), editDocument.id, documentPayload);
        onNotify('Vehicle document updated successfully!');
      } else {
        await vehiclesAPI.addDocument(parseInt(docForm.vehicle_id), documentPayload);
        onNotify('Vehicle document uploaded successfully!');
      }
      setShowDocModal(false);
      await fetchVehicles();
      if (selectedVehicleForDocs) {
        const refreshedVehicle = await vehiclesAPI.show(selectedVehicleForDocs.id);
        setSelectedVehicleForDocs(refreshedVehicle.data.data);
      }
    } catch (err: any) {
      onNotify(err.response?.data?.message || 'Failed to add document', 'error');
    } finally {
      setSavingDoc(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await vehiclesAPI.delete(deleteTarget.id);
      onNotify('Vehicle deleted');
      setDeleteTarget(null);
      fetchVehicles();
    } catch (err: any) {
      onNotify(err.response?.data?.message || 'Delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // If showing standalone "Vehicle Documents" view
  if (showDocs) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Vehicle Documents & Compliance</h2>
            <p className="text-slate-400 text-sm">Track insurance, fitness certificates, permits, and expiry renewals</p>
          </div>
          <Button onClick={() => openAddDocument()}>
            <FilePlus size={14} />
            + Add Document
          </Button>
        </div>

        {expiringDocs.length > 0 && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-300 font-semibold text-sm">
                {expiringDocs.length} document(s) expiring within 90 days
              </p>
              <p className="text-amber-400/80 text-xs mt-0.5">
                Renew these documents promptly with local transport authorities to avoid compliance interruptions.
              </p>
            </div>
          </div>
        )}

        <Card padding={false}>
          <Table
            headers={DOC_HEADERS}
            loading={loading}
            empty={!loading && expiringDocs.length === 0}
            emptyMessage="No documents expiring within the next 90 days"
          >
            {expiringDocs.map((doc: any) => (
              <Tr key={doc.id}>
                <Td>
                  <div className="text-white text-sm font-medium font-mono">
                    {doc.vehicle?.registration_number}
                  </div>
                  <div className="text-slate-500 text-xs">{doc.vehicle?.company_model || '—'}</div>
                </Td>
                <Td className="capitalize font-medium text-slate-200">
                  <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs">
                    {doc.doc_type}
                  </span>
                </Td>
                <Td className="font-mono text-xs text-cyan-400">{doc.doc_number || '—'}</Td>
                <Td className="text-xs text-slate-400">{doc.issue_date || '—'}</Td>
                <Td>
                  <span
                    className={`font-mono text-xs font-semibold ${
                      new Date(doc.expiry_date) < new Date() ? 'text-rose-400' : 'text-amber-400'
                    }`}
                  >
                    {doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString() : '—'}
                  </span>
                </Td>
                <Td>
                  <StatusBadge status={doc.status} />
                </Td>
                <Td className="text-xs text-slate-400">{doc.notes || '—'}</Td>
              </Tr>
            ))}
          </Table>
        </Card>

        {/* Add Document Modal Reuse */}
        {showDocModal && renderDocModal()}
      </div>
    );
  }

  function renderDocModal() {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
        <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-6 my-8">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <h3 className="text-lg font-semibold text-white">{editDocument ? 'Edit Vehicle Document' : 'Add Vehicle Document'}</h3>
            <button
              onClick={() => setShowDocModal(false)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSaveDocument} className="space-y-4 pt-4">
            {/* Target Vehicle */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Select Vehicle <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={docForm.vehicle_id}
                disabled={!!editDocument}
                onChange={(e) => setDocForm({ ...docForm, vehicle_id: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">Select a Vehicle</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registration_number} ({v.company_model || 'Bus'})
                  </option>
                ))}
              </select>
            </div>

            {/* Document Type & Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Document Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={docForm.doc_type}
                  onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  {[
                    ['insurance', 'Insurance Policy'],
                    ['fitness', 'Fitness Certificate'],
                    ['pollution', 'Pollution Under Control (PUC)'],
                    ['registration', 'Registration Certificate (RC)'],
                    ['permit', 'Commercial Route Permit'],
                    ['other', 'Other Compliance Doc'],
                  ].map(([value, label]) => (
                    <option
                      key={value}
                      value={value}
                      disabled={Boolean(selectedDocVehicle?.documents?.some((document: any) =>
                        document.doc_type === value && document.id !== editDocument?.id
                      ))}
                    >
                      {label}
                    </option>
                  ))}
                </select>
                {duplicateDocType && <p className="mt-1 text-xs text-rose-400">This vehicle already has a document of this type.</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Document / Policy No. <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., POL-88992-X"
                  value={docForm.doc_number}
                  onChange={(e) => setDocForm({ ...docForm, doc_number: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Document Image / PDF</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) readImageFile(file, (doc_img) => setDocForm((previous) => ({ ...previous, doc_img })));
                }}
                className="block w-full text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-xs file:font-medium file:text-white hover:file:bg-slate-600"
              />
              {(docForm.doc_img || editDocument?.doc_img) && <p className="mt-1 truncate text-xs text-slate-500">A document file is attached</p>}
              {editDocument?.doc_img && !docForm.doc_img && editDocument.doc_img.match(/\.(png|jpe?g|webp|gif)(\?|$)/i) && (
                <img src={editDocument.doc_img} alt="Current document" className="mt-2 h-24 w-full rounded-md object-cover" />
              )}
            </div>

            {/* Issue Date & Expiry Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Issue Date</label>
                <input
                  type="date"
                  value={docForm.issue_date}
                  onChange={(e) => setDocForm({ ...docForm, issue_date: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Expiry Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={docForm.expiry_date}
                  onChange={(e) => setDocForm({ ...docForm, expiry_date: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Document Status */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Status</label>
              <select
                value={docForm.status}
                onChange={(e) => setDocForm({ ...docForm, status: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Valid">Valid</option>
                <option value="Expiring Soon">Expiring Soon</option>
                <option value="Expired">Expired</option>
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Notes / Authority</label>
              <input
                type="text"
                placeholder="Issued by National Insurance / RTO Kolkata..."
                value={docForm.notes}
                onChange={(e) => setDocForm({ ...docForm, notes: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <Button variant="ghost" type="button" onClick={() => setShowDocModal(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={savingDoc}>
                <Upload size={14} />
                {editDocument ? 'Update Document' : 'Save Document'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Vehicle Management</h2>
          <p className="text-slate-400 text-sm">{pagination.total} vehicles registered</p>
        </div>
        <div className="flex items-center gap-3">
          {canManageVehicleDocuments && (
            <Button variant="secondary" onClick={() => openAddDocument()}>
              <FilePlus size={14} />
              + Add Document
            </Button>
          )}
          <Button onClick={openCreate}>
            <Plus size={14} />
            Add Vehicle
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search reg. number or model..."
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'Active', label: 'Active' },
            { value: 'Inactive', label: 'Inactive' },
            { value: 'Under Maintenance', label: 'Under Maintenance' },
          ]}
          placeholder="All Statuses"
        />
      </div>

      {/* Selected Vehicle Documents Panel */}
      {selectedVehicleForDocs && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-medium">
                {selectedVehicleForDocs.registration_number} — Documents
              </h3>
              <p className="text-slate-400 text-xs">
                {selectedVehicleForDocs.company_model || 'Bus'} ({selectedVehicleForDocs.total_seats} seats)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => openAddDocument(selectedVehicleForDocs)}
              >
                <FilePlus size={14} />
                Add Document
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedVehicleForDocs(null)}>
                Close
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {(selectedVehicleForDocs.documents || []).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {selectedVehicleForDocs.documents?.map((doc: any) => (
                  <div
                    key={doc.id}
                    className="p-3 rounded-lg bg-slate-800/80 border border-slate-700 flex flex-col justify-between gap-2"
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-xs uppercase font-semibold text-indigo-400">
                        {doc.doc_type}
                      </span>
                      <StatusBadge status={doc.status} />
                    </div>
                    <div className="font-mono text-sm text-white font-medium">
                      {doc.doc_number || 'No Number'}
                    </div>
                    {doc.doc_img && (doc.doc_img.match(/\.(png|jpe?g|webp|gif)(\?|$)/i) || doc.doc_img.startsWith('data:image/')) && (
                      <img src={doc.doc_img} alt={`${doc.doc_type} document`} className="h-24 w-full rounded-md object-cover" />
                    )}
                    {doc.doc_img && !doc.doc_img.match(/\.(png|jpe?g|webp|gif)(\?|$)/i) && (
                      <a href={doc.doc_img} target="_blank" rel="noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300">
                        View attached file
                      </a>
                    )}
                    <div className="flex justify-end">
                      <Button size="sm" variant="ghost" onClick={() => openEditDocument(selectedVehicleForDocs, doc)}>
                        <Edit2 size={13} />
                      </Button>
                    </div>
                    <div className="text-xs text-slate-400 flex items-center justify-between pt-1 border-t border-slate-700/50">
                      <span>Expires:</span>
                      <span
                        className={
                          new Date(doc.expiry_date) < new Date() ? 'text-rose-400 font-bold' : 'text-slate-200'
                        }
                      >
                        {doc.expiry_date || '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-slate-500 text-sm">
                No documents uploaded yet for this vehicle.{' '}
                <button
                  onClick={() => openAddDocument(selectedVehicleForDocs)}
                  className="text-indigo-400 underline ml-1"
                >
                  Upload now
                </button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Main Vehicles Table */}
      <Card padding={false}>
        {error ? (
          <ErrorState message={error} onRetry={fetchVehicles} />
        ) : (
          <>
            <Table
              headers={HEADERS}
              loading={loading}
              empty={!loading && vehicles.length === 0}
              emptyMessage="No vehicles found"
            >
              {vehicles.map((v) => (
                <Tr key={v.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(99, 102, 241, 0.1)' }}
                      >
                        {v.vehicle_img ? (
                          <img src={v.vehicle_img} alt={v.registration_number} className="h-8 w-8 rounded-lg object-cover" />
                        ) : <FileText size={14} style={{ color: '#818cf8' }} />}
                      </div>
                      <div>
                        <div className="text-white font-medium text-sm font-mono">{v.registration_number}</div>
                        <div className="text-slate-500 text-xs">{v.company_model || '—'}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="text-xs text-slate-300 capitalize">{v.engine_type || '—'}</div>
                    <div className="text-xs text-slate-500 capitalize">{v.color || '—'}</div>
                  </Td>
                  <Td className="text-xs text-slate-300">{v.bus_type?.name || 'Standard Bus'}</Td>
                  <Td className="text-xs text-slate-300">{v.driver?.name || 'Unassigned'}</Td>
                  <Td>
                    <Badge color="blue">{v.total_seats} seats</Badge>
                  </Td>
                  <Td>
                    {canManageVehicleDocuments ? (
                      <button
                        onClick={() => setSelectedVehicleForDocs(v)}
                        className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                        title="View & Add documents"
                      >
                        <FileText size={13} />
                        <span>{v.documents?.length || 0} Docs</span>
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">Restricted</span>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={v.status} />
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {canManageVehicleDocuments && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openAddDocument(v)}
                        >
                          <FilePlus size={14} className="text-indigo-400" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEdit(v)}>
                        <Edit2 size={13} className="text-slate-300" />
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleteTarget(v)}>
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

      {/* Add / Edit Vehicle Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editVehicle ? 'Edit Vehicle' : 'Add Vehicle'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveVehicle} loading={saving}>
              {editVehicle ? 'Update' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          {!isOwner && (
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-300">Owner</label>
              <select
                value={form.owner_id}
                onChange={(e) => setForm({ ...form, owner_id: e.target.value, driver_id: '' })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">
                  {ownersLoading ? 'Loading owners...' : ownersLoadError || (owners.length ? 'Select owner' : 'No owner users found')}
                </option>
                {owners.map((owner) => (
                  <option key={owner.id} value={String(owner.id)}>{owner.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-300">Assigned Driver</label>
            <select
              value={form.driver_id}
              onChange={(e) => setForm({ ...form, driver_id: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">Unassigned</option>
              {selectableDrivers.map((driver) => (
                <option key={driver.id} value={String(driver.id)}>{driver.name}</option>
              ))}
            </select>
          </div>

          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-300">Bus Type</label>
            <select
              value={form.bus_type_id}
              onChange={(e) => setForm({ ...form, bus_type_id: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">Select a bus type</option>
              {busTypes.map((busType) => (
                <option key={busType.id} value={String(busType.id)}>{busType.name}</option>
              ))}
            </select>
          </div>

          <Input
            label="Registration Number"
            value={form.registration_number}
            onChange={(v) => setForm({ ...form, registration_number: v })}
            placeholder="WB 04 G 8812"
            required
            className="col-span-2 font-mono"
          />
          <Input
            label="Model"
            value={form.company_model}
            onChange={(v) => setForm({ ...form, company_model: v })}
            placeholder="Volvo 9400 EV"
          />
          <Input
            label="Engine Type"
            value={form.engine_type}
            onChange={(v) => setForm({ ...form, engine_type: v })}
            placeholder="Electric / CNG / Diesel"
          />
          <Input
            label="Color"
            value={form.color}
            onChange={(v) => setForm({ ...form, color: v })}
            placeholder="Midnight Blue"
          />
          <Input
            label="Total Seats"
            type="number"
            value={form.total_seats}
            onChange={(v) => setForm({ ...form, total_seats: v })}
            placeholder="24"
          />
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-300">Vehicle Photo</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) readImageFile(file, (vehicle_img) => setForm((previous) => ({ ...previous, vehicle_img })));
              }}
              className="block w-full text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-xs file:font-medium file:text-white hover:file:bg-slate-600"
            />
            {(form.vehicle_img || editVehicle?.vehicle_img) && (
              <img src={form.vehicle_img || editVehicle?.vehicle_img || ''} alt="Vehicle preview" className="mt-3 h-32 w-full rounded-lg object-cover" />
            )}
          </div>
        </div>
      </Modal>

      {/* Add Document Modal */}
      {showDocModal && renderDocModal()}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Vehicle"
        message={`Delete vehicle "${deleteTarget?.registration_number}"?`}
        loading={deleting}
      />
    </div>
  );
};
