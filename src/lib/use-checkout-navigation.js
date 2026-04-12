'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

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
    const navigationTimeoutRef = useRef(null);

    const clearPendingCheckoutNavigation = useCallback(() => {
        if (typeof window !== 'undefined' && navigationTimeoutRef.current) {
            window.clearTimeout(navigationTimeoutRef.current);
            navigationTimeoutRef.current = null;
        }

        setPendingCheckoutHref('');
    }, []);

    const startCheckoutLoading = useCallback((href) => {
        const targetHref = String(href || '/checkout').trim() || '/checkout';

        if (pendingCheckoutHref || isSameNavigationTarget(targetHref)) {
            return false;
        }

        setPendingCheckoutHref(targetHref);

        return true;
    }, [pendingCheckoutHref]);

    const navigateToCheckout = useCallback((href, beforeNavigate) => {
        const targetHref = String(href || '/checkout').trim() || '/checkout';

        if (!startCheckoutLoading(targetHref)) {
            return;
        }

        navigationTimeoutRef.current = window.setTimeout(() => {
            navigationTimeoutRef.current = null;

            if (typeof beforeNavigate === 'function') {
                beforeNavigate();
            }

            flushSync(() => {
                clearPendingCheckoutNavigation();
            });

            router.push(targetHref);
        }, 120);
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
        if (!pendingCheckoutHref || typeof window === 'undefined' || navigationTimeoutRef.current) {
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
            if (navigationTimeoutRef.current) {
                window.clearTimeout(navigationTimeoutRef.current);
                navigationTimeoutRef.current = null;
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