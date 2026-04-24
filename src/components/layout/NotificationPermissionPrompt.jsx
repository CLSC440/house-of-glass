'use client';

import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

const LOGIN_PROMPT_SESSION_KEY = 'hog_prompt_notifications_after_login';
const SERVICE_WORKER_URL = '/sw.js?v=20260424-2';

function isMobileDevice() {
    if (typeof window === 'undefined') return false;

    const userAgent = navigator.userAgent || '';
    return /android|iphone|ipad|ipod|mobile/i.test(userAgent) || window.innerWidth < 1024;
}

function isIosSafari() {
    if (typeof window === 'undefined') return false;

    const userAgent = navigator.userAgent || '';
    const isIos = /iphone|ipad|ipod/i.test(userAgent);
    const isSafari = /safari/i.test(userAgent) && !/crios|fxios|edgios|opr\//i.test(userAgent);
    return isIos && isSafari;
}

function isStandaloneMode() {
    if (typeof window === 'undefined') return false;

    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isLocalDevelopmentHost() {
    if (typeof window === 'undefined') return false;

    return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function canUseNativePush() {
    return typeof window !== 'undefined'
        && !isLocalDevelopmentHost()
        && 'Notification' in window
        && 'serviceWorker' in navigator
        && 'PushManager' in window;
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let index = 0; index < rawData.length; index += 1) {
        outputArray[index] = rawData.charCodeAt(index);
    }

    return outputArray;
}

async function ensureServiceWorkerRegistration() {
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
    await registration.update().catch(() => undefined);
    return navigator.serviceWorker.ready;
}

export default function NotificationPermissionPrompt() {
    const previousUserRef = useRef(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [publicKey, setPublicKey] = useState('');
    const [isPushConfigured, setIsPushConfigured] = useState(false);
    const mobileDevice = isMobileDevice();
    const iosSafari = isIosSafari();
    const standaloneMode = isStandaloneMode();
    const nativePushAvailable = canUseNativePush();
    const permissionState = nativePushAvailable ? Notification.permission : 'unsupported';

    const detachCurrentSubscription = async (user) => {
        if (!user || !nativePushAvailable) return;

        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = await registration?.pushManager?.getSubscription?.();
        const endpoint = subscription?.endpoint;
        if (!endpoint) return;

        const idToken = await user.getIdToken();
        await fetch('/api/notifications/push-subscription', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`
            },
            body: JSON.stringify({ endpoint })
        }).catch(() => undefined);
    };

    const syncCurrentSubscription = async (user) => {
        if (!user || !nativePushAvailable || Notification.permission !== 'granted' || !publicKey) {
            return;
        }

        const registration = await ensureServiceWorkerRegistration();
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
        }

        const idToken = await user.getIdToken();
        const response = await fetch('/api/notifications/push-subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`
            },
            body: JSON.stringify({
                subscription: subscription.toJSON(),
                userAgent: navigator.userAgent
            })
        });

        if (!response.ok) {
            const errorPayload = await response.json().catch(() => ({}));
            throw new Error(errorPayload?.error || 'Failed to save push subscription');
        }
    };

    useEffect(() => {
        fetch('/api/notifications/push-subscription')
            .then((response) => response.json())
            .then((data) => {
                setPublicKey(String(data?.publicKey || '').trim());
                setIsPushConfigured(Boolean(data?.supported && data?.publicKey));
            })
            .catch((error) => {
                console.error('Failed to load push notification config:', error);
                setIsPushConfigured(false);
            });
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            try {
                const previousUser = previousUserRef.current;
                if (previousUser && !user) {
                    await detachCurrentSubscription(previousUser);
                }
            } catch (error) {
                console.error('Failed to detach push subscription on logout:', error);
            }

            previousUserRef.current = user;
            setCurrentUser(user || null);

            if (!user || !mobileDevice) {
                setIsVisible(false);
                return;
            }

            if (nativePushAvailable && Notification.permission === 'granted' && isPushConfigured) {
                try {
                    await syncCurrentSubscription(user);
                } catch (error) {
                    console.error('Failed to sync push subscription:', error);
                }
                setIsVisible(false);
                sessionStorage.removeItem(LOGIN_PROMPT_SESSION_KEY);
                return;
            }

            const shouldPromptAfterLogin = sessionStorage.getItem(LOGIN_PROMPT_SESSION_KEY) === '1';
            if (shouldPromptAfterLogin && permissionState !== 'denied') {
                setIsVisible(true);
            }
        });

        return () => unsubscribe();
    }, [isPushConfigured, mobileDevice, nativePushAvailable, permissionState, publicKey]);

    const handleDismiss = () => {
        sessionStorage.removeItem(LOGIN_PROMPT_SESSION_KEY);
        setIsVisible(false);
    };

    const handleEnable = async () => {
        if (!currentUser || !nativePushAvailable || !isPushConfigured) {
            return;
        }

        setIsBusy(true);
        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                await syncCurrentSubscription(currentUser);
            }
            sessionStorage.removeItem(LOGIN_PROMPT_SESSION_KEY);
            setIsVisible(false);
        } catch (error) {
            console.error('Failed to enable notifications:', error);
        } finally {
            setIsBusy(false);
        }
    };

    if (!currentUser || !mobileDevice || !isVisible) {
        return null;
    }

    const needsInstallFirst = iosSafari && !standaloneMode;
    const canEnableNow = nativePushAvailable && isPushConfigured && !needsInstallFirst;

    return (
        <div className="fixed inset-x-3 bottom-3 z-[215] lg:hidden">
            <div className="mx-auto max-w-sm overflow-hidden rounded-[1.5rem] border border-brandGold/20 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.18),transparent_38%),linear-gradient(180deg,rgba(18,26,45,0.98),rgba(10,16,31,0.98))] shadow-[0_18px_48px_rgba(4,8,20,0.42)] backdrop-blur-xl">
                <div className="flex items-start gap-3 px-3.5 pb-2.5 pt-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brandGold/95 text-brandBlue shadow-[0_10px_24px_rgba(212,175,55,0.22)]">
                        <i className="fa-solid fa-bell text-xs"></i>
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <span className="inline-flex rounded-full border border-brandGold/20 bg-brandGold/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-brandGold/90">
                                    Mobile Alerts
                                </span>
                                <p className="mt-2 text-[13px] font-black leading-tight text-brandGold">
                                    Enable Notifications | فعّل الإشعارات
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={handleDismiss}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/8 text-slate-300 transition-colors hover:bg-white/15 hover:text-white"
                                aria-label="Dismiss notification prompt"
                            >
                                <i className="fa-solid fa-xmark text-xs"></i>
                            </button>
                        </div>

                        <p className="mt-2 text-[11px] leading-5 text-slate-300/95">
                            {needsInstallFirst
                                ? 'On iPhone, install the app first from Safari, then enable notifications. | على iPhone لازم تثبّت التطبيق أولاً من Safari ثم تفعّل الإشعارات.'
                                : 'Turn on notifications so new order updates reach you on mobile. | فعّل الإشعارات حتى تصلك تحديثات الطلبات على الموبايل.'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 border-t border-white/10 px-3.5 py-3">
                    {canEnableNow ? (
                        <button
                            type="button"
                            onClick={handleEnable}
                            disabled={isBusy}
                            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-brandGold px-4 text-[12px] font-black text-brandBlue transition-all hover:bg-[#e0be52] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            <i className={`fa-solid ${isBusy ? 'fa-spinner fa-spin' : 'fa-bell'}`}></i>
                            <span>{isBusy ? 'Enabling...' : 'Enable Now'}</span>
                        </button>
                    ) : (
                        <div className="flex h-11 flex-1 items-center justify-center rounded-full border border-brandGold/20 bg-brandGold/10 px-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-brandGold">
                            {needsInstallFirst ? 'Install App First' : 'Notifications Not Ready Yet'}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleDismiss}
                        className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 px-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 transition-colors hover:border-brandGold/30 hover:text-brandGold"
                    >
                        Later
                    </button>
                </div>
            </div>
        </div>
    );
}