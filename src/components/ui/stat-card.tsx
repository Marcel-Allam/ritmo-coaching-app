import React from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  trend?: {
    direction: 'up' | 'down';
    value: string | number;
  };
  dark?: boolean;
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, label, value, trend, dark, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg p-6 border',
          dark
            ? 'bg-black text-white border-gray-800'
            : 'bg-white text-black border-gray-200',
          className
        )}
        {...props}
      >
        <p className="text-sm font-semibold uppercase mb-2 opacity-75">
          {label}
        </p>
        <div className="flex items-end justify-between">
          <div className="text-4xl font-bold">{value}</div>
          {trend && (
            <div
              className={cn(
                'flex items-center gap-1 text-sm font-semibold',
                trend.direction === 'up' ? 'text-green-500' : 'text-red-600'
              )}
            >
              {trend.direction === 'up' ? (
                <svg
                  className="w-4 h-4"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M7 14l5-5 5 5z" />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              )}
              {trend.value}
            </div>
          )}
        </div>
      </div>
    );
  }
);

StatCard.displayName = 'StatCard';

export { StatCard };
export type { StatCardProps };
