"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";

type SmoothTabTransitionProps = {
  children: React.ReactNode;
};

const tabVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction * 34,
  }),
  center: {
    opacity: 1,
    x: 0,
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -26,
  }),
};

export function SmoothTabTransition({ children }: SmoothTabTransitionProps) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const direction = pathname === "/event" ? 1 : -1;

  return (
    <AnimatePresence initial={false} mode="popLayout" custom={direction}>
      <motion.div
        key={pathname}
        className="smooth-tab-panel"
        custom={direction}
        variants={reduceMotion ? undefined : tabVariants}
        initial={reduceMotion ? { opacity: 0 } : "enter"}
        animate={reduceMotion ? { opacity: 1 } : "center"}
        exit={reduceMotion ? { opacity: 0 } : "exit"}
        transition={reduceMotion
          ? { duration: 0.14, ease: "easeOut" }
          : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
