import type { Variants } from "motion/react";
import type { MotionTransitions } from "./transitions";

export function makePageVariants(
  transition: MotionTransitions,
  reduced: boolean,
): Variants {
  const y = reduced ? 0 : 6;
  return {
    hidden: { opacity: 0, y },
    visible: { opacity: 1, y: 0, transition: transition.normal },
    exit: { opacity: 0, y: 0, transition: transition.fast },
  };
}

export function makeDialogVariants(
  transition: MotionTransitions,
  reduced: boolean,
): Variants {
  const scale = reduced ? 1 : 0.98;
  return {
    hidden: { opacity: 0, scale },
    visible: { opacity: 1, scale: 1, transition: transition.normal },
    exit: { opacity: 0, scale, transition: transition.fast },
  };
}

export function makePopoverVariants(
  transition: MotionTransitions,
  reduced: boolean,
): Variants {
  const y = reduced ? 0 : 4;
  const scale = reduced ? 1 : 0.98;
  return {
    hidden: { opacity: 0, y, scale },
    visible: { opacity: 1, y: 0, scale: 1, transition: transition.fast },
    exit: { opacity: 0, y, scale, transition: transition.fast },
  };
}

export function makeStaggerVariants(
  transition: MotionTransitions,
  reduced: boolean,
): { container: Variants; item: Variants } {
  return {
    container: {
      hidden: {},
      visible: {
        transition: { staggerChildren: reduced ? 0 : 0.05 },
      },
    },
    item: {
      hidden: { opacity: 0, y: reduced ? 0 : 6 },
      visible: { opacity: 1, y: 0, transition: transition.fast },
    },
  };
}