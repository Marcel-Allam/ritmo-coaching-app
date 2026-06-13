import React from 'react';
import { cn } from '@/lib/utils';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-semibold uppercase mb-2">
            {label}
          </label>
        )}
        <textarea
          className={cn(
            'w-full px-4 py-2 bg-white border-2 border-gray-300 rounded-lg text-black placeholder-gray-500 transition-colors duration-200 resize-vertical min-h-24',
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

Textarea.displayName = 'Textarea';

export { Textarea };
export type { TextareaProps };
