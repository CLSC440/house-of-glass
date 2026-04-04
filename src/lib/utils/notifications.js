import { getOrderStatusMeta, normalizeOrderStatus } from '@/lib/utils/order-status';

function toSafeDate(value) {
    if (!value) return null;

    if (typeof value?.toDate === 'function') {
        return value.toDate();
    }

    const parsedDate = new Date(value);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

export function resolveNotificationDate(notification = {}) {
    return toSafeDate(notification.createdAt || notification.updatedAt || notification.date);
}

export function formatNotificationTimeAgo(notification = {}) {
    const date = resolveNotificationDate(notification);
    if (!date) return '';

    const diffInSeconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short'
    });
}

export function getNotificationVisuals(notification = {}) {
    const isUnread = !notification.read;
    const baseMuted = 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-400';

    if (notification.type === 'order_cancelled') {
        return {
            iconClassName: isUnread ? 'bg-red-500/10 text-red-500' : baseMuted,
            unreadDotClassName: 'bg-red-500',
            iconPath: 'M6 18L18 6M6 6l12 12'
        };
    }

    if (notification.type === 'order_completed' || notification.type === 'order_received') {
        return {
            iconClassName: isUnread ? 'bg-blue-500/10 text-blue-500' : baseMuted,
            unreadDotClassName: 'bg-blue-500',
            iconPath: 'M5 13l4 4L19 7'
        };
    }

    return {
        iconClassName: isUnread ? 'bg-green-500/10 text-green-500' : baseMuted,
        unreadDotClassName: 'bg-green-500',
        iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4'
    };
}

function getOrderItemsCount(order = {}) {
    return (Array.isArray(order.items) ? order.items : []).reduce((sum, item) => sum + Number(item?.quantity || 0), 0);
}

function getNotificationRecipientUid(order = {}) {
    return String(order?.customer?.uid || order?.customerInfo?.uid || '').trim();
}

function getStatusNotificationCopy(normalizedStatus, itemsCount) {
    const itemLabel = itemsCount > 0 ? `${itemsCount} ${itemsCount === 1 ? 'item' : 'items'}` : 'your order';
    const arabicCountLabel = itemsCount > 0 ? `${itemsCount} ${itemsCount === 1 ? 'منتج' : 'منتج'}` : 'طلبك';

    if (normalizedStatus === 'confirmed') {
        return {
            title: 'Order Received | تم استلام طلبك',
            message: `Your order (${itemLabel}) has been received and is under review.\nتم استلام طلبك (${arabicCountLabel}) وهو تحت المراجعة الآن.`
        };
    }

    if (normalizedStatus === 'completed') {
        return {
            title: 'Order Prepared | تم تجهيز طلبك',
            message: `Your order (${itemLabel}) has been prepared successfully and is ready for the final step.\nتم تجهيز طلبك (${arabicCountLabel}) بنجاح وهو الآن في مرحلته النهائية.`
        };
    }

    if (normalizedStatus === 'received') {
        return {
            title: 'Order Received Successfully | تم استلام الطلب بنجاح',
            message: 'Your order has been marked as received successfully. Thank you for shopping with us.\nتم تأكيد استلام طلبك بنجاح. شكراً لتسوقك معنا.'
        };
    }

    if (normalizedStatus === 'cancelled') {
        return {
            title: 'Order Cancelled | تم إلغاء طلبك',
            message: `Your order (${itemLabel}) has been cancelled. Contact us for details.\nتم إلغاء طلبك (${arabicCountLabel}). تواصل معنا لمزيد من التفاصيل.`
        };
    }

    const statusMeta = getOrderStatusMeta(normalizedStatus);
    return {
        title: `${statusMeta.label} | ${statusMeta.customerLabel}`,
        message: statusMeta.description
    };
}

export function buildOrderStatusNotification(order = {}, nextStatus) {
    const normalizedStatus = normalizeOrderStatus(nextStatus);
    const userId = getNotificationRecipientUid(order);

    if (!userId || normalizedStatus === 'pending') {
        return null;
    }

    const itemsCount = getOrderItemsCount(order);
    const copy = getStatusNotificationCopy(normalizedStatus, itemsCount);

    return {
        userId,
        orderId: String(order.id || '').trim(),
        type: `order_${normalizedStatus}`,
        status: normalizedStatus,
        title: copy.title,
        message: copy.message,
        read: false
    };
}

function getNotificationCustomerName(order = {}) {
    return String(
        order?.customer?.name
        || order?.customerInfo?.fullName
        || order?.customerInfo?.name
        || order?.customer?.email
        || 'A customer'
    ).trim();
}

export function buildAdminOrderCreatedNotification(order = {}, recipientUserId = '') {
    const userId = String(recipientUserId || '').trim();
    const orderId = String(order?.id || '').trim();

    if (!userId || !orderId) {
        return null;
    }

    const orderType = String(order?.orderType || 'retail').trim().toLowerCase() === 'wholesale' ? 'wholesale' : 'retail';
    const customerName = getNotificationCustomerName(order);
    const itemCount = Number(order?.itemCount || getOrderItemsCount(order) || 0);
    const externalRef = String(order?.websiteOrderRef || orderId).trim();
    const englishOrderLabel = orderType === 'wholesale' ? 'Wholesale Order' : 'Retail Order';
    const arabicOrderLabel = orderType === 'wholesale' ? 'طلب جملة جديد' : 'طلب جديد';

    return {
        userId,
        orderId,
        type: 'admin_order_created',
        title: `${englishOrderLabel} | ${arabicOrderLabel}`,
        message: `${customerName} placed a ${orderType} order with ${itemCount || 'multiple'} item${itemCount === 1 ? '' : 's'}. Order #${externalRef}.\nقام ${customerName} بإرسال ${orderType === 'wholesale' ? 'طلب جملة' : 'طلب'} يحتوي على ${itemCount || 'عدة'} منتج. رقم الطلب #${externalRef}.`,
        actionHref: `/admin/orders?orderId=${encodeURIComponent(orderId)}`,
        actionLabel: 'View Order | عرض الطلب',
        read: false
    };
}