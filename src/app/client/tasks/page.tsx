'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { TaskCard } from '@/components/ui/task-card';
import { Button } from '@/components/ui/button';

interface Task {
  id: number;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  dueDate: string;
}

const allTasks: Task[] = [
  {
    id: 1,
    title: 'Complete Weekly Check-in',
    description: 'Submit your weekly metrics and feedback for program evaluation',
    status: 'pending',
    dueDate: 'June 15, 2026',
  },
  {
    id: 2,
    title: 'Log Top Lift - Upper Push',
    description: 'Record your heaviest set from the upper push session',
    status: 'in-progress',
    dueDate: 'June 16, 2026',
  },
  {
    id: 3,
    title: 'Nutrition Check-in',
    description: 'Submit your average daily macro intake for the week',
    status: 'pending',
    dueDate: 'June 17, 2026',
  },
  {
    id: 4,
    title: 'Workout Check-in - Lower A',
    description: 'Log RPE and volume completion for lower A session',
    status: 'completed',
    dueDate: 'June 14, 2026',
  },
  {
    id: 5,
    title: 'Submit Bodyweight Reading',
    description: 'Record your current bodyweight and date',
    status: 'completed',
    dueDate: 'June 13, 2026',
  },
];

type FilterStatus = 'all' | 'pending' | 'in-progress' | 'completed';

export default function TasksPage() {
  const [filter, setFilter] = useState<FilterStatus>('all');

  const filteredTasks =
    filter === 'all'
      ? allTasks
      : allTasks.filter((task) => task.status === filter);

  const filterOptions: { label: string; value: FilterStatus }[] = [
    { label: 'All', value: 'all' },
    { label: 'Pending', value: 'pending' },
    { label: 'In Progress', value: 'in-progress' },
    { label: 'Completed', value: 'completed' },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader title="YOUR TASKS" />

      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="px-4 py-6 md:px-8 max-w-3xl mx-auto">
          {/* Filter Buttons */}
          <div className="mb-8 flex gap-2 flex-wrap">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`px-4 py-2 rounded-lg font-bold uppercase text-sm transition-colors ${
                  filter === option.value
                    ? 'bg-[#FA0201] text-white'
                    : 'bg-white border-2 border-gray-300 text-black hover:border-[#FA0201]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Tasks List */}
          <div className="space-y-4 pb-8">
            {filteredTasks.length > 0 ? (
              filteredTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  title={task.title}
                  description={task.description}
                  status={task.status}
                  dueDate={task.dueDate}
                />
              ))
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg font-semibold uppercase">
                  No tasks with this status
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
