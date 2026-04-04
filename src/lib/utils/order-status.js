const ORDER_STATUS_META = {
    pending: {
        value: 'pending',
        label: 'Pending',
        customerLabel: 'قيد المراجعة',
        description: 'استلمنا طلبك وسيقوم الفريق بمراجعته في اقرب وقت ممكن.',
        progressIndex: 0,
        dotClass: 'bg-amber-300',
        lightBadgeClass: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/30 dark:bg-amber-900/20 dark:text-amber-300',
        darkBadgeClass: 'bg-amber-500/10 text-amber-300',
        adminTriggerClass: 'border-amber-400/35 bg-amber-500/12 text-amber-300 hover:bg-amber-500/18',
        adminMenuClass: 'hover:bg-amber-500/12 hover:text-amber-200'
    },
    confirmed: {
        value: 'confirmed',
        label: 'Confirmed',
        customerLabel: 'تم التأكيد',
        description: 'تمت مراجعة طلبك وتأكيده بنجاح.',
        progressIndex: 1,
        dotClass: 'bg-sky-300',
        lightBadgeClass: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/30 dark:bg-sky-900/20 dark:text-sky-300',
        darkBadgeClass: 'bg-sky-500/10 text-sky-300',
        adminTriggerClass: 'border-sky-400/35 bg-sky-500/12 text-sky-300 hover:bg-sky-500/18',
        adminMenuClass: 'hover:bg-sky-500/12 hover:text-sky-200'
    },
    completed: {
        value: 'completed',
        label: 'Completed',
        customerLabel: 'تم التجهيز',
        description: 'تم تجهيز طلبك بنجاح وهو الآن في مرحلته النهائية.',
        progressIndex: 2,
        dotClass: 'bg-emerald-300',
        lightBadgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/20 dark:text-emerald-300',
        darkBadgeClass: 'bg-emerald-500/10 text-emerald-400',
        adminTriggerClass: 'border-emerald-400/35 bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/18',
        adminMenuClass: 'hover:bg-emerald-500/12 hover:text-emerald-200'
    },
    received: {
        value: 'received',
        label: 'Received',
        customerLabel: 'تم الاستلام بنجاح',
        description: 'تم استلام الطلب بنجاح.',
        progressIndex: 3,
        dotClass: 'bg-emerald-300',
        lightBadgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/20 dark:text-emerald-300',
        darkBadgeClass: 'bg-emerald-500/10 text-emerald-400',
        adminTriggerClass: 'border-emerald-400/35 bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/18',
        adminMenuClass: 'hover:bg-emerald-500/12 hover:text-emerald-200'
    },
    cancelled: {
        value: 'cancelled',
        label: 'Cancelled',
        customerLabel: 'تم الإلغاء',
        description: 'تم إلغاء هذا الطلب. تواصل مع الدعم إذا كنت تحتاج تفاصيل أكثر.',
        progressIndex: -1,
        dotClass: 'bg-rose-300',
        lightBadgeClass: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/30 dark:bg-rose-900/20 dark:text-rose-300',
        darkBadgeClass: 'bg-rose-500/10 text-rose-400',
        adminTriggerClass: 'border-rose-400/35 bg-rose-500/12 text-rose-300 hover:bg-rose-500/18',
        adminMenuClass: 'hover:bg-rose-500/12 hover:text-rose-200'
    }
};

export const ORDER_STATUS_SEQUENCE = ['pending', 'confirmed', 'completed', 'received'];

export const ORDER_STATUS_OPTIONS = [
    ORDER_STATUS_META.pending,
    ORDER_STATUS_META.confirmed,
    ORDER_STATUS_META.completed,
    ORDER_STATUS_META.received,
    ORDER_STATUS_META.cancelled
].map((status) => ({
    value: status.value,
    label: status.label
}));

export function normalizeOrderStatus(status) {
    const normalized = String(status || '').trim().toLowerCase();

    if (normalized === 'processing') {
        return 'confirmed';
    }

    if (normalized === 'shipped') {
        return 'completed';
    }

    return ORDER_STATUS_META[normalized] ? normalized : 'pending';
}

export function getOrderStatusMeta(status) {
    return ORDER_STATUS_META[normalizeOrderStatus(status)];
}

export function buildOrderStatusHistoryEntry(status, overrides = {}) {
    const meta = getOrderStatusMeta(status);
    const at = overrides.at || new Date().toISOString();

    return {
        status: meta.value,
        label: meta.label,
        customerLabel: meta.customerLabel,
        description: overrides.description || meta.description,
        at,
        note: overrides.note || '',
        ...(overrides.updatedBy ? { updatedBy: overrides.updatedBy } : {})
    };
}

export function getOrderStatusHistory(order = {}) {
    const existingHistory = Array.isArray(order.statusHistory)
        ? order.statusHistory
            .map((entry) => {
                const meta = getOrderStatusMeta(entry?.status || order.status);
                return {
                    status: meta.value,
                    label: entry?.label || meta.label,
                    customerLabel: entry?.customerLabel || meta.customerLabel,
                    description: entry?.description || meta.description,
                    at: entry?.at || entry?.updatedAt || entry?.date || order.statusUpdatedAt || order.createdAt || order.orderDate || null,
                    note: entry?.note || '',
                    ...(entry?.updatedBy ? { updatedBy: entry.updatedBy } : {})
                };
            })
            .filter((entry) => entry.at)
        : [];

    if (existingHistory.length > 0) {
        return existingHistory.sort((leftEntry, rightEntry) => new Date(leftEntry.at || 0) - new Date(rightEntry.at || 0));
    }

    return [buildOrderStatusHistoryEntry(order.status || 'pending', {
        at: order.statusUpdatedAt || order.createdAt || order.orderDate || new Date().toISOString()
    })];
}

export function appendOrderStatusHistory(history = [], nextStatus, overrides = {}) {
    const normalizedHistory = Array.isArray(history) ? history : [];
    const nextEntry = buildOrderStatusHistoryEntry(nextStatus, overrides);
    const lastEntry = normalizedHistory[normalizedHistory.length - 1];

    if (lastEntry && normalizeOrderStatus(lastEntry.status) === nextEntry.status) {
        return [
            ...normalizedHistory.slice(0, -1),
            {
                ...lastEntry,
                ...nextEntry,
                note: nextEntry.note || lastEntry.note || ''
            }
        ];
    }

    return [...normalizedHistory, nextEntry];
}

export function getOrderTrackingSteps(status) {
    const normalizedStatus = normalizeOrderStatus(status);

    if (normalizedStatus === 'cancelled') {
        return ORDER_STATUS_SEQUENCE.map((stepStatus) => ({
            ...getOrderStatusMeta(stepStatus),
            state: 'upcoming'
        }));
    }

    const currentMeta = getOrderStatusMeta(normalizedStatus);
    return ORDER_STATUS_SEQUENCE.map((stepStatus, index) => ({
        ...getOrderStatusMeta(stepStatus),
        state: index < currentMeta.progressIndex
            ? 'completed'
            : index === currentMeta.progressIndex
                ? 'current'
                : 'upcoming'
    }));
}

export function getAllowedOrderStatusTransitions(status) {
    const normalizedStatus = normalizeOrderStatus(status);

    if (normalizedStatus === 'pending') {
        return ['confirmed', 'cancelled'];
    }

    if (normalizedStatus === 'confirmed') {
        return ['completed', 'cancelled'];
    }

    if (normalizedStatus === 'completed') {
        return ['received', 'cancelled'];
    }

    return [];
}