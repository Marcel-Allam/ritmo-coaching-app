import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva(
  'rounded-lg p-6 relative',
  {
    variants: {
      variant: {
        default: 'bg-white border border-gray-200 shadow-sm',
        dark: 'bg-black text-white border border-gray-800',
        accent: 'bg-white border border-gray-200 shadow-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  title?: string;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, title, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(cardVariants({ variant }), className)}
        {...props}
      >
        {variant === 'accent' && (
          <div
            className="absolute top-0 right-0 w-0 h-0 border-l-[60px] border-t-[60px] border-l-transparent border-t-red-600"
            aria-hidden="true"
          />
        )}
        {title && (
          <h3 className="text-lg font-bold uppercase mb-4">{title}</h3>
        )}
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export { Card, cardVariants };
export type { CardProps };
