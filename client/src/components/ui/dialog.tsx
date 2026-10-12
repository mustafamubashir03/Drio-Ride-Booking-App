import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

/**
 * Modal dialog over Base UI, matching the existing Drio surfaces: the card
 * background, the hairline border, the 2xl radius already used across the
 * passenger panels, and the same scrim strength as the mobile sheet's shadow.
 *
 * Portalled to <body> so it always paints above the map, the bottom sheet and
 * the bottom tab bar regardless of their stacking contexts, and so the fixed
 * viewport it is centred against is the real viewport rather than a scrolled
 * ancestor.
 */

function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root {...props} />;
}

function DialogPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal {...props} />;
}

/**
 * Scrim strength is deliberately different per breakpoint.
 *
 * On a phone the dialog is small and nearly fills the screen, so the heavy scrim
 * reads as focus. On laptop/tablet/desktop the dialog is a compact card floating
 * over a large map and panel layout, and a 65% black + blur scrim turned the
 * whole viewport into one dark box that destroyed the surrounding UI. From `sm`
 * up the scrim is much lighter and the blur is dropped entirely, so the map stays
 * legible behind the dialog and it still reads as modal.
 */
function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Backdrop>) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/65",
        // Blur only below `sm`. Written as a max-* bound rather than overriding
        // with `sm:backdrop-blur-0`, which Tailwind does not emit, so the blur
        // would have silently survived on desktop.
        "max-sm:backdrop-blur-[2px]",
        "sm:bg-black/40 lg:bg-black/30",
        "transition-opacity duration-200 motion-reduce:transition-none",
        "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * `z-50` clears the map (z-0..z-20) and the bottom tab bar (z-40).
 *
 * The card is a fixed-size floating panel, never a stretched one: `w-[calc(100%-2rem)]`
 * fills a small phone, and `max-w-[26rem]` caps it so laptop and desktop always
 * get the same compact dialog rather than a box spanning the viewport. Height is
 * capped so the popup scrolls internally instead of ever pushing its actions off
 * screen, with more room reserved on larger screens.
 *
 * Elevation differs by breakpoint on purpose. The phone shadow is a single
 * upward offset, which suits a card sitting over a bottom sheet. The same shadow
 * on a viewport-centred dialog looked detached and half-lit, so from `sm` up it
 * becomes a proper two-layer elevation, plus a faint light ring that defines the
 * card's edge against the dark map (the app is dark-themed, so a dark ring would
 * be invisible and the card read as a hole).
 */
function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Popup>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-[26rem]",
          "-translate-x-1/2 -translate-y-1/2",
          "max-h-[calc(100svh-2.5rem)] overflow-y-auto overscroll-contain",
          "sm:max-h-[calc(100svh-6rem)]",
          "rounded-2xl border border-border bg-card p-5 text-card-foreground",
          "shadow-[0_-8px_32px_rgba(0,0,0,0.45)]",
          "sm:shadow-[0_12px_20px_-8px_rgba(0,0,0,0.55),0_32px_64px_-24px_rgba(0,0,0,0.5)]",
          "sm:ring-1 sm:ring-white/[0.07]",
          "transition-[opacity,transform] duration-200 outline-none motion-reduce:transition-none",
          "data-[starting-style]:translate-y-[calc(-50%+8px)] data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0",
          "data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-[15px] font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-[12.5px] text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};