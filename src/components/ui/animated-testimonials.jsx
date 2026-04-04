"use client";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";

import { useEffect, useEffectEvent, useState } from "react";

export const AnimatedTestimonials = ({
  testimonials,
  autoplay = false,
  activeIndex,
  onActiveChange = () => {},
  renderExtra = null,
  renderMobileBeforeContent = null,
  onActiveImageClick = null,
  containerClassName = "",
  mediaFrameClassName = "",
  imageClassName = "object-cover object-center",
  contentClassName = "",
  showCount = false
}) => {
  const [uncontrolledActive, setUncontrolledActive] = useState(0);
  const hasTestimonials = testimonials.length > 0;
  const isControlled = Number.isInteger(activeIndex);
  const active = isControlled ? activeIndex : uncontrolledActive;

  const commitActive = useEffectEvent((nextIndex) => {
    if (!hasTestimonials) return;

    const safeIndex = ((nextIndex % testimonials.length) + testimonials.length) % testimonials.length;

    if (!isControlled) {
      setUncontrolledActive(safeIndex);
    }

    onActiveChange(safeIndex);
  });

  useEffect(() => {
    if (!hasTestimonials) {
      if (!isControlled) {
        setUncontrolledActive(0);
      }
      return;
    }

    if (isControlled) return;

    setUncontrolledActive((currentActive) => Math.min(currentActive, testimonials.length - 1));
  }, [hasTestimonials, testimonials.length, isControlled]);

  const handleNext = () => {
    if (!hasTestimonials) {
      return;
    }

    commitActive(active + 1);
  };

  const handlePrev = () => {
    if (!hasTestimonials) {
      return;
    }

    commitActive(active - 1);
  };

  const handleSetActive = (index) => {
    commitActive(index);
  };

  const isActive = (index) => {
    return index === active;
  };

  useEffect(() => {
    if (autoplay && hasTestimonials) {
      const interval = setInterval(() => {
        commitActive(active + 1);
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [autoplay, hasTestimonials, testimonials.length, active, commitActive]);

  if (!hasTestimonials) {
    return null;
  }

  const randomRotateY = () => {
    return Math.floor(Math.random() * 21) - 10;
  };

  const renderControls = (className = "") => (
    <div className={`flex gap-4 ${className}`}>
      <button
        onClick={handlePrev}
        className="group/button flex h-14 w-14 items-center justify-center rounded-full bg-brandGold/10 hover:bg-brandGold dark:bg-brandGold/20 dark:hover:bg-brandGold transition-colors border border-brandGold/30">
        <IconArrowLeft
          className="h-7 w-7 text-brandGold group-hover/button:text-brandBlue transition-transform duration-300 group-hover/button:rotate-12" />
      </button>
      <button
        onClick={handleNext}
        className="group/button flex h-14 w-14 items-center justify-center rounded-full bg-brandGold/10 hover:bg-brandGold dark:bg-brandGold/20 dark:hover:bg-brandGold transition-colors border border-brandGold/30">
        <IconArrowRight
          className="h-7 w-7 text-brandGold group-hover/button:text-brandBlue transition-transform duration-300 group-hover/button:-rotate-12" />
      </button>
    </div>
  );

  const handleImageClick = () => {
    if (typeof onActiveImageClick === "function") {
      onActiveImageClick(active);
    }
  };

  const activeTestimonial = testimonials[active];

  return (
    <div
      className={`mx-auto w-full max-w-md px-4 py-8 font-sans antialiased md:max-w-5xl md:px-8 md:py-12 lg:px-12 ${containerClassName}`}>
      <div className="relative grid grid-cols-1 items-start gap-6 md:grid-cols-2 md:gap-10 lg:gap-14">
        <div className="space-y-4 md:space-y-0">
          <div className={`relative overflow-hidden rounded-[2rem] border border-slate-200/70 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.12),transparent_42%),linear-gradient(180deg,rgba(248,250,252,0.96),rgba(226,232,240,0.88))] p-3 shadow-[0_24px_70px_rgba(148,163,184,0.16)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.16),transparent_38%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.95))] dark:shadow-[0_24px_70px_rgba(2,6,23,0.36)] ${mediaFrameClassName}`}>
            {showCount ? (
              <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-full border border-white/60 bg-white/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-950/70 dark:text-white/75">
                {active + 1} / {testimonials.length}
              </div>
            ) : null}

            <div className="relative h-[20rem] w-full sm:h-[24rem] md:h-[28rem]">
            <AnimatePresence>
              {testimonials.map((testimonial, index) => (
                <motion.div
                  key={index}
                  initial={{
                    opacity: 0,
                    scale: 0.9,
                    z: -100,
                    rotate: randomRotateY(),
                  }}
                  animate={{
                    opacity: isActive(index) ? 1 : 0.7,
                    scale: isActive(index) ? 1 : 0.95,
                    z: isActive(index) ? 0 : -100,
                    rotate: isActive(index) ? 0 : randomRotateY(),
                    zIndex: isActive(index)
                      ? 40
                      : testimonials.length + 2 - index,
                    y: isActive(index) ? [0, -80, 0] : 0,
                  }}
                  exit={{
                    opacity: 0,
                    scale: 0.9,
                    z: 100,
                    rotate: randomRotateY(),
                  }}
                  transition={{
                    duration: 0.4,
                    ease: "easeInOut",
                  }}
                  className={`absolute inset-0 origin-bottom ${isActive(index) ? 'pointer-events-auto' : 'pointer-events-none'}`}>
                  <button
                    type="button"
                    onClick={handleImageClick}
                    className="h-full w-full overflow-hidden rounded-[1.6rem] border border-white/50 bg-white/80 p-2 shadow-[0_18px_50px_rgba(148,163,184,0.16)] backdrop-blur-sm focus:outline-none active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.04]"
                    aria-label={`Open ${testimonial.name} image fullscreen`}>
                    <img
                      src={testimonial.src}
                      alt={testimonial.name}
                      width={500}
                      height={500}
                      draggable={false}
                      className={`h-full w-full rounded-[1.2rem] cursor-zoom-in ${imageClassName}`} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          </div>
          {renderControls("justify-center md:hidden")}
          {renderMobileBeforeContent ? (
            <div className="md:hidden">
              {renderMobileBeforeContent(active, handleSetActive)}
            </div>
          ) : null}
        </div>
        <div className={`flex flex-col justify-between py-2 md:py-4 ${contentClassName}`}>
          <motion.div
            key={active}
            initial={{
              y: 20,
              opacity: 0,
            }}
            animate={{
              y: 0,
              opacity: 1,
            }}
            exit={{
              y: -20,
              opacity: 0,
            }}
            transition={{
              duration: 0.2,
              ease: "easeInOut",
            }}
            className="rounded-[1.8rem] border border-slate-200/70 bg-white/88 p-5 shadow-[0_20px_60px_rgba(148,163,184,0.12)] backdrop-blur-sm dark:border-white/8 dark:bg-white/[0.04] dark:shadow-[0_20px_60px_rgba(2,6,23,0.3)] md:p-6">
            <h3 className="text-[1.7rem] font-black leading-tight text-slate-950 dark:text-white md:text-3xl" dir="rtl">
              {activeTestimonial.name}
            </h3>
            <p className="mt-2 text-sm font-semibold text-brandGold dark:text-brandGold" dir="rtl">
              {activeTestimonial.designation}
            </p>
            {activeTestimonial.quote ? (
              <motion.div 
                key={active}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <p className="mt-5 text-base leading-relaxed text-slate-600 dark:text-neutral-300 md:mt-6 md:text-lg" dir="rtl">
                  {activeTestimonial.quote}
                </p>
              </motion.div>
            ) : null}
          </motion.div>
          {renderControls("hidden pt-12 md:flex md:pt-0")}
          {renderExtra && (
            <div className="mt-6 md:mt-8">
              {renderExtra(active, handleSetActive)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
