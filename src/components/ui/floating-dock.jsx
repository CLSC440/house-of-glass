"use client";
/**
 * Note: Use position fixed according to your needs
 * Desktop navbar is better positioned at the bottom
 * Mobile navbar is better positioned at bottom right.
 **/

import { cn } from "@/lib/utils";
import { IconLayoutNavbarCollapse } from "@tabler/icons-react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "motion/react";

import { useRef, useState } from "react";

function resolveDockVisual(visual, fallbackIcon, state = {}) {
  if (typeof visual === "function") {
    return visual(state);
  }

  return visual || fallbackIcon;
}

export const FloatingDock = ({
  items,
  desktopClassName,
  mobileClassName
}) => {
  return (
    <>
      <FloatingDockDesktop items={items} className={desktopClassName} />
      <FloatingDockMobile items={items} className={mobileClassName} />
    </>
  );
};

const FloatingDockMobile = ({
  items,
  className
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("relative block md:hidden", className)}>
      <AnimatePresence>
        {open && (
          <motion.div
            layoutId="nav"
            className="absolute inset-x-0 bottom-full mb-2 flex flex-col gap-2">
            {items.map((item, idx) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                exit={{
                  opacity: 0,
                  y: 10,
                  transition: {
                    delay: idx * 0.05,
                  },
                }}
                transition={{ delay: (items.length - 1 - idx) * 0.05 }}>
                <DockAction item={item} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1d263b] text-slate-200 transition-colors hover:bg-[#293552] dark:bg-[#1d263b]" iconClassName="h-4 w-4" />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-50 dark:bg-neutral-800">
        <IconLayoutNavbarCollapse className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
      </button>
    </div>
  );
};

const FloatingDockDesktop = ({
  items,
  className
}) => {
  let mouseX = useMotionValue(Infinity);
  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn(
        "mx-auto hidden w-fit max-w-full items-center gap-2 rounded-[1.6rem] px-2 py-2 md:flex",
        className
      )}>
      {items.map((item) => (
        <IconContainer mouseX={mouseX} key={item.title} {...item} />
      ))}
    </motion.div>
  );
};

function IconContainer({
  mouseX,
  title,
  icon,
  render,
  href,
  onClick,
  active,
  badge,
  secondaryAction,
  renderFullSize,
  magnify = true,
  containerClassName,
  tooltipClassName
}) {
  if (!magnify) {
    return (
      <div className="relative flex flex-col items-center">
        <DockAction item={{ title, icon, render, href, onClick, active, badge }}>
          <div
            className={cn(
              "relative flex items-center justify-center transition-colors",
              containerClassName
            )}
          >
            {badge ? (
              <span className="absolute -right-1.5 -top-1.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] font-black text-white shadow-[0_6px_16px_rgba(239,68,68,0.32)]">
                {badge}
              </span>
            ) : null}
            {resolveDockVisual(render, icon, { hovered: false, active })}
          </div>
        </DockAction>
      </div>
    );
  }

  let ref = useRef(null);

  let distance = useTransform(mouseX, (val) => {
    let bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };

    return val - bounds.x - bounds.width / 2;
  });

  let widthTransform = useTransform(distance, [-140, 0, 140], [44, 58, 44]);
  let heightTransform = useTransform(distance, [-140, 0, 140], [44, 58, 44]);

  let widthTransformIcon = useTransform(distance, [-140, 0, 140], [18, 26, 18]);
  let heightTransformIcon = useTransform(distance, [-140, 0, 140], [18, 26, 18]);

  let width = useSpring(widthTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  let height = useSpring(heightTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  let widthIcon = useSpring(widthTransformIcon, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  let heightIcon = useSpring(heightTransformIcon, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative flex flex-col items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <DockAction item={{ title, icon, href, onClick, active, badge }}>
        <motion.div
          ref={ref}
          style={{ width, height }}
          className={cn(
            "relative flex aspect-square items-center justify-center rounded-full border shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-[background-color,color,border-color,transform] duration-200",
            active
              ? "border-brandGold/45 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.24),rgba(42,53,80,0.98))] text-brandGold shadow-[0_10px_24px_rgba(212,175,55,0.14)]"
              : "border-white/10 bg-[linear-gradient(180deg,#202945_0%,#1a2238_100%)] text-slate-200 hover:border-white/16 hover:bg-[linear-gradient(180deg,#263252_0%,#1d2740_100%)]"
          )}>
          <AnimatePresence>
            {hovered && (
              <motion.div
                initial={{ opacity: 0, y: 10, x: "-50%" }}
                animate={{ opacity: 1, y: 0, x: "-50%" }}
                exit={{ opacity: 0, y: 2, x: "-50%" }}
                className={cn("absolute -top-8 start-1/2 w-fit rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs whitespace-pre text-neutral-700 dark:border-neutral-900 dark:bg-neutral-800 dark:text-white", tooltipClassName)}>
                {title}
              </motion.div>
            )}
          </AnimatePresence>
          {badge ? (
            <span className="absolute -right-1.5 -top-1.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] font-black text-white shadow-[0_6px_16px_rgba(239,68,68,0.32)]">
              {badge}
            </span>
          ) : null}
          {renderFullSize ? (
            <div className="absolute inset-[5px] flex items-center justify-center">
              {resolveDockVisual(render, icon, { hovered, active })}
            </div>
          ) : (
            <motion.div
              style={{ width: widthIcon, height: heightIcon }}
              className="flex items-center justify-center">
              {resolveDockVisual(render, icon, { hovered, active })}
            </motion.div>
          )}
        </motion.div>
      </DockAction>

      <AnimatePresence>
        {hovered && secondaryAction ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.92 }}
            className="absolute top-full z-30 mt-2 flex items-center justify-center rounded-[1rem] border border-white/10 bg-[linear-gradient(180deg,#1d2436_0%,#181e2e_100%)] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.28)]"
          >
            <DockAction
              item={secondaryAction}
              className="flex h-14 w-14 items-center justify-center rounded-[1rem] bg-[#1b4b24] text-[#7CFF82] transition-colors hover:bg-[#225f2d]"
              iconClassName="h-6 w-6"
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function DockAction({ item, className, iconClassName, children }) {
  const content = children || <div className={iconClassName}>{resolveDockVisual(item.render, item.icon, { hovered: false, active: item.active })}</div>;

  if (typeof item.onClick === 'function') {
    return (
      <button type="button" onClick={item.onClick} aria-label={item.title} className={className}>
        {content}
      </button>
    );
  }

  return (
    <a href={item.href || '#'} aria-label={item.title} className={className}>
      {content}
    </a>
  );
}
