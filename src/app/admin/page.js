import DashboardStats from '@/components/admin/DashboardStats';
import OrdersTable from '@/components/admin/OrdersTable';

export default function AdminDashboard() {
    return (
        <div className="w-full max-w-7xl mx-auto space-y-8">
            <header className="mb-8">
                <h1 className="text-2xl md:text-3xl font-black text-brandBlue dark:text-brandGold">Dashboard Overview</h1>
                <p className="text-gray-500 mt-1">Welcome back. Here is what's happening today.</p>
            </header>

            <DashboardStats />
            <OrdersTable />
        </div>
    );
}