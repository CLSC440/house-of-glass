'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
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

function DetailCard({ label, value, accent = 'text-white' }) {
    return (
        <div className="rounded-[1rem] border border-white/8 bg-[#11192c] px-4 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className={`mt-2 text-sm font-black ${accent}`}>{value}</p>
        </div>
    );
}

function StatusChip({ status }) {
    const normalizedStatus = normalizeText(status) || 'pending';
    const className = normalizedStatus === 'paid'
        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
        : normalizedStatus === 'invoiced'
            ? 'border-sky-500/25 bg-sky-500/10 text-sky-300'
            : normalizedStatus === 'submitted'
                ? 'border-brandGold/25 bg-brandGold/10 text-brandGold'
                : normalizedStatus === 'confirmed'
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

export default function AdminResellerSettlementAuditPage() {
    const params = useParams();
    const batchId = useMemo(() => String(params?.batchId || ''), [params]);
    const orderId = useMemo(() => String(params?.orderId || ''), [params]);
    const [viewState, setViewState] = useState({
        loading: true,
        error: '',
        batch: null,
        order: null
    });

    useEffect(() => {
        let isDisposed = false;

        if (!batchId || !orderId) {
            setViewState({
                loading: false,
                error: 'Batch id and order id are required.',
                batch: null,
                order: null
            });
            return undefined;
        }

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                if (!isDisposed) {
                    setViewState({
                        loading: false,
                        error: 'Login required to load reseller audit details.',
                        batch: null,
                        order: null
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
                const response = await fetch(`/api/admin/reseller-settlements/${batchId}/audit/${orderId}`, {
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
                    order: responseData?.order || null
                });
            } catch (error) {
                if (!isDisposed) {
                    setViewState({
                        loading: false,
                        error: error?.message || 'Failed to load reseller audit details.',
                        batch: null,
                        order: null
                    });
                }
            }
        });

        return () => {
            isDisposed = true;
            unsubscribe();
        };
    }, [batchId, orderId]);

    const batch = viewState.batch;
    const order = viewState.order;
    const orderItems = Array.isArray(order?.items) ? order.items : [];
    const orderHistory = Array.isArray(order?.statusHistory) ? order.statusHistory : [];

    return (
        <section className="space-y-6">
            <div className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <Link href={`/admin/reseller-settlements/${batchId}`} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-brandGold/80 transition-colors hover:text-brandGold">
                            <i className="fa-solid fa-arrow-left"></i>
                            Back To Batch Details
                        </Link>
                        <h2 className="mt-3 text-2xl font-black text-white">Hidden Audit Drill-Down</h2>
                        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">This admin-only view exposes customer-level and line-level reseller order data for disputes, reviews, and settlement checks only.</p>
                    </div>

                    {order ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <StatusChip status={batch?.status || 'submitted'} />
                            <StatusChip status={order.status} />
                        </div>
                    ) : null}
                </div>
            </div>

            {viewState.error ? (
                <div className="rounded-[1.45rem] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-200">
                    {viewState.error}
                </div>
            ) : null}

            {viewState.loading ? (
                <div className="rounded-[1.45rem] border border-white/8 bg-[#101729] px-5 py-16 text-center text-slate-400 shadow-[0_20px_44px_rgba(4,8,20,0.28)]">
                    <i className="fa-solid fa-spinner fa-spin text-3xl text-brandGold"></i>
                    <p className="mt-4 text-sm font-bold">Loading reseller audit details...</p>
                </div>
            ) : batch && order ? (
                <>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        <DetailCard label="Order Number" value={order.orderNumber || order.id} />
                        <DetailCard label="Customer" value={order.customerSnapshot?.name || 'Unknown customer'} />
                        <DetailCard label="Sold" value={formatCurrency(order.totals?.sold || 0)} accent="text-emerald-300" />
                        <DetailCard label="Wholesale" value={formatCurrency(order.totals?.wholesale || 0)} accent="text-brandGold" />
                        <DetailCard label="Profit" value={formatCurrency(order.totals?.profit || 0)} accent="text-sky-300" />
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)] xl:items-start">
                        <div className="space-y-6">
                            <div className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brandGold/70">Customer Snapshot</p>
                                <div className="mt-5 grid gap-3 md:grid-cols-2">
                                    <DetailCard label="Customer Name" value={order.customerSnapshot?.name || 'Unknown customer'} />
                                    <DetailCard label="Customer Phone" value={order.customerSnapshot?.phone || 'No phone'} />
                                    <DetailCard label="Order Created" value={formatDateTime(order.createdAtIso)} />
                                    <DetailCard label="Settlement Key" value={order.settlementKey || 'No settlement key'} />
                                </div>

                                <div className="mt-5 rounded-[1rem] border border-white/8 bg-[#11192c] px-4 py-4">
                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Order Notes</p>
                                    <p className="mt-2 text-sm leading-7 text-slate-300">{order.customerSnapshot?.notes || 'No notes added.'}</p>
                                </div>
                            </div>

                            <div className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brandGold/70">Line Items Audit</p>
                                <p className="mt-2 text-sm leading-7 text-slate-400">Immutable pricing snapshots captured when the reseller order was created.</p>

                                <div className="mt-6 space-y-3">
                                    {orderItems.map((item) => (
                                        <article key={item.lineId || `${item.productId}-${item.variantKey || 'base'}`} className="rounded-[1.25rem] border border-white/8 bg-[#151e34] p-4">
                                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                                <div>
                                                    <p className="text-base font-black text-white">{item.productTitle || 'Unnamed product'}</p>
                                                    <p className="mt-1 text-xs text-slate-500">{item.code || 'No code'}{item.variantLabel ? ` • ${item.variantLabel}` : ''}</p>
                                                    <p className="mt-2 text-xs text-slate-400">Category: {item.category || 'Uncategorized'} • Qty {Number(item.quantity || 0).toLocaleString('en-US')}</p>
                                                </div>

                                                <div className="grid gap-2 sm:min-w-[320px] sm:grid-cols-2">
                                                    <DetailCard label="Wholesale Unit" value={formatCurrency(item.pricingSnapshot?.wholesaleUnit || 0)} accent="text-brandGold" />
                                                    <DetailCard label="Public Unit" value={formatCurrency(item.pricingSnapshot?.publicUnit || 0)} />
                                                    <DetailCard label="Sell Unit" value={formatCurrency(item.pricingSnapshot?.sellUnit || 0)} accent="text-emerald-300" />
                                                    <DetailCard label="Profit Unit" value={formatCurrency(item.pricingSnapshot?.profitUnit || 0)} accent="text-sky-300" />
                                                    <DetailCard label="Sell Total" value={formatCurrency(item.pricingSnapshot?.sellTotal || 0)} accent="text-emerald-300" />
                                                    <DetailCard label="Profit Total" value={formatCurrency(item.pricingSnapshot?.profitTotal || 0)} accent="text-sky-300" />
                                                </div>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <aside className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7 xl:sticky xl:top-6">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brandGold/70">Audit Meta</p>
                            <div className="mt-5 space-y-3 rounded-[1.25rem] border border-white/8 bg-[#151e34] p-4 text-sm text-slate-300">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Batch Id</p>
                                    <p className="mt-2 break-all font-semibold text-white">{batch.id}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Order Id</p>
                                    <p className="mt-2 break-all font-semibold text-white">{order.id}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Reseller</p>
                                    <p className="mt-2 font-semibold text-white">{batch.resellerSnapshot?.name || 'Unknown reseller'}</p>
                                    <p className="mt-1 text-xs text-slate-400">{batch.resellerSnapshot?.email || 'No email'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Created By</p>
                                    <p className="mt-2 font-semibold text-white">{order.createdByUid || 'Unknown user'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Last Edited By</p>
                                    <p className="mt-2 font-semibold text-white">{order.lastEditedByUid || 'Unknown user'}</p>
                                </div>
                            </div>

                            <div className="mt-5 rounded-[1.25rem] border border-white/8 bg-[#151e34] p-4 text-sm text-slate-300">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Status History</p>
                                {orderHistory.length === 0 ? (
                                    <p className="mt-3 text-sm text-slate-400">No status history was stored for this order.</p>
                                ) : (
                                    <div className="mt-4 space-y-3">
                                        {orderHistory.map((entry, index) => (
                                            <article key={`${entry.status}-${entry.at || index}`} className="rounded-[1rem] border border-white/8 bg-[#11192c] px-4 py-4">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <StatusChip status={entry.status} />
                                                    <p className="text-xs font-semibold text-slate-400">{formatDateTime(entry.at)}</p>
                                                </div>
                                                <p className="mt-3 text-sm font-black text-white">{entry.label || entry.status}</p>
                                                <p className="mt-2 text-sm leading-7 text-slate-400">{entry.description || 'No description recorded.'}</p>
                                                {entry.updatedBy?.email ? <p className="mt-2 text-xs text-slate-500">Updated by {entry.updatedBy.email}</p> : null}
                                                {entry.note ? <p className="mt-2 text-xs text-slate-500">Note: {entry.note}</p> : null}
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </aside>
                    </div>
                </>
            ) : null}
        </section>
    );
}