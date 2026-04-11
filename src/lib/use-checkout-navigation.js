'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

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
    const [pendingCheckoutHref, setPendingCheckoutHref] = useState('');

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

        window.setTimeout(() => {
            if (typeof beforeNavigate === 'function') {
                beforeNavigate();
            }

            router.push(targetHref);
        }, 120);
    }, [router, startCheckoutLoading]);

    return {
        isCheckoutRouteLoading: Boolean(pendingCheckoutHref),
        pendingCheckoutHref,
        startCheckoutLoading,
        navigateToCheckout
    };
}