import React, { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';
import { ownerApprovalAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, ErrorState, Input, LoadingState, Modal, Select, StatusBadge, Table, Td, Tr } from '../components/ui';
import { hasRole } from '../utils/roles';

interface OwnerApprovalRequestsPageProps {
  onNotify: (message: string, type?: any) => void;
}

const REQUEST_LABELS: Record<string, string> = {
  driver_create: 'Add driver',
  driver_update: 'Edit driver',
  vehicle_create: 'Add vehicle',
  vehicle_update: 'Edit vehicle',
  trip_assignment: 'Change trip assignment',
};

const readablePayload = (payload: Record<string, any>) => Object.entries(payload || {})
  .filter(([key, value]) => !key.endsWith('_img') && key !== 'owner_id' && value !== null && value !== '')
  .map(([key, value]) => [key.replace(/_/g, ' '), typeof value === 'object' ? JSON.stringify(value) : String(value)] as const);

export const OwnerApprovalRequestsPage: React.FC<OwnerApprovalRequestsPageProps> = ({ onNotify }) => {
  const { user } = useAuth();
  const isAdmin = hasRole(user, 'admin');
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [reviewTarget, setReviewTarget] = useState<any>(null);
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [adminNote, setAdminNote] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = isAdmin
        ? await ownerApprovalAPI.list({ ...(statusFilter ? { status: statusFilter } : {}) })
        : await ownerApprovalAPI.mine();
      setRequests(response.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Unable to load approval requests');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, statusFilter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const openReview = (request: any, nextDecision: 'approve' | 'reject') => {
    setReviewTarget(request);
    setDecision(nextDecision);
    setAdminNote('');
  };

  const submitReview = async () => {
    if (!reviewTarget) return;
    setReviewing(true);
    try {
      const response = await ownerApprovalAPI.review(reviewTarget.id, decision, adminNote);
      onNotify(response.data.message || 'Request reviewed');
      setReviewTarget(null);
      await fetchRequests();
    } catch (err: any) {
      const validationErrors = err.response?.data?.errors;
      const message = [err.response?.data?.message, ...(Array.isArray(validationErrors) ? validationErrors : [])]
        .filter(Boolean)
        .join(': ');
      onNotify(message || 'Unable to review request', 'error');
    } finally {
      setReviewing(false);
    }
  };

  const headers = isAdmin ? ['Request', 'Owner', 'Details', 'Submitted', 'Status', 'Review'] : ['Request', 'Details', 'Submitted', 'Status', 'Admin Note'];

  if (loading && requests.length === 0) return <LoadingState message="Loading approval requests..." />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{isAdmin ? 'Owner Approval Requests' : 'My Approval Requests'}</h2>
          <p className="text-sm text-slate-500">{isAdmin ? 'Review requested owner fleet changes' : 'Track changes submitted for admin approval'}</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && <Select value={statusFilter} onChange={setStatusFilter} options={[
            { value: 'pending', label: 'Pending' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
          ]} placeholder="All requests" />}
          <Button variant="secondary" size="sm" onClick={fetchRequests} title="Refresh requests"><RefreshCw size={14} /></Button>
        </div>
      </div>

      <Card padding={false}>
        {error ? <ErrorState message={error} onRetry={fetchRequests} /> : (
          <Table headers={headers} loading={loading} empty={!loading && requests.length === 0} emptyMessage="No approval requests">
            {requests.map((request) => {
              const details = readablePayload(request.payload || {});
              return (
                <Tr key={request.id}>
                  <Td>
                    <div className="font-medium text-slate-900 dark:text-white">{REQUEST_LABELS[request.request_type] || request.request_type}</div>
                    <div className="text-xs text-slate-500">Request #{request.id}{request.target_id ? ` · Item #${request.target_id}` : ''}</div>
                  </Td>
                  {isAdmin && <Td className="text-sm text-slate-700 dark:text-slate-300">{request.owner?.name || `Owner #${request.owner_id}`}</Td>}
                  <Td>
                    <div className="space-y-0.5">
                      {details.slice(0, 4).map(([key, value]) => (
                        <div key={key} className="text-xs text-slate-600 dark:text-slate-300"><span className="capitalize text-slate-400">{key}:</span> {value.length > 100 ? `${value.slice(0, 100)}...` : value}</div>
                      ))}
                      {details.length > 4 && <div className="text-xs text-slate-400">+{details.length - 4} more fields</div>}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-slate-500">{request.created_at ? new Date(request.created_at).toLocaleString() : '—'}</Td>
                  <Td><StatusBadge status={request.status} /></Td>
                  {!isAdmin && <Td className="max-w-48 text-xs text-slate-500">{request.admin_note || '—'}</Td>}
                  {isAdmin && <Td>
                    {request.status === 'pending' ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="secondary" onClick={() => openReview(request, 'approve')} title="Approve request"><Check size={14} /></Button>
                        <Button size="sm" variant="danger" onClick={() => openReview(request, 'reject')} title="Reject request"><X size={14} /></Button>
                      </div>
                    ) : <span className="text-xs text-slate-500">{request.admin_note || 'Reviewed'}</span>}
                  </Td>}
                </Tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Modal open={!!reviewTarget} onClose={() => !reviewing && setReviewTarget(null)} title={`${decision === 'approve' ? 'Approve' : 'Reject'} ${REQUEST_LABELS[reviewTarget?.request_type] || 'request'}`} size="md"
        footer={<><Button variant="ghost" onClick={() => setReviewTarget(null)} disabled={reviewing}>Cancel</Button><Button variant={decision === 'reject' ? 'danger' : 'primary'} onClick={submitReview} loading={reviewing}>{decision === 'approve' ? 'Approve and Apply' : 'Reject Request'}</Button></>}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">Owner: {reviewTarget?.owner?.name || `#${reviewTarget?.owner_id}`}</p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {readablePayload(reviewTarget?.payload || {}).map(([key, value]) => (
              <div key={key} className="min-w-0 border-b border-slate-100 dark:border-slate-800 pb-2">
                <dt className="text-[11px] uppercase text-slate-400">{key}</dt>
                <dd className="break-words text-sm text-slate-800 dark:text-slate-200">{value.length > 180 ? `${value.slice(0, 180)}...` : value}</dd>
              </div>
            ))}
          </dl>
          <Input label="Admin note (optional)" value={adminNote} onChange={setAdminNote} placeholder="Add a note for the owner" />
        </div>
      </Modal>
    </div>
  );
};