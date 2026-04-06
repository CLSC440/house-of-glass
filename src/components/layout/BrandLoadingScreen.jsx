import Image from 'next/image';

export default function BrandLoadingScreen({
    title = 'Loading your account',
    message = 'Preparing your settings and order history...',
    fixed = true
}) {
    return (
        <div className={`${fixed ? 'fixed inset-0 z-[240]' : 'min-h-screen'} flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.16),transparent_28%),linear-gradient(180deg,#0b1020_0%,#121a2d_48%,#090d18_100%)] px-6`}>
            <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.03)_22%,transparent_48%)] opacity-70"></div>
            <div className="relative flex w-full max-w-sm flex-col items-center rounded-[2rem] border border-brandGold/20 bg-[#11192c]/88 px-8 py-10 text-center shadow-[0_30px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl">
                <div className="relative flex h-28 w-28 items-center justify-center">
                    <span className="absolute inset-0 rounded-full border border-brandGold/20 bg-brandGold/5"></span>
                    <span className="absolute inset-2 rounded-full border border-brandGold/15 animate-ping"></span>
                    <span className="absolute inset-0 rounded-full border-t-2 border-brandGold/80 border-r border-r-transparent border-b border-b-transparent border-l border-l-transparent animate-spin"></span>
                    <Image src="/logo.png" alt="House Of Glass" width={80} height={80} className="relative z-10 h-20 w-20 object-contain drop-shadow-[0_12px_24px_rgba(212,175,55,0.22)]" priority />
                </div>
                <p className="mt-7 text-lg font-black text-white">{title}</p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300" dir="rtl">{message}</p>
                <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                    <span className="block h-full w-1/2 animate-[loadingBar_1.25s_ease-in-out_infinite] rounded-full bg-brandGold"></span>
                </div>
            </div>
        </div>
    );
}