'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { collection, doc, onSnapshot, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useFloatingActionsVisibility } from '@/lib/use-floating-actions-visibility';
import { formatNotificationTimeAgo, getNotificationVisuals, resolveNotificationDate } from '@/lib/utils/notifications';

export default function NotificationsCenter({ user, isAccountPanelOpen = false, onBeforeOpen, variant = 'storefront', isProductModalOpen = false }) {
    const pathname = usePathname();
    const router = useRouter();
    const [notifications, setNotifications] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const { isMounted, isVisible } = useFloatingActionsVisibility();
    const isAdminVariant = variant === 'admin';

    useEffect(() => {
        setIsOpen(false);
    }, [pathname, isAccountPanelOpen, isProductModalOpen]);

    useEffect(() => {
        if (!toastMessage) return undefined;

        const timeoutId = window.setTimeout(() => setToastMessage(''), 4000);
        return () => window.clearTimeout(timeoutId);
    }, [toastMessage]);

    useEffect(() => {
        if (!user?.uid) {
            setNotifications([]);
            return undefined;
        }

        const notificationsQuery = query(
            collection(db, 'notifications'),
            where('userId', '==', user.uid)
        );

        return onSnapshot(notificationsQuery, (snapshot) => {
            setNotifications((previousNotifications) => {
                const previousIds = new Set(previousNotifications.map((notification) => notification.id));
                const nextNotifications = snapshot.docs
                    .map((notificationDoc) => ({
                        id: notificationDoc.id,
                        ...notificationDoc.data()
                    }))
                    .sort((leftNotification, rightNotification) => {
                        const leftDate = resolveNotificationDate(leftNotification)?.getTime() || 0;
                        const rightDate = resolveNotificationDate(rightNotification)?.getTime() || 0;
                        return rightDate - leftDate;
                    });

                const newestUnreadNotification = nextNotifications.find((notification) => !notification.read && !previousIds.has(notification.id));
                if (newestUnreadNotification) {
                    setToastMessage(newestUnreadNotification.title || 'New notification | إشعار جديد');
                }

                return nextNotifications;
            });
        }, (error) => {
            console.error('Notifications listener error:', error);
        });
    }, [user?.uid]);

    const unreadCount = useMemo(
        () => notifications.filter((notification) => !notification.read).length,
        [notifications]
    );

    if (!user) {
        return null;
    }

    const togglePanel = () => {
        if (!isOpen) {
            onBeforeOpen?.();
        }
        setIsOpen((currentValue) => !currentValue);
    };

    const closePanel = () => setIsOpen(false);

    const markNotificationRead = async (notificationId, currentReadState) => {
        if (!notificationId || currentReadState) return;

        try {
            await updateDoc(doc(db, 'notifications', notificationId), { read: true });
        } catch (error) {
            console.error('Error marking notification read:', error);
        }
    };

    const markAllRead = async () => {
        const unreadNotifications = notifications.filter((notification) => !notification.read);
        if (unreadNotifications.length === 0) return;

        try {
            const batch = writeBatch(db);
            unreadNotifications.forEach((notification) => {
                batch.update(doc(db, 'notifications', notification.id), { read: true });
            });
            await batch.commit();
        } catch (error) {
            console.error('Error marking all notifications read:', error);
        }
    };

    const openNotificationAction = async (notification) => {
        if (!notification?.actionHref) return;

        await markNotificationRead(notification.id, notification.read);
        closePanel();
        router.push(notification.actionHref);
    };

    return (
        <>
            {!isAdminVariant ? (
                <button
                    id="notifDesktopBtn"
                    type="button"
                    onClick={togglePanel}
                    className={`relative hidden rounded-lg p-2 text-brandBlue transition-colors hover:bg-gray-100 dark:text-brandGold dark:hover:bg-gray-800 lg:flex ${unreadCount > 0 ? 'has-unread' : ''}`}
                    aria-label="Notifications"
                    title="Notifications"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 md:h-7 md:w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <NotificationBadge count={unreadCount} />
                </button>
            ) : null}

            {isMounted ? createPortal(
                <>
                    {isAdminVariant ? (
                        <button
                            id="notifAdminBtn"
                            type="button"
                            onClick={togglePanel}
                            className={`fixed right-5 top-5 z-[140] flex h-12 w-12 items-center justify-center rounded-full border border-brandGold/25 bg-[#171f36]/95 text-brandGold shadow-[0_20px_45px_rgba(4,8,20,0.48)] backdrop-blur-xl transition-all duration-300 hover:scale-105 ${unreadCount > 0 ? 'has-unread' : ''}`}
                            aria-label="Admin notifications"
                            title="Admin notifications"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            <NotificationBadge count={unreadCount} />
                        </button>
                    ) : (
                        <button
                            id="notifFloatingBtn"
                            type="button"
                            onClick={togglePanel}
                            className={`fixed bottom-[5.75rem] right-6 z-[120] flex h-12 w-12 items-center justify-center rounded-full bg-brandBlue text-white shadow-2xl shadow-brandBlue/40 transition-all duration-300 hover:scale-110 active:scale-95 dark:bg-brandGold dark:text-brandBlue lg:hidden ${unreadCount > 0 ? 'has-unread' : ''} ${isVisible && !isProductModalOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'pointer-events-none translate-y-4 opacity-0'}`}
                            aria-label="Notifications"
                            title="Notifications"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            <NotificationBadge count={unreadCount} />
                        </button>
                    )}

                    {toastMessage ? <NotificationToast message={toastMessage} /> : null}

                    {isOpen ? (
                        <>
                            <div className="fixed inset-0 z-[155] bg-black/10" onClick={closePanel}></div>
                            <div className={`fixed inset-0 z-[160] flex flex-col overflow-hidden bg-white dark:bg-darkCard md:inset-auto md:max-h-[70vh] md:w-96 md:rounded-2xl md:border md:border-gray-200 dark:md:border-gray-700 md:shadow-2xl ${isAdminVariant ? 'md:right-5 md:top-20' : 'md:right-8 md:top-20'}`}>
                                <div className="flex items-center justify-between border-b p-4 dark:border-gray-700">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-brandBlue dark:text-brandGold">Notifications | الإشعارات</h3>
                                    <div className="flex items-center gap-3">
                                        <button type="button" onClick={markAllRead} className="text-[10px] font-bold uppercase tracking-widest text-brandGold hover:underline">
                                            Mark all read
                                        </button>
                                        <button type="button" onClick={closePanel} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-400 shadow-sm transition-colors hover:text-red-500 dark:bg-gray-700 md:hidden">
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                <div className="flex-1 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
                                    {notifications.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12 text-gray-400 opacity-60">
                                            <svg className="mb-2 h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                            </svg>
                                            <p className="text-xs font-bold uppercase tracking-widest">No notifications</p>
                                            <p className="mt-1 text-[10px]">لا توجد إشعارات</p>
                                        </div>
                                    ) : (
                                        notifications.map((notification) => {
                                            const notificationVisuals = getNotificationVisuals(notification);
                                            const isUnread = !notification.read;

                                            return (
                                                <div
                                                    key={notification.id}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => markNotificationRead(notification.id, notification.read)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            markNotificationRead(notification.id, notification.read);
                                                        }
                                                    }}
                                                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${isUnread ? 'bg-brandGold/5' : ''}`}
                                                >
                                                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${notificationVisuals.iconClassName}`}>
                                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={notificationVisuals.iconPath} />
                                                        </svg>
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <p className={`text-xs font-bold text-brandBlue dark:text-white ${isUnread ? '' : 'opacity-60'}`}>{notification.title || ''}</p>
                                                        <p className="mt-0.5 whitespace-pre-line text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">{notification.message || ''}</p>
                                                        {notification.actionHref ? (
                                                            <button
                                                                type="button"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    openNotificationAction(notification);
                                                                }}
                                                                className="mt-2 inline-flex items-center gap-2 rounded-full border border-brandGold/25 bg-brandGold/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-brandGold transition-colors hover:bg-brandGold hover:text-brandBlue"
                                                            >
                                                                {notification.actionLabel || 'View Order'}
                                                                <i className="fa-solid fa-arrow-right text-[9px]"></i>
                                                            </button>
                                                        ) : null}
                                                        <p className="mt-1 text-[9px] uppercase tracking-widest text-gray-400">{formatNotificationTimeAgo(notification)}</p>
                                                    </div>

                                                    {isUnread ? <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notificationVisuals.unreadDotClassName}`}></div> : null}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </>
                    ) : null}
                </>,
                document.body
            ) : null}
        </>
    );
}

function NotificationBadge({ count }) {
    return (
        <span className={`absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white transition-all duration-300 ${count > 0 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}>
            {count > 9 ? '9+' : count}
        </span>
    );
}

function NotificationToast({ message }) {
    return (
        <div className="pointer-events-none fixed left-1/2 top-4 z-[200] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/10 bg-brandGold/90 px-5 py-3 text-brandBlue shadow-2xl backdrop-blur-md">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brandBlue/10">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
            </div>
            <div className="text-sm font-black tracking-wide">{message}</div>
        </div>
    );
}