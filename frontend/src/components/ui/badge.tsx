import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium leading-5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-app-ring focus-visible:ring-offset-2 ring-offset-background',
  {
    variants: {
      variant: {
        /* ── Brand / default ─────────────────────────────── */
        default:
          'border-app-primary/30 bg-app-primary-soft text-app-primary hover:bg-app-primary/10',
        secondary:
          'border-border bg-muted text-text-secondary hover:bg-muted',
        outline:
          'border-border text-text-primary',
        muted:
          'border-transparent bg-muted text-text-secondary',

        /* ── Status ──────────────────────────────────────── */
        success:
          'border-app-success/30 bg-app-success-soft text-app-success',
        warning:
          'border-app-warning/30 bg-app-warning-soft text-app-warning',
        danger:
          'border-app-danger/30 bg-app-danger-soft text-app-danger',

        /* ── Activity ────────────────────────────────────── */
        active:
          'border-app-success/30 bg-app-success/10 text-app-success',
        inactive:
          'border-border bg-muted text-text-muted',

        /* ── Roles ───────────────────────────────────────── */
        admin:
          'border-app-primary/30 bg-app-primary/15 text-app-primary',
        stock:
          'border-app-accent/30 bg-app-accent/15 text-app-accent',
        seller:
          'border-app-accent/20 bg-app-accent/10 text-app-accent',
        purchase:
          'border-app-secondary/20 bg-app-secondary/10 text-app-secondary',
      },
    },
    defaultVariants: {
      variant: 'secondary',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
