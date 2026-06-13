import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from './badge';

interface TaskCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed';
  dueDate?: string;
}

const statusConfig = {
  pending: { badge: 'default', label: 'Pending' },
  'in-progress': { badge: 'warning', label: 'In Progress' },
  completed: { badge: 'success', label: 'Completed' },
};

const TaskCard = React.forwardRef<HTMLDivElement, TaskCardProps>(
  ({ className, title, description, status, dueDate, ...props }, ref) => {
    const statusInfo = statusConfig[status];

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg p-5 bg-white border border-gray-200 hover:shadow-md transition-shadow',
          className
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <h3 className="text-base font-bold uppercase flex-1">{title}</h3>
          <Badge variant={statusInfo.badge as any}>
            {statusInfo.label}
          </Badge>
        </div>

        {description && (
          <p className="text-sm text-gray-600 mb-3">{description}</p>
        )}

        {dueDate && (
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase">
            <svg
              className="w-4 h-4"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {dueDate}
          </div>
        )}
      </div>
    );
  }
);

TaskCard.displayName = 'TaskCard';

export { TaskCard };
export type { TaskCardProps };
