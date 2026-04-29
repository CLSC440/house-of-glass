'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const STATUS_FILTERS = ['all', 'pending', 'confirmed', 'cancelled'];

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

function buildOrderSearchIndex(order = {}) {
    return [
        order.orderNumber,
        order.status,
        order.customerSnapshot?.name,
        order.customerSnapshot?.phone,
        order.settlementKey,
        order.resellerSnapshot?.name,
        order.createdAtIso
    ].map((value) => normalizeText(value)).filter(Boolean).join(' ');
}

function StatCard({ label, value, accent = 'text-white' }) {
    return (
        <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className={`mt-3 text-lg font-black ${accent}`}>{value}</p>
        </div>
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

export default function ResellerOrdersPage() {
    const [ordersState, setOrdersState] = useState({
        loading: true,
        error: '',
        items: []
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const deferredSearchQuery = useDeferredValue(searchQuery);

    useEffect(() => {
        let isDisposed = false;

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                if (!isDisposed) {
                    setOrdersState({
                        loading: false,
                        error: 'Login required to load reseller orders.',
                        items: []
                    });
                }
                return;
            }

            try {
                if (!isDisposed) {
                    setOrdersState((currentValue) => ({
                        ...currentValue,
                        loading: true,
                        error: ''
                    }));
                }

                const idToken = await currentUser.getIdToken();
                const response = await fetch('/api/reseller/orders', {
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

                setOrdersState({
                    loading: false,
                    error: '',
                    items: Array.isArray(responseData.orders) ? responseData.orders : []
                });
            } catch (error) {
                if (!isDisposed) {
                    setOrdersState({
                        loading: false,
                        error: error?.message || 'Failed to load reseller orders.',
                        items: []
                    });
                }
            }
        });

        return () => {
            isDisposed = true;
            unsubscribe();
        };
    }, []);

    const filteredOrders = useMemo(() => {
        const normalizedQuery = normalizeText(deferredSearchQuery);

        return ordersState.items.filter((order) => {
            const matchesFilter = statusFilter === 'all' || normalizeText(order.status) === statusFilter;
            const matchesQuery = !normalizedQuery || buildOrderSearchIndex(order).includes(normalizedQuery);
            return matchesFilter && matchesQuery;
        });
    }, [deferredSearchQuery, ordersState.items, statusFilter]);

    const orderSummary = useMemo(() => filteredOrders.reduce((summary, order) => ({
        count: summary.count + 1,
        sold: summary.sold + Number(order?.totals?.sold || 0),
        profit: summary.profit + Number(order?.totals?.profit || 0),
        pending: summary.pending + (normalizeText(order.status) === 'pending' ? 1 : 0)
    }), {
        count: 0,
        sold: 0,
        profit: 0,
        pending: 0
    }), [filteredOrders]);

    return (
        <section className="space-y-6">
            <div className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70">Slice 5</p>
                        <h2 className="mt-2 text-2xl font-black text-white">My Reseller Orders</h2>
                        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">This screen reads only from the isolated reseller order API and shows the reseller&apos;s own customer orders without touching any website customer history.</p>
                    </div>

                    <Link href="/reseller/orders/new" className="inline-flex items-center justify-center rounded-full border border-brandGold/30 bg-brandGold/10 px-4 py-2.5 text-sm font-black text-brandGold transition-colors hover:bg-brandGold hover:text-brandBlue">
                        Create Customer Order
                    </Link>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Visible Orders" value={orderSummary.count.toLocaleString('en-US')} />
                    <StatCard label="Visible Sold" value={formatCurrency(orderSummary.sold)} accent="text-emerald-300" />
                    <StatCard label="Visible Profit" value={formatCurrency(orderSummary.profit)} accent="text-sky-300" />
                    <StatCard label="Pending Orders" value={orderSummary.pending.toLocaleString('en-US')} accent="text-amber-300" />
                </div>
            </div>

            <div className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <label className="relative block w-full xl:max-w-xl">
                        <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search by order number, customer, phone, settlement key..."
                            className="h-12 w-full rounded-[1rem] border border-white/8 bg-[#18223a] pl-12 pr-4 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brandGold/35"
                        />
                    </label>

                    <div className="flex flex-wrap gap-2">
                        {STATUS_FILTERS.map((filterKey) => {
                            const isActive = statusFilter === filterKey;
                            return (
                                <button
                                    key={filterKey}
                                    type="button"
                                    onClick={() => setStatusFilter(filterKey)}
                                    className={isActive
                                        ? 'inline-flex items-center justify-center rounded-full border border-brandGold/30 bg-brandGold/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-brandGold'
                                        : 'inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-300 transition-colors hover:border-brandGold/20 hover:text-brandGold'}
                                >
                                    {filterKey}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {ordersState.error ? (
                    <div className="mt-6 rounded-[1.45rem] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-200">
                        {ordersState.error}
                    </div>
                ) : null}

                {ordersState.loading ? (
                    <div className="mt-6 rounded-[1.45rem] border border-white/8 bg-white/[0.03] px-5 py-16 text-center text-slate-400">
                        <i className="fa-solid fa-spinner fa-spin text-3xl text-brandGold"></i>
                        <p className="mt-4 text-sm font-bold">Loading reseller orders...</p>
                    </div>
                ) : filteredOrders.length === 0 ? (
                    <div className="mt-6 rounded-[1.45rem] border border-white/8 bg-white/[0.03] px-5 py-16 text-center text-slate-400">
                        <p className="text-lg font-black text-white">No reseller orders matched this filter.</p>
                        <p className="mt-2 text-sm">Create the first customer order or clear the current search/filter.</p>
                    </div>
                ) : (
                    <div className="mt-6 space-y-4">
                        {filteredOrders.map((order) => (
                            <article key={order.id} className="rounded-[1.45rem] border border-white/8 bg-[#151e34] p-5">
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <p className="text-xl font-black text-white">{order.orderNumber || 'Pending Ref'}</p>
                                            <StatusChip status={order.status} />
                                        </div>

                                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                            <div className="rounded-[1rem] border border-white/8 bg-[#11192c] px-4 py-3">
                                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Customer</p>
                                                <p className="mt-2 text-sm font-black text-white">{order.customerSnapshot?.name || 'Unknown customer'}</p>
                                            </div>
                                            <div className="rounded-[1rem] border border-white/8 bg-[#11192c] px-4 py-3">
                                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Phone</p>
                                                <p className="mt-2 text-sm font-black text-white">{order.customerSnapshot?.phone || 'No phone'}</p>
                                            </div>
                                            <div className="rounded-[1rem] border border-white/8 bg-[#11192c] px-4 py-3">
                                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Created</p>
                                                <p className="mt-2 text-sm font-black text-white">{formatDateTime(order.createdAtIso)}</p>
                                            </div>
                                            <div className="rounded-[1rem] border border-white/8 bg-[#11192c] px-4 py-3">
                                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Settlement Key</p>
                                                <p className="mt-2 text-sm font-black text-white">{order.settlementKey || 'Pending key'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid min-w-full gap-3 sm:grid-cols-3 xl:min-w-[360px] xl:max-w-[420px]">
                                        <StatCard label="Sold" value={formatCurrency(order?.totals?.sold || 0)} accent="text-emerald-300" />
                                        <StatCard label="Profit" value={formatCurrency(order?.totals?.profit || 0)} accent="text-sky-300" />
                                        <StatCard label="Units" value={Number(order?.totals?.quantity || 0).toLocaleString('en-US')} accent="text-slate-200" />
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
        </section>
    );
}