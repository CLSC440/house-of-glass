import { normalizeOrderStatus } from '@/lib/utils/order-status';

function parseAmount(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const normalized = value.replace(/[^\d.-]/g, '');
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
}

function getItemPrice(item = {}, orderType = 'retail') {
    if (orderType === 'wholesale') {
        return parseAmount(
            item.wholesalePrice
            || item.wholesale_price
            || item.cartonPrice
            || item.bulkPrice
            || item.price
        );
    }

    return parseAmount(
        item.price
        || item.retailPrice
        || item.retail_price
        || item.salePrice
        || item.sellingPrice
        || item.wholesalePrice
    );
}

function getOrderItemsSubtotal(order = {}) {
    return Array.isArray(order.items)
        ? order.items.reduce((sum, item) => sum + (getItemPrice(item, order.orderType) * Number(item.quantity || 1)), 0)
        : 0;
}

function getFirstPositiveAmount(order = {}, keys = []) {
    for (const key of keys) {
        const amount = parseAmount(order?.[key]);
        if (amount > 0) {
            return amount;
        }
    }

    return 0;
}

export function getOrderDiscountAmount(order = {}) {
    return getFirstPositiveAmount(order, ['discountAmount', 'discount_amount', 'discount']);
}

export function getOrderShippingAmount(order = {}) {
    return getFirstPositiveAmount(order, ['shippingAmount', 'shipping_amount', 'shippingCost', 'shipping_cost', 'shippingFee', 'shipping_fee']);
}

export function getOrderSubtotalAmount(order = {}) {
    const storedSubtotal = getFirstPositiveAmount(order, ['subtotalAmount', 'subtotal_amount', 'subtotal']);
    if (storedSubtotal > 0) {
        return storedSubtotal;
    }

    const itemsSubtotal = getOrderItemsSubtotal(order);
    if (itemsSubtotal > 0) {
        return itemsSubtotal;
    }

    const directFinalAmount = getFirstPositiveAmount(order, ['totalPrice', 'total', 'totalAmount', 'total_amount', 'amount', 'grandTotal', 'grand_total']);
    const inferredSubtotal = directFinalAmount + getOrderDiscountAmount(order) - getOrderShippingAmount(order);
    return inferredSubtotal > 0 ? inferredSubtotal : 0;
}

export function getOrderPreDiscountTotalAmount(order = {}) {
    const subtotalAmount = getOrderSubtotalAmount(order);
    const shippingAmount = getOrderShippingAmount(order);
    const calculatedTotal = subtotalAmount + shippingAmount;

    if (calculatedTotal > 0) {
        return calculatedTotal;
    }

    const directFinalAmount = getFirstPositiveAmount(order, ['totalPrice', 'total', 'totalAmount', 'total_amount', 'amount', 'grandTotal', 'grand_total']);
    const inferredTotal = directFinalAmount + getOrderDiscountAmount(order);
    return inferredTotal > 0 ? inferredTotal : 0;
}

export function getOrderAmount(order = {}) {
    const directAmount = getFirstPositiveAmount(order, ['totalPrice', 'total', 'totalAmount', 'total_amount', 'amount', 'grandTotal', 'grand_total']);
    if (directAmount > 0) {
        return directAmount;
    }

    const calculatedAmount = Math.max(0, getOrderPreDiscountTotalAmount(order) - getOrderDiscountAmount(order));
    if (calculatedAmount > 0) {
        return calculatedAmount;
    }

    return getOrderSubtotalAmount(order);
}

export function getOrderCustomerName(order = {}) {
    return order.shippingRecipient?.name
        || order.customer?.name
        || order.customer?.fullName
        || order.customerInfo?.fullName
        || order.customerInfo?.name
        || order.customerName
        || order.fullName
        || 'Guest';
}

export function getOrderCustomerPhone(order = {}) {
    return order.shippingRecipient?.phone
        || order.customer?.phone
        || order.customerInfo?.phone
        || order.phone
        || '';
}

export function getOrderDateValue(order = {}) {
    return order.createdAt || order.orderDate || order.date || null;
}

export function getOrderExternalRef(order = {}) {
    return String(
        order.dcSync?.externalOrderId
        || order.websiteOrderRef
        || order.externalOrderId
        || order.id
        || ''
    ).trim();
}

export function getOrderDcSyncState(order = {}) {
    const status = String(order.dcSync?.status || '').toLowerCase();

    if (status === 'success') {
        return {
            label: 'DC Synced',
            tone: 'success',
            message: order.dcSync?.message || 'Invoice synced successfully'
        };
    }

    if (status === 'sending') {
        return {
            label: 'DC Sending',
            tone: 'sending',
            message: order.dcSync?.message || 'Invoice is being sent to DC'
        };
    }

    if (status === 'failed') {
        return {
            label: 'DC Sync Failed',
            tone: 'failed',
            message: order.dcSync?.message || 'Invoice sync failed'
        };
    }

    return {
        label: 'DC Not Sent',
        tone: 'idle',
        message: 'Invoice has not been sent to DC yet'
    };
}

export function canSendOrderInvoice(order = {}) {
    const dcSyncStatus = String(order.dcSync?.status || '').toLowerCase();
    const orderStatus = normalizeOrderStatus(order.status);

    if (orderStatus === 'cancelled') {
        return false;
    }

    if (orderStatus !== 'confirmed') {
        return false;
    }

    return dcSyncStatus !== 'success' && dcSyncStatus !== 'sending';
}

function getOrderDeliveryMethod(order = {}) {
    return String(
        order.deliveryMethod
        || order.customerInfo?.deliveryMethod
        || order.customer?.deliveryMethod
        || 'pickup'
    ).trim().toLowerCase() === 'shipping'
        ? 'shipping'
        : 'pickup';
}

export function getOrderSideUpSyncState(order = {}) {
    const deliveryMethod = getOrderDeliveryMethod(order);
    const syncStatus = String(order.sideupSync?.status || '').trim().toLowerCase();
    const shipmentCode = String(order.sideupSync?.shipmentCode || '').trim();
    const areaName = String(order.sideupSync?.areaName || '').trim();

    if (deliveryMethod !== 'shipping') {
        return {
            label: 'Pickup Only',
            tone: 'pickup',
            message: 'This order does not need a shipping shipment',
            shipmentCode: '',
            areaName: ''
        };
    }

    if (syncStatus === 'success' || shipmentCode) {
        return {
            label: 'SideUp Sent',
            tone: 'success',
            message: order.sideupSync?.message || 'Order created successfully on SideUp',
            shipmentCode,
            areaName
        };
    }

    if (syncStatus === 'sending') {
        return {
            label: 'SideUp Sending',
            tone: 'sending',
            message: order.sideupSync?.message || 'Order is being created on SideUp',
            shipmentCode: '',
            areaName
        };
    }

    if (syncStatus === 'failed') {
        return {
            label: 'SideUp Failed',
            tone: 'failed',
            message: order.sideupSync?.message || 'SideUp order creation failed',
            shipmentCode,
            areaName
        };
    }

    return {
        label: 'SideUp Not Sent',
        tone: 'idle',
        message: 'Order has not been sent to SideUp yet',
        shipmentCode: '',
        areaName
    };
}

export function canPreviewOrderForSideUp(order = {}) {
    const deliveryMethod = getOrderDeliveryMethod(order);
    const orderStatus = normalizeOrderStatus(order.status);

    if (deliveryMethod !== 'shipping') {
        return false;
    }

    return orderStatus !== 'pending' && orderStatus !== 'cancelled';
}

export function canCreateOrderForSideUp(order = {}) {
    const deliveryMethod = getOrderDeliveryMethod(order);
    const orderStatus = normalizeOrderStatus(order.status);
    const sideupSyncStatus = String(order.sideupSync?.status || '').trim().toLowerCase();
    const shipmentCode = String(order.sideupSync?.shipmentCode || '').trim();

    if (deliveryMethod !== 'shipping') {
        return false;
    }

    if (orderStatus === 'pending' || orderStatus === 'cancelled') {
        return false;
    }

    return sideupSyncStatus !== 'sending' && sideupSyncStatus !== 'success' && !shipmentCode;
}