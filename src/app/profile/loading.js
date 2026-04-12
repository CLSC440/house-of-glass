import BrandLoadingScreen from '@/components/layout/BrandLoadingScreen';

export default function Loading() {
    return <BrandLoadingScreen title="Loading your account" message="جاري فتح صفحة الحساب" fixed={false} showProgressBar={false} />;
}