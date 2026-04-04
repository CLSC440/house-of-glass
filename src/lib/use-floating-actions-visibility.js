'use client';

import { useEffect, useState } from 'react';

const DEFAULT_SCROLL_THRESHOLD = 220;

export function useFloatingActionsVisibility(scrollThreshold = DEFAULT_SCROLL_THRESHOLD) {
    const [isMounted, setIsMounted] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        setIsMounted(true);

        const updateVisibility = () => {
            setIsVisible(window.scrollY > scrollThreshold);
        };

        updateVisibility();
        window.addEventListener('scroll', updateVisibility, { passive: true });
        window.addEventListener('resize', updateVisibility);

        return () => {
            window.removeEventListener('scroll', updateVisibility);
            window.removeEventListener('resize', updateVisibility);
        };
    }, [scrollThreshold]);

    return {
        isMounted,
        isVisible
    };
}