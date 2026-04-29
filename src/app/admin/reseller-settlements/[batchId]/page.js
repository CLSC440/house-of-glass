'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const STATUS_ACTIONS = {
    submitted: {
        nextStatus: 'invoiced',
        label: 'Mark As Invoiced',
        note: 'Confirm that this reseller batch was reviewed and invoiced by admin.'
    },
    invoiced: {
        nextStatus: 'paid',
        label: 'Mark As Paid',
        note: 'Confirm that the reseller settled this batch and no further action is pending.'
    }
};

function formatCurrency(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return '0 EGP';
    }

    return `${numericValue.toLocaleString('en-US', { maximumFractionDigits: 2 })} EGP`;
}

function formatDateTime(value) {
    if (!value) {
        return 'Unknown date';
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
        return 'Unknown date';
    }

    return parsedDate.toLocaleString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
}

function SummaryCard({ label, value, note = '', accent = 'text-white' }) {
    return (
        <article className="rounded-[1.35rem] border border-white/8 bg-[#151e34] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className={`mt-3 text-2xl font-black ${accent}`}>{value}</p>
            {note ? <p className="mt-2 text-xs leading-6 text-slate-400">{note}</p> : null}
        </article>
    );
}

function StatusChip({ status }) {
    const normalizedStatus = normalizeText(status) || 'open';
    const className = normalizedStatus === 'paid'
        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
        : normalizedStatus === 'invoiced'
            ? 'border-sky-500/25 bg-sky-500/10 text-sky-300'
        : normalizedStatus === 'submitted'
            ? 'border-brandGold/25 bg-brandGold/10 text-brandGold'
            : normalizedStatus === 'cancelled'
                ? 'border-red-500/25 bg-red-500/10 text-red-300'
                : 'border-sky-500/25 bg-sky-500/10 text-sky-300';

    return (
        <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] ${className}`}>
            {normalizedStatus}
        </span>
    );
}

export default function AdminResellerSettlementDetailPage() {
    const params = useParams();
    const batchId = String(params?.batchId || '');
    const [viewState, setViewState] = useState({
        loading: true,
        error: '',
        batch: null,
        orders: []
    });
    const [statusState, setStatusState] = useState({
        submitting: false,
        error: '',
        success: '',
        adminNotes: ''
    });

    useEffect(() => {
        let isDisposed = false;

        if (!batchId) {
            setViewState({
                loading: false,
                error: 'Batch id is required.',
                batch: null,
                orders: []
            });
            return undefined;
        }

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                if (!isDisposed) {
                    setViewState({
                        loading: false,
                        error: 'Login required to load reseller settlement details.',
                        batch: null,
                        orders: []
                    });
                }
                return;
            }

            try {
                if (!isDisposed) {
                    setViewState((currentValue) => ({
                        ...currentValue,
                        loading: true,
                        error: ''
                    }));
                }

                const idToken = await currentUser.getIdToken();
                const response = await fetch(`/api/admin/reseller-settlements/${batchId}`, {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${idToken}`
                    },
                    cache: 'no-store'
                });

                const responseData = await response.json().catch(() => ({}));
                if (!response.ok || responseData?.success === false) {
                    throw new Error(responseData?.error || `Request failed (${response.status})`);
                }

                if (isDisposed) {
                    return;
                }

                setViewState({
                    loading: false,
                    error: '',
                    batch: responseData?.batch || null,
                    orders: Array.isArray(responseData?.orders) ? responseData.orders : []
                });
                setStatusState((currentValue) => ({
                    ...currentValue,
                    adminNotes: String(responseData?.batch?.adminNotes || '')
                }));
            } catch (error) {
                if (!isDisposed) {
                    setViewState({
                        loading: false,
                        error: error?.message || 'Failed to load reseller settlement details.',
                        batch: null,
                        orders: []
                    });
                }
            }
        });

        return () => {
            isDisposed = true;
            unsubscribe();
        };
    }, [batchId]);

    const batch = viewState.batch;
    const orders = viewState.orders;
    const totals = batch?.totals || {};
    const normalizedStatus = normalizeText(batch?.status) || 'open';
    const nextAction = STATUS_ACTIONS[normalizedStatus] || null;

    async function handleStatusUpdate() {
        const currentUser = auth.currentUser;
        if (!currentUser || !batch || !nextAction) {
            return;
        }

        try {
            setStatusState((currentValue) => ({
                ...currentValue,
                submitting: true,
                error: '',
                success: ''
            }));

            const idToken = await currentUser.getIdToken();
            const response = await fetch(`/api/admin/reseller-settlements/${batch.id}`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${idToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: nextAction.nextStatus,
                    adminNotes: statusState.adminNotes
                })
            });

            const responseData = await response.json().catch(() => ({}));
            if (!response.ok || responseData?.success === false) {
                throw new Error(responseData?.error || `Request failed (${response.status})`);
            }

            setViewState((currentValue) => ({
                ...currentValue,
                batch: responseData?.batch || currentValue.batch
            }));
            setStatusState((currentValue) => ({
                ...currentValue,
                submitting: false,
                error: '',
                success: `Batch moved to ${nextAction.nextStatus}.`
            }));
        } catch (error) {
            setStatusState((currentValue) => ({
                ...currentValue,
                submitting: false,
                error: error?.message || 'Failed to update settlement batch status.',
                success: ''
            }));
        }
    }

    return (
        <section className="space-y-6">
            <div className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <Link href="/admin/reseller-settlements" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-brandGold/80 transition-colors hover:text-brandGold">
                            <i className="fa-solid fa-arrow-left"></i>
                            Back To Settlements
                        </Link>
                        <h2 className="mt-3 text-2xl font-black text-white">Reseller Settlement Batch</h2>
                        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">Batch-level read view for reseller daily submissions, ready for the next status workflow slice.</p>
                    </div>

                    {batch ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <StatusChip status={batch.status} />
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                                {batch.batchDateKey || 'No date'}
                            </span>
                        </div>
                    ) : null}
                </div>
            </div>

            {viewState.error ? (
                <div className="rounded-[1.45rem] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-200">
                    {viewState.error}
                </div>
            ) : null}

            {statusState.error ? (
                <div className="rounded-[1.45rem] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-200">
                    {statusState.error}
                </div>
            ) : null}

            {statusState.success ? (
                <div className="rounded-[1.45rem] border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm font-semibold text-emerald-200">
                    {statusState.success}
                </div>
            ) : null}

            {viewState.loading ? (
                <div className="rounded-[1.45rem] border border-white/8 bg-[#101729] px-5 py-16 text-center text-slate-400 shadow-[0_20px_44px_rgba(4,8,20,0.28)]">
                    <i className="fa-solid fa-spinner fa-spin text-3xl text-brandGold"></i>
                    <p className="mt-4 text-sm font-bold">Loading reseller settlement batch...</p>
                </div>
            ) : batch ? (
                <>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        <SummaryCard label="Orders" value={Number(totals.ordersCount || 0).toLocaleString('en-US')} note="Active orders inside this batch" />
                        <SummaryCard label="Units" value={Number(totals.quantity || 0).toLocaleString('en-US')} note="Units across active orders" />
                        <SummaryCard label="Sold" value={formatCurrency(totals.sold || 0)} accent="text-emerald-300" note="Customer-facing total" />
                        <SummaryCard label="Due To Admin" value={formatCurrency(totals.dueToAdmin || 0)} accent="text-brandGold" note="Wholesale total only" />
                        <SummaryCard label="Profit" value={formatCurrency(totals.profit || 0)} accent="text-sky-300" note="Sold minus wholesale" />
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.85fr)] xl:items-start">
                        <div className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brandGold/70">Batch Orders</p>
                                <p className="mt-2 text-sm leading-7 text-slate-400">Orders linked to this reseller settlement batch at submit time.</p>
                            </div>

                            {orders.length === 0 ? (
                                <div className="mt-6 rounded-[1.35rem] border border-white/8 bg-white/[0.03] px-5 py-16 text-center text-slate-400">
                                    <p className="text-lg font-black text-white">No orders are linked to this batch yet.</p>
                                </div>
                            ) : (
                                <div className="mt-6 space-y-3">
                                    {orders.map((order) => (
                                        <article key={order.id} className="rounded-[1.25rem] border border-white/8 bg-[#151e34] p-4">
                                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        <p className="text-base font-black text-white">{order.orderNumber || order.id}</p>
                                                        <StatusChip status={order.status} />
                                                    </div>
                                                    <p className="mt-2 text-sm text-slate-400">{order.customerSnapshot?.name || 'Unknown customer'} • {order.customerSnapshot?.phone || 'No phone'}</p>
                                                    <p className="mt-1 text-xs text-slate-500">Created {formatDateTime(order.createdAtIso)}</p>
                                                </div>

                                                <div className="grid gap-2 sm:min-w-[320px] sm:grid-cols-2">
                                                    <SummaryCard label="Sold" value={formatCurrency(order?.totals?.sold || 0)} accent="text-emerald-300" />
                                                    <SummaryCard label="Profit" value={formatCurrency(order?.totals?.profit || 0)} accent="text-sky-300" />
                                                </div>
                                            </div>

                                            <div className="mt-4 flex flex-wrap gap-2">
                                                <Link href={`/admin/reseller-settlements/${batch.id}/audit/${order.id}`} className="inline-flex items-center justify-center rounded-full border border-sky-500/25 bg-sky-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-sky-300 transition-colors hover:bg-sky-500/18">
                                                    Open Audit Details
                                                </Link>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </div>

                        <aside className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7 xl:sticky xl:top-6">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brandGold/70">Batch Meta</p>
                            <div className="mt-5 space-y-3 rounded-[1.25rem] border border-white/8 bg-[#151e34] p-4 text-sm text-slate-300">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Batch Id</p>
                                    <p className="mt-2 break-all font-semibold text-white">{batch.id}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Settlement Key</p>
                                    <p className="mt-2 break-all font-semibold text-white">{batch.settlementKey || 'No settlement key'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Reseller</p>
                                    <p className="mt-2 font-semibold text-white">{batch.resellerSnapshot?.name || 'Unknown reseller'}</p>
                                    <p className="mt-1 text-xs text-slate-400">{batch.resellerSnapshot?.email || 'No email'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Submitted</p>
                                    <p className="mt-2 font-semibold text-white">{formatDateTime(batch.submittedAtIso || batch.updatedAtIso)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Invoiced</p>
                                    <p className="mt-2 font-semibold text-white">{formatDateTime(batch.invoicedAtIso)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Paid</p>
                                    <p className="mt-2 font-semibold text-white">{formatDateTime(batch.paidAtIso)}</p>
                                </div>
                            </div>

                            <div className="mt-5 space-y-4 rounded-[1.25rem] border border-white/8 bg-[#151e34] p-4 text-sm text-slate-300">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Workflow Action</p>
                                    <p className="mt-2 leading-7 text-slate-300">{nextAction?.note || 'This batch already reached the final workflow state.'}</p>
                                </div>
                                <label className="block">
                                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Admin Notes</span>
                                    <textarea
                                        value={statusState.adminNotes}
                                        onChange={(event) => setStatusState((currentValue) => ({
                                            ...currentValue,
                                            adminNotes: event.target.value,
                                            error: '',
                                            success: ''
                                        }))}
                                        rows={4}
                                        placeholder="Optional notes about invoicing or payment follow-up"
                                        className="mt-2 w-full rounded-[1rem] border border-white/10 bg-[#0f172b] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brandGold/35"
                                    />
                                </label>
                                <button
                                    type="button"
                                    onClick={handleStatusUpdate}
                                    disabled={!nextAction || statusState.submitting}
                                    className={`inline-flex w-full items-center justify-center rounded-[1rem] border px-4 py-3 text-sm font-black uppercase tracking-[0.16em] transition-colors ${nextAction && !statusState.submitting ? 'border-brandGold/30 bg-brandGold text-brandBlue hover:bg-[#f4d67a]' : 'cursor-not-allowed border-white/10 bg-white/[0.04] text-slate-500 opacity-70'}`}
                                >
                                    {statusState.submitting ? 'Updating Batch...' : nextAction?.label || 'Workflow Complete'}
                                </button>
                            </div>
                        </aside>
                    </div>
                </>
            ) : null}
        </section>
    );
}