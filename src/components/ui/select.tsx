import React from 'react';
import { cn } from '@/lib/utils';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: Array<{ value: string; label: string }>;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, children, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-semibold uppercase mb-2">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            className={cn(
              'w-full px-4 py-2 bg-white border-2 border-gray-300 rounded-lg text-black appearance-none transition-colors duration-200',
              'focus:outline-none focus:border-black focus:ring-2 focus:ring-black focus:ring-opacity-50',
              'disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50',
              error && 'border-red-600 focus:border-red-600 focus:ring-red-600',
              'pr-10',
              className
            )}
            ref={ref}
            {...props}
          >
            {options ? (
              options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))
            ) : (
              children
            )}
          </select>
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none text-gray-700"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        {error && (
          <p className="text-red-600 text-sm font-semibold mt-1">{error}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export { Select };
export type { SelectProps };
