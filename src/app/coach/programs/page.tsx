'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';

type ProgramTab = 'templates' | 'catalogue' | 'assignment_model';

type ProgramTemplate = {
  name: string;
  category: string;
  goal: string;
  structure: string;
  equipment: string;
  status: 'ready_later' | 'draft';
};

const programTemplates: ProgramTemplate[] = [
  {
    name: 'Upper A',
    category: 'Upper Body',
    goal: 'Horizontal push/pull emphasis with accessories.',
    structure: 'Main press, main row, secondary press, vertical pull, arms/rear delts.',
    equipment: 'Gym-based',
    status: 'draft',
  },
  {
    name: 'Upper B',
    category: 'Upper Body',
    goal: 'Vertical push/pull emphasis with upper-body volume.',
    structure: 'Overhead press, pull-up/pulldown, incline press, row, arms/shoulders.',
    equipment: 'Gym-based',
    status: 'draft',
  },
  {
    name: 'Lower A',
    category: 'Lower Body',
    goal: 'Squat emphasis with controlled accessory work.',
    structure: 'Squat pattern, hinge accessory, single-leg work, hamstrings, core.',
    equipment: 'Gym-based',
    status: 'draft',
  },
  {
    name: 'Lower B',
    category: 'Lower Body',
    goal: 'Hinge emphasis with secondary squat work.',
    structure: 'Deadlift or hinge pattern, squat accessory, posterior chain, core.',
    equipment: 'Gym-based',
    status: 'draft',
  },
  {
    name: 'Full Body',
    category: 'Full Body',
    goal: 'Balanced strength and physique session for busy lifters.',
    structure: 'Squat/hinge, push, pull, accessory, core or conditioning finisher.',
    equipment: 'Gym-based',
    status: 'draft',
  },
  {
    name: 'Full Body Bodyweight',
    category: 'Full Body',
    goal: 'Low-equipment fallback session for travel or home training.',
    structure: 'Squat/lunge, push-up variation, row/pull substitute, hinge, core.',
    equipment: 'Bodyweight or minimal equipment',
    status: 'draft',
  },
  {
    name: 'Squat Strength Base',
    category: 'Strength Block',
    goal: 'Reusable squat-focused progression structure.',
    structure: 'Primary squat exposure, secondary lower pattern, posterior chain, trunk.',
    equipment: 'Gym-based',
    status: 'draft',
  },
  {
    name: 'Bench Strength Base',
    category: 'Strength Block',
    goal: 'Reusable bench-focused progression structure.',
    structure: 'Primary bench exposure, secondary press, upper back, triceps, shoulders.',
    equipment: 'Gym-based',
    status: 'draft',
  },
];

const tabs: { label: string; value: ProgramTab }[] = [
  { label: 'Templates', value: 'templates' },
  { label: 'Catalogue', value: 'catalogue' },
  { label: 'Assignment Model', value: 'assignment_model' },
];

export default function CoachProgramsPage() {
  const [activeTab, setActiveTab] = useState<ProgramTab>('templates');

  return (
    <div className="space-y-8 p-6 md:p-8">
      <PageHeader
        title="PROGRAMS"
        subtitle="Build reusable training structures, manage the exercise catalogue, and later assign personalised programmes to clients."
      />

      <Card>
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`rounded-lg px-4 py-2 text-sm font-bold uppercase transition-colors ${
                activeTab === tab.value
                  ? 'bg-[#FA0201] text-white'
                  : 'bg-gray-200 text-[#000000] hover:bg-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Card>

      {activeTab === 'templates' && (
        <section>
          <SectionHeader title="PROGRAM TEMPLATES" accent />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {programTemplates.map((template) => (
              <Card key={template.name}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-gray-500">{template.category}</p>
                    <h2 className="mt-1 text-xl font-black uppercase text-[#000000]">{template.name}</h2>
                  </div>
                  <Badge variant="default">{template.status === 'draft' ? 'Draft structure' : 'Ready later'}</Badge>
                </div>

                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs font-bold uppercase text-gray-500">Goal</p>
                    <p className="text-gray-800">{template.goal}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-gray-500">Session Structure</p>
                    <p className="text-gray-800">{template.structure}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-gray-500">Equipment</p>
                    <p className="text-gray-800">{template.equipment}</p>
                  </div>
                </div>

                <div className="mt-5 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
                  <p className="text-xs font-bold uppercase text-gray-600">Not built yet</p>
                  <p className="mt-1 text-sm text-gray-700">
                    Later this template will be selectable during programme assignment, then adjusted for the client.
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'catalogue' && (
        <section>
          <SectionHeader title="EXERCISE CATALOGUE" accent />
          <Card>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.6fr] lg:items-center">
              <div>
                <h2 className="text-2xl font-black uppercase text-[#000000]">Catalogue sits inside Programs now</h2>
                <p className="mt-2 text-sm text-gray-700">
                  The exercise catalogue is the lowest-level library. Programmes and templates should sit above it,
                  then pull exercises from it when building or assigning training.
                </p>
                <p className="mt-3 text-sm text-gray-700">
                  For now, the existing catalogue manager remains available as the detailed editing screen.
                </p>
              </div>
              <div className="rounded-xl bg-gray-100 p-5">
                <p className="text-xs font-bold uppercase text-gray-500">Current action</p>
                <p className="mt-1 text-sm text-gray-700">
                  Open the existing exercise library to add, edit, archive, or restore exercises.
                </p>
                <Link href="/coach/exercise-catalogue" className="mt-4 block">
                  <Button type="button" className="w-full bg-[#FA0201] hover:bg-red-700">
                    Open catalogue
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        </section>
      )}

      {activeTab === 'assignment_model' && (
        <section>
          <SectionHeader title="ASSIGNMENT MODEL" accent />
          <Card>
            <div className="space-y-5 text-sm text-gray-800">
              <div>
                <h2 className="text-2xl font-black uppercase text-[#000000]">Planned programme assignment logic</h2>
                <p className="mt-2">
                  This is intentionally not built yet. The structure is here so the hierarchy is correct before we add complexity.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-bold uppercase text-gray-500">1. Pick Template</p>
                  <p className="mt-2">Choose a reusable structure such as Squat Strength Base, Upper A, or Full Body.</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-bold uppercase text-gray-500">2. Assign to Client</p>
                  <p className="mt-2">Use the same set and rep structure, but calculate loads relative to the client.</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-bold uppercase text-gray-500">3. Coach Tweaks</p>
                  <p className="mt-2">Adjust exercise choice, training days, load targets, and notes before publishing.</p>
                </div>
              </div>

              <div className="rounded-xl border-2 border-[#FA0201] bg-red-50 p-5">
                <p className="text-xs font-bold uppercase text-[#FA0201]">Example</p>
                <p className="mt-2">
                  Client A and Client B can both start the same squat programme. The programme architecture can stay identical,
                  such as 3 sets of 5 or 4 sets of 6, while the actual working loads are personalised from their strength level.
                  Client A might squat around 50 kg, while Client B might squat around 100 kg.
                </p>
              </div>
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}
