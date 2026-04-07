import { Suspense } from 'react';
import Hero from '@/components/gallery/Hero';
import SearchFilter from '@/components/gallery/SearchFilter';
import ProductGrid from '@/components/gallery/ProductGrid';
import CategoriesRow from '@/components/gallery/CategoriesRow';
import ProductModal from '@/components/gallery/ProductModal';
import ToastStack from '@/components/gallery/ToastStack';
import Header from '@/components/layout/Header';
import FloatingActions from '@/components/layout/FloatingActions';
import Footer from '@/components/layout/Footer';
import { GalleryProvider } from '@/contexts/GalleryContext';

export default function GalleryPage() {
    return (
        <GalleryProvider>
            <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-darkBg transition-colors">
                <Header />
                <main className="flex-1 w-full flex flex-col items-center pb-32">
                    <Hero />
                    <SearchFilter />
                    <div className="max-w-7xl w-full px-4 md:px-6 py-16 md:py-24 min-h-[60vh]">
                        <CategoriesRow />
                        <ProductGrid />
                    </div>
                </main>
                <Footer />
                <Suspense fallback={null}>
                    <ProductModal />
                </Suspense>
                <ToastStack />
                <FloatingActions />
            </div>
        </GalleryProvider>
    );
}
