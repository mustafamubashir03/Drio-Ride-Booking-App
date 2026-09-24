import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useMotionSystem } from "./use-motion";

export function MotionPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { page, reduced } = useMotionSystem();
  return (
    <motion.div
      className={className}
      variants={page}
      initial={reduced ? false : "hidden"}
      animate={reduced ? undefined : "visible"}
      exit={reduced ? undefined : "exit"}
    >
      {children}
    </motion.div>
  );
}