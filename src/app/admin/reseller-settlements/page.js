'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const STATUS_ACTIONS = {
    submitted: {
        nextStatus: 'invoiced',
        label: 'Mark As Invoiced',
        successMessage: 'Batch moved to invoiced.'
    },
    invoiced: {
        nextStatus: 'paid',
        label: 'Mark As Paid',
        successMessage: 'Batch moved to paid.'
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

export default function AdminResellerSettlementsPage() {
    const [filters, setFilters] = useState({
        query: '',
        status: 'all'
    });
    const [viewState, setViewState] = useState({
        loading: true,
        error: '',
        batches: []
    });
    const [statusState, setStatusState] = useState({
        submittingBatchId: '',
        error: '',
        success: ''
    });

    useEffect(() => {
        let isDisposed = false;

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                if (!isDisposed) {
                    setViewState({
                        loading: false,
                        error: 'Login required to load reseller settlement batches.',
                        batches: []
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
                const response = await fetch('/api/admin/reseller-settlements', {
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
                    batches: Array.isArray(responseData?.batches) ? responseData.batches : []
                });
            } catch (error) {
                if (!isDisposed) {
                    setViewState({
                        loading: false,
                        error: error?.message || 'Failed to load reseller settlement batches.',
                        batches: []
                    });
                }
            }
        });

        return () => {
            isDisposed = true;
            unsubscribe();
        };
    }, []);

    const filteredBatches = viewState.batches.filter((batch) => {
        const normalizedQuery = normalizeText(filters.query);
        const matchesQuery = !normalizedQuery || [
            batch.id,
            batch.batchDateKey,
            batch.settlementKey,
            batch.resellerSnapshot?.name,
            batch.resellerSnapshot?.email
        ].some((value) => normalizeText(value).includes(normalizedQuery));
        const normalizedStatus = normalizeText(batch.status) || 'open';
        const matchesStatus = filters.status === 'all' || normalizedStatus === filters.status;
        return matchesQuery && matchesStatus;
    });

    const summary = filteredBatches.reduce((result, batch) => ({
        batchesCount: result.batchesCount + 1,
        ordersCount: result.ordersCount + Number(batch?.totals?.ordersCount || 0),
        dueToAdmin: result.dueToAdmin + Number(batch?.totals?.dueToAdmin || 0),
        sold: result.sold + Number(batch?.totals?.sold || 0),
        profit: result.profit + Number(batch?.totals?.profit || 0)
    }), {
        batchesCount: 0,
        ordersCount: 0,
        dueToAdmin: 0,
        sold: 0,
        profit: 0
    });

    async function handleStatusUpdate(batch) {
        const normalizedStatus = normalizeText(batch?.status);
        const nextAction = STATUS_ACTIONS[normalizedStatus];
        const currentUser = auth.currentUser;

        if (!nextAction || !currentUser || !batch?.id) {
            return;
        }

        try {
            setStatusState({
                submittingBatchId: batch.id,
                error: '',
                success: ''
            });

            const idToken = await currentUser.getIdToken();
            const response = await fetch(`/api/admin/reseller-settlements/${batch.id}`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${idToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: nextAction.nextStatus,
                    adminNotes: batch?.adminNotes || ''
                })
            });

            const responseData = await response.json().catch(() => ({}));
            if (!response.ok || responseData?.success === false) {
                throw new Error(responseData?.error || `Request failed (${response.status})`);
            }

            setViewState((currentValue) => ({
                ...currentValue,
                batches: currentValue.batches.map((currentBatch) => currentBatch.id === batch.id
                    ? { ...currentBatch, ...(responseData?.batch || {}) }
                    : currentBatch)
            }));
            setStatusState({
                submittingBatchId: '',
                error: '',
                success: nextAction.successMessage
            });
        } catch (error) {
            setStatusState({
                submittingBatchId: '',
                error: error?.message || 'Failed to update reseller settlement status.',
                success: ''
            });
        }
    }

    return (
        <section className="space-y-6">
            <div className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70">Admin Workspace</p>
                        <h2 className="mt-2 text-2xl font-black text-white">Reseller Settlements</h2>
                        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">Review submitted reseller daily batches without touching the public orders collection or checkout flows.</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex min-w-[220px] items-center gap-3 rounded-[1rem] border border-white/8 bg-[#151e34] px-4 py-3 text-sm text-slate-300">
                            <i className="fa-solid fa-magnifying-glass text-slate-500"></i>
                            <input
                                type="search"
                                value={filters.query}
                                onChange={(event) => setFilters((currentValue) => ({
                                    ...currentValue,
                                    query: event.target.value
                                }))}
                                placeholder="Search reseller, date, key..."
                                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                            />
                        </label>

                        <label className="flex items-center gap-3 rounded-[1rem] border border-white/8 bg-[#151e34] px-4 py-3 text-sm text-slate-300">
                            <i className="fa-solid fa-filter text-slate-500"></i>
                            <select
                                value={filters.status}
                                onChange={(event) => setFilters((currentValue) => ({
                                    ...currentValue,
                                    status: event.target.value
                                }))}
                                className="w-full bg-transparent text-sm text-white outline-none"
                            >
                                <option value="all" className="bg-[#101729] text-white">All statuses</option>
                                <option value="submitted" className="bg-[#101729] text-white">Submitted</option>
                                <option value="invoiced" className="bg-[#101729] text-white">Invoiced</option>
                                <option value="open" className="bg-[#101729] text-white">Open</option>
                                <option value="paid" className="bg-[#101729] text-white">Paid</option>
                            </select>
                        </label>
                    </div>
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
                    <p className="mt-4 text-sm font-bold">Loading reseller settlement batches...</p>
                </div>
            ) : (
                <>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        <SummaryCard label="Batches" value={summary.batchesCount.toLocaleString('en-US')} note="Filtered result count" />
                        <SummaryCard label="Orders" value={summary.ordersCount.toLocaleString('en-US')} note="Orders attached to visible batches" />
                        <SummaryCard label="Sold" value={formatCurrency(summary.sold)} accent="text-emerald-300" note="Customer totals across visible batches" />
                        <SummaryCard label="Due To Admin" value={formatCurrency(summary.dueToAdmin)} accent="text-brandGold" note="Wholesale totals only" />
                        <SummaryCard label="Profit" value={formatCurrency(summary.profit)} accent="text-sky-300" note="Sold minus wholesale" />
                    </div>

                    <div className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brandGold/70">Batch Queue</p>
                                <p className="mt-2 text-sm leading-7 text-slate-400">Submitted reseller batches ready for admin review and later settlement actions.</p>
                            </div>

                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                                {filteredBatches.length.toLocaleString('en-US')} visible
                            </span>
                        </div>

                        {filteredBatches.length === 0 ? (
                            <div className="mt-6 rounded-[1.35rem] border border-white/8 bg-white/[0.03] px-5 py-16 text-center text-slate-400">
                                <p className="text-lg font-black text-white">No reseller batches matched the current filters.</p>
                                <p className="mt-2 text-sm">Submitted reseller daily summaries will appear here automatically.</p>
                            </div>
                        ) : (
                            <div className="mt-6 space-y-3">
                                {filteredBatches.map((batch) => {
                                    const normalizedStatus = normalizeText(batch.status);
                                    const nextAction = STATUS_ACTIONS[normalizedStatus] || null;
                                    const isSubmitting = statusState.submittingBatchId === batch.id;

                                    return (
                                        <article key={batch.id} className="rounded-[1.25rem] border border-white/8 bg-[#151e34] p-4">
                                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        <p className="text-base font-black text-white">{batch.resellerSnapshot?.name || 'Unknown reseller'}</p>
                                                        <StatusChip status={batch.status} />
                                                    </div>
                                                    <p className="mt-2 text-sm text-slate-400">{batch.resellerSnapshot?.email || 'No email'} • {batch.batchDateKey || 'No batch date'}</p>
                                                    <p className="mt-1 text-xs text-slate-500">Submitted {formatDateTime(batch.submittedAtIso || batch.updatedAtIso)}</p>
                                                    <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{batch.id}</p>
                                                </div>

                                                <div className="grid gap-2 sm:min-w-[320px] sm:grid-cols-2">
                                                    <SummaryCard label="Orders" value={Number(batch?.totals?.ordersCount || 0).toLocaleString('en-US')} />
                                                    <SummaryCard label="Due To Admin" value={formatCurrency(batch?.totals?.dueToAdmin || 0)} accent="text-brandGold" />
                                                </div>
                                            </div>

                                            <div className="mt-4 flex flex-wrap gap-2">
                                                <Link href={`/admin/reseller-settlements/${batch.id}`} className="inline-flex items-center justify-center rounded-full border border-brandGold/30 bg-brandGold/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-brandGold transition-colors hover:bg-brandGold hover:text-brandBlue">
                                                    Open Batch Details
                                                </Link>
                                                {nextAction ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleStatusUpdate(batch)}
                                                        disabled={isSubmitting}
                                                        className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.18em] transition-colors ${isSubmitting ? 'cursor-wait border-white/10 bg-white/[0.04] text-slate-500 opacity-70' : 'border-sky-500/25 bg-sky-500/10 text-sky-300 hover:bg-sky-500/18'}`}
                                                    >
                                                        {isSubmitting ? 'Updating...' : nextAction.label}
                                                    </button>
                                                ) : normalizedStatus === 'paid' ? (
                                                    <span className="inline-flex items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-300">
                                                        Workflow Complete
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                                                        Waiting For Reseller Submit
                                                    </span>
                                                )}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </section>
    );
}