'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BrandLoadingScreen from '@/components/layout/BrandLoadingScreen';

export default function ProductShareRedirect({ targetPath = '/', title = '' }) {
    const router = useRouter();

    useEffect(() => {
        router.replace(targetPath || '/');
    }, [router, targetPath]);

    return (
        <BrandLoadingScreen
            title={title ? `Opening ${title}` : 'Opening product'}
            message="جاري فتح المنتج داخل متجر House Of Glass"
            fixed={false}
        />
    );
}