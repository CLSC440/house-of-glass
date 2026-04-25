'use client';
import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { addDoc, collection, query, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useGallery } from '@/contexts/GalleryContext';
import { parseTimestamp } from '@/lib/utils/format';
import { canCreateOrderForSideUp, canPreviewOrderForSideUp, canRefreshOrderForSideUp, canSendOrderInvoice, getOrderAmount, getOrderCustomerName, getOrderCustomerPhone, getOrderDateValue, getOrderDiscountAmount, getOrderExternalRef, getOrderDcSyncState, getOrderPreDiscountTotalAmount, getOrderShippingAmount, getOrderSideUpSyncState, getOrderSubtotalAmount } from '@/lib/utils/admin-orders';
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

function getOrderDeliveryMethodValue(order) {
    return String(order.deliveryMethod || order.customerInfo?.deliveryMethod || order.customer?.deliveryMethod || '').trim().toLowerCase() === 'shipping'
        ? 'shipping'
        : 'pickup';
}

function getOrderDeliveryMethodLabel(order) {
    return getOrderDeliveryMethodValue(order) === 'shipping' ? 'Shipping | شحن' : 'Pickup | استلام من المعرض';
}

function getOrderShippingAddress(order) {
    return order.shippingAddress || order.customerInfo?.shippingAddress || order.customer?.shippingAddress || '';
}

function getOrderPromoCode(order) {
    return String(order.promoCode || order.promo_code || '').trim();
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

function getSideUpButtonLabel({ isPreviewing, canPreviewSideUp, sideupSyncState, normalizedStatus, deliveryMethod }) {
    if (isPreviewing) return 'Previewing';
    if (canPreviewSideUp) return sideupSyncState.tone === 'success' ? 'Preview Again' : 'Preview SideUp';
    if (deliveryMethod !== 'shipping') return 'Pickup Only';
    if (normalizedStatus === 'pending') return 'Review First';
    if (normalizedStatus === 'cancelled') return 'Cancelled';
    return 'Unavailable';
}

function getSideUpCreateButtonLabel({ isCreating, canCreateSideUp, sideupSyncState, normalizedStatus, deliveryMethod }) {
    if (isCreating || sideupSyncState.tone === 'sending') return 'Sending';
    if (canCreateSideUp) return sideupSyncState.tone === 'failed' ? 'Retry SideUp' : 'Send to SideUp';
    if (sideupSyncState.tone === 'success') return 'SideUp Sent';
    if (deliveryMethod !== 'shipping') return 'Pickup Only';
    if (normalizedStatus === 'pending') return 'Review First';
    if (normalizedStatus === 'cancelled') return 'Cancelled';
    return 'Unavailable';
}

function getSideUpRefreshButtonLabel({ isRefreshing, canRefreshSideUp, sideupSyncState, deliveryMethod }) {
    if (isRefreshing) return 'Refreshing';
    if (canRefreshSideUp) return 'Refresh Status';
    if (deliveryMethod !== 'shipping') return 'Pickup Only';
    if (sideupSyncState.tone === 'sending') return 'Wait';
    if (!sideupSyncState.shipmentCode) return 'No Shipment';
    return 'Unavailable';
}

function buildSideUpPreviewFeedbackState(payload = {}) {
    const cityName = payload?.location?.city?.name || 'Unknown';
    const areaName = payload?.location?.area?.name || 'Unknown';
    const zoneName = payload?.location?.zone?.name || 'Unknown';
    const shipmentCode = payload?.shipmentCode || payload?.payloads?.postman?.shipment_code || 'Not set';
    const serverMode = payload?.createReady ? 'Create mode ready' : 'Preview only';

    return {
        tone: 'info',
        icon: 'fa-location-dot',
        eyebrow: 'SideUp Preview',
        title: 'Preview Ready',
        description: 'Resolved SideUp delivery details for this order before sending it live.',
        details: [
            { label: 'City', value: cityName },
            { label: 'Area', value: areaName },
            { label: 'Zone', value: zoneName },
            { label: 'Shipment Code', value: shipmentCode },
            { label: 'Server Mode', value: serverMode }
        ]
    };
}

function buildSideUpCreateConfirmationState(payload = {}) {
    const cityName = payload?.location?.city?.name || 'Unknown';
    const areaName = payload?.location?.area?.name || 'Unknown';
    const zoneName = payload?.location?.zone?.name || 'Unknown';
    const shipmentCode = payload?.shipmentCode || payload?.payloads?.postman?.shipment_code || 'Not set';

    return {
        tone: 'warning',
        icon: 'fa-paper-plane',
        variant: 'confirm',
        eyebrow: 'SideUp Send',
        title: 'Send Order To SideUp?',
        description: 'This will create a real shipment on SideUp for this order.',
        details: [
            { label: 'City', value: cityName },
            { label: 'Area', value: areaName },
            { label: 'Zone', value: zoneName },
            { label: 'Shipment Code', value: shipmentCode }
        ],
        confirmLabel: 'Send Now',
        cancelLabel: 'Cancel'
    };
}

function buildSideUpCreateSuccessFeedbackState(payload = {}, previewPayload = {}) {
    const shipmentCode = payload?.shipmentCode || previewPayload?.shipmentCode || previewPayload?.payloads?.postman?.shipment_code || 'Not set';
    const sideupOrderId = payload?.sideupOrderId || 'Not returned';
    const payloadFormat = payload?.usedPayloadFormat || 'unknown';

    return {
        tone: 'success',
        icon: 'fa-circle-check',
        eyebrow: 'SideUp Send',
        title: 'Order Sent Successfully',
        description: 'A real SideUp shipment was created successfully for this order.',
        details: [
            { label: 'Shipment Code', value: shipmentCode },
            { label: 'SideUp Order ID', value: sideupOrderId },
            { label: 'Payload Format', value: payloadFormat }
        ]
    };
}

function buildSideUpRefreshFeedbackState(payload = {}) {
    return {
        tone: 'success',
        icon: 'fa-rotate-right',
        eyebrow: 'SideUp Status',
        title: 'Status Refreshed',
        description: 'Latest shipment details were pulled successfully from SideUp.',
        details: [
            { label: 'Shipment Code', value: payload?.shipmentCode || 'Not set' },
            { label: 'Current Status', value: payload?.orderStatus || 'Not returned' },
            { label: 'Courier', value: payload?.courierName || 'Not returned' },
            { label: 'SideUp Order ID', value: payload?.sideupOrderId || 'Not returned' }
        ]
    };
}

function buildSideUpDialogErrorState(title, message) {
    return {
        tone: 'error',
        icon: 'fa-circle-exclamation',
        eyebrow: 'SideUp',
        title,
        description: message,
        details: []
    };
}

const INITIAL_ORDER_FILTERS = Object.freeze({
    query: '',
    status: 'all',
    orderType: 'all',
    delivery: 'all',
    dcSync: 'all',
    sideupSync: 'all'
});

const ORDER_TYPE_FILTER_OPTIONS = [
    { value: 'all', label: 'All Types' },
    { value: 'retail', label: 'Retail' },
    { value: 'wholesale', label: 'Wholesale' }
];

const ORDER_DELIVERY_FILTER_OPTIONS = [
    { value: 'all', label: 'All Delivery' },
    { value: 'shipping', label: 'Shipping' },
    { value: 'pickup', label: 'Pickup' }
];

const ORDER_DC_FILTER_OPTIONS = [
    { value: 'all', label: 'All DC States' },
    { value: 'success', label: 'DC Synced' },
    { value: 'sending', label: 'DC Sending' },
    { value: 'failed', label: 'DC Failed' },
    { value: 'idle', label: 'DC Not Sent' }
];

const ORDER_SIDEUP_FILTER_OPTIONS = [
    { value: 'all', label: 'All SideUp States' },
    { value: 'success', label: 'SideUp Sent' },
    { value: 'sending', label: 'SideUp Sending' },
    { value: 'failed', label: 'SideUp Failed' },
    { value: 'idle', label: 'SideUp Not Sent' },
    { value: 'pickup', label: 'Pickup Only' }
];

function getOrderTypeValue(order = {}) {
    return String(order.orderType || '').trim().toLowerCase() === 'wholesale'
        ? 'wholesale'
        : 'retail';
}

function buildOrderSearchIndex(order = {}) {
    const items = Array.isArray(order.items) ? order.items : [];

    return [
        order.id,
        getOrderExternalRef(order),
        getOrderCustomerName(order),
        getOrderCustomerPhone(order),
        getCustomerEmail(order),
        getCustomerGovernorate(order),
        getOrderShippingAddress(order),
        order.websiteOrderRef,
        order.sideupSync?.shipmentCode,
        order.sideupSync?.orderStatus,
        order.sideupSync?.courierName,
        ...items.flatMap((item) => [item.title, item.name, item.productCode, item.category])
    ].map(normalizeLookupValue).filter(Boolean).join(' ');
}

export default function AdminOrders() {
    const searchParams = useSearchParams();
    const { allProducts } = useGallery();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedOrderId, setExpandedOrderId] = useState(null);
    const [syncingOrderId, setSyncingOrderId] = useState(null);
    const [previewingSideUpOrderId, setPreviewingSideUpOrderId] = useState(null);
    const [creatingSideUpOrderId, setCreatingSideUpOrderId] = useState(null);
    const [refreshingSideUpOrderId, setRefreshingSideUpOrderId] = useState(null);
    const [sideUpDialogState, setSideUpDialogState] = useState(null);
    const [orderFilters, setOrderFilters] = useState(() => ({ ...INITIAL_ORDER_FILTERS }));
    const [openStatusMenuId, setOpenStatusMenuId] = useState(null);
    const [editingOrder, setEditingOrder] = useState(null);
    const [editingForm, setEditingForm] = useState(null);
    const [isSavingOrder, setIsSavingOrder] = useState(false);
    const statusMenuRef = useRef(null);
    const sideUpDialogResolverRef = useRef(null);
    const catalogEntries = useMemo(() => buildCatalogEntries(allProducts), [allProducts]);
    const targetedOrderId = String(searchParams.get('orderId') || '').trim();
    const deferredOrderQuery = useDeferredValue(orderFilters.query);
    const hasPendingQueryUpdate = deferredOrderQuery !== orderFilters.query;

    const filteredOrders = useMemo(() => {
        const normalizedQuery = normalizeLookupValue(deferredOrderQuery);

        return orders.filter((order) => {
            const normalizedStatus = normalizeOrderStatus(order.status);
            const orderTypeValue = getOrderTypeValue(order);
            const deliveryMethodValue = getOrderDeliveryMethodValue(order);
            const dcSyncTone = getOrderDcSyncState(order).tone;
            const sideupSyncTone = getOrderSideUpSyncState(order).tone;

            if (orderFilters.status !== 'all' && normalizedStatus !== orderFilters.status) {
                return false;
            }

            if (orderFilters.orderType !== 'all' && orderTypeValue !== orderFilters.orderType) {
                return false;
            }

            if (orderFilters.delivery !== 'all' && deliveryMethodValue !== orderFilters.delivery) {
                return false;
            }

            if (orderFilters.dcSync !== 'all' && dcSyncTone !== orderFilters.dcSync) {
                return false;
            }

            if (orderFilters.sideupSync !== 'all' && sideupSyncTone !== orderFilters.sideupSync) {
                return false;
            }

            if (!normalizedQuery) {
                return true;
            }

            return buildOrderSearchIndex(order).includes(normalizedQuery);
        });
    }, [orders, orderFilters.status, orderFilters.orderType, orderFilters.delivery, orderFilters.dcSync, orderFilters.sideupSync, deferredOrderQuery]);

    const activeOrderFilterCount = useMemo(() => (
        Object.entries(orderFilters).reduce((count, [key, value]) => {
            if (key === 'query') {
                return count + (String(value || '').trim() ? 1 : 0);
            }

            return count + (value !== 'all' ? 1 : 0);
        }, 0)
    ), [orderFilters]);

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

    useEffect(() => () => {
        if (sideUpDialogResolverRef.current) {
            sideUpDialogResolverRef.current(false);
            sideUpDialogResolverRef.current = null;
        }
    }, []);

    const closeSideUpDialog = (result = false) => {
        setSideUpDialogState(null);

        if (sideUpDialogResolverRef.current) {
            const resolve = sideUpDialogResolverRef.current;
            sideUpDialogResolverRef.current = null;
            resolve(result);
        }
    };

    const openSideUpMessage = (feedback) => {
        if (sideUpDialogResolverRef.current) {
            sideUpDialogResolverRef.current(false);
            sideUpDialogResolverRef.current = null;
        }

        setSideUpDialogState({
            variant: 'message',
            dismissLabel: 'Done',
            ...feedback
        });
    };

    const openSideUpConfirmation = (feedback) => new Promise((resolve) => {
        if (sideUpDialogResolverRef.current) {
            sideUpDialogResolverRef.current(false);
        }

        sideUpDialogResolverRef.current = resolve;
        setSideUpDialogState({
            variant: 'confirm',
            confirmLabel: 'Confirm',
            cancelLabel: 'Cancel',
            ...feedback
        });
    });

    const updateOrderFilter = (field, value) => {
        setOrderFilters((currentValue) => ({
            ...currentValue,
            [field]: value
        }));
    };

    const clearOrderFilters = () => {
        setOrderFilters({ ...INITIAL_ORDER_FILTERS });
    };

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

    const handlePreviewSideUp = async (orderId) => {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            openSideUpMessage(buildSideUpDialogErrorState(
                'Authentication Required',
                'Sign in again, then retry the SideUp preview.'
            ));
            return;
        }

        setPreviewingSideUpOrderId(orderId);
        try {
            const token = await currentUser.getIdToken();
            let areaHint = '';

            while (true) {
                const response = await fetch('/api/integrations/sideup', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        orderId,
                        areaHint,
                        mode: 'preview'
                    })
                });

                const payload = await response.json().catch(() => ({}));
                if (response.ok) {
                    openSideUpMessage(buildSideUpPreviewFeedbackState(payload));
                    break;
                }

                if (payload?.code === 'sideup_area_match_required') {
                    const availableAreaNames = Array.isArray(payload?.details?.availableAreaNames)
                        ? payload.details.availableAreaNames.slice(0, 8)
                        : [];
                    const suggestionSuffix = availableAreaNames.length > 0
                        ? `\n\nSuggestions: ${availableAreaNames.join(', ')}`
                        : '';
                    const hintedArea = window.prompt(
                        `SideUp needs the district or area in their naming. Enter the الحي / المنطقة and retry.${suggestionSuffix}`,
                        areaHint
                    );

                    if (hintedArea && hintedArea.trim()) {
                        areaHint = hintedArea.trim();
                        continue;
                    }
                }

                throw new Error(payload?.error || payload?.message || 'Failed to preview SideUp order');
            }
        } catch (error) {
            console.error('SideUp preview failed:', error);
            openSideUpMessage(buildSideUpDialogErrorState(
                'Preview Failed',
                error.message || 'Failed to preview SideUp order'
            ));
        } finally {
            setPreviewingSideUpOrderId(null);
        }
    };

    const handleCreateSideUp = async (orderId) => {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            openSideUpMessage(buildSideUpDialogErrorState(
                'Authentication Required',
                'Sign in again, then retry sending this order to SideUp.'
            ));
            return;
        }

        setCreatingSideUpOrderId(orderId);
        try {
            const token = await currentUser.getIdToken();
            let areaHint = '';

            while (true) {
                const previewResponse = await fetch('/api/integrations/sideup', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        orderId,
                        areaHint,
                        mode: 'preview'
                    })
                });

                const previewPayload = await previewResponse.json().catch(() => ({}));
                if (!previewResponse.ok) {
                    if (previewPayload?.code === 'sideup_area_match_required') {
                        const availableAreaNames = Array.isArray(previewPayload?.details?.availableAreaNames)
                            ? previewPayload.details.availableAreaNames.slice(0, 8)
                            : [];
                        const suggestionSuffix = availableAreaNames.length > 0
                            ? `\n\nSuggestions: ${availableAreaNames.join(', ')}`
                            : '';
                        const hintedArea = window.prompt(
                            `SideUp needs the district or area in their naming. Enter the الحي / المنطقة and retry.${suggestionSuffix}`,
                            areaHint
                        );

                        if (hintedArea && hintedArea.trim()) {
                            areaHint = hintedArea.trim();
                            continue;
                        }
                    }

                    throw new Error(previewPayload?.error || previewPayload?.message || 'Failed to prepare SideUp test order');
                }

                if (!previewPayload?.createReady) {
                    throw new Error('SideUp server credentials are missing. Add SIDEUP_EMAIL/SIDEUP_PASSWORD or SIDEUP_API_TOKEN first.');
                }

                const isConfirmed = await openSideUpConfirmation(buildSideUpCreateConfirmationState(previewPayload));
                if (!isConfirmed) {
                    return;
                }

                const createResponse = await fetch('/api/integrations/sideup', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        orderId,
                        areaHint,
                        mode: 'create'
                    })
                });

                const createPayload = await createResponse.json().catch(() => ({}));
                if (createResponse.ok) {
                    openSideUpMessage(buildSideUpCreateSuccessFeedbackState(createPayload, previewPayload));
                    break;
                }

                if (createPayload?.code === 'sideup_area_match_required') {
                    const availableAreaNames = Array.isArray(createPayload?.details?.availableAreaNames)
                        ? createPayload.details.availableAreaNames.slice(0, 8)
                        : [];
                    const suggestionSuffix = availableAreaNames.length > 0
                        ? `\n\nSuggestions: ${availableAreaNames.join(', ')}`
                        : '';
                    const hintedArea = window.prompt(
                        `SideUp needs the district or area in their naming. Enter the الحي / المنطقة and retry.${suggestionSuffix}`,
                        areaHint
                    );

                    if (hintedArea && hintedArea.trim()) {
                        areaHint = hintedArea.trim();
                        continue;
                    }
                }

                throw new Error(createPayload?.error || createPayload?.message || 'Failed to create SideUp test order');
            }
        } catch (error) {
            console.error('SideUp order creation failed:', error);
            openSideUpMessage(buildSideUpDialogErrorState(
                'Send Failed',
                error.message || 'Failed to create SideUp test order'
            ));
        } finally {
            setCreatingSideUpOrderId(null);
        }
    };

    const handleRefreshSideUp = async (orderId) => {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            openSideUpMessage(buildSideUpDialogErrorState(
                'Authentication Required',
                'Sign in again, then retry refreshing this SideUp shipment.'
            ));
            return;
        }

        setRefreshingSideUpOrderId(orderId);
        try {
            const token = await currentUser.getIdToken();
            const response = await fetch('/api/integrations/sideup', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    orderId,
                    mode: 'refresh'
                })
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || payload?.message || 'Failed to refresh SideUp status');
            }

            openSideUpMessage(buildSideUpRefreshFeedbackState(payload));
        } catch (error) {
            console.error('SideUp status refresh failed:', error);
            openSideUpMessage(buildSideUpDialogErrorState(
                'Refresh Failed',
                error.message || 'Failed to refresh SideUp status'
            ));
        } finally {
            setRefreshingSideUpOrderId(null);
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
        <div className="mx-auto max-w-[1480px] space-y-4 lg:[zoom:0.92] xl:[zoom:0.96] 2xl:[zoom:1]">
            <div className="rounded-[1.55rem] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(193,155,78,0.12),transparent_34%),linear-gradient(180deg,rgba(22,31,53,0.98),rgba(13,19,34,0.98))] px-5 py-5 shadow-[0_18px_40px_rgba(4,8,20,0.24)]">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70">Orders Control</p>
                        <h1 className="mt-1.5 text-[1.7rem] font-black text-brandGold lg:text-[1.85rem]">Orders Management</h1>
                        <p className="mt-1.5 text-[13px] text-slate-400 sm:text-sm">Open any order to inspect customer data, ordered items, pricing, and operational details.</p>
                    </div>

                    <Link href="/admin" className="inline-flex items-center justify-center gap-2 self-start rounded-full border border-brandGold/30 bg-brandGold/10 px-3.5 py-2 text-[13px] font-black text-brandGold transition-colors hover:bg-brandGold hover:text-brandBlue md:self-auto">
                        <i className="fa-solid fa-arrow-left"></i>
                        <span>Back to Admin Page</span>
                    </Link>
                </div>
            </div>

            <div className="overflow-hidden rounded-[1.55rem] border border-white/8 bg-[#161f35] shadow-[0_18px_40px_rgba(4,8,20,0.24)]">
                <div className="border-b border-white/8 px-4 py-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                        <label className="block w-full xl:max-w-[360px]">
                            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Search Orders</span>
                            <div className="relative">
                                <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-500"></i>
                                <input
                                    type="text"
                                    value={orderFilters.query}
                                    onChange={(event) => updateOrderFilter('query', event.target.value)}
                                    placeholder="Order ID, customer, phone, email, shipment..."
                                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brandGold/35 focus:bg-white/[0.06]"
                                />
                            </div>
                        </label>

                        <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-5">
                            <OrderFilterSelect
                                label="Status"
                                value={orderFilters.status}
                                options={[{ value: 'all', label: 'All Statuses' }, ...ORDER_STATUS_OPTIONS]}
                                onChange={(value) => updateOrderFilter('status', value)}
                            />
                            <OrderFilterSelect
                                label="Type"
                                value={orderFilters.orderType}
                                options={ORDER_TYPE_FILTER_OPTIONS}
                                onChange={(value) => updateOrderFilter('orderType', value)}
                            />
                            <OrderFilterSelect
                                label="Delivery"
                                value={orderFilters.delivery}
                                options={ORDER_DELIVERY_FILTER_OPTIONS}
                                onChange={(value) => updateOrderFilter('delivery', value)}
                            />
                            <OrderFilterSelect
                                label="DC Sync"
                                value={orderFilters.dcSync}
                                options={ORDER_DC_FILTER_OPTIONS}
                                onChange={(value) => updateOrderFilter('dcSync', value)}
                            />
                            <OrderFilterSelect
                                label="SideUp"
                                value={orderFilters.sideupSync}
                                options={ORDER_SIDEUP_FILTER_OPTIONS}
                                onChange={(value) => updateOrderFilter('sideupSync', value)}
                            />
                        </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                            <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 font-semibold text-slate-300">
                                Showing {filteredOrders.length} of {orders.length} orders
                            </span>
                            {activeOrderFilterCount > 0 ? (
                                <span className="rounded-full border border-brandGold/20 bg-brandGold/10 px-2.5 py-1 font-semibold text-brandGold">
                                    {activeOrderFilterCount} active filters
                                </span>
                            ) : null}
                            {hasPendingQueryUpdate ? (
                                <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 font-semibold text-cyan-300">
                                    Updating...
                                </span>
                            ) : null}
                        </div>

                        <button
                            type="button"
                            onClick={clearOrderFilters}
                            disabled={activeOrderFilterCount === 0}
                            className="inline-flex items-center justify-center gap-2 self-start rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-45 sm:self-auto"
                        >
                            <i className="fa-solid fa-rotate-left text-[10px]"></i>
                            Clear Filters
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/8 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 md:text-xs">
                                <th className="px-3.5 py-3">Order ID</th>
                                <th className="px-3.5 py-3">Date</th>
                                <th className="px-3.5 py-3">Customer</th>
                                <th className="px-3.5 py-3">Items</th>
                                <th className="px-3.5 py-3">Total</th>
                                <th className="px-3.5 py-3">Status</th>
                                <th className="px-3.5 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrders.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-4 py-12 text-center text-slate-500">
                                        {orders.length === 0
                                            ? 'No orders found.'
                                            : 'No orders match the current filters.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredOrders.map((order) => {
                                    const isExpanded = expandedOrderId === order.id;
                                    const isTargetedOrder = targetedOrderId === order.id;
                                    const amount = getOrderAmount(order);
                                    const subtotalAmount = getOrderSubtotalAmount(order);
                                    const shippingAmount = getOrderShippingAmount(order);
                                    const discountAmount = getOrderDiscountAmount(order);
                                    const preDiscountTotalAmount = getOrderPreDiscountTotalAmount(order);
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
                                    const isSideUpCreating = creatingSideUpOrderId === order.id;
                                    const isSideUpRefreshing = refreshingSideUpOrderId === order.id;
                                    const orderTypeLabel = order.orderType === 'wholesale' ? 'Wholesale Order' : 'Retail Order';
                                    let displayOrder = order;
                                    if (isSyncing) {
                                        displayOrder = {
                                            ...displayOrder,
                                            dcSync: {
                                                ...(displayOrder.dcSync || {}),
                                                status: 'sending',
                                                message: 'Sending invoice to DC...'
                                            }
                                        };
                                    }
                                    if (isSideUpCreating) {
                                        displayOrder = {
                                            ...displayOrder,
                                            sideupSync: {
                                                ...(displayOrder.sideupSync || {}),
                                                status: 'sending',
                                                message: 'Creating order on SideUp...'
                                            }
                                        };
                                    }
                                    const dcSyncState = getOrderDcSyncState(displayOrder);
                                    const canSendInvoice = canSendOrderInvoice(displayOrder);
                                    const invoiceButtonLabel = getInvoiceButtonLabel({
                                        isSyncing,
                                        canSendInvoice,
                                        dcSyncState,
                                        normalizedStatus
                                    });
                                    const deliveryMethodValue = getOrderDeliveryMethodValue(order);
                                    const sideupSyncState = getOrderSideUpSyncState(displayOrder);
                                    const canPreviewSideUp = canPreviewOrderForSideUp(displayOrder);
                                    const canCreateSideUp = canCreateOrderForSideUp(displayOrder);
                                    const canRefreshSideUp = canRefreshOrderForSideUp(displayOrder);
                                    const isSideUpPreviewing = previewingSideUpOrderId === order.id;
                                    const sideupButtonLabel = getSideUpButtonLabel({
                                        isPreviewing: isSideUpPreviewing,
                                        canPreviewSideUp,
                                        sideupSyncState,
                                        normalizedStatus,
                                        deliveryMethod: deliveryMethodValue
                                    });
                                    const sideupCreateButtonLabel = getSideUpCreateButtonLabel({
                                        isCreating: isSideUpCreating,
                                        canCreateSideUp,
                                        sideupSyncState,
                                        normalizedStatus,
                                        deliveryMethod: deliveryMethodValue
                                    });
                                    const sideupRefreshButtonLabel = getSideUpRefreshButtonLabel({
                                        isRefreshing: isSideUpRefreshing,
                                        canRefreshSideUp,
                                        sideupSyncState,
                                        deliveryMethod: deliveryMethodValue
                                    });

                                    return (
                                        <Fragment key={order.id}>
                                            <tr id={`order-row-${order.id}`} key={order.id} className={`border-b border-white/5 transition-colors hover:bg-white/[0.03] ${isTargetedOrder ? 'bg-brandGold/10' : ''}`}>
                                                <td className="px-3.5 py-3 align-top">
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className="font-mono text-[11px] font-semibold text-slate-300 md:text-xs">#{externalRef}</span>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${order.orderType === 'wholesale' ? 'bg-brandGold/10 text-brandGold' : 'bg-green-500/10 text-green-400'}`}>{orderTypeLabel}</span>
                                                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${dcSyncState.tone === 'success' ? 'bg-emerald-500/10 text-emerald-400' : dcSyncState.tone === 'sending' ? 'bg-blue-500/10 text-blue-400' : dcSyncState.tone === 'failed' ? 'bg-red-500/10 text-red-400' : 'bg-slate-500/10 text-slate-400'}`}>{dcSyncState.label}</span>
                                                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${sideupSyncState.tone === 'success' ? 'bg-cyan-500/10 text-cyan-300' : sideupSyncState.tone === 'sending' ? 'bg-sky-500/10 text-sky-300' : sideupSyncState.tone === 'failed' ? 'bg-rose-500/10 text-rose-300' : sideupSyncState.tone === 'pickup' ? 'bg-slate-500/10 text-slate-400' : 'bg-white/10 text-slate-300'}`}>{sideupSyncState.label}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3.5 py-3 align-top text-[11px] text-slate-400 md:text-xs">
                                                    {parseTimestamp(getOrderDateValue(order))}
                                                </td>
                                                <td className="px-3.5 py-3 align-top">
                                                    <div className="text-[13px] font-semibold text-white md:text-sm">{getOrderCustomerName(order)}</div>
                                                    <div className="text-[11px] text-slate-500 md:text-xs">{getOrderCustomerPhone(order)}</div>
                                                    <div className="text-[11px] text-slate-500 md:text-xs">{getCustomerEmail(order)}</div>
                                                </td>
                                                <td className="px-3.5 py-3 align-top">
                                                    <div className="text-[13px] font-medium text-white md:text-sm">
                                                        {order.itemCount || items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || items.length} items
                                                    </div>
                                                </td>
                                                <td className="px-3.5 py-3 align-top text-[13px] font-bold text-white md:text-sm">
                                                    {amount.toLocaleString()} ج.م
                                                </td>
                                                <td className="px-3.5 py-3 align-top">
                                                    <div ref={openStatusMenuId === order.id ? statusMenuRef : null} className="relative inline-flex">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (!hasStatusTransitions) return;
                                                                setOpenStatusMenuId((currentValue) => currentValue === order.id ? null : order.id);
                                                            }}
                                                            disabled={!hasStatusTransitions}
                                                            className={`inline-flex min-w-[144px] items-center justify-between gap-2.5 rounded-full border px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] transition-colors md:text-[11px] disabled:cursor-not-allowed disabled:opacity-70 ${statusStyle.trigger}`}
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
                                                            <div className="absolute left-0 top-[calc(100%+0.45rem)] z-30 min-w-[170px] overflow-hidden rounded-2xl border border-white/10 bg-[#10192d] p-1.5 shadow-[0_18px_40px_rgba(4,8,20,0.45)] backdrop-blur-xl">
                                                                {statusActionOptions.map((option) => {
                                                                    const optionStyle = STATUS_STYLES[option.value] || STATUS_STYLES.pending;

                                                                    return (
                                                                        <button
                                                                            key={option.value}
                                                                            type="button"
                                                                            onClick={() => handleStatusChange(order, option.value)}
                                                                            className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-slate-300 transition-colors md:text-[11px] ${optionStyle.menu}`}
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
                                                <td className="px-3.5 py-3 align-top">
                                                    <div className="grid justify-end gap-1.5 [grid-template-columns:auto_max-content_max-content_max-content_max-content_auto]">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenEditOrder(order)}
                                                            className="col-start-1 row-start-1 flex h-8 w-8 items-center justify-center rounded-lg border border-sky-500/25 bg-sky-500/10 text-sky-300 transition-colors hover:bg-sky-500 hover:text-white"
                                                            title="Edit Order"
                                                        >
                                                            <i className="fa-solid fa-pen-to-square text-[13px]"></i>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSendInvoice(order.id)}
                                                            disabled={isSyncing || !canSendInvoice}
                                                            className={`col-start-2 row-start-1 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${canSendInvoice ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white' : 'border-white/10 bg-white/5 text-slate-500'}`}
                                                        >
                                                            <i className={`fa-solid ${isSyncing ? 'fa-spinner fa-spin' : canSendInvoice ? 'fa-paper-plane' : 'fa-ban'}`}></i>
                                                            {invoiceButtonLabel}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handlePreviewSideUp(order.id)}
                                                            disabled={isSideUpPreviewing || isSideUpCreating || isSideUpRefreshing || !canPreviewSideUp}
                                                            className={`col-start-3 row-start-1 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${canPreviewSideUp ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500 hover:text-[#11192b]' : 'border-white/10 bg-white/5 text-slate-500'}`}
                                                        >
                                                            <i className={`fa-solid ${isSideUpPreviewing ? 'fa-spinner fa-spin' : canPreviewSideUp ? 'fa-location-dot' : 'fa-ban'}`}></i>
                                                            {sideupButtonLabel}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleCreateSideUp(order.id)}
                                                            disabled={isSideUpCreating || isSideUpPreviewing || isSideUpRefreshing || !canCreateSideUp}
                                                            className={`col-start-2 row-start-2 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${canCreateSideUp ? 'border-teal-500/25 bg-teal-500/10 text-teal-300 hover:bg-teal-500 hover:text-[#11192b]' : 'border-white/10 bg-white/5 text-slate-500'}`}
                                                        >
                                                            <i className={`fa-solid ${isSideUpCreating ? 'fa-spinner fa-spin' : canCreateSideUp ? 'fa-paper-plane' : 'fa-ban'}`}></i>
                                                            {sideupCreateButtonLabel}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRefreshSideUp(order.id)}
                                                            disabled={isSideUpRefreshing || isSideUpCreating || isSideUpPreviewing || !canRefreshSideUp}
                                                            className={`col-start-3 row-start-2 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${canRefreshSideUp ? 'border-violet-500/25 bg-violet-500/10 text-violet-300 hover:bg-violet-500 hover:text-white' : 'border-white/10 bg-white/5 text-slate-500'}`}
                                                        >
                                                            <i className={`fa-solid ${isSideUpRefreshing ? 'fa-spinner fa-spin' : canRefreshSideUp ? 'fa-rotate-right' : 'fa-ban'}`}></i>
                                                            {sideupRefreshButtonLabel}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleExpandedOrder(order.id)}
                                                            className="col-start-5 row-start-2 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-brandGold/20 bg-brandGold/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-brandGold transition-colors hover:bg-brandGold hover:text-brandBlue"
                                                        >
                                                            {isExpanded ? 'Hide' : 'View'}
                                                            <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(order.id)}
                                                            className="col-start-6 row-start-2 flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-400 transition-colors hover:bg-red-500 hover:text-white"
                                                            title="Delete Order"
                                                        >
                                                            <i className="fa-solid fa-trash text-[13px]"></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr key={`${order.id}-details`} className="border-b border-white/5 bg-[#11192b]">
                                                    <td colSpan="7" className="p-4 md:p-5">
                                                        <div className="grid gap-4 xl:grid-cols-[1.05fr_1.55fr]">
                                                            <div className="space-y-3.5">
                                                                <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-3.5">
                                                                    <h3 className="mb-2.5 text-[13px] font-black uppercase tracking-[0.16em] text-brandGold">Customer Details</h3>
                                                                    <div className="space-y-1.5 text-[13px] text-slate-300">
                                                                        <p><span className="text-slate-500">Name:</span> {getOrderCustomerName(order)}</p>
                                                                        <p><span className="text-slate-500">Email:</span> {getCustomerEmail(order)}</p>
                                                                        <p><span className="text-slate-500">Phone:</span> {getOrderCustomerPhone(order) || 'Not provided'}</p>
                                                                        <p><span className="text-slate-500">Governorate:</span> {getCustomerGovernorate(order)}</p>
                                                                        <p><span className="text-slate-500">Delivery:</span> {getOrderDeliveryMethodLabel(order)}</p>
                                                                        {getOrderDeliveryMethodValue(order) === 'shipping' ? (
                                                                            <p className="leading-6"><span className="text-slate-500">Shipping Address:</span> {getOrderShippingAddress(order) || 'Not provided'}</p>
                                                                        ) : null}
                                                                        <p><span className="text-slate-500">Role:</span> {getCustomerRole(order)}</p>
                                                                    </div>
                                                                </div>

                                                                <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-3.5">
                                                                    <h3 className="mb-2.5 text-[13px] font-black uppercase tracking-[0.16em] text-brandGold">Order Meta</h3>
                                                                    <div className="grid gap-2.5 sm:grid-cols-2">
                                                                        <InfoPill label="External Order Ref" value={externalRef || 'Not assigned'} />
                                                                        <InfoPill label="Order Type" value={order.orderType || 'retail'} />
                                                                        <InfoPill label="Status" value={statusMeta.label} />
                                                                        <InfoPill label="Items Count" value={String(order.itemCount || items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || items.length)} />
                                                                        <InfoPill label="Source" value={order.source || 'Website'} />
                                                                        <InfoPill label="Date" value={parseTimestamp(getOrderDateValue(order))} />
                                                                        <InfoPill label="Promo Code" value={getOrderPromoCode(order) || 'Not used'} />
                                                                        <InfoPill label="Products Subtotal" value={`${subtotalAmount.toLocaleString()} ج.م`} />
                                                                        <InfoPill label="Shipping Cost" value={`${shippingAmount.toLocaleString()} ج.م`} />
                                                                        <InfoPill label="Order Total" value={`${preDiscountTotalAmount.toLocaleString()} ج.م`} />
                                                                        <InfoPill label="Discount Applied" value={`${discountAmount.toLocaleString()} ج.م`} tone="danger" />
                                                                        <InfoPill label="Final Total" value={`${amount.toLocaleString()} ج.م`} tone="success" />
                                                                        <InfoPill label="DC Sync" value={dcSyncState.label} />
                                                                        <InfoPill label="SideUp Sync" value={sideupSyncState.label} />
                                                                        <InfoPill label="SideUp Shipment" value={sideupSyncState.shipmentCode || 'Not assigned'} />
                                                                        <InfoPill label="SideUp Status" value={sideupSyncState.orderStatus || 'Not synced'} />
                                                                        <InfoPill label="SideUp Courier" value={sideupSyncState.courierName || 'Not synced'} />
                                                                        <InfoPill label="SideUp Area" value={sideupSyncState.areaName || 'Not resolved'} />
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

                                                            <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-3.5">
                                                                <div className="mb-3 flex items-center justify-between gap-3">
                                                                    <h3 className="text-[13px] font-black uppercase tracking-[0.16em] text-brandGold">Ordered Items</h3>
                                                                    <span className="rounded-full bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{items.length} lines</span>
                                                                </div>

                                                                <div className="space-y-2.5">
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
                                                                                <div key={`${order.id}-item-${index}`} className="flex gap-3 rounded-[1.05rem] border border-white/8 bg-[#18223a] p-3">
                                                                                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/8 bg-white">
                                                                                        <img src={item.image || item.imageUrl || '/logo.png'} alt={item.title || item.name || 'Order item'} className="h-full w-full object-contain p-1" />
                                                                                    </div>
                                                                                    <div className="min-w-0 flex-1">
                                                                                        <div className="flex flex-col gap-2.5 md:flex-row md:items-start md:justify-between">
                                                                                            <div>
                                                                                                <p className="text-[13px] font-bold text-white md:text-sm">{item.title || item.name || 'Unnamed Item'}</p>
                                                                                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                                                                                                    <span>Qty: {quantity}</span>
                                                                                                    {item.productCode ? <span>Code: {item.productCode}</span> : null}
                                                                                                    {item.category ? <span>Category: {item.category}</span> : null}
                                                                                                </div>
                                                                                            </div>
                                                                                            <div className="text-left md:text-right">
                                                                                                <p className="text-[13px] font-black text-brandGold md:text-sm">{lineTotal.toLocaleString()} ج.م</p>
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

            <AdminStatusMessageModal
                feedback={sideUpDialogState}
                onClose={() => closeSideUpDialog(false)}
                onConfirm={() => closeSideUpDialog(true)}
            />
        </div>
    );
}

function AdminStatusMessageModal({ feedback, onClose, onConfirm }) {
    const isOpen = Boolean(feedback);
    const tone = ['error', 'warning', 'info', 'success'].includes(feedback?.tone) ? feedback.tone : 'success';
    const variant = feedback?.variant === 'confirm' ? 'confirm' : 'message';

    useEffect(() => {
        if (!isOpen) {
            return undefined;
        }

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) {
        return null;
    }

    const accentClasses = tone === 'error'
        ? {
            badge: 'border-rose-400/25 bg-rose-500/12 text-rose-200',
            icon: 'border-rose-400/30 bg-rose-500/14 text-rose-200',
            value: 'text-rose-100',
            button: 'border-rose-400/30 bg-rose-500/14 text-rose-100 hover:bg-rose-500/24'
        }
        : tone === 'warning'
            ? {
                badge: 'border-amber-400/25 bg-amber-500/12 text-amber-200',
                icon: 'border-amber-400/30 bg-amber-500/14 text-amber-200',
                value: 'text-white',
                button: 'border-amber-400/30 bg-amber-500/14 text-amber-100 hover:bg-amber-500/24'
            }
            : tone === 'info'
                ? {
                    badge: 'border-cyan-400/25 bg-cyan-500/12 text-cyan-200',
                    icon: 'border-cyan-400/30 bg-cyan-500/14 text-cyan-200',
                    value: 'text-white',
                    button: 'border-cyan-400/30 bg-cyan-500/14 text-cyan-100 hover:bg-cyan-500/24'
                }
                : {
                    badge: 'border-teal-400/25 bg-teal-500/12 text-teal-200',
                    icon: 'border-teal-400/30 bg-teal-500/14 text-teal-200',
                    value: 'text-white',
                    button: 'border-brandGold/30 bg-brandGold/12 text-brandGold hover:bg-brandGold hover:text-brandBlue'
                };

    const iconName = feedback?.icon || (tone === 'error'
        ? 'fa-circle-exclamation'
        : tone === 'warning'
            ? 'fa-triangle-exclamation'
            : tone === 'info'
                ? 'fa-circle-info'
                : 'fa-circle-check');
    const secondaryButtonClassName = 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white';

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="relative w-full max-w-[34rem] overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,#162038_0%,#10192d_100%)] shadow-[0_30px_80px_rgba(4,8,20,0.55)]" onClick={(event) => event.stopPropagation()}>
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent"></div>
                <div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
                    <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${accentClasses.icon}`}>
                            <i className={`fa-solid ${iconName} text-lg`}></i>
                        </div>
                        <div>
                            <p className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${accentClasses.badge}`}>
                                {feedback?.eyebrow || 'Update'}
                            </p>
                            <h3 className="mt-3 text-[1.45rem] font-black text-white">{feedback?.title || 'Done'}</h3>
                            {feedback?.description ? (
                                <p className="mt-2 max-w-[28rem] text-sm leading-6 text-slate-300">{feedback.description}</p>
                            ) : null}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                        aria-label="Close status message"
                    >
                        <i className="fa-solid fa-xmark text-sm"></i>
                    </button>
                </div>

                {Array.isArray(feedback?.details) && feedback.details.length > 0 ? (
                    <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
                        {feedback.details.map((detail) => (
                            <div key={detail.label} className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-3.5">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{detail.label}</p>
                                <p className={`mt-2 text-[15px] font-bold leading-6 ${accentClasses.value}`}>{detail.value}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="px-6 py-5">
                        <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-slate-300">
                            {feedback?.description || 'No additional details were returned.'}
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-2 border-t border-white/8 px-6 py-4">
                    {variant === 'confirm' ? (
                        <>
                            <button
                                type="button"
                                onClick={onClose}
                                className={`inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-black uppercase tracking-[0.12em] transition-colors ${secondaryButtonClassName}`}
                            >
                                {feedback?.cancelLabel || 'Cancel'}
                            </button>
                            <button
                                type="button"
                                onClick={onConfirm}
                                className={`inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-black uppercase tracking-[0.12em] transition-colors ${accentClasses.button}`}
                            >
                                {feedback?.confirmLabel || 'Confirm'}
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={onClose}
                            className={`inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-black uppercase tracking-[0.12em] transition-colors ${accentClasses.button}`}
                        >
                            {feedback?.dismissLabel || 'Done'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function OrderFilterSelect({ label, value, options, onChange }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</span>
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#10192d] px-3 py-2.5 text-sm font-semibold text-white outline-none transition-colors focus:border-brandGold/35"
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </label>
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

function InfoPill({ label, value, tone = 'default' }) {
    const toneClasses = tone === 'danger'
        ? 'border-rose-500/20 bg-rose-500/8'
        : tone === 'success'
            ? 'border-emerald-500/20 bg-emerald-500/8'
            : 'border-white/8 bg-[#18223a]';

    const valueClasses = tone === 'danger'
        ? 'text-rose-300'
        : tone === 'success'
            ? 'text-emerald-300'
            : 'text-white';

    return (
        <div className={`rounded-xl border px-3 py-2.5 ${toneClasses}`}>
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
            <p className={`mt-1 text-[13px] font-semibold md:text-sm ${valueClasses}`}>{value}</p>
        </div>
    );
}

