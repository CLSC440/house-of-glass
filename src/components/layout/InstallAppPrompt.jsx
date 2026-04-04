'use client';

import { useEffect, useMemo, useState } from 'react';

const DISMISS_KEY = 'hog-install-prompt-dismissed-at';
const DISMISS_DURATION_MS = 1000 * 60 * 60 * 24 * 3;

function isMobileDevice() {
    if (typeof window === 'undefined') return false;

    const userAgent = navigator.userAgent || navigator.vendor || '';
    return /android|iphone|ipad|ipod|mobile/i.test(userAgent) || window.innerWidth < 1024;
}

function isIosSafari() {
    if (typeof window === 'undefined') return false;

    const userAgent = navigator.userAgent || '';
    const isIos = /iphone|ipad|ipod/i.test(userAgent);
    const isSafari = /safari/i.test(userAgent) && !/crios|fxios|edgios|opr"]/i.test(userAgent);
    return isIos && isSafari;
}

function isRunningStandalone() {
    if (typeof window === 'undefined') return false;

    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export default function InstallAppPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isPromptVisible, setIsPromptVisible] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);
    const [isInstalling, setIsInstalling] = useState(false);
    const mobileDevice = useMemo(() => isMobileDevice(), []);
    const iosSafari = useMemo(() => isIosSafari(), []);

    useEffect(() => {
        if (!('serviceWorker' in navigator)) {
            return undefined;
        }

        navigator.serviceWorker.register('/sw.js').catch((error) => {
            console.error('Service worker registration failed:', error);
        });

        return undefined;
    }, []);

    useEffect(() => {
        const installed = isRunningStandalone();
        setIsInstalled(installed);

        if (!mobileDevice || installed) {
            setIsPromptVisible(false);
            return undefined;
        }

        const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
        if (dismissedAt && Date.now() - dismissedAt < DISMISS_DURATION_MS) {
            setIsPromptVisible(false);
        } else {
            setIsPromptVisible(true);
        }

        const handleBeforeInstallPrompt = (event) => {
            event.preventDefault();
            setDeferredPrompt(event);
            setIsPromptVisible(true);
        };

        const handleAppInstalled = () => {
            setIsInstalled(true);
            setDeferredPrompt(null);
            setIsPromptVisible(false);
            window.localStorage.removeItem(DISMISS_KEY);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, [mobileDevice]);

    const handleDismiss = () => {
        window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
        setIsPromptVisible(false);
    };

    const handleInstall = async () => {
        if (!deferredPrompt) {
            return;
        }

        setIsInstalling(true);
        try {
            await deferredPrompt.prompt();
            await deferredPrompt.userChoice;
        } finally {
            setDeferredPrompt(null);
            setIsInstalling(false);
        }
    };

    if (!mobileDevice || isInstalled || !isPromptVisible) {
        return null;
    }

    return (
        <div className="fixed inset-x-3 bottom-3 z-[210] lg:hidden">
            <div className="mx-auto max-w-sm overflow-hidden rounded-[1.5rem] border border-brandGold/20 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.18),transparent_38%),linear-gradient(180deg,rgba(18,26,45,0.98),rgba(10,16,31,0.98))] shadow-[0_18px_48px_rgba(4,8,20,0.42)] backdrop-blur-xl">
                <div className="flex items-start gap-3 px-3.5 pb-2.5 pt-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brandGold/95 text-brandBlue shadow-[0_10px_24px_rgba(212,175,55,0.22)]">
                        <i className="fa-solid fa-download text-xs"></i>
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <span className="inline-flex rounded-full border border-brandGold/20 bg-brandGold/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-brandGold/90">
                                    Quick Install
                                </span>
                                <p className="mt-2 text-[13px] font-black leading-tight text-brandGold">
                                    Install App | تنزيل التطبيق
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={handleDismiss}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/8 text-slate-300 transition-colors hover:bg-white/15 hover:text-white"
                                aria-label="Dismiss install prompt"
                            >
                                <i className="fa-solid fa-xmark text-xs"></i>
                            </button>
                        </div>

                        <p className="mt-2 text-[11px] leading-5 text-slate-300/95">
                            {iosSafari
                                ? 'Use Safari share menu then tap Add to Home Screen. | افتح قائمة المشاركة في Safari ثم اختر Add to Home Screen.'
                                : deferredPrompt
                                    ? 'Install House Of Glass on your phone for faster access. | نزّل House Of Glass على موبايلك للوصول السريع.'
                                    : 'You can add this site to your home screen from the browser menu. | يمكنك إضافة الموقع إلى الشاشة الرئيسية من قائمة المتصفح.'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 border-t border-white/10 px-3.5 py-3">
                    {deferredPrompt ? (
                        <button
                            type="button"
                            onClick={handleInstall}
                            disabled={isInstalling}
                            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-brandGold px-4 text-[12px] font-black text-brandBlue transition-all hover:bg-[#e0be52] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            <i className={`fa-solid ${isInstalling ? 'fa-spinner fa-spin' : 'fa-mobile-screen-button'}`}></i>
                            <span>{isInstalling ? 'Installing...' : 'Install App'}</span>
                        </button>
                    ) : (
                        <div className="flex h-11 flex-1 items-center justify-center rounded-full border border-brandGold/20 bg-brandGold/10 px-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-brandGold">
                            {iosSafari ? 'Safari: Share > Add to Home Screen' : 'Browser Menu > Install App'}
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