'use client';

import { useEffect, useMemo, useState } from 'react';

const DISMISS_KEY = 'hog-install-prompt-dismissed-at';
const DISMISS_DURATION_MS = 1000 * 60 * 60 * 24 * 3;
const BUTTON_FEEDBACK_DURATION_MS = 320;

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
    const [isActionPressed, setIsActionPressed] = useState(false);
    const [showFallbackSteps, setShowFallbackSteps] = useState(false);
    const mobileDevice = useMemo(() => isMobileDevice(), []);
    const iosSafari = useMemo(() => isIosSafari(), []);
    const canUseShareMenu = useMemo(() => {
        if (typeof window === 'undefined') return false;
        return typeof navigator.share === 'function';
    }, []);

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

    const triggerActionFeedback = () => {
        setIsActionPressed(true);

        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(18);
        }

        window.setTimeout(() => {
            setIsActionPressed(false);
        }, BUTTON_FEEDBACK_DURATION_MS);
    };

    const handleInstall = async () => {
        if (!deferredPrompt) {
            return;
        }

        setShowFallbackSteps(false);
        setIsInstalling(true);
        try {
            await deferredPrompt.prompt();
            await deferredPrompt.userChoice;
        } finally {
            setDeferredPrompt(null);
            setIsInstalling(false);
        }
    };

    const handleOpenShareMenu = async () => {
        if (!canUseShareMenu) {
            setShowFallbackSteps(true);
            return;
        }

        setShowFallbackSteps(false);
        try {
            await navigator.share({
                title: 'House Of Glass',
                text: 'Install House Of Glass on your iPhone.',
                url: window.location.href
            });
        } catch (error) {
            if (error?.name !== 'AbortError') {
                console.error('Failed to open iOS share menu:', error);
            }
        }
    };

    const handlePrimaryAction = async () => {
        triggerActionFeedback();

        if (iosSafari) {
            await handleOpenShareMenu();
            if (!canUseShareMenu) {
                setShowFallbackSteps(true);
            }
            return;
        }

        if (deferredPrompt) {
            await handleInstall();
            return;
        }

        setShowFallbackSteps(true);
    };

    const fallbackStepsTitle = iosSafari
        ? 'iPhone Steps | خطوات الايفون'
        : 'Install Steps | خطوات التثبيت';

    const fallbackSteps = iosSafari
        ? [
            '1. اضغط زر المشاركة في Safari.',
            '2. اختر Add to Home Screen.',
            '3. اضغط Add لتثبيت التطبيق.'
        ]
        : [
            '1. افتح قائمة المتصفح.',
            '2. اختر Install App أو Add to Home Screen.',
            '3. أكد التثبيت من الرسالة التي ستظهر.'
        ];

    const primaryActionLabel = iosSafari
        ? (canUseShareMenu ? 'Open Share Menu' : 'Show Install Steps')
        : deferredPrompt
            ? (isInstalling ? 'Installing...' : 'Install App')
            : 'Show Install Steps';

    const primaryActionIcon = iosSafari
        ? 'fa-arrow-up-from-bracket'
        : deferredPrompt
            ? (isInstalling ? 'fa-spinner fa-spin' : 'fa-mobile-screen-button')
            : 'fa-circle-info';

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
                                ? 'Tap the button below to open the iPhone share menu, then choose Add to Home Screen. | اضغط الزر بالأسفل لفتح قائمة المشاركة في iPhone ثم اختر Add to Home Screen.'
                                : deferredPrompt
                                    ? 'Install House Of Glass on your phone for faster access. | نزّل House Of Glass على موبايلك للوصول السريع.'
                                    : 'You can add this site to your home screen from the browser menu. | يمكنك إضافة الموقع إلى الشاشة الرئيسية من قائمة المتصفح.'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 border-t border-white/10 px-3.5 py-3">
                    <button
                        type="button"
                        onClick={handlePrimaryAction}
                        disabled={isInstalling}
                        className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-[12px] font-black transition-all ${showFallbackSteps ? 'border border-brandGold/35 bg-brandGold/12 text-brandGold' : 'bg-brandGold text-brandBlue hover:bg-[#e0be52]'} ${isActionPressed ? 'scale-[0.97] shadow-[0_0_0_4px_rgba(212,175,55,0.16)]' : 'scale-100'} disabled:cursor-not-allowed disabled:opacity-70`}
                    >
                        <i className={`fa-solid ${primaryActionIcon}`}></i>
                        <span>{primaryActionLabel}</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleDismiss}
                        className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 px-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 transition-colors hover:border-brandGold/30 hover:text-brandGold"
                    >
                        Later
                    </button>
                </div>

                {showFallbackSteps ? (
                    <div className="border-t border-white/10 px-3.5 pb-3.5 pt-3">
                        <div className="rounded-[1.1rem] border border-brandGold/20 bg-white/[0.04] px-3.5 py-3 text-slate-200">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brandGold">{fallbackStepsTitle}</p>
                            <div className="mt-2 space-y-1.5 text-[11px] leading-5 text-slate-300/95">
                                {fallbackSteps.map((step) => (
                                    <p key={step}>{step}</p>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}