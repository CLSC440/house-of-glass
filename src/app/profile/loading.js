import BrandLoadingScreen from '@/components/layout/BrandLoadingScreen';

export default function Loading() {
    return <BrandLoadingScreen title="Loading your account" message="جاري تحميل الصفحة والبيانات الخاصة بحسابك" fixed={false} showProgressBar={false} />;
}