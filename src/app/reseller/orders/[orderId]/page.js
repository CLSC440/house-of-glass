/* eslint-disable @next/next/no-img-element */
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

function DetailCard({ label, value, accent = 'text-white' }) {
    return (
        <div className="rounded-[1rem] border border-white/8 bg-[#11192c] px-4 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className={`mt-2 text-sm font-black ${accent}`}>{value}</p>
        </div>
    );
}

function buildInvoiceText(order = {}) {
    const itemLines = (Array.isArray(order.items) ? order.items : []).map((item, index) => {
        const productTitle = String(item.productTitle || 'Unnamed product').trim() || 'Unnamed product';
        const variantLabel = String(item.variantLabel || '').trim();
        const title = variantLabel ? `${productTitle} / ${variantLabel}` : productTitle;

        return `${index + 1}. ${title}\n   Qty ${Number(item.quantity || 0).toLocaleString('en-US')} x ${formatCurrency(item.pricingSnapshot?.sellUnit || 0)} = ${formatCurrency(item.pricingSnapshot?.sellTotal || 0)}`;
    }).join('\n');

    const lines = [
        'House Of Glass Reseller Invoice',
        `Order: ${String(order.orderNumber || 'Pending Ref')}`,
        `Date: ${formatDateTime(order.createdAtIso)}`,
        `Customer: ${String(order.customerSnapshot?.name || 'Customer')}`,
        `Phone: ${String(order.customerSnapshot?.phone || 'No phone')}`,
        '',
        'Items:',
        itemLines || 'No items',
        '',
        `Total: ${formatCurrency(order.totals?.sold || 0)}`,
        'Fulfillment: Branch Pickup'
    ];

    const notes = String(order.customerSnapshot?.notes || '').trim();
    if (notes) {
        lines.push(`Notes: ${notes}`);
    }

    return lines.join('\n');
}

export default function ResellerOrderDetailsPage() {
    const params = useParams();
    const orderId = useMemo(() => Array.isArray(params?.orderId) ? params.orderId[0] : params?.orderId || '', [params]);
    const [orderState, setOrderState] = useState({
        loading: true,
        error: '',
        order: null
    });
    const [actionState, setActionState] = useState({
        error: '',
        success: ''
    });

    useEffect(() => {
        if (!orderId) {
            setOrderState({
                loading: false,
                error: 'Order id is missing.',
                order: null
            });
            return undefined;
        }

        let isDisposed = false;

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                if (!isDisposed) {
                    setOrderState({
                        loading: false,
                        error: 'Login required to load reseller order details.',
                        order: null
                    });
                }
                return;
            }

            try {
                if (!isDisposed) {
                    setOrderState((currentValue) => ({
                        ...currentValue,
                        loading: true,
                        error: ''
                    }));
                }

                const idToken = await currentUser.getIdToken();
                const response = await fetch(`/api/reseller/orders/${orderId}`, {
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

                setOrderState({
                    loading: false,
                    error: '',
                    order: responseData.order || null
                });
            } catch (error) {
                if (!isDisposed) {
                    setOrderState({
                        loading: false,
                        error: error?.message || 'Failed to load reseller order details.',
                        order: null
                    });
                }
            }
        });

        return () => {
            isDisposed = true;
            unsubscribe();
        };
    }, [orderId]);

    const order = orderState.order;

    const handleCopyInvoice = async () => {
        if (!order || typeof window === 'undefined') {
            return;
        }

        const invoiceText = buildInvoiceText(order);

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(invoiceText);
                setActionState({ error: '', success: 'Invoice text copied to clipboard.' });
                return;
            }

            window.prompt('Copy this invoice text:', invoiceText);
            setActionState({ error: '', success: 'Invoice text is ready to copy.' });
        } catch (error) {
            setActionState({ error: error?.message || 'Failed to copy invoice text.', success: '' });
        }
    };

    const handleShareInvoice = async () => {
        if (!order || typeof window === 'undefined') {
            return;
        }

        const invoiceText = buildInvoiceText(order);

        try {
            if (navigator.share) {
                await navigator.share({
                    title: `${order.orderNumber || 'Reseller Order'} Invoice`,
                    text: invoiceText
                });
                setActionState({ error: '', success: 'Invoice shared successfully.' });
                return;
            }

            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(invoiceText);
                setActionState({ error: '', success: 'Share text copied to clipboard.' });
                return;
            }

            window.prompt('Copy this invoice text:', invoiceText);
            setActionState({ error: '', success: 'Invoice text is ready to share.' });
        } catch (error) {
            if (error?.name === 'AbortError') {
                return;
            }

            setActionState({ error: error?.message || 'Failed to share invoice.', success: '' });
        }
    };

    const handlePrintInvoice = () => {
        if (typeof window === 'undefined') {
            return;
        }

        setActionState({ error: '', success: 'Print dialog opened.' });
        window.print();
    };

    return (
        <section className="space-y-6">
            <div className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70">Slice 5</p>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                            <h2 className="text-2xl font-black text-white">{order?.orderNumber || 'Reseller Order Details'}</h2>
                            {order ? <StatusChip status={order.status} /> : null}
                        </div>
                        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">This page reads a single order from the isolated reseller order collection and keeps the existing website customer order flow untouched.</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Link href="/reseller/orders" className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-black text-slate-200 transition-colors hover:border-brandGold/20 hover:text-brandGold">
                            Back To Orders
                        </Link>
                        <Link href="/reseller/orders/new" className="inline-flex items-center justify-center rounded-full border border-brandGold/30 bg-brandGold/10 px-4 py-2.5 text-sm font-black text-brandGold transition-colors hover:bg-brandGold hover:text-brandBlue">
                            Create Customer Order
                        </Link>
                    </div>
                </div>
            </div>

            {orderState.error ? (
                <div className="rounded-[1.45rem] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-200">
                    {orderState.error}
                </div>
            ) : null}

            {actionState.error ? (
                <div className="rounded-[1.45rem] border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-200">
                    {actionState.error}
                </div>
            ) : null}

            {actionState.success ? (
                <div className="rounded-[1.45rem] border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm font-semibold text-emerald-200">
                    {actionState.success}
                </div>
            ) : null}

            {orderState.loading ? (
                <div className="rounded-[1.45rem] border border-white/8 bg-[#101729] px-5 py-16 text-center text-slate-400 shadow-[0_20px_44px_rgba(4,8,20,0.28)]">
                    <i className="fa-solid fa-spinner fa-spin text-3xl text-brandGold"></i>
                    <p className="mt-4 text-sm font-bold">Loading reseller order details...</p>
                </div>
            ) : order ? (
                <>
                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)] xl:items-start">
                        <div className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brandGold/70">Customer Snapshot</p>
                            <div className="mt-5 grid gap-3 md:grid-cols-2">
                                <DetailCard label="Customer Name" value={order.customerSnapshot?.name || 'Unknown customer'} />
                                <DetailCard label="Customer Phone" value={order.customerSnapshot?.phone || 'No phone'} />
                                <DetailCard label="Created" value={formatDateTime(order.createdAtIso)} />
                                <DetailCard label="Settlement Key" value={order.settlementKey || 'Pending key'} />
                            </div>

                            <div className="mt-5 rounded-[1rem] border border-white/8 bg-[#11192c] px-4 py-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Notes</p>
                                <p className="mt-2 text-sm leading-7 text-slate-300">{order.customerSnapshot?.notes || 'No notes added.'}</p>
                            </div>

                            <div className="mt-6 space-y-3">
                                {(Array.isArray(order.items) ? order.items : []).map((item) => (
                                    <article key={item.lineId || `${item.productId}-${item.variantKey || 'base'}`} className="rounded-[1.25rem] border border-white/8 bg-[#151e34] p-4">
                                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="flex gap-4">
                                                <img
                                                    src={item.image || '/logo.png'}
                                                    alt={item.productTitle || 'Order item'}
                                                    className="h-20 w-20 rounded-[1rem] border border-white/8 bg-[#0f1729] object-cover"
                                                />
                                                <div>
                                                    <p className="text-base font-black text-white">{item.productTitle || 'Unnamed product'}</p>
                                                    <p className="mt-1 text-xs text-slate-500">{item.code || 'No code'}{item.variantLabel ? ` • ${item.variantLabel}` : ''}</p>
                                                    <p className="mt-2 text-xs text-slate-400">Qty {Number(item.quantity || 0).toLocaleString('en-US')}</p>
                                                </div>
                                            </div>

                                            <div className="grid gap-2 sm:min-w-[260px] sm:grid-cols-2">
                                                <DetailCard label="Sell Total" value={formatCurrency(item.pricingSnapshot?.sellTotal || 0)} accent="text-emerald-300" />
                                                <DetailCard label="Profit Total" value={formatCurrency(item.pricingSnapshot?.profitTotal || 0)} accent="text-sky-300" />
                                                <DetailCard label="Sell Unit" value={formatCurrency(item.pricingSnapshot?.sellUnit || 0)} />
                                                <DetailCard label="Wholesale Unit" value={formatCurrency(item.pricingSnapshot?.wholesaleUnit || 0)} accent="text-brandGold" />
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </div>

                        <aside className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7 xl:sticky xl:top-6">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brandGold/70">Order Totals</p>
                            <div className="mt-5 grid gap-3">
                                <DetailCard label="Sold" value={formatCurrency(order.totals?.sold || 0)} accent="text-emerald-300" />
                                <DetailCard label="Profit" value={formatCurrency(order.totals?.profit || 0)} accent="text-sky-300" />
                                <DetailCard label="Wholesale" value={formatCurrency(order.totals?.wholesale || 0)} accent="text-brandGold" />
                                <DetailCard label="Units" value={Number(order.totals?.quantity || 0).toLocaleString('en-US')} />
                            </div>

                            <div className="mt-6 grid gap-3">
                                <Link href={`/reseller/orders/new?duplicateOrderId=${order.id}`} className="inline-flex items-center justify-center rounded-[1rem] border border-brandGold/30 bg-brandGold/10 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-brandGold transition-colors hover:bg-brandGold hover:text-brandBlue">
                                    Duplicate As New Order
                                </Link>
                                <button
                                    type="button"
                                    onClick={handleCopyInvoice}
                                    className="inline-flex items-center justify-center rounded-[1rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-200 transition-colors hover:border-brandGold/20 hover:text-brandGold"
                                >
                                    Copy Customer Invoice
                                </button>
                                <button
                                    type="button"
                                    onClick={handleShareInvoice}
                                    className="inline-flex items-center justify-center rounded-[1rem] border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-sky-300 transition-colors hover:bg-sky-500/16"
                                >
                                    Share Customer Invoice
                                </button>
                                <button
                                    type="button"
                                    onClick={handlePrintInvoice}
                                    className="inline-flex items-center justify-center rounded-[1rem] border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-emerald-300 transition-colors hover:bg-emerald-500/16"
                                >
                                    Print Invoice
                                </button>
                            </div>

                            <div className="mt-6 rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4 text-sm leading-7 text-slate-400">
                                <p className="font-black uppercase tracking-[0.18em] text-brandGold">Customer Invoice Scope</p>
                                <p className="mt-2">These actions only read reseller order data and do not create, update, or expose anything inside the public website order flow.</p>
                            </div>
                        </aside>
                    </div>
                </>
            ) : null}
        </section>
    );
}