'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const CHECKOUT_NAVIGATION_STALL_TIMEOUT_MS = 8000;

function isSameNavigationTarget(href) {
    if (typeof window === 'undefined') {
        return false;
    }

    const currentUrl = new URL(window.location.href);
    const targetUrl = new URL(href, currentUrl.origin);

    return currentUrl.pathname === targetUrl.pathname && currentUrl.search === targetUrl.search;
}

export default function useCheckoutNavigation() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [pendingCheckoutHref, setPendingCheckoutHref] = useState('');
    const navigationStallTimeoutRef = useRef(null);

    const clearPendingCheckoutNavigation = useCallback(() => {
        if (typeof window !== 'undefined' && navigationStallTimeoutRef.current) {
            window.clearTimeout(navigationStallTimeoutRef.current);
            navigationStallTimeoutRef.current = null;
        }

        setPendingCheckoutHref('');
    }, []);

    const startCheckoutLoading = useCallback((href) => {
        const targetHref = String(href || '/checkout').trim() || '/checkout';

        if (pendingCheckoutHref || isSameNavigationTarget(targetHref)) {
            return false;
        }

        flushSync(() => {
            setPendingCheckoutHref(targetHref);
        });

        return true;
    }, [pendingCheckoutHref]);

    const navigateToCheckout = useCallback((href, beforeNavigate) => {
        const targetHref = String(href || '/checkout').trim() || '/checkout';

        if (!startCheckoutLoading(targetHref)) {
            return;
        }

        if (typeof beforeNavigate === 'function') {
            beforeNavigate();
        }

        if (typeof window !== 'undefined') {
            if (navigationStallTimeoutRef.current) {
                window.clearTimeout(navigationStallTimeoutRef.current);
            }

            navigationStallTimeoutRef.current = window.setTimeout(() => {
                navigationStallTimeoutRef.current = null;
                clearPendingCheckoutNavigation();
            }, CHECKOUT_NAVIGATION_STALL_TIMEOUT_MS);
        }

        router.push(targetHref);
    }, [clearPendingCheckoutNavigation, router, startCheckoutLoading]);

    useEffect(() => {
        if (!pendingCheckoutHref || typeof window === 'undefined') {
            return;
        }

        const currentUrl = new URL(window.location.href);
        const targetUrl = new URL(pendingCheckoutHref, currentUrl.origin);

        if (currentUrl.pathname === targetUrl.pathname && currentUrl.search === targetUrl.search) {
            clearPendingCheckoutNavigation();
        }
    }, [clearPendingCheckoutNavigation, pathname, pendingCheckoutHref, searchParams]);

    useEffect(() => {
        if (!pendingCheckoutHref || typeof window === 'undefined' || navigationStallTimeoutRef.current) {
            return;
        }

        if (isSameNavigationTarget(pendingCheckoutHref)) {
            return;
        }

        clearPendingCheckoutNavigation();
    }, [clearPendingCheckoutNavigation, pathname, pendingCheckoutHref, searchParams]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const handleHistoryNavigation = () => {
            clearPendingCheckoutNavigation();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                clearPendingCheckoutNavigation();
            }
        };

        window.addEventListener('popstate', handleHistoryNavigation);
        window.addEventListener('pageshow', handleHistoryNavigation);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('popstate', handleHistoryNavigation);
            window.removeEventListener('pageshow', handleHistoryNavigation);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (navigationStallTimeoutRef.current) {
                window.clearTimeout(navigationStallTimeoutRef.current);
                navigationStallTimeoutRef.current = null;
            }
        };
    }, [clearPendingCheckoutNavigation]);

    return {
        isCheckoutRouteLoading: Boolean(pendingCheckoutHref),
        pendingCheckoutHref,
        clearPendingCheckoutNavigation,
        startCheckoutLoading,
        navigateToCheckout
    };
}