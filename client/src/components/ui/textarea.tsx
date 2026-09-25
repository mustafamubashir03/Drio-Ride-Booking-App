import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-[80px] w-full min-w-0 resize-y rounded-xl border border-border bg-card px-4 py-2.5 text-base text-foreground transition-colors outline-none motion-reduce:transition-none placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 sm:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }