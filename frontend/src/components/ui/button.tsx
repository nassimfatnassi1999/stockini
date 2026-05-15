import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /* ── Primary actions ─────────────────────────────── */
        default:
          'bg-app-primary text-white shadow-sm hover:bg-app-primary-hover',
        success:
          'bg-app-success text-white shadow-sm hover:bg-app-success/90',
        warning:
          'bg-app-warning text-white shadow-sm hover:bg-app-warning/90',
        danger:
          'bg-app-danger text-white shadow-sm hover:bg-app-danger/90',

        /* ── Neutral / structural ────────────────────────── */
        secondary:
          'bg-secondary text-text-primary hover:bg-muted',
        outline:
          'border border-border bg-background text-text-secondary hover:bg-muted hover:text-text-primary',
        ghost:
          'text-text-secondary hover:bg-muted hover:text-text-primary',
        link:
          'text-app-primary underline-offset-4 hover:underline',

        /* ── shadcn destructive alias ────────────────────── */
        destructive:
          'bg-app-danger text-white shadow-sm hover:bg-app-danger/90',

        /* ── Icon action variants (token-aware) ──────────── */
        action:
          'h-7 w-7 border border-transparent bg-transparent p-0 text-text-muted hover:bg-muted hover:text-text-primary',
        actionEdit:
          'h-7 w-7 border border-transparent bg-transparent p-0 text-text-muted hover:border-app-primary/20 hover:bg-app-primary-soft hover:text-app-primary',
        actionView:
          'h-7 w-7 border border-transparent bg-transparent p-0 text-text-muted hover:border-border hover:bg-muted hover:text-text-primary',
        actionDelete:
          'h-7 w-7 border border-transparent bg-transparent p-0 text-text-muted hover:border-app-danger/20 hover:bg-app-danger-soft hover:text-app-danger',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm:      'h-9 rounded-md px-3',
        lg:      'h-11 rounded-md px-8',
        icon:    'h-10 w-10',
        action:  'h-7 w-7 rounded-md p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
