'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

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

function SummaryCard({ label, value, accent = 'text-white', note = '' }) {
    return (
        <article className="rounded-[1.35rem] border border-white/8 bg-[#151e34] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className={`mt-3 text-2xl font-black ${accent}`}>{value}</p>
            {note ? <p className="mt-2 text-xs leading-6 text-slate-400">{note}</p> : null}
        </article>
    );
}

function StatusChip({ status }) {
    const normalizedStatus = normalizeText(status) || 'pending';
    const className = normalizedStatus === 'confirmed'
        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
        : normalizedStatus === 'cancelled'
            ? 'border-red-500/25 bg-red-500/10 text-red-300'
            : 'border-amber-500/25 bg-amber-500/10 text-amber-300';

    return (
        <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] ${className}`}>
            {normalizedStatus}
        </span>
    );
}

export default function ResellerDailySummaryPage() {
    const [batchState, setBatchState] = useState({
        loading: true,
        error: '',
        batch: null
    });
    const [submitState, setSubmitState] = useState({
        submitting: false,
        error: '',
        success: ''
    });

    useEffect(() => {
        let isDisposed = false;

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                if (!isDisposed) {
                    setBatchState({
                        loading: false,
                        error: 'Login required to load the current daily summary.',
                        batch: null
                    });
                }
                return;
            }

            try {
                if (!isDisposed) {
                    setBatchState((currentValue) => ({
                        ...currentValue,
                        loading: true,
                        error: ''
                    }));
                }

                const idToken = await currentUser.getIdToken();
                const response = await fetch('/api/reseller/settlements/current', {
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

                setBatchState({
                    loading: false,
                    error: '',
                    batch: responseData.batch || null
                });
            } catch (error) {
                if (!isDisposed) {
                    setBatchState({
                        loading: false,
                        error: error?.message || 'Failed to load the current daily summary.',
                        batch: null
                    });
                }
            }
        });

        return () => {
            isDisposed = true;
            unsubscribe();
        };
    }, []);

    const batch = batchState.batch;
    const orders = Array.isArray(batch?.orders) ? batch.orders : [];
    const totals = batch?.totals || {};
    const isSubmittedBatch = normalizeText(batch?.status) === 'submitted';
    const canSubmitBatch = orders.length > 0 && Number(totals.ordersCount || 0) > 0 && !isSubmittedBatch && !submitState.submitting;

    async function handleSubmitBatch() {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            setSubmitState({
                submitting: false,
                error: 'Login required to submit the current daily summary.',
                success: ''
            });
            return;
        }

        try {
            setSubmitState({
                submitting: true,
                error: '',
                success: ''
            });

            const idToken = await currentUser.getIdToken();
            const response = await fetch('/api/reseller/settlements/submit', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${idToken}`
                }
            });

            const responseData = await response.json().catch(() => ({}));
            if (!response.ok || responseData?.success === false) {
                throw new Error(responseData?.error || `Request failed (${response.status})`);
            }

            setBatchState((currentValue) => ({
                ...currentValue,
                batch: responseData.batch || currentValue.batch
            }));
            setSubmitState({
                submitting: false,
                error: '',
                success: 'The current daily batch was submitted successfully and is now visible to admin settlements.'
            });
        } catch (error) {
            setSubmitState({
                submitting: false,
                error: error?.message || 'Failed to submit the current daily summary.',
                success: ''
            });
        }
    }

    return (
        <section className="space-y-6">
            <div className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70">Slice 6</p>
                        <h2 className="mt-2 text-2xl font-black text-white">Daily Summary</h2>
                        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">This view groups today&apos;s reseller orders by the current settlement key and shows the live daily batch totals without adding shipping or touching public website orders.</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full border border-brandGold/20 bg-brandGold/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-brandGold">
                            <i className="fa-solid fa-calendar-day"></i>
                            {batch?.batchDateKey || 'Today'}
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-300">
                            <i className="fa-solid fa-store"></i>
                            {batch?.branchSnapshot?.label || 'Branch Pickup'}
                        </span>
                        <StatusChip status={batch?.status || 'open'} />
                    </div>
                </div>
            </div>

            {batchState.error ? (
                <div className="rounded-[1.45rem] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-200">
                    {batchState.error}
                </div>
            ) : null}

            {submitState.error ? (
                <div className="rounded-[1.45rem] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-200">
                    {submitState.error}
                </div>
            ) : null}

            {submitState.success ? (
                <div className="rounded-[1.45rem] border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm font-semibold text-emerald-200">
                    {submitState.success}
                </div>
            ) : null}

            {batchState.loading ? (
                <div className="rounded-[1.45rem] border border-white/8 bg-[#101729] px-5 py-16 text-center text-slate-400 shadow-[0_20px_44px_rgba(4,8,20,0.28)]">
                    <i className="fa-solid fa-spinner fa-spin text-3xl text-brandGold"></i>
                    <p className="mt-4 text-sm font-bold">Loading current settlement batch...</p>
                </div>
            ) : (
                <>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        <SummaryCard label="Orders Today" value={Number(totals.ordersCount || 0).toLocaleString('en-US')} note="Active orders in the current batch" />
                        <SummaryCard label="Sold Today" value={formatCurrency(totals.sold || 0)} accent="text-emerald-300" note="Customer-facing total" />
                        <SummaryCard label="Due To Admin" value={formatCurrency(totals.dueToAdmin || 0)} accent="text-brandGold" note="Wholesale total only" />
                        <SummaryCard label="Profit" value={formatCurrency(totals.profit || 0)} accent="text-sky-300" note="Sold minus wholesale" />
                        <SummaryCard label="Cancelled" value={Number(totals.cancelledOrdersCount || 0).toLocaleString('en-US')} accent="text-red-300" note="Excluded from totals" />
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)] xl:items-start">
                        <div className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brandGold/70">Batch Orders</p>
                                    <p className="mt-2 text-sm leading-7 text-slate-400">Orders below share the same settlement key for today.</p>
                                </div>

                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                                    {batch?.settlementKey || 'No key'}
                                </span>
                            </div>

                            {orders.length === 0 ? (
                                <div className="mt-6 rounded-[1.35rem] border border-white/8 bg-white/[0.03] px-5 py-16 text-center text-slate-400">
                                    <p className="text-lg font-black text-white">No reseller orders yet for today.</p>
                                    <p className="mt-2 text-sm">Create the first customer order and it will appear in this open daily batch automatically.</p>
                                    <Link href="/reseller/orders/new" className="mt-5 inline-flex items-center justify-center rounded-full border border-brandGold/30 bg-brandGold/10 px-4 py-2.5 text-sm font-black text-brandGold transition-colors hover:bg-brandGold hover:text-brandBlue">
                                        Create Customer Order
                                    </Link>
                                </div>
                            ) : (
                                <div className="mt-6 space-y-3">
                                    {orders.map((order) => (
                                        <article key={order.id} className="rounded-[1.25rem] border border-white/8 bg-[#151e34] p-4">
                                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        <p className="text-base font-black text-white">{order.orderNumber || 'Pending Ref'}</p>
                                                        <StatusChip status={order.status} />
                                                    </div>
                                                    <p className="mt-2 text-sm text-slate-400">{order.customerSnapshot?.name || 'Unknown customer'} • {order.customerSnapshot?.phone || 'No phone'}</p>
                                                    <p className="mt-1 text-xs text-slate-500">Created {formatDateTime(order.createdAtIso)}</p>
                                                </div>

                                                <div className="grid gap-2 sm:min-w-[260px] sm:grid-cols-2">
                                                    <SummaryCard label="Sold" value={formatCurrency(order?.totals?.sold || 0)} accent="text-emerald-300" />
                                                    <SummaryCard label="Profit" value={formatCurrency(order?.totals?.profit || 0)} accent="text-sky-300" />
                                                </div>
                                            </div>

                                            <div className="mt-4 flex flex-wrap gap-2">
                                                <Link href={`/reseller/orders/${order.id}`} className="inline-flex items-center justify-center rounded-full border border-brandGold/30 bg-brandGold/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-brandGold transition-colors hover:bg-brandGold hover:text-brandBlue">
                                                    View Order Details
                                                </Link>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </div>

                        <aside className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7 xl:sticky xl:top-6">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brandGold/70">Batch Status</p>
                            <div className={`mt-5 rounded-[1.25rem] border p-4 text-sm leading-7 ${isSubmittedBatch ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100' : 'border-amber-500/20 bg-amber-500/10 text-amber-100'}`}>
                                <p className={`font-black uppercase tracking-[0.18em] ${isSubmittedBatch ? 'text-emerald-300' : 'text-amber-300'}`}>{isSubmittedBatch ? 'Submitted Batch' : 'Open Batch'}</p>
                                <p className="mt-2">
                                    {isSubmittedBatch
                                        ? 'This batch is already written into resellerSettlementBatches and linked to today\'s reseller orders.'
                                        : 'Today\'s reseller orders are grouped by settlementKey and ready to be submitted into the dedicated settlement collection.'}
                                </p>
                                {batch?.submittedAtIso ? (
                                    <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-300">
                                        Submitted {formatDateTime(batch.submittedAtIso)}
                                    </p>
                                ) : null}
                            </div>

                            <div className="mt-6 grid gap-3">
                                <SummaryCard label="Units" value={Number(totals.quantity || 0).toLocaleString('en-US')} accent="text-slate-200" note="Total units in active orders" />
                                <SummaryCard label="Settlement Key" value={batch?.settlementKey || 'No key yet'} accent="text-brandGold" note="Derived from reseller id and today date" />
                            </div>

                            <button
                                type="button"
                                onClick={handleSubmitBatch}
                                disabled={!canSubmitBatch}
                                className={`mt-6 inline-flex w-full items-center justify-center rounded-[1rem] border px-4 py-3 text-sm font-black uppercase tracking-[0.16em] transition-colors ${canSubmitBatch ? 'border-brandGold/30 bg-brandGold text-brandBlue hover:bg-[#f4d67a]' : 'cursor-not-allowed border-white/10 bg-white/[0.04] text-slate-500 opacity-70'}`}
                            >
                                {submitState.submitting ? 'Submitting Batch...' : isSubmittedBatch ? 'Batch Already Submitted' : 'Submit Daily Summary'}
                            </button>
                        </aside>
                    </div>
                </>
            )}
        </section>
    );
}