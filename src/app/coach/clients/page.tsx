'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { useState } from 'react';

// Placeholder data for clients
const clientsData = [
  {
    id: 1,
    name: 'Sarah Mitchell',
    status: 'active',
    currentFocus: 'Strength & Conditioning',
    nextReviewDate: 'June 17, 2026',
  },
  {
    id: 2,
    name: 'James Chen',
    status: 'active',
    currentFocus: 'Flexibility & Recovery',
    nextReviewDate: 'June 19, 2026',
  },
  {
    id: 3,
    name: 'Emma Rodriguez',
    status: 'active',
    currentFocus: 'Weight Management',
    nextReviewDate: 'June 21, 2026',
  },
  {
    id: 4,
    name: 'Marcus Thompson',
    status: 'paused',
    currentFocus: 'Injury Rehabilitation',
    nextReviewDate: 'July 5, 2026',
  },
  {
    id: 5,
    name: 'Lisa Anderson',
    status: 'active',
    currentFocus: 'Performance Training',
    nextReviewDate: 'June 20, 2026',
  },
];

const getStatusBadgeVariant = (status: string) => {
  return status === 'active' ? 'success' : 'warning';
};

export default function CoachClientsPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredClients = clientsData.filter((client) =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="CLIENTS"
        action={{
          label: 'ADD CLIENT',
          onClick: () => {
            // Non-functional for now
          },
        }}
      />

      <div className="mt-8 space-y-6">
        {/* Search Bar */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <Input
            type="text"
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Client Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClients.map((client) => (
            <Link key={client.id} href={`/coach/clients/${client.id}`}>
              <Card
                variant="default"
                className="cursor-pointer hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-bold uppercase text-[#000000] flex-1">
                    {client.name}
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
                      {client.currentFocus}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      Next Review
                    </p>
                    <p className="text-sm text-gray-700 mt-1">
                      {client.nextReviewDate}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        {filteredClients.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600 font-semibold">
              No clients found matching "{searchQuery}"
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
