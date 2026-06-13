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

const emptyForm = {
  fullName: '',
  email: '',
  currentFocus: '',
  nextReviewDate: '',
};

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
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [form, setForm] = useState(emptyForm);

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

    setClients((data ?? []) as ClientRecord[]);
    setIsLoading(false);
  };

  useEffect(() => {
    loadClients();
  }, []);

  const filteredClients = useMemo(
    () =>
      clients.filter((client) =>
        client.full_name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [clients, searchQuery]
  );

  const handleCreateClient = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      return;
    }

    if (!form.fullName.trim()) {
      setError('Client name is required.');
      return;
    }

    setIsSavingClient(true);
    setError(null);

    const supabase = createClient();

    const { error: insertError } = await supabase.from('clients').insert({
      full_name: form.fullName.trim(),
      email: form.email.trim() || null,
      status: 'active',
      start_date: new Date().toISOString().slice(0, 10),
      current_focus: form.currentFocus.trim() || null,
      next_review_date: form.nextReviewDate || null,
    });

    if (insertError) {
      setError(insertError.message);
      setIsSavingClient(false);
      return;
    }

    setForm(emptyForm);
    setIsAddClientOpen(false);
    setIsSavingClient(false);
    setIsLoading(true);
    await loadClients();
  };

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="CLIENTS"
        action={{
          label: 'ADD CLIENT',
          onClick: () => setIsAddClientOpen(true),
        }}
      />

      <div className="mt-8 space-y-6">
        {isAddClientOpen && (
          <Card className="border-2 border-[#FA0201]">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold uppercase text-[#000000]">
                  Add Client
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Create a client record for tracking, check-ins, actions, and feedback.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddClientOpen(false)}
                className="text-sm font-bold uppercase text-gray-500 hover:text-[#FA0201]"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-600 mb-2">
                  Client Name
                </label>
                <Input
                  value={form.fullName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, fullName: event.target.value }))
                  }
                  placeholder="e.g. Alex Smith"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-600 mb-2">
                  Email
                </label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="client@email.com"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-600 mb-2">
                  Current Focus
                </label>
                <Input
                  value={form.currentFocus}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, currentFocus: event.target.value }))
                  }
                  placeholder="e.g. Strength and nutrition consistency"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-600 mb-2">
                  Next Review Date
                </label>
                <Input
                  type="date"
                  value={form.nextReviewDate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, nextReviewDate: event.target.value }))
                  }
                />
              </div>

              <div className="md:col-span-2 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddClientOpen(false)}
                  className="px-5 py-3 rounded-lg bg-gray-200 text-[#000000] font-bold uppercase hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingClient}
                  className="px-5 py-3 rounded-lg bg-[#FA0201] text-white font-bold uppercase hover:bg-red-700 disabled:opacity-60"
                >
                  {isSavingClient ? 'Saving...' : 'Create Client'}
                </button>
              </div>
            </form>
          </Card>
        )}

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
