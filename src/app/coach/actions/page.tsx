'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

// Placeholder data for actions
const actionsData = [
  {
    id: 1,
    type: 'Client Check-in',
    title: 'Weekly Progress Call',
    clientName: 'Sarah Mitchell',
    dueDate: 'June 15, 2026',
    status: 'pending',
  },
  {
    id: 2,
    type: 'Form Review',
    title: 'Squat Form Assessment',
    clientName: 'James Chen',
    dueDate: 'June 14, 2026',
    status: 'in-progress',
  },
  {
    id: 3,
    type: 'Workout Design',
    title: 'Create New Training Plan',
    clientName: 'Emma Rodriguez',
    dueDate: 'June 16, 2026',
    status: 'pending',
  },
  {
    id: 4,
    type: 'Client Check-in',
    title: 'Recovery Status Update',
    clientName: 'Marcus Thompson',
    dueDate: 'June 13, 2026',
    status: 'completed',
  },
  {
    id: 5,
    type: 'Nutrition Guidance',
    title: 'Meal Plan Adjustment',
    clientName: 'Lisa Anderson',
    dueDate: 'June 17, 2026',
    status: 'pending',
  },
  {
    id: 6,
    type: 'Progress Review',
    title: 'Monthly Assessment',
    clientName: 'Sarah Mitchell',
    dueDate: 'June 20, 2026',
    status: 'pending',
  },
];

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'in-progress':
      return 'warning';
    case 'pending':
      return 'default';
    default:
      return 'default';
  }
};

const getStatusLabel = (status: string) => {
  return status.charAt(0).toUpperCase() + status.slice(1);
};

export default function CoachActionsPage() {
  const [filteredStatus, setFilteredStatus] = useState('all');
  const [completedActions, setCompletedActions] = useState(
    new Set(
      actionsData
        .filter((a) => a.status === 'completed')
        .map((a) => a.id)
    )
  );

  const filteredActions =
    filteredStatus === 'all'
      ? actionsData
      : actionsData.filter((action) => action.status === filteredStatus);

  const handleComplete = (actionId: number) => {
    setCompletedActions((prev) => {
      const newSet = new Set(prev);
      newSet.add(actionId);
      return newSet;
    });
  };

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="ACTION QUEUE"
        subtitle="Manage your coaching tasks and follow-ups"
      />

      <div className="mt-8 space-y-6">
        {/* Filter Tabs */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 flex flex-wrap gap-2">
          {['all', 'pending', 'in-progress', 'completed'].map((filter) => (
            <button
              key={filter}
              onClick={() => setFilteredStatus(filter)}
              className={`px-4 py-2 font-semibold uppercase text-sm rounded-lg transition-colors ${
                filteredStatus === filter
                  ? 'bg-[#FA0201] text-white'
                  : 'bg-gray-200 text-[#000000] hover:bg-gray-300'
              }`}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>

        {/* Action Cards */}
        <div className="space-y-4">
          {filteredActions.map((action) => (
            <Card key={action.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h3 className="text-lg font-bold uppercase text-[#000000]">
                    {action.title}
                  </h3>
                  <Badge
                    variant={getStatusBadgeVariant(action.status) as any}
                  >
                    {getStatusLabel(action.status)}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      Type
                    </p>
                    <p className="text-gray-700">{action.type}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      Client
                    </p>
                    <p className="text-gray-700">{action.clientName}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      Due Date
                    </p>
                    <p className="text-gray-700">{action.dueDate}</p>
                  </div>
                </div>
              </div>

              {action.status !== 'completed' && (
                <Button
                  onClick={() => handleComplete(action.id)}
                  variant="primary"
                  size="md"
                  className="w-full md:w-auto"
                >
                  Complete
                </Button>
              )}

              {action.status === 'completed' && (
                <div className="text-sm font-semibold text-green-600 uppercase">
                  ✓ Done
                </div>
              )}
            </Card>
          ))}
        </div>

        {filteredActions.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-600 font-semibold">
              No {filteredStatus === 'all' ? '' : filteredStatus} actions found
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
