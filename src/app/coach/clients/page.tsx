'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

interface ClientRecord {
  id: string;
  full_name: string;
  status: string;
  current_focus: string | null;
  next_review_date: string | null;
}

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const getStatusBadgeVariant = (status: string) => {
  return status === 'active' ? 'success' : 'warning';
};

export default function CoachClientsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadClients = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setIsLoading(false);
        return;
      }

      const supabase = createClient();

      const { data, error: clientError } = await supabase
        .from('clients')
        .select('id, full_name, status, current_focus, next_review_date')
        .order('created_at', { ascending: false });

      if (clientError) {
        setError(clientError.message);
        setIsLoading(false);
        return;
      }

      setClients(data ?? []);
      setIsLoading(false);
    };

    loadClients();
  }, []);

  const filteredClients = useMemo(
    () =>
      clients.filter((client) =>
        client.full_name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [clients, searchQuery]
  );

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="CLIENTS"
        action={{
          label: 'ADD CLIENT',
          onClick: () => {
            alert('Add Client form is the next build step.');
          },
        }}
      />

      <div className="mt-8 space-y-6">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <Input
            type="text"
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {isLoading && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="font-semibold text-gray-700">Loading clients...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="font-semibold text-red-700">{error}</p>
          </div>
        )}

        {!isLoading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClients.map((client) => (
              <Link key={client.id} href={`/coach/clients/${client.id}`}>
                <Card
                  variant="default"
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-lg font-bold uppercase text-[#000000] flex-1">
                      {client.full_name}
                    </h3>
                    <Badge
                      variant={getStatusBadgeVariant(client.status) as any}
                    >
                      {client.status}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-gray-500">
                        Current Focus
                      </p>
                      <p className="text-sm text-gray-700 mt-1">
                        {client.current_focus || 'No current focus set'}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase text-gray-500">
                        Next Review
                      </p>
                      <p className="text-sm text-gray-700 mt-1">
                        {formatDate(client.next_review_date)}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {!isLoading && !error && filteredClients.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-600 font-semibold">
              No clients found matching &quot;{searchQuery}&quot;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
