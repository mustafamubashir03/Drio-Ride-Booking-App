import type { Transition } from "motion/react";

export interface MotionTransitions {
  fast: Transition;
  normal: Transition;
  deliberate: Transition;
  /**
   * Spring for elements that change size or position, where an eased duration
   * reads as mechanical. Slightly under-damped so a large travel settles with
   * a little weight instead of stopping dead.
   */
  spring: Transition;
}

const reducedTransitions: MotionTransitions = {
  fast: { duration: 0 },
  normal: { duration: 0 },
  deliberate: { duration: 0 },
  spring: { duration: 0 },
};

const fullTransitions: MotionTransitions = {
  fast: { duration: 0.15, ease: "easeOut" },
  normal: { duration: 0.2, ease: "easeOut" },
  deliberate: { duration: 0.28, ease: "easeOut" },
  spring: { type: "spring", stiffness: 420, damping: 38, mass: 0.9 },
};

export function getTransitions(reduced: boolean): MotionTransitions {
  return reduced ? reducedTransitions : fullTransitions;
}