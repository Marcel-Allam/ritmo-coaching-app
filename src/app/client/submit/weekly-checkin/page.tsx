'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/ui/section-header';

interface RatingInput {
  label: string;
  value: number;
}

interface FormData {
  weekStarting: string;
  energy: number;
  sleepQuality: number;
  stress: number;
  motivation: number;
  adherence: number;
  painIssues: string;
  wins: string;
  notes: string;
}

const RatingButtons = ({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (val: number) => void;
  label: string;
}) => (
  <div className="mb-6">
    <label className="block text-sm font-semibold uppercase mb-3">{label}</label>
    <div className="flex gap-2 flex-wrap">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
        <button
          key={num}
          onClick={() => onChange(num)}
          className={`w-10 h-10 rounded font-bold uppercase text-sm transition-colors ${
            value === num
              ? 'bg-[#FA0201] text-white'
              : 'bg-white border-2 border-gray-300 text-black hover:border-[#FA0201]'
          }`}
        >
          {num}
        </button>
      ))}
    </div>
  </div>
);

export default function WeeklyCheckinPage() {
  const [formData, setFormData] = useState<FormData>({
    weekStarting: '',
    energy: 0,
    sleepQuality: 0,
    stress: 0,
    motivation: 0,
    adherence: 0,
    painIssues: '',
    wins: '',
    notes: '',
  });

  const [submitted, setSubmitted] = useState(false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleRatingChange = (field: keyof FormData, value: number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader title="WEEKLY CHECK-IN" />

      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="px-4 py-6 md:px-8 max-w-2xl mx-auto">
          {submitted && (
            <Card className="mb-6 p-4 bg-green-50 border-green-200">
              <p className="text-green-800 font-semibold uppercase text-sm">
                ✓ Check-in submitted successfully
              </p>
            </Card>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Week Starting */}
            <div>
              <Input
                type="date"
                label="WEEK STARTING"
                name="weekStarting"
                value={formData.weekStarting}
                onChange={handleInputChange}
                required
              />
            </div>

            {/* Rating Section */}
            <section>
              <SectionHeader title="METRICS" />
              <RatingButtons
                value={formData.energy}
                onChange={(val) => handleRatingChange('energy', val)}
                label="Energy Level"
              />
              <RatingButtons
                value={formData.sleepQuality}
                onChange={(val) => handleRatingChange('sleepQuality', val)}
                label="Sleep Quality"
              />
              <RatingButtons
                value={formData.stress}
                onChange={(val) => handleRatingChange('stress', val)}
                label="Stress Level"
              />
              <RatingButtons
                value={formData.motivation}
                onChange={(val) => handleRatingChange('motivation', val)}
                label="Motivation"
              />
              <RatingButtons
                value={formData.adherence}
                onChange={(val) => handleRatingChange('adherence', val)}
                label="Adherence"
              />
            </section>

            {/* Textarea Fields */}
            <section>
              <SectionHeader title="FEEDBACK" />
              <Textarea
                label="Pain / Issues"
                name="painIssues"
                placeholder="Any pain, injuries, or issues this week?"
                value={formData.painIssues}
                onChange={handleInputChange}
              />
            </section>

            <section>
              <Textarea
                label="Wins This Week"
                name="wins"
                placeholder="What went well this week? Any PRs or achievements?"
                value={formData.wins}
                onChange={handleInputChange}
              />
            </section>

            <section>
              <Textarea
                label="Additional Notes"
                name="notes"
                placeholder="Any other notes or observations..."
                value={formData.notes}
                onChange={handleInputChange}
              />
            </section>

            {/* Submit Button */}
            <div className="pb-8">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                className="bg-[#FA0201] hover:bg-red-700"
              >
                SUBMIT CHECK-IN
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
