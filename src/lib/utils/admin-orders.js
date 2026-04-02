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

export function getOrderAmount(order = {}) {
    const directAmount = parseAmount(
        order.totalPrice
        || order.total
        || order.totalAmount
        || order.total_amount
        || order.amount
        || order.grandTotal
        || order.grand_total
        || order.subtotal
    );

    const itemsAmount = Array.isArray(order.items)
        ? order.items.reduce((sum, item) => sum + (getItemPrice(item, order.orderType) * Number(item.quantity || 1)), 0)
        : 0;

    return directAmount > 0 ? directAmount : itemsAmount;
}

export function getOrderCustomerName(order = {}) {
    return order.customer?.name
        || order.customer?.fullName
        || order.customerInfo?.fullName
        || order.customerInfo?.name
        || order.customerName
        || order.fullName
        || 'Guest';
}

export function getOrderCustomerPhone(order = {}) {
    return order.customer?.phone
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
            label: 'Sending',
            tone: 'sending',
            message: order.dcSync?.message || 'Invoice is being sent to DC'
        };
    }

    if (status === 'failed') {
        return {
            label: 'Sync Failed',
            tone: 'failed',
            message: order.dcSync?.message || 'Invoice sync failed'
        };
    }

    return {
        label: 'Not Synced',
        tone: 'idle',
        message: 'Invoice has not been sent to DC yet'
    };
}

export function canSendOrderInvoice(order = {}) {
    const status = String(order.dcSync?.status || '').toLowerCase();
    return status !== 'success' && status !== 'sending';
}