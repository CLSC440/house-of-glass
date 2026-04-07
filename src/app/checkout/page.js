import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import FloatingActions from '@/components/layout/FloatingActions';
import ToastStack from '@/components/gallery/ToastStack';
import CheckoutPageContent from '@/components/gallery/CheckoutPageContent';
import { GalleryProvider } from '@/contexts/GalleryContext';

export const metadata = {
    title: 'Checkout | House Of Glass'
};

export default function CheckoutPage() {
    return (
        <GalleryProvider>
            <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-darkBg transition-colors">
                <Header />
                <main className="flex-1 pb-16">
                    <CheckoutPageContent />
                </main>
                <Footer />
                <ToastStack />
                <FloatingActions />
            </div>
        </GalleryProvider>
    );
}