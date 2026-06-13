import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="text-gray-400 mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-700 mb-2">
        {title}
      </h3>
      <p className="text-gray-500 text-center max-w-sm">
        {description}
      </p>
    </div>
  );
};
