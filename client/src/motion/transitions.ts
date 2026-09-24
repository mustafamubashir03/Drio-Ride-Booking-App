import type { Transition } from "motion/react";

export interface MotionTransitions {
  fast: Transition;
  normal: Transition;
  deliberate: Transition;
}

const reducedTransitions: MotionTransitions = {
  fast: { duration: 0 },
  normal: { duration: 0 },
  deliberate: { duration: 0 },
};

const fullTransitions: MotionTransitions = {
  fast: { duration: 0.15, ease: "easeOut" },
  normal: { duration: 0.2, ease: "easeOut" },
  deliberate: { duration: 0.28, ease: "easeOut" },
};

export function getTransitions(reduced: boolean): MotionTransitions {
  return reduced ? reducedTransitions : fullTransitions;
}