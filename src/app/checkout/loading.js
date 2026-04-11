import BrandLoadingScreen from '@/components/layout/BrandLoadingScreen';

export default function Loading() {
    return (
        <BrandLoadingScreen
            title="Loading checkout"
            message="جاري تجهيز صفحة الـ checkout قبل فتحها"
            showProgressBar={false}
        />
    );
}