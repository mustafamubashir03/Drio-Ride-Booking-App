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

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Backdrop>) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px]",
        "transition-opacity duration-200 motion-reduce:transition-none",
        "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * `z-50` clears the map (z-0..z-20) and the bottom tab bar (z-40). The bottom
 * inset plus the max height keep the card fully reachable on short phones: the
 * popup scrolls internally instead of ever pushing its actions off screen.
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
          "rounded-2xl border border-border bg-card p-5 text-card-foreground",
          "shadow-[0_-8px_32px_rgba(0,0,0,0.45)]",
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