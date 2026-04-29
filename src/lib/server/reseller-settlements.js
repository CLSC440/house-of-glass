export const RESELLER_ORDERS_COLLECTION = 'resellerOrders';
export const RESELLER_SETTLEMENT_BATCHES_COLLECTION = 'resellerSettlementBatches';
export const RESELLER_SETTLEMENT_STATUS_ORDER = Object.freeze([
    'open',
    'submitted',
    'invoiced',
    'paid'
]);
export const RESELLER_BRANCH_SNAPSHOT = Object.freeze({
    id: 'branch-pickup',
    label: 'Branch Pickup'
});

export function createError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

export function roundCurrency(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return 0;
    }

    return Math.round((numericValue + Number.EPSILON) * 100) / 100;
}

export function normalizeText(value, maxLength = 200) {
    return String(value || '').trim().slice(0, maxLength);
}

export function createBatchDateKey(dateValue = new Date()) {
    const resolvedDate = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (Number.isNaN(resolvedDate.getTime())) {
        return new Date().toISOString().slice(0, 10);
    }

    return resolvedDate.toISOString().slice(0, 10);
}

export function createSettlementKey(resellerUid, batchDateKey = createBatchDateKey()) {
    return `${normalizeText(resellerUid, 128)}:${String(batchDateKey || '').slice(0, 10)}`;
}

export function createSettlementBatchId(resellerUid, batchDateKey = createBatchDateKey()) {
    const safeUid = String(resellerUid || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'reseller';
    const safeDate = String(batchDateKey || '').slice(0, 10) || createBatchDateKey();
    return `reseller-batch_${safeUid}_${safeDate}`;
}

export function sortOrdersByCreatedAtDesc(orders = []) {
    return [...orders].sort((leftOrder, rightOrder) => new Date(rightOrder.createdAtIso || 0) - new Date(leftOrder.createdAtIso || 0));
}

export function buildBatchTotals(orders = []) {
    const activeOrders = orders.filter((order) => normalizeText(order.status) !== 'cancelled');
    const cancelledOrdersCount = orders.length - activeOrders.length;

    const totals = activeOrders.reduce((summary, order) => ({
        ordersCount: summary.ordersCount + 1,
        quantity: summary.quantity + Number(order?.totals?.quantity || 0),
        wholesale: roundCurrency(summary.wholesale + Number(order?.totals?.wholesale || 0)),
        public: roundCurrency(summary.public + Number(order?.totals?.public || 0)),
        sold: roundCurrency(summary.sold + Number(order?.totals?.sold || 0)),
        profit: roundCurrency(summary.profit + Number(order?.totals?.profit || 0))
    }), {
        ordersCount: 0,
        quantity: 0,
        wholesale: 0,
        public: 0,
        sold: 0,
        profit: 0
    });

    return {
        ...totals,
        dueToAdmin: totals.wholesale,
        cancelledOrdersCount
    };
}

export function buildResellerSnapshot(roleContext = {}, tokenData = {}) {
    return {
        uid: roleContext.uid,
        name: normalizeText(roleContext.userData?.name || tokenData.name || tokenData.email || 'Reseller', 160),
        email: normalizeText(roleContext.userData?.email || tokenData.email || '', 254)
    };
}

export function normalizeSettlementStatus(value) {
    const normalizedValue = normalizeText(value, 40).toLowerCase();
    return RESELLER_SETTLEMENT_STATUS_ORDER.includes(normalizedValue) ? normalizedValue : '';
}

export function getNextSettlementStatus(currentStatus) {
    const normalizedStatus = normalizeSettlementStatus(currentStatus) || 'open';
    const currentIndex = RESELLER_SETTLEMENT_STATUS_ORDER.indexOf(normalizedStatus);
    if (currentIndex === -1 || currentIndex >= RESELLER_SETTLEMENT_STATUS_ORDER.length - 1) {
        return '';
    }

    return RESELLER_SETTLEMENT_STATUS_ORDER[currentIndex + 1];
}

export function canTransitionSettlementStatus(currentStatus, nextStatus) {
    return getNextSettlementStatus(currentStatus) === normalizeSettlementStatus(nextStatus);
}