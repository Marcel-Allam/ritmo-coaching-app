import React from 'react';
import { cn } from '@/lib/utils';

interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  accent?: boolean;
}

const SectionHeader = React.forwardRef<HTMLDivElement, SectionHeaderProps>(
  ({ className, title, accent, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center gap-3 mb-6',
          className
        )}
        {...props}
      >
        {accent && (
          <div className="w-1 h-8 bg-red-600" aria-hidden="true" />
        )}
        <h2 className="text-2xl font-bold uppercase tracking-tight">
          {title}
        </h2>
      </div>
    );
  }
);

SectionHeader.displayName = 'SectionHeader';

export { SectionHeader };
export type { SectionHeaderProps };
