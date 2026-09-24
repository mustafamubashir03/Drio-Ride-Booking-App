import { useSyncExternalStore } from "react";
import type { Variants } from "motion/react";
import { getTransitions, type MotionTransitions } from "./transitions";
import {
  makeDialogVariants,
  makePageVariants,
  makePopoverVariants,
  makeStaggerVariants,
} from "./variants";

function reducedMotionQuery() {
  if (typeof window === "undefined") return null;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)");
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  const mq = reducedMotionQuery();
  if (!mq) return () => {};
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getReducedSnapshot() {
  return reducedMotionQuery()?.matches ?? false;
}

function getServerSnapshot() {
  return false;
}

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, getReducedSnapshot, getServerSnapshot);
}

export interface MotionSystem {
  reduced: boolean;
  transition: MotionTransitions;
  page: Variants;
  dialog: Variants;
  popover: Variants;
  stagger: { container: Variants; item: Variants };
}

export function useMotionSystem(): MotionSystem {
  const reduced = useReducedMotion();
  const transition = getTransitions(reduced);
  return {
    reduced,
    transition,
    page: makePageVariants(transition, reduced),
    dialog: makeDialogVariants(transition, reduced),
    popover: makePopoverVariants(transition, reduced),
    stagger: makeStaggerVariants(transition, reduced),
  };
}

type MotionStateProps = {
  variants: Variants;
  reduced: boolean;
};

export function motionStateProps({ variants, reduced }: MotionStateProps) {
  return {
    variants,
    initial: reduced ? false : "hidden",
    animate: reduced ? undefined : "visible",
    exit: reduced ? undefined : "exit",
  };
}