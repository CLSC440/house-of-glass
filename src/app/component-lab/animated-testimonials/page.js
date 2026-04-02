import Link from 'next/link';
import AnimatedTestimonialsDemo from '@/components/animated-testimonials-demo';

export const metadata = {
  title: 'Animated Testimonials Lab | House Of Glass',
  description: 'Preview route for the Aceternity animated testimonials component.'
};

export default function AnimatedTestimonialsLabPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.18),transparent_28%),linear-gradient(180deg,#f8f5ee_0%,#f3efe6_35%,#ece7db_100%)] px-4 py-10 text-brandBlue dark:bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.18),transparent_25%),linear-gradient(180deg,#0f172a_0%,#111827_40%,#030712_100%)] dark:text-white">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-black uppercase tracking-[0.38em] text-brandGold">Component Lab</p>
            <h1 className="mt-3 text-4xl font-black uppercase tracking-tight md:text-6xl">Animated Testimonials Preview</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-brandBlue/70 dark:text-white/70" dir="rtl">
              هذا route تجريبي لعزل component جديد بصريًا قبل اتخاذ قرار إدخاله في storefront الأساسي. عدلت المحتوى ليعرض collections من منتجات House Of Glass بدل testimonials عامة حتى يكون الحكم عليه أقرب لاستخدامك الحقيقي.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/" className="inline-flex items-center justify-center rounded-full border border-brandGold/40 bg-white/80 px-5 py-3 text-xs font-black uppercase tracking-[0.2em] text-brandBlue transition-all hover:bg-brandGold hover:text-white dark:bg-white/10 dark:text-white">
              Back To Store
            </Link>
          </div>
        </div>

        <div className="mt-10 overflow-hidden rounded-[2rem] border border-white/40 bg-white/70 shadow-[0_30px_80px_rgba(18,25,38,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5 dark:shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
          <AnimatedTestimonialsDemo />
        </div>
      </div>
    </main>
  );
}