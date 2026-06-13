import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, action }) => {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-3xl font-bold uppercase text-[#000000] tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-gray-600">
              {subtitle}
            </p>
          )}
        </div>
        {action && (
          <div>
            {action.href ? (
              <a
                href={action.href}
                className="ml-4 inline-flex items-center px-4 py-2 bg-[#FA0201] text-white font-semibold rounded hover:bg-red-700 transition-colors"
              >
                {action.label}
              </a>
            ) : (
              <button
                onClick={action.onClick}
                className="ml-4 inline-flex items-center px-4 py-2 bg-[#FA0201] text-white font-semibold rounded hover:bg-red-700 transition-colors"
              >
                {action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
