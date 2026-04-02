'use client';
import { Fragment, useEffect, useRef, useState } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { parseTimestamp } from '@/lib/utils/format';
import { canSendOrderInvoice, getOrderAmount, getOrderCustomerName, getOrderCustomerPhone, getOrderDateValue, getOrderExternalRef, getOrderDcSyncState } from '@/lib/utils/admin-orders';

const ORDER_STATUS_OPTIONS = [
    { value: 'pending', label: 'Pending' },
    { value: 'processing', label: 'Processing' },
    { value: 'shipped', label: 'Shipped' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' }
];

const STATUS_STYLES = {
    pending: {
        trigger: 'border-amber-400/35 bg-amber-500/12 text-amber-300 hover:bg-amber-500/18',
        dot: 'bg-amber-300',
        menu: 'hover:bg-amber-500/12 hover:text-amber-200'
    },
    processing: {
        trigger: 'border-sky-400/35 bg-sky-500/12 text-sky-300 hover:bg-sky-500/18',
        dot: 'bg-sky-300',
        menu: 'hover:bg-sky-500/12 hover:text-sky-200'
    },
    shipped: {
        trigger: 'border-indigo-400/35 bg-indigo-500/12 text-indigo-300 hover:bg-indigo-500/18',
        dot: 'bg-indigo-300',
        menu: 'hover:bg-indigo-500/12 hover:text-indigo-200'
    },
    completed: {
        trigger: 'border-emerald-400/35 bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/18',
        dot: 'bg-emerald-300',
        menu: 'hover:bg-emerald-500/12 hover:text-emerald-200'
    },
    cancelled: {
        trigger: 'border-rose-400/35 bg-rose-500/12 text-rose-300 hover:bg-rose-500/18',
        dot: 'bg-rose-300',
        menu: 'hover:bg-rose-500/12 hover:text-rose-200'
    }
};

export default function AdminOrders() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedOrderId, setExpandedOrderId] = useState(null);
    const [syncingOrderId, setSyncingOrderId] = useState(null);
    const [openStatusMenuId, setOpenStatusMenuId] = useState(null);
    const statusMenuRef = useRef(null);

    useEffect(() => {
        const q = query(collection(db, 'orders'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let ordersData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            ordersData.sort((a, b) => new Date(getOrderDateValue(b) || 0) - new Date(getOrderDateValue(a) || 0));
            setOrders(ordersData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const handlePointerDown = (event) => {
            if (!statusMenuRef.current?.contains(event.target)) {
                setOpenStatusMenuId(null);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, []);

    const handleStatusChange = async (orderId, newStatus) => {
        try {
            const orderRef = doc(db, 'orders', orderId);
            await updateDoc(orderRef, { status: newStatus });
            setOpenStatusMenuId(null);
        } catch (error) {
            console.error('Error updating status:', error);
            alert('Failed to update status');
        }
    };

    const handleDelete = async (orderId) => {
        if (!window.confirm('Are you sure you want to delete this order?')) return;
        try {
            await deleteDoc(doc(db, 'orders', orderId));
            setExpandedOrderId((currentValue) => currentValue === orderId ? null : currentValue);
        } catch (error) {
            console.error('Error deleting order:', error);
            alert('Failed to delete order');
        }
    };

    const toggleExpandedOrder = (orderId) => {
        setExpandedOrderId((currentValue) => currentValue === orderId ? null : orderId);
    };

    const handleSendInvoice = async (orderId) => {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            alert('Authentication is required.');
            return;
        }

        setSyncingOrderId(orderId);
        try {
            const token = await currentUser.getIdToken();
            const response = await fetch('/api/integrations/online-invoices', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ orderId })
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || payload?.message || 'Failed to sync invoice');
            }
        } catch (error) {
            console.error('Invoice sync failed:', error);
            alert(error.message || 'Failed to sync invoice');
        } finally {
            setSyncingOrderId(null);
        }
    };

    const getCustomerEmail = (order) => {
        return order.customer?.email || order.customerInfo?.email || 'Not provided';
    };

    const getCustomerGovernorate = (order) => {
        return order.customer?.governorate || order.customerInfo?.governorate || order.governorate || 'Not provided';
    };

    const getCustomerRole = (order) => {
        return order.customer?.role || order.customerInfo?.role || 'customer';
    };

    const getItemUnitPrice = (item, orderType) => {
        const rawPrice = orderType === 'wholesale'
            ? item.wholesalePrice || item.wholesale_price || item.cartonPrice || item.bulkPrice || item.price
            : item.price || item.retailPrice || item.retail_price || item.salePrice || item.sellingPrice || item.wholesalePrice;

        const normalized = Number(rawPrice);
        return Number.isFinite(normalized) ? normalized : 0;
    };

    const STATUS_COLORS = {
        pending: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-500',
        processing: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-500',
        shipped: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-500',
        completed: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-500',
        cancelled: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-500'
    };

    if (loading) return <div className="rounded-[1.6rem] border border-white/8 bg-[#161f35] p-8 text-center text-slate-400">Loading orders...</div>;

    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <div className="rounded-[1.7rem] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(193,155,78,0.12),transparent_34%),linear-gradient(180deg,rgba(22,31,53,0.98),rgba(13,19,34,0.98))] px-6 py-6 shadow-[0_18px_40px_rgba(4,8,20,0.24)]">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70">Orders Control</p>
                    <h1 className="mt-2 text-[2rem] font-black text-brandGold">Orders Management</h1>
                    <p className="mt-2 text-sm text-slate-400">Open any order to inspect customer data, ordered items, pricing, and operational details.</p>
                </div>
            </div>

            <div className="overflow-hidden rounded-[1.7rem] border border-white/8 bg-[#161f35] shadow-[0_18px_40px_rgba(4,8,20,0.24)]">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/8 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 md:text-sm">
                                <th className="p-4">Order ID</th>
                                <th className="p-4">Date</th>
                                <th className="p-4">Customer</th>
                                <th className="p-4">Items</th>
                                <th className="p-4">Total</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="py-12 text-center text-slate-500">No orders found.</td>
                                </tr>
                            ) : (
                                orders.map((order) => {
                                    const isExpanded = expandedOrderId === order.id;
                                    const amount = getOrderAmount(order);
                                    const items = Array.isArray(order.items) ? order.items : [];
                                    const externalRef = getOrderExternalRef(order);
                                    const dcSyncState = getOrderDcSyncState(order);
                                    const orderTypeLabel = order.orderType === 'wholesale' ? 'Wholesale Order' : 'Retail Order';
                                    const isSyncing = syncingOrderId === order.id;
                                    const canSendInvoice = canSendOrderInvoice(order);

                                    return (
                                        <Fragment key={order.id}>
                                            <tr key={order.id} className="border-b border-white/5 transition-colors hover:bg-white/[0.03]">
                                                <td className="p-4">
                                                    <div className="flex flex-col gap-2">
                                                        <span className="font-mono text-[11px] font-semibold text-slate-300 md:text-xs">#{externalRef}</span>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${order.orderType === 'wholesale' ? 'bg-brandGold/10 text-brandGold' : 'bg-green-500/10 text-green-400'}`}>{orderTypeLabel}</span>
                                                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${dcSyncState.tone === 'success' ? 'bg-emerald-500/10 text-emerald-400' : dcSyncState.tone === 'sending' ? 'bg-blue-500/10 text-blue-400' : dcSyncState.tone === 'failed' ? 'bg-red-500/10 text-red-400' : 'bg-slate-500/10 text-slate-400'}`}>{dcSyncState.label}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-xs text-slate-400 md:text-sm">
                                                    {parseTimestamp(getOrderDateValue(order))}
                                                </td>
                                                <td className="p-4">
                                                    <div className="text-sm font-semibold text-white md:text-base">{getOrderCustomerName(order)}</div>
                                                    <div className="text-[11px] text-slate-500 md:text-xs">{getOrderCustomerPhone(order)}</div>
                                                    <div className="text-[11px] text-slate-500 md:text-xs">{getCustomerGovernorate(order)}</div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="text-sm font-medium text-white">
                                                        {order.itemCount || items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || items.length} items
                                                    </div>
                                                </td>
                                                <td className="p-4 font-bold text-white">
                                                    {amount.toLocaleString()} ج.م
                                                </td>
                                                <td className="p-4">
                                                    <div ref={openStatusMenuId === order.id ? statusMenuRef : null} className="relative inline-flex">
                                                        <button
                                                            type="button"
                                                            onClick={() => setOpenStatusMenuId((currentValue) => currentValue === order.id ? null : order.id)}
                                                            className={`inline-flex min-w-[160px] items-center justify-between gap-3 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] transition-colors md:text-xs ${STATUS_STYLES[order.status || 'pending']?.trigger || STATUS_STYLES.pending.trigger}`}
                                                            aria-haspopup="menu"
                                                            aria-expanded={openStatusMenuId === order.id}
                                                        >
                                                            <span className="flex items-center gap-2">
                                                                <span className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLES[order.status || 'pending']?.dot || STATUS_STYLES.pending.dot}`}></span>
                                                                {ORDER_STATUS_OPTIONS.find((option) => option.value === (order.status || 'pending'))?.label || 'Pending'}
                                                            </span>
                                                            <i className={`fa-solid ${openStatusMenuId === order.id ? 'fa-chevron-up' : 'fa-chevron-down'} text-[10px]`}></i>
                                                        </button>

                                                        {openStatusMenuId === order.id ? (
                                                            <div className="absolute left-0 top-[calc(100%+0.55rem)] z-30 min-w-[180px] overflow-hidden rounded-2xl border border-white/10 bg-[#10192d] p-2 shadow-[0_18px_40px_rgba(4,8,20,0.45)] backdrop-blur-xl">
                                                                {ORDER_STATUS_OPTIONS.map((option) => {
                                                                    const isActive = (order.status || 'pending') === option.value;
                                                                    const style = STATUS_STYLES[option.value] || STATUS_STYLES.pending;

                                                                    return (
                                                                        <button
                                                                            key={option.value}
                                                                            type="button"
                                                                            onClick={() => handleStatusChange(order.id, option.value)}
                                                                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.12em] transition-colors md:text-xs ${isActive ? 'bg-white/10 text-white' : `text-slate-300 ${style.menu}`}`}
                                                                        >
                                                                            <span className="flex items-center gap-2">
                                                                                <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`}></span>
                                                                                {option.label}
                                                                            </span>
                                                                            {isActive ? <i className="fa-solid fa-check text-[10px] text-brandGold"></i> : null}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSendInvoice(order.id)}
                                                            disabled={isSyncing || !canSendInvoice}
                                                            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${canSendInvoice ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white' : 'border-white/10 bg-white/5 text-slate-500'}`}
                                                        >
                                                            <i className={`fa-solid ${isSyncing ? 'fa-spinner fa-spin' : canSendInvoice ? 'fa-paper-plane' : 'fa-ban'}`}></i>
                                                            {isSyncing ? 'Sending' : canSendInvoice ? 'Send Invoice' : 'Already Sent'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleExpandedOrder(order.id)}
                                                            className="inline-flex items-center gap-2 rounded-xl border border-brandGold/20 bg-brandGold/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-brandGold transition-colors hover:bg-brandGold hover:text-brandBlue"
                                                        >
                                                            {isExpanded ? 'Hide' : 'View'}
                                                            <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDelete(order.id)}
                                                            className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/10 text-red-400 transition-colors hover:bg-red-500 hover:text-white"
                                                            title="Delete Order"
                                                        >
                                                            <i className="fa-solid fa-trash text-sm"></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr key={`${order.id}-details`} className="border-b border-white/5 bg-[#11192b]">
                                                    <td colSpan="7" className="p-5 md:p-6">
                                                        <div className="grid gap-5 xl:grid-cols-[1.1fr_1.6fr]">
                                                            <div className="space-y-4">
                                                                <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4">
                                                                    <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-brandGold">Customer Details</h3>
                                                                    <div className="space-y-2 text-sm text-slate-300">
                                                                        <p><span className="text-slate-500">Name:</span> {getOrderCustomerName(order)}</p>
                                                                        <p><span className="text-slate-500">Email:</span> {getCustomerEmail(order)}</p>
                                                                        <p><span className="text-slate-500">Phone:</span> {getOrderCustomerPhone(order) || 'Not provided'}</p>
                                                                        <p><span className="text-slate-500">Governorate:</span> {getCustomerGovernorate(order)}</p>
                                                                        <p><span className="text-slate-500">Role:</span> {getCustomerRole(order)}</p>
                                                                    </div>
                                                                </div>

                                                                <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4">
                                                                    <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-brandGold">Order Meta</h3>
                                                                    <div className="grid gap-3 sm:grid-cols-2">
                                                                        <InfoPill label="External Order Ref" value={externalRef || 'Not assigned'} />
                                                                        <InfoPill label="Order Type" value={order.orderType || 'retail'} />
                                                                        <InfoPill label="Status" value={order.status || 'pending'} />
                                                                        <InfoPill label="Items Count" value={String(order.itemCount || items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || items.length)} />
                                                                        <InfoPill label="Source" value={order.source || 'Website'} />
                                                                        <InfoPill label="Date" value={parseTimestamp(getOrderDateValue(order))} />
                                                                        <InfoPill label="Total" value={`${amount.toLocaleString()} ج.م`} />
                                                                        <InfoPill label="DC Sync" value={dcSyncState.label} />
                                                                    </div>
                                                                    {order.dcSync?.dcInvoiceId ? (
                                                                        <div className="mt-3 rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-3 py-3 text-sm text-emerald-300">
                                                                            <span className="font-black">DC Invoice ID:</span> {order.dcSync.dcInvoiceId}
                                                                        </div>
                                                                    ) : null}
                                                                    {order.dcSync?.message ? (
                                                                        <div className="mt-3 rounded-xl border border-white/8 bg-[#18223a] px-3 py-3 text-sm text-slate-300">
                                                                            <span className="font-black text-slate-400">Sync Message:</span> {order.dcSync.message}
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            </div>

                                                            <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4">
                                                                <div className="mb-4 flex items-center justify-between gap-3">
                                                                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-brandGold">Ordered Items</h3>
                                                                    <span className="rounded-full bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{items.length} lines</span>
                                                                </div>

                                                                <div className="space-y-3">
                                                                    {items.length === 0 ? (
                                                                        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-500">
                                                                            No items stored for this order.
                                                                        </div>
                                                                    ) : (
                                                                        items.map((item, index) => {
                                                                            const unitPrice = getItemUnitPrice(item, order.orderType);
                                                                            const quantity = Number(item.quantity || 1);
                                                                            const lineTotal = unitPrice * quantity;

                                                                            return (
                                                                                <div key={`${order.id}-item-${index}`} className="flex gap-4 rounded-[1.15rem] border border-white/8 bg-[#18223a] p-3.5">
                                                                                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/8 bg-white">
                                                                                        <img src={item.image || item.imageUrl || '/logo.png'} alt={item.title || item.name || 'Order item'} className="h-full w-full object-contain p-1" />
                                                                                    </div>
                                                                                    <div className="min-w-0 flex-1">
                                                                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                                                            <div>
                                                                                                <p className="text-sm font-bold text-white">{item.title || item.name || 'Unnamed Item'}</p>
                                                                                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                                                                                                    <span>Qty: {quantity}</span>
                                                                                                    {item.productCode ? <span>Code: {item.productCode}</span> : null}
                                                                                                    {item.category ? <span>Category: {item.category}</span> : null}
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="text-left md:text-right">
                                                                                                <p className="text-sm font-black text-brandGold">{lineTotal.toLocaleString()} ج.م</p>
                                                                                                <p className="text-[11px] text-slate-500">{unitPrice.toLocaleString()} × {quantity}</p>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function InfoPill({ label, value }) {
    return (
        <div className="rounded-xl border border-white/8 bg-[#18223a] px-3 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-semibold text-white">{value}</p>
        </div>
    );
}

