import { Suspense } from 'react';
import Hero from '@/components/gallery/Hero';
import SearchFilter from '@/components/gallery/SearchFilter';
import ProductGrid from '@/components/gallery/ProductGrid';
import CategoriesRow from '@/components/gallery/CategoriesRow';
import CartModal from '@/components/gallery/CartModal';
import ProductModal from '@/components/gallery/ProductModal';
import ToastStack from '@/components/gallery/ToastStack';
import { GalleryProvider } from '@/contexts/GalleryContext';

export default function GalleryPage() {
    return (
        <GalleryProvider>
            <main className="flex-1 w-full flex flex-col items-center bg-gray-50 dark:bg-darkBg transition-colors pb-32">
                <Hero />
                <SearchFilter />
                <div className="max-w-[1600px] w-full px-4 md:px-8 xl:px-12 mt-12 md:mt-16">
                    <CategoriesRow />
                    <ProductGrid />
                </div>
            </main>
            <CartModal />
            <Suspense fallback={null}>
                <ProductModal />
            </Suspense>
            <ToastStack />
        </GalleryProvider>
    );
}