'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useEffect, useMemo, useState } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

interface CoachActionRecord {
  id: string;
  action_type: string;
  description: string;
  due_date: string | null;
  status: string;
  priority: string;
  clients: {
    full_name: string;
  } | null;
}

const formatDate = (value: string | null) => {
  if (!value) return 'No due date';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const normaliseStatusForFilter = (status: string) => {
  if (status === 'done') return 'completed';
  if (status === 'in_progress') return 'in-progress';
  if (status === 'new') return 'pending';
  return status.replaceAll('_', '-');
};

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'done':
      return 'success';
    case 'in_progress':
    case 'waiting_on_client':
    case 'waiting_on_coach':
      return 'warning';
    case 'new':
      return 'default';
    default:
      return 'default';
  }
};

const getStatusLabel = (status: string) => {
  if (status === 'new') return 'Pending';
  if (status === 'in_progress') return 'In Progress';
  if (status === 'done') return 'Completed';
  if (status === 'no_action_needed') return 'No Action Needed';
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const getActionTitle = (action: CoachActionRecord) => {
  return action.description || action.action_type.replaceAll('_', ' ');
};

export default function CoachActionsPage() {
  const [filteredStatus, setFilteredStatus] = useState('all');
  const [actions, setActions] = useState<CoachActionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActions = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    const { data, error: actionError } = await supabase
      .from('coach_actions')
      .select('id, action_type, description, due_date, status, priority, clients(full_name)')
      .order('due_date', { ascending: true });

    if (actionError) {
      setError(actionError.message);
      setIsLoading(false);
      return;
    }

    setActions((data ?? []) as CoachActionRecord[]);
    setIsLoading(false);
  };

  useEffect(() => {
    loadActions();
  }, []);

  const filteredActions = useMemo(
    () =>
      filteredStatus === 'all'
        ? actions
        : actions.filter(
            (action) => normaliseStatusForFilter(action.status) === filteredStatus
          ),
    [actions, filteredStatus]
  );

  const handleComplete = async (actionId: string) => {
    if (!isSupabaseConfigured) return;

    const supabase = createClient();

    const { error: updateError } = await supabase
      .from('coach_actions')
      .update({
        status: 'done',
        completed_at: new Date().toISOString(),
      })
      .eq('id', actionId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setActions((currentActions) =>
      currentActions.map((action) =>
        action.id === actionId ? { ...action, status: 'done' } : action
      )
    );
  };

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="ACTION QUEUE"
        subtitle="Manage your coaching tasks and follow-ups"
      />

      <div className="mt-8 space-y-6">
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

        {isLoading && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="font-semibold text-gray-700">Loading actions...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="font-semibold text-red-700">{error}</p>
          </div>
        )}

        {!isLoading && !error && (
          <div className="space-y-4">
            {filteredActions.map((action) => (
              <Card key={action.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h3 className="text-lg font-bold uppercase text-[#000000]">
                      {getActionTitle(action)}
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
                      <p className="text-gray-700">{action.action_type.replaceAll('_', ' ')}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-gray-500">
                        Client
                      </p>
                      <p className="text-gray-700">{action.clients?.full_name ?? 'No client linked'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-gray-500">
                        Due Date
                      </p>
                      <p className="text-gray-700">{formatDate(action.due_date)}</p>
                    </div>
                  </div>
                </div>

                {action.status !== 'done' && (
                  <Button
                    onClick={() => handleComplete(action.id)}
                    variant="primary"
                    size="md"
                    className="w-full md:w-auto"
                  >
                    Complete
                  </Button>
                )}

                {action.status === 'done' && (
                  <div className="text-sm font-semibold text-green-600 uppercase">
                    ✓ Done
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {!isLoading && !error && filteredActions.length === 0 && (
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
