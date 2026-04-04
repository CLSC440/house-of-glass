'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { addDoc, collection, query, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useGallery } from '@/contexts/GalleryContext';
import { parseTimestamp } from '@/lib/utils/format';
import { canSendOrderInvoice, getOrderAmount, getOrderCustomerName, getOrderCustomerPhone, getOrderDateValue, getOrderExternalRef, getOrderDcSyncState } from '@/lib/utils/admin-orders';
import { ORDER_STATUS_OPTIONS, appendOrderStatusHistory, getAllowedOrderStatusTransitions, getOrderStatusHistory, getOrderStatusMeta, normalizeOrderStatus } from '@/lib/utils/order-status';
import { buildOrderStatusNotification } from '@/lib/utils/notifications';

const STATUS_STYLES = {
    pending: {
        trigger: 'border-amber-400/35 bg-amber-500/12 text-amber-300 hover:bg-amber-500/18',
        dot: 'bg-amber-300',
        menu: 'hover:bg-amber-500/12 hover:text-amber-200'
    },
    confirmed: {
        trigger: 'border-sky-400/35 bg-sky-500/12 text-sky-300 hover:bg-sky-500/18',
        dot: 'bg-sky-300',
        menu: 'hover:bg-sky-500/12 hover:text-sky-200'
    },
    completed: {
        trigger: 'border-emerald-400/35 bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/18',
        dot: 'bg-emerald-300',
        menu: 'hover:bg-emerald-500/12 hover:text-emerald-200'
    },
    received: {
        trigger: 'border-teal-400/35 bg-teal-500/12 text-teal-300 hover:bg-teal-500/18',
        dot: 'bg-teal-300',
        menu: 'hover:bg-teal-500/12 hover:text-teal-200'
    },
    cancelled: {
        trigger: 'border-rose-400/35 bg-rose-500/12 text-rose-300 hover:bg-rose-500/18',
        dot: 'bg-rose-300',
        menu: 'hover:bg-rose-500/12 hover:text-rose-200'
    }
};

function getCustomerEmail(order) {
    return order.customer?.email || order.customerInfo?.email || 'Not provided';
}

function getCustomerGovernorate(order) {
    return order.customer?.governorate || order.customerInfo?.governorate || order.governorate || 'Not provided';
}

function getCustomerRole(order) {
    return order.customer?.role || order.customerInfo?.role || 'customer';
}

function getItemUnitPrice(item, orderType) {
    const rawPrice = orderType === 'wholesale'
        ? item.wholesalePrice || item.wholesale_price || item.cartonPrice || item.bulkPrice || item.price
        : item.price || item.retailPrice || item.retail_price || item.salePrice || item.sellingPrice || item.wholesalePrice;

    const normalized = Number(rawPrice);
    return Number.isFinite(normalized) ? normalized : 0;
}

function normalizeLookupValue(value) {
    return String(value || '').trim().toLowerCase();
}

function getNumericValue(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function getItemTitle(item = {}) {
    return item.title || item.name || item.variantLabel || 'Unnamed Item';
}

function getProductCode(product = {}) {
    return product.code || product.barcode || product.productCode || product.sku || product.itemCode || '';
}

function getProductImage(product = {}) {
    return product.image || product.imageUrl || product.url || product.images?.[0] || '/logo.png';
}

function getProductName(product = {}) {
    return product.title || product.name || 'Unnamed Product';
}

function buildCatalogEntries(products = []) {
    const entries = [];

    (Array.isArray(products) ? products : []).forEach((product) => {
        const productName = getProductName(product);
        const productCode = getProductCode(product);
        const productRetailPrice = getItemUnitPrice(product, 'retail');
        const productWholesalePrice = getItemUnitPrice(product, 'wholesale');

        entries.push({
            key: `product:${product.id}`,
            label: `${productName}${productCode ? ` | ${productCode}` : ''}`,
            productId: product.id,
            productCode,
            title: productName,
            name: productName,
            image: getProductImage(product),
            category: product.category || '',
            variantLabel: '',
            retailPrice: productRetailPrice,
            wholesalePrice: productWholesalePrice
        });

        (Array.isArray(product.variants) ? product.variants : []).forEach((variant, index) => {
            const variantLabel = variant.name || variant.label || `Variant ${index + 1}`;
            const variantCode = getProductCode(variant) || productCode;
            const variantRetailPrice = getItemUnitPrice(variant, 'retail') || productRetailPrice;
            const variantWholesalePrice = getItemUnitPrice(variant, 'wholesale') || productWholesalePrice;

            entries.push({
                key: `variant:${product.id}:${index}`,
                label: `${productName} / ${variantLabel}${variantCode ? ` | ${variantCode}` : ''}`,
                productId: product.id,
                productCode: variantCode,
                title: variantLabel,
                name: variantLabel,
                image: getProductImage(variant) || getProductImage(product),
                category: variant.category || product.category || '',
                variantLabel,
                retailPrice: variantRetailPrice,
                wholesalePrice: variantWholesalePrice
            });
        });
    });

    return entries;
}

function getCatalogEntryPrice(entry, orderType) {
    if (!entry) return 0;
    return orderType === 'wholesale'
        ? getNumericValue(entry.wholesalePrice, 0)
        : getNumericValue(entry.retailPrice, 0);
}

function findCatalogEntryForItem(item, catalogEntries = []) {
    const itemCodes = [
        item.productCode,
        item.barcode,
        item.code,
        item.productId
    ].map(normalizeLookupValue).filter(Boolean);
    const itemLabels = [
        item.title,
        item.name,
        item.variantLabel,
        item.variantName,
        item.variant
    ].map(normalizeLookupValue).filter(Boolean);

    return catalogEntries.find((entry) => {
        const entryCode = normalizeLookupValue(entry.productCode);
        const entryProductId = normalizeLookupValue(entry.productId);
        const entryTitle = normalizeLookupValue(entry.title);
        const entryLabel = normalizeLookupValue(entry.label);
        const entryVariantLabel = normalizeLookupValue(entry.variantLabel);

        return itemCodes.includes(entryCode)
            || itemCodes.includes(entryProductId)
            || itemLabels.includes(entryTitle)
            || itemLabels.includes(entryLabel)
            || (entryVariantLabel && itemLabels.includes(entryVariantLabel));
    }) || null;
}

function buildEditableItemFromCatalogEntry(entry, orderType = 'retail', existingItem = {}) {
    const price = getCatalogEntryPrice(entry, orderType);
    const quantity = Math.max(1, getNumericValue(existingItem.quantity, 1));

    return {
        id: existingItem.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        productSearch: entry?.label || existingItem.productSearch || '',
        selectionKey: entry?.key || existingItem.selectionKey || '',
        productId: entry?.productId || existingItem.productId || '',
        productCode: entry?.productCode || existingItem.productCode || '',
        title: entry?.title || existingItem.title || existingItem.name || '',
        name: entry?.name || existingItem.name || existingItem.title || '',
        image: entry?.image || existingItem.image || existingItem.imageUrl || '/logo.png',
        category: entry?.category || existingItem.category || '',
        variantLabel: entry?.variantLabel || existingItem.variantLabel || existingItem.variantName || existingItem.variant || '',
        quantity,
        price: getNumericValue(existingItem.price, price),
        wholesalePrice: getNumericValue(existingItem.wholesalePrice, entry?.wholesalePrice || price)
    };
}

function buildEditableItem(item, orderType, catalogEntries, index) {
    const matchedEntry = findCatalogEntryForItem(item, catalogEntries);
    const fallbackPrice = orderType === 'wholesale'
        ? getNumericValue(item.wholesalePrice, getNumericValue(item.price, 0))
        : getNumericValue(item.price, 0);

    return {
        id: item.id || `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
        productSearch: matchedEntry?.label || item.title || item.name || item.productCode || '',
        selectionKey: matchedEntry?.key || '',
        productId: item.productId || matchedEntry?.productId || '',
        productCode: item.productCode || item.barcode || item.code || matchedEntry?.productCode || '',
        title: item.title || item.name || matchedEntry?.title || '',
        name: item.name || item.title || matchedEntry?.name || '',
        image: item.image || item.imageUrl || matchedEntry?.image || '/logo.png',
        category: item.category || matchedEntry?.category || '',
        variantLabel: item.variantLabel || item.variantName || item.variant || matchedEntry?.variantLabel || '',
        quantity: Math.max(1, getNumericValue(item.quantity, 1)),
        price: fallbackPrice,
        wholesalePrice: getNumericValue(item.wholesalePrice, matchedEntry?.wholesalePrice || fallbackPrice)
    };
}

function buildEditForm(order, catalogEntries) {
    return {
        customerName: getOrderCustomerName(order),
        customerEmail: getCustomerEmail(order),
        customerPhone: getOrderCustomerPhone(order) || '',
        orderType: order.orderType || 'retail',
        status: normalizeOrderStatus(order.status),
        items: (Array.isArray(order.items) ? order.items : []).map((item, index) => buildEditableItem(item, order.orderType || 'retail', catalogEntries, index))
    };
}

function sanitizeEditedItems(items, orderType) {
    return (Array.isArray(items) ? items : [])
        .filter((item) => item && (item.title || item.name || item.productCode))
        .map((item) => {
            const quantity = Math.max(1, getNumericValue(item.quantity, 1));
            const price = Math.max(0, getNumericValue(item.price, 0));
            const baseItem = {
                productId: item.productId || '',
                productCode: item.productCode || '',
                name: item.name || item.title || 'Unnamed Item',
                title: item.title || item.name || 'Unnamed Item',
                quantity,
                price,
                image: item.image || '/logo.png',
                category: item.category || ''
            };

            if (item.variantLabel) {
                baseItem.variantLabel = item.variantLabel;
            }

            if (orderType === 'wholesale') {
                baseItem.wholesalePrice = price;
            }

            return baseItem;
        });
}

function computeOrderItemCount(items = []) {
    return items.reduce((sum, item) => sum + Math.max(1, getNumericValue(item.quantity, 1)), 0);
}

function computeOrderTotal(items = []) {
    return items.reduce((sum, item) => sum + (Math.max(1, getNumericValue(item.quantity, 1)) * Math.max(0, getNumericValue(item.price, 0))), 0);
}

function getInvoiceButtonLabel({ isSyncing, canSendInvoice, dcSyncState, normalizedStatus }) {
    if (isSyncing || dcSyncState.tone === 'sending') return 'Sending';
    if (canSendInvoice) return dcSyncState.tone === 'failed' ? 'Retry Invoice' : 'Send Invoice';
    if (dcSyncState.tone === 'success') return 'Already Sent';
    if (normalizedStatus === 'pending') return 'Confirm First';
    if (normalizedStatus === 'completed') return 'Stage Closed';
    if (normalizedStatus === 'received') return 'Received';
    if (normalizedStatus === 'cancelled') return 'Cancelled';
    return 'Unavailable';
}

export default function AdminOrders() {
    const searchParams = useSearchParams();
    const { allProducts } = useGallery();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedOrderId, setExpandedOrderId] = useState(null);
    const [syncingOrderId, setSyncingOrderId] = useState(null);
    const [openStatusMenuId, setOpenStatusMenuId] = useState(null);
    const [editingOrder, setEditingOrder] = useState(null);
    const [editingForm, setEditingForm] = useState(null);
    const [isSavingOrder, setIsSavingOrder] = useState(false);
    const statusMenuRef = useRef(null);
    const catalogEntries = useMemo(() => buildCatalogEntries(allProducts), [allProducts]);
    const targetedOrderId = String(searchParams.get('orderId') || '').trim();

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

    useEffect(() => {
        if (!targetedOrderId || orders.length === 0) {
            return undefined;
        }

        const orderExists = orders.some((order) => order.id === targetedOrderId);
        if (!orderExists) {
            return undefined;
        }

        setExpandedOrderId(targetedOrderId);

        const timeoutId = window.setTimeout(() => {
            const orderRowElement = document.getElementById(`order-row-${targetedOrderId}`);
            orderRowElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 180);

        return () => window.clearTimeout(timeoutId);
    }, [orders, targetedOrderId]);

    const handleStatusChange = async (order, newStatus) => {
        try {
            if (!order?.id) return;
            if ((order.status || 'pending') === newStatus) {
                setOpenStatusMenuId(null);
                return;
            }

            const changedAt = new Date().toISOString();
            const currentUser = auth.currentUser;
            const orderRef = doc(db, 'orders', order.id);
            const nextHistory = appendOrderStatusHistory(getOrderStatusHistory(order), newStatus, {
                at: changedAt,
                updatedBy: currentUser ? {
                    uid: currentUser.uid,
                    email: currentUser.email || ''
                } : undefined
            });

            await updateDoc(orderRef, {
                status: newStatus,
                statusUpdatedAt: changedAt,
                statusHistory: nextHistory
            });

            const notificationPayload = buildOrderStatusNotification(order, newStatus);
            if (notificationPayload && currentUser) {
                try {
                    const token = await currentUser.getIdToken();
                    const response = await fetch('/api/notifications/order-status', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            orderId: order.id,
                            status: newStatus
                        })
                    });

                    if (!response.ok) {
                        const errorPayload = await response.json().catch(() => ({}));
                        throw new Error(errorPayload?.error || 'Failed to send notification');
                    }
                } catch (notificationError) {
                    console.error('Failed to send notification:', notificationError);
                }
            }

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

    const handleOpenEditOrder = (order) => {
        setEditingOrder(order);
        setEditingForm(buildEditForm(order, catalogEntries));
    };

    const handleCloseEditOrder = () => {
        if (isSavingOrder) return;
        setEditingOrder(null);
        setEditingForm(null);
    };

    const updateEditingForm = (field, value) => {
        setEditingForm((currentValue) => {
            if (!currentValue) return currentValue;

            if (field === 'orderType') {
                return {
                    ...currentValue,
                    orderType: value,
                    items: currentValue.items.map((item) => {
                        const matchedEntry = catalogEntries.find((entry) => entry.key === item.selectionKey) || findCatalogEntryForItem(item, catalogEntries);
                        if (!matchedEntry) return item;
                        return {
                            ...item,
                            price: getCatalogEntryPrice(matchedEntry, value) || item.price,
                            wholesalePrice: getNumericValue(matchedEntry.wholesalePrice, item.wholesalePrice)
                        };
                    })
                };
            }

            return { ...currentValue, [field]: value };
        });
    };

    const updateEditingItem = (itemId, field, value) => {
        setEditingForm((currentValue) => {
            if (!currentValue) return currentValue;
            return {
                ...currentValue,
                items: currentValue.items.map((item) => item.id === itemId ? { ...item, [field]: value } : item)
            };
        });
    };

    const handleCatalogItemChange = (itemId, selectionKey) => {
        setEditingForm((currentValue) => {
            if (!currentValue) return currentValue;
            const matchedEntry = catalogEntries.find((entry) => entry.key === selectionKey);
            if (!matchedEntry) return currentValue;

            return {
                ...currentValue,
                items: currentValue.items.map((item) => item.id === itemId
                    ? buildEditableItemFromCatalogEntry(matchedEntry, currentValue.orderType, item)
                    : item)
            };
        });
    };

    const handleAddOrderItem = () => {
        setEditingForm((currentValue) => {
            if (!currentValue) return currentValue;
            return {
                ...currentValue,
                items: [
                    ...currentValue.items,
                    buildEditableItemFromCatalogEntry(catalogEntries[0] || null, currentValue.orderType, {})
                ]
            };
        });
    };

    const handleRemoveOrderItem = (itemId) => {
        setEditingForm((currentValue) => {
            if (!currentValue) return currentValue;
            return {
                ...currentValue,
                items: currentValue.items.filter((item) => item.id !== itemId)
            };
        });
    };

    const handleSaveOrder = async () => {
        if (!editingOrder?.id || !editingForm) return;

        const sanitizedItems = sanitizeEditedItems(editingForm.items, editingForm.orderType);
        if (sanitizedItems.length === 0) {
            alert('Add at least one product to the order.');
            return;
        }

        const changedAt = new Date().toISOString();
        const currentUser = auth.currentUser;
        const statusChanged = normalizeOrderStatus(editingOrder.status) !== editingForm.status;
        const nextHistory = statusChanged
            ? appendOrderStatusHistory(getOrderStatusHistory(editingOrder), editingForm.status, {
                at: changedAt,
                updatedBy: currentUser ? {
                    uid: currentUser.uid,
                    email: currentUser.email || ''
                } : undefined
            })
            : getOrderStatusHistory(editingOrder);

        const updatePayload = {
            customer: {
                ...(editingOrder.customer || {}),
                name: editingForm.customerName,
                email: editingForm.customerEmail,
                phone: editingForm.customerPhone
            },
            customerInfo: {
                ...(editingOrder.customerInfo || {}),
                fullName: editingForm.customerName,
                name: editingForm.customerName,
                email: editingForm.customerEmail,
                phone: editingForm.customerPhone
            },
            orderType: editingForm.orderType,
            items: sanitizedItems,
            itemCount: computeOrderItemCount(sanitizedItems),
            totalPrice: computeOrderTotal(sanitizedItems),
            updatedAt: changedAt
        };

        if (statusChanged) {
            updatePayload.status = editingForm.status;
            updatePayload.statusUpdatedAt = changedAt;
            updatePayload.statusHistory = nextHistory;
        }

        if (editingOrder.dcSync?.status) {
            updatePayload.dcSync = {
                status: 'idle',
                message: 'Order updated by admin. Resend invoice to DC.',
                updatedAt: changedAt
            };
        }

        setIsSavingOrder(true);
        try {
            await updateDoc(doc(db, 'orders', editingOrder.id), updatePayload);
            handleCloseEditOrder();
        } catch (error) {
            console.error('Failed to save order changes:', error);
            alert('Failed to save order changes');
        } finally {
            setIsSavingOrder(false);
        }
    };

    const handleResendInvoice = async () => {
        if (!editingOrder?.id) return;
        await handleSendInvoice(editingOrder.id);
    };

    if (loading) return <div className="rounded-[1.6rem] border border-white/8 bg-[#161f35] p-8 text-center text-slate-400">Loading orders...</div>;

    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <div className="rounded-[1.7rem] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(193,155,78,0.12),transparent_34%),linear-gradient(180deg,rgba(22,31,53,0.98),rgba(13,19,34,0.98))] px-6 py-6 shadow-[0_18px_40px_rgba(4,8,20,0.24)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70">Orders Control</p>
                        <h1 className="mt-2 text-[2rem] font-black text-brandGold">Orders Management</h1>
                        <p className="mt-2 text-sm text-slate-400">Open any order to inspect customer data, ordered items, pricing, and operational details.</p>
                    </div>

                    <Link href="/admin" className="inline-flex items-center justify-center gap-2 self-start rounded-full border border-brandGold/30 bg-brandGold/10 px-4 py-2.5 text-sm font-black text-brandGold transition-colors hover:bg-brandGold hover:text-brandBlue md:self-auto">
                        <i className="fa-solid fa-arrow-left"></i>
                        <span>Back to Admin Page</span>
                    </Link>
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
                                    const isTargetedOrder = targetedOrderId === order.id;
                                    const amount = getOrderAmount(order);
                                    const items = Array.isArray(order.items) ? order.items : [];
                                    const externalRef = getOrderExternalRef(order);
                                    const normalizedStatus = normalizeOrderStatus(order.status);
                                    const statusMeta = getOrderStatusMeta(normalizedStatus);
                                    const statusStyle = STATUS_STYLES[normalizedStatus] || STATUS_STYLES.pending;
                                    const allowedTransitions = getAllowedOrderStatusTransitions(normalizedStatus);
                                    const statusActionOptions = allowedTransitions.map((value) => ({
                                        value,
                                        meta: getOrderStatusMeta(value)
                                    }));
                                    const hasStatusTransitions = statusActionOptions.length > 0;
                                    const isSyncing = syncingOrderId === order.id;
                                    const orderTypeLabel = order.orderType === 'wholesale' ? 'Wholesale Order' : 'Retail Order';
                                    const displayOrder = isSyncing
                                        ? {
                                            ...order,
                                            dcSync: {
                                                ...(order.dcSync || {}),
                                                status: 'sending',
                                                message: 'Sending invoice to DC...'
                                            }
                                        }
                                        : order;
                                    const dcSyncState = getOrderDcSyncState(displayOrder);
                                    const canSendInvoice = canSendOrderInvoice(displayOrder);
                                    const invoiceButtonLabel = getInvoiceButtonLabel({
                                        isSyncing,
                                        canSendInvoice,
                                        dcSyncState,
                                        normalizedStatus
                                    });

                                    return (
                                        <Fragment key={order.id}>
                                            <tr id={`order-row-${order.id}`} key={order.id} className={`border-b border-white/5 transition-colors hover:bg-white/[0.03] ${isTargetedOrder ? 'bg-brandGold/10' : ''}`}>
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
                                                            onClick={() => {
                                                                if (!hasStatusTransitions) return;
                                                                setOpenStatusMenuId((currentValue) => currentValue === order.id ? null : order.id);
                                                            }}
                                                            disabled={!hasStatusTransitions}
                                                            className={`inline-flex min-w-[160px] items-center justify-between gap-3 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] transition-colors md:text-xs disabled:cursor-not-allowed disabled:opacity-70 ${statusStyle.trigger}`}
                                                            aria-haspopup="menu"
                                                            aria-expanded={hasStatusTransitions && openStatusMenuId === order.id}
                                                        >
                                                            <span className="flex items-center gap-2">
                                                                <span className={`h-2.5 w-2.5 rounded-full ${statusStyle.dot}`}></span>
                                                                {statusMeta.label}
                                                            </span>
                                                            <i className={`fa-solid ${hasStatusTransitions ? (openStatusMenuId === order.id ? 'fa-chevron-up' : 'fa-chevron-down') : 'fa-lock'} text-[10px]`}></i>
                                                        </button>

                                                        {hasStatusTransitions && openStatusMenuId === order.id ? (
                                                            <div className="absolute left-0 top-[calc(100%+0.55rem)] z-30 min-w-[180px] overflow-hidden rounded-2xl border border-white/10 bg-[#10192d] p-2 shadow-[0_18px_40px_rgba(4,8,20,0.45)] backdrop-blur-xl">
                                                                {statusActionOptions.map((option) => {
                                                                    const optionStyle = STATUS_STYLES[option.value] || STATUS_STYLES.pending;

                                                                    return (
                                                                        <button
                                                                            key={option.value}
                                                                            type="button"
                                                                            onClick={() => handleStatusChange(order, option.value)}
                                                                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-slate-300 transition-colors md:text-xs ${optionStyle.menu}`}
                                                                        >
                                                                            <span className="flex items-center gap-2">
                                                                                <span className={`h-2.5 w-2.5 rounded-full ${optionStyle.dot}`}></span>
                                                                                {option.meta.label}
                                                                            </span>
                                                                            <i className="fa-solid fa-arrow-right text-[10px] text-brandGold"></i>
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
                                                            onClick={() => handleOpenEditOrder(order)}
                                                            className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/25 bg-sky-500/10 text-sky-300 transition-colors hover:bg-sky-500 hover:text-white"
                                                            title="Edit Order"
                                                        >
                                                            <i className="fa-solid fa-pen-to-square text-sm"></i>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSendInvoice(order.id)}
                                                            disabled={isSyncing || !canSendInvoice}
                                                            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${canSendInvoice ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white' : 'border-white/10 bg-white/5 text-slate-500'}`}
                                                        >
                                                            <i className={`fa-solid ${isSyncing ? 'fa-spinner fa-spin' : canSendInvoice ? 'fa-paper-plane' : 'fa-ban'}`}></i>
                                                            {invoiceButtonLabel}
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
                                                                        <InfoPill label="Status" value={statusMeta.label} />
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
                                                                    {displayOrder.dcSync?.message ? (
                                                                        <div className="mt-3 rounded-xl border border-white/8 bg-[#18223a] px-3 py-3 text-sm text-slate-300">
                                                                            <span className="font-black text-slate-400">Sync Message:</span> {displayOrder.dcSync.message}
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

            {editingOrder && editingForm ? (
                <OrderEditModal
                    order={editingOrder}
                    form={editingForm}
                    catalogEntries={catalogEntries}
                    isSavingOrder={isSavingOrder}
                    isSyncingInvoice={syncingOrderId === editingOrder.id}
                    onClose={handleCloseEditOrder}
                    onFormChange={updateEditingForm}
                    onItemChange={updateEditingItem}
                    onCatalogItemChange={handleCatalogItemChange}
                    onAddItem={handleAddOrderItem}
                    onRemoveItem={handleRemoveOrderItem}
                    onSave={handleSaveOrder}
                    onResendInvoice={handleResendInvoice}
                />
            ) : null}
        </div>
    );
}

function OrderEditModal({
    order,
    form,
    catalogEntries,
    isSavingOrder,
    isSyncingInvoice,
    onClose,
    onFormChange,
    onItemChange,
    onCatalogItemChange,
    onAddItem,
    onRemoveItem,
    onSave,
    onResendInvoice
}) {
    const normalizedStatus = normalizeOrderStatus(order.status);
    const dcSyncState = getOrderDcSyncState(order);
    const canResendInvoice = normalizedStatus !== 'cancelled' && (normalizedStatus === 'confirmed' || normalizedStatus === 'completed');
    const editedOrderAmount = computeOrderTotal(form.items || []);
    const editedItemCount = computeOrderItemCount(form.items || []);

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="relative w-full max-w-6xl overflow-hidden rounded-[1.8rem] border border-white/10 bg-[#10192d] shadow-[0_30px_80px_rgba(4,8,20,0.5)]">
                <div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-brandGold/70">Edit Order</p>
                        <h2 className="mt-2 text-2xl font-black text-white">#{getOrderExternalRef(order)}</h2>
                        <p className="mt-2 text-sm text-slate-400">Update order items, status, customer info, then save or resend the invoice.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSavingOrder}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div className="max-h-[78vh] overflow-y-auto px-6 py-6 custom-scrollbar">
                    <div className="grid gap-5 xl:grid-cols-[1.1fr_1.6fr]">
                        <div className="space-y-5">
                            <section className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4">
                                <h3 className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-brandGold">Customer Info</h3>
                                <div className="space-y-3">
                                    <label className="block">
                                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Name</span>
                                        <input
                                            type="text"
                                            value={form.customerName}
                                            onChange={(event) => onFormChange('customerName', event.target.value)}
                                            className="w-full rounded-xl border border-white/10 bg-[#18223a] px-3 py-2.5 text-sm text-white outline-none transition focus:border-brandGold/50"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Email</span>
                                        <input
                                            type="email"
                                            value={form.customerEmail}
                                            onChange={(event) => onFormChange('customerEmail', event.target.value)}
                                            className="w-full rounded-xl border border-white/10 bg-[#18223a] px-3 py-2.5 text-sm text-white outline-none transition focus:border-brandGold/50"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Phone</span>
                                        <input
                                            type="text"
                                            value={form.customerPhone}
                                            onChange={(event) => onFormChange('customerPhone', event.target.value)}
                                            className="w-full rounded-xl border border-white/10 bg-[#18223a] px-3 py-2.5 text-sm text-white outline-none transition focus:border-brandGold/50"
                                        />
                                    </label>
                                </div>
                            </section>

                            <section className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4">
                                <h3 className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-brandGold">Order Controls</h3>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="block">
                                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Order Type</span>
                                        <select
                                            value={form.orderType}
                                            onChange={(event) => onFormChange('orderType', event.target.value)}
                                            className="w-full rounded-xl border border-white/10 bg-[#18223a] px-3 py-2.5 text-sm text-white outline-none transition focus:border-brandGold/50"
                                        >
                                            <option value="retail">Retail</option>
                                            <option value="wholesale">Wholesale</option>
                                        </select>
                                    </label>
                                    <label className="block">
                                        <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Status</span>
                                        <select
                                            value={form.status}
                                            onChange={(event) => onFormChange('status', event.target.value)}
                                            className="w-full rounded-xl border border-white/10 bg-[#18223a] px-3 py-2.5 text-sm text-white outline-none transition focus:border-brandGold/50"
                                        >
                                            {ORDER_STATUS_OPTIONS.map((statusOption) => {
                                                const statusMeta = getOrderStatusMeta(statusOption.value);
                                                return (
                                                    <option key={statusOption.value} value={statusOption.value}>{statusMeta.label}</option>
                                                );
                                            })}
                                        </select>
                                    </label>
                                </div>

                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <InfoPill label="Items Count" value={String(editedItemCount)} />
                                    <InfoPill label="Order Total" value={`${editedOrderAmount.toLocaleString()} ج.م`} />
                                    <InfoPill label="Current DC Sync" value={dcSyncState.label} />
                                    <InfoPill label="Current Status" value={getOrderStatusMeta(order.status).label} />
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={onResendInvoice}
                                        disabled={isSavingOrder || isSyncingInvoice || !canResendInvoice}
                                        className="inline-flex items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-sky-300 transition hover:bg-sky-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <i className={`fa-solid ${isSyncingInvoice ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`}></i>
                                        {isSyncingInvoice ? 'Resending' : 'Resend Invoice'}
                                    </button>
                                    {!canResendInvoice ? (
                                        <p className="self-center text-[11px] font-medium text-slate-500">Resend is available only for confirmed or completed orders.</p>
                                    ) : null}
                                </div>
                            </section>
                        </div>

                        <section className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-brandGold">Order Items</h3>
                                    <p className="mt-1 text-xs text-slate-500">Change products, quantities, and prices before saving.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={onAddItem}
                                    className="inline-flex items-center gap-2 rounded-xl border border-brandGold/25 bg-brandGold/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-brandGold transition hover:bg-brandGold hover:text-brandBlue"
                                >
                                    <i className="fa-solid fa-plus"></i>
                                    Add Item
                                </button>
                            </div>

                            <div className="space-y-3">
                                {(form.items || []).map((item, index) => (
                                    <div key={item.id} className="rounded-[1.15rem] border border-white/8 bg-[#18223a] p-3.5">
                                        {(() => {
                                            const normalizedSearch = normalizeLookupValue(item.productSearch);
                                            const filteredCatalogEntries = catalogEntries.filter((entry) => {
                                                if (!normalizedSearch) return true;

                                                return [
                                                    entry.label,
                                                    entry.title,
                                                    entry.productCode,
                                                    entry.category,
                                                    entry.variantLabel
                                                ].some((value) => normalizeLookupValue(value).includes(normalizedSearch));
                                            }).slice(0, 60);

                                            return (
                                                <>
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Line {index + 1}</span>
                                            <button
                                                type="button"
                                                onClick={() => onRemoveItem(item.id)}
                                                className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-300 transition hover:bg-rose-500 hover:text-white"
                                            >
                                                <i className="fa-solid fa-trash text-xs"></i>
                                            </button>
                                        </div>

                                        <div className="grid gap-3 md:grid-cols-[minmax(0,1.8fr)_90px_120px]">
                                            <label className="block md:col-span-3">
                                                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Search Product</span>
                                                <input
                                                    type="text"
                                                    value={item.productSearch || ''}
                                                    onChange={(event) => onItemChange(item.id, 'productSearch', event.target.value)}
                                                    placeholder="Search by name, code, category, or variant"
                                                    className="w-full rounded-xl border border-white/10 bg-[#10192d] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-brandGold/50"
                                                />
                                            </label>

                                            <label className="block md:col-span-3">
                                                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Product</span>
                                                <select
                                                    value={item.selectionKey}
                                                    onChange={(event) => onCatalogItemChange(item.id, event.target.value)}
                                                    className="w-full rounded-xl border border-white/10 bg-[#10192d] px-3 py-2.5 text-sm text-white outline-none transition focus:border-brandGold/50"
                                                >
                                                    <option value="">Select product</option>
                                                    {filteredCatalogEntries.map((entry) => (
                                                        <option key={entry.key} value={entry.key}>{entry.label}</option>
                                                    ))}
                                                </select>
                                                {filteredCatalogEntries.length === 0 ? (
                                                    <p className="mt-2 text-[11px] font-medium text-amber-300">No products matched your search.</p>
                                                ) : null}
                                            </label>

                                            <label className="block">
                                                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Qty</span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={item.quantity}
                                                    onChange={(event) => onItemChange(item.id, 'quantity', Math.max(1, Number(event.target.value) || 1))}
                                                    className="w-full rounded-xl border border-white/10 bg-[#10192d] px-3 py-2.5 text-sm text-white outline-none transition focus:border-brandGold/50"
                                                />
                                            </label>

                                            <label className="block">
                                                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Price</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={item.price}
                                                    onChange={(event) => onItemChange(item.id, 'price', Number(event.target.value) || 0)}
                                                    className="w-full rounded-xl border border-white/10 bg-[#10192d] px-3 py-2.5 text-sm text-white outline-none transition focus:border-brandGold/50"
                                                />
                                            </label>

                                            <div className="rounded-xl border border-white/8 bg-[#10192d] px-3 py-2.5 text-sm text-slate-300">
                                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Line Total</p>
                                                <p className="mt-1 font-black text-brandGold">{(getNumericValue(item.quantity, 1) * getNumericValue(item.price, 0)).toLocaleString()} ج.م</p>
                                            </div>

                                            <div className="grid gap-3 md:col-span-3 md:grid-cols-3">
                                                <div className="rounded-xl border border-white/8 bg-[#10192d] px-3 py-2.5 text-sm text-slate-300">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Product Code</p>
                                                    <p className="mt-1 font-medium text-white">{item.productCode || '-'}</p>
                                                </div>
                                                <div className="rounded-xl border border-white/8 bg-[#10192d] px-3 py-2.5 text-sm text-slate-300">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Variant</p>
                                                    <p className="mt-1 font-medium text-white">{item.variantLabel || 'Standard'}</p>
                                                </div>
                                                <div className="rounded-xl border border-white/8 bg-[#10192d] px-3 py-2.5 text-sm text-slate-300">
                                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Category</p>
                                                    <p className="mt-1 font-medium text-white">{item.category || '-'}</p>
                                                </div>
                                            </div>
                                        </div>
                                                </>
                                            );
                                        })()}
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/8 px-6 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSavingOrder}
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={isSavingOrder}
                        className="rounded-xl bg-brandGold px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-brandBlue transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isSavingOrder ? 'Saving...' : 'Save Order'}
                    </button>
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

