import React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, type, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-semibold uppercase mb-2">
            {label}
          </label>
        )}
        <input
          type={type}
          className={cn(
            'w-full px-4 py-2 bg-white border-2 border-gray-300 rounded-lg text-black placeholder-gray-500 transition-colors duration-200',
            'focus:outline-none focus:border-black focus:ring-2 focus:ring-black focus:ring-opacity-50',
            'disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-red-600 focus:border-red-600 focus:ring-red-600',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="text-red-600 text-sm font-semibold mt-1">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
export type { InputProps };
