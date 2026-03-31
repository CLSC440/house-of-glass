'use client';

export default function Hero() {
    return (
        <section className="bg-white dark:bg-brandBlue py-16 md:py-32 text-center relative overflow-hidden transition-all w-full duration-1000">
            {/* Subtle background effect */}
            <div className="absolute inset-0 opacity-10 dark:opacity-20 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,_rgba(0,0,0,0.1),transparent_70%)] dark:bg-[radial-gradient(circle_at_50%_50%,_rgba(193,155,78,0.15),transparent_70%)]"></div>
            </div>

            <div className="relative z-10 px-4 reveal active">
                <h2 className="text-3xl md:text-7xl font-black mb-4 text-brandGold tracking-tighter uppercase drop-shadow-sm dark:drop-shadow-[0_0_20px_rgba(193,155,78,0.4)]">House Of Glass</h2>

                <div className="flex flex-col items-center justify-center mb-12 md:mb-16">
                    <p className="text-[8px] md:text-xs tracking-[0.4em] md:tracking-[0.6em] uppercase text-slate-400 dark:text-white/40 font-bold mb-6 md:mb-10 transition-all hover:opacity-60 cursor-default">
                        Showroom for Home Glassware
                    </p>

                    <div className="flex items-center justify-center w-full max-w-3xl mx-auto group">
                        <div className="flex-grow h-[1px] bg-gradient-to-l from-brandGold via-brandGold/40 to-transparent transition-all duration-1000 dark:group-hover:from-white"></div>
                        <p className="text-3xl md:text-7xl font-black text-[#163159] dark:text-slate-100 font-arabic px-6 md:px-16 whitespace-nowrap leading-none transition-all duration-700 hover:scale-105" dir="rtl" style={{ textShadow: '0 10px 30px rgba(22,49,89,0.1)' }}>
                            ال عاشور عدس
                        </p>
                        <div className="flex-grow h-[1px] bg-gradient-to-r from-brandGold via-brandGold/40 to-transparent transition-all duration-1000 dark:group-hover:from-white"></div>
                    </div>
                </div>

                <p className="text-sm md:text-2xl text-slate-500 dark:text-white/60 max-w-2xl mx-auto font-light tracking-widest italic font-serif mt-4 md:mt-8">
                    "Excellence in every reflection."
                </p>
            </div>
        </section>
    );
}