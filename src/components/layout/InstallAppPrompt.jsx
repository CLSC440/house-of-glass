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

function isLocalDevelopmentHost() {
    if (typeof window === 'undefined') return false;

    return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

export default function InstallAppPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isPromptVisible, setIsPromptVisible] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);
    const [isInstalling, setIsInstalling] = useState(false);
    const [showInstructions, setShowInstructions] = useState(false);
    const mobileDevice = useMemo(() => isMobileDevice(), []);
    const iosSafari = useMemo(() => isIosSafari(), []);

    useEffect(() => {
        if (!('serviceWorker' in navigator)) {
            return undefined;
        }

        if (isLocalDevelopmentHost()) {
            navigator.serviceWorker.getRegistrations()
                .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
                .catch((error) => {
                    console.error('Failed to unregister service workers on localhost:', error);
                });
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
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm lg:hidden animate-in fade-in duration-300">
            <div className="relative w-full max-w-sm">
                
                {/* Back shadow lights / glow */}
                <div className="absolute inset-0 h-full w-full transform scale-[0.85] rounded-full bg-gradient-to-r from-brandGold to-brandBlue opacity-50 blur-3xl"></div>
                
                <div className="relative flex w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0A101F] px-5 py-5 shadow-[0_18px_48px_rgba(4,8,20,0.5)]">
                    
                    {/* Close button top right */}
                    <button
                        type="button"
                        onClick={handleDismiss}
                        className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-slate-400 transition-colors hover:bg-white/15 hover:text-white"
                        aria-label="Dismiss install prompt"
                    >
                        <i className="fa-solid fa-xmark text-xs"></i>
                    </button>

                    {/* Icon */}
                    <div className="mb-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-brandGold">
                        <i className="fa-solid fa-download text-sm"></i>
                    </div>

                    {/* Title */}
                    <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-white">
                        Install App | تنزيل التطبيق
                    </h3>

                    {/* Description */}
                    <p className="mb-6 text-[13px] leading-relaxed text-slate-400">
                        {iosSafari
                            ? 'Use Safari share menu then tap Add to Home Screen for faster access. | افتح قائمة المشاركة في Safari ثم اختر Add to Home Screen للوصول السريع.'
                            : deferredPrompt
                                ? 'Install House Of Glass on your phone for faster access. | نزّل House Of Glass على موبايلك للوصول السريع.'
                                : 'You can add this site to your home screen from the browser menu. | يمكنك إضافة الموقع إلى الشاشة الرئيسية من قائمة المتصفح.'}
                    </p>

                    {/* Instructions Popover */}
                    {showInstructions && (
                        <div className="absolute bottom-20 left-4 right-4 z-10 rounded-xl border border-brandGold/20 bg-[#0d1323] p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.6)] backdrop-blur-3xl animate-in slide-in-from-bottom-2 fade-in">
                            <div className="mb-3 flex items-center justify-between">
                                <h4 className="text-[13px] font-black tracking-wide text-brandGold">
                                    {iosSafari ? 'Install App | للآيفون' : 'Install App | طريقة التنزيل'}
                                </h4>
                                <button
                                    onClick={() => setShowInstructions(false)}
                                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                                >
                                    <i className="fa-solid fa-xmark text-[10px]"></i>
                                </button>
                            </div>

                            <div className="flex flex-col gap-2.5">
                                {iosSafari ? (
                                    <>
                                        <div className="flex items-start gap-3 rounded-lg bg-white/5 p-2.5">
                                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brandGold text-brandBlue">
                                                <i className="fa-solid fa-arrow-up-from-bracket text-xs"></i>
                                            </div>
                                            <div className="text-[12px] font-medium leading-tight text-white">
                                                1. Tap the <strong className="text-brandGold">Share</strong> button.<br />
                                                <span className="mt-1 block text-[10px] text-slate-400">اضغط على زر المشاركة بالأسفل</span>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3 rounded-lg bg-white/5 p-2.5">
                                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brandGold text-brandBlue">
                                                <i className="fa-solid fa-square-plus text-xs"></i>
                                            </div>
                                            <div className="text-[12px] font-medium leading-tight text-white">
                                                2. Select <strong className="text-brandGold">Add to Home Screen</strong>.<br />
                                                <span className="mt-1 block text-[10px] text-slate-400">اختر إضافة إلى الشاشة الرئيسية</span>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex items-start gap-3 rounded-lg bg-white/5 p-2.5">
                                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brandGold text-brandBlue">
                                                <i className="fa-solid fa-ellipsis-vertical text-xs"></i>
                                            </div>
                                            <div className="text-[12px] font-medium leading-tight text-white">
                                                1. Open the <strong className="text-brandGold">browser menu (⋮)</strong>.<br />
                                                <span className="mt-1 block text-[10px] text-slate-400">افتح قائمة المتصفح</span>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3 rounded-lg bg-white/5 p-2.5">
                                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brandGold text-brandBlue">
                                                <i className="fa-solid fa-mobile-screen-button text-xs"></i>
                                            </div>
                                            <div className="text-[12px] font-medium leading-tight text-white">
                                                2. Select <strong className="text-brandGold">Install App</strong>.<br />
                                                <span className="mt-1 block text-[10px] text-slate-400">اختر تثبيت التطبيق</span>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                        {deferredPrompt ? (
                            <button
                                type="button"
                                onClick={handleInstall}
                                disabled={isInstalling}
                                className="inline-flex h-10 items-center justify-center rounded-lg border border-transparent bg-brandGold px-5 text-[13px] font-bold text-[#0A101F] transition-all hover:bg-[#e0be52] disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                <i className={`mr-2 fa-solid ${isInstalling ? 'fa-spinner fa-spin' : 'fa-download'}`}></i>
                                <span>{isInstalling ? 'Installing...' : 'Install Now'}</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowInstructions(!showInstructions)}
                                className="flex h-10 items-center justify-center rounded-lg border border-brandGold/30 bg-transparent px-5 text-[13px] font-bold text-brandGold transition-colors hover:bg-brandGold/10"
                            >
                                <i className={`mr-2 ${iosSafari ? 'fa-brands fa-apple' : 'fa-solid fa-circle-info'}`}></i>
                                <span>{iosSafari ? 'How to Install' : 'Instructions'}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleDismiss}
                            className="inline-flex h-10 px-5 items-center justify-center rounded-lg border border-white/10 bg-transparent text-[13px] font-bold text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                        >
                            Later
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}