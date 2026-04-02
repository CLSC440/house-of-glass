"use client";;
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";

import { useEffect, useState } from "react";

export const AnimatedTestimonials = ({
  testimonials,
  autoplay = false,
  onActiveChange = () => {},
  renderExtra = null
}) => {
  const [active, setActive] = useState(0);
  const hasTestimonials = testimonials.length > 0;

  useEffect(() => {
    if (!hasTestimonials) {
      setActive(0);
      return;
    }

    setActive((currentActive) => Math.min(currentActive, testimonials.length - 1));
  }, [hasTestimonials, testimonials.length]);

  useEffect(() => {
    if (!hasTestimonials) {
      return;
    }

    onActiveChange(active);
  }, [active, hasTestimonials, onActiveChange]);

  const handleNext = () => {
    if (!hasTestimonials) {
      return;
    }

    setActive((prev) => {
      return (prev + 1) % testimonials.length;
    });
  };

  const handlePrev = () => {
    if (!hasTestimonials) {
      return;
    }

    setActive((prev) => {
      return (prev - 1 + testimonials.length) % testimonials.length;
    });
  };

  const handleSetActive = (index) => {
    setActive(index);
  };

  const isActive = (index) => {
    return index === active;
  };

  useEffect(() => {
    if (autoplay && hasTestimonials) {
      const interval = setInterval(() => {
        setActive((prev) => (prev + 1) % testimonials.length);
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [autoplay, hasTestimonials, testimonials.length]);

  if (!hasTestimonials) {
    return null;
  }

  const randomRotateY = () => {
    return Math.floor(Math.random() * 21) - 10;
  };
  return (
    <div
      className="mx-auto max-w-sm px-4 py-20 font-sans antialiased md:max-w-4xl md:px-8 lg:px-12">
      <div className="relative grid grid-cols-1 gap-20 md:grid-cols-2">
        <div>
          <div className="relative h-80 w-full">
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
                  className="absolute inset-0 origin-bottom">
                  <img
                    src={testimonial.src}
                    alt={testimonial.name}
                    width={500}
                    height={500}
                    draggable={false}
                    className="h-full w-full rounded-3xl object-cover object-center" />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
        <div className="flex flex-col justify-between py-4">
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
            }}>
            <h3 className="text-2xl font-bold text-black dark:text-white" dir="rtl">
              {testimonials[active].name}
            </h3>
            <p className="text-sm text-gray-500 dark:text-neutral-500" dir="rtl">
              {testimonials[active].designation}
            </p>
            <motion.div 
              key={active}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <p className="mt-8 text-lg text-gray-500 dark:text-neutral-300 leading-relaxed" dir="rtl">
                {testimonials[active].quote}
              </p>
            </motion.div>
          </motion.div>
          <div className="flex gap-4 pt-12 md:pt-0">
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
          {renderExtra && (
            <div className="mt-8">
              {renderExtra(active, handleSetActive)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
