import Header from '@/components/layout/Header';
import FloatingActions from '@/components/layout/FloatingActions';

export default function GalleryLayout({ children }) {
    return (
        <div className="flex flex-col min-h-screen">
            <Header />
            {children}
            <FloatingActions />
        </div>
    );
}