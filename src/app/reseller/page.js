import Link from 'next/link';

const SUMMARY_CARDS = [
    {
        label: 'Today Sold',
        value: '--',
        note: 'Will be connected in settlement slice.'
    },
    {
        label: 'Due To Admin',
        value: '--',
        note: 'Based on wholesale snapshots only.'
    },
    {
        label: 'Profit',
        value: '--',
        note: 'Sell price minus wholesale cost.'
    },
    {
        label: 'Orders Today',
        value: '--',
        note: 'Daily batch total will appear here.'
    }
];

const QUICK_ACTIONS = [
    {
        href: '/reseller/orders/new',
        label: 'Create Customer Order',
        description: 'Start a new reseller customer order with pricing visibility and profit preview.'
    },
    {
        href: '/reseller/orders',
        label: 'Open My Orders',
        description: 'Review saved reseller orders, customer names, and order status history.'
    },
    {
        href: '/reseller/daily-summary',
        label: 'Open Daily Summary',
        description: 'Review the current batch that will later be submitted to admin as one daily settlement.'
    }
];

export default function ResellerDashboardPage() {
    return (
        <div className="space-y-6">
            <section className="rounded-[1.8rem] border border-white/8 bg-[#101729] px-6 py-6 shadow-[0_20px_44px_rgba(4,8,20,0.28)] md:px-7 md:py-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-brandGold/70">Slice 1</p>
                        <h2 className="mt-2 text-2xl font-black text-white md:text-[2rem]">Reseller dashboard shell is now isolated and ready.</h2>
                        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">No public website route, checkout flow, or existing admin orders logic was changed in this slice. The next slices will connect catalog data, order creation, and daily settlements inside this new workspace only.</p>
                    </div>

                    <div className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-300">
                        <i className="fa-solid fa-shield"></i>
                        Isolated Module
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {SUMMARY_CARDS.map((card) => (
                    <article key={card.label} className="rounded-[1.55rem] border border-white/8 bg-[#161f35] p-5 shadow-[0_18px_40px_rgba(4,8,20,0.24)]">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">{card.label}</p>
                        <p className="mt-3 text-3xl font-black text-white">{card.value}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-400">{card.note}</p>
                    </article>
                ))}
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
                {QUICK_ACTIONS.map((action) => (
                    <Link key={action.href} href={action.href} className="rounded-[1.65rem] border border-white/8 bg-[#121a2d] p-5 shadow-[0_18px_40px_rgba(4,8,20,0.24)] transition-colors hover:border-brandGold/20 hover:bg-[#16213a]">
                        <p className="text-lg font-black text-white">{action.label}</p>
                        <p className="mt-2 text-sm leading-7 text-slate-400">{action.description}</p>
                        <span className="mt-4 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-brandGold">
                            Open
                            <i className="fa-solid fa-arrow-right"></i>
                        </span>
                    </Link>
                ))}
            </section>
        </div>
    );
}