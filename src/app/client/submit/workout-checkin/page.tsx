'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface FormData {
  workoutDate: string;
  sessionName: string;
  rpe: number;
  volumeCompleted: boolean;
  notes: string;
}

const RatingButtons = ({
  value,
  onChange,
}: {
  value: number;
  onChange: (val: number) => void;
}) => (
  <div className="mb-6">
    <label className="block text-sm font-semibold uppercase mb-3">RPE (1-10)</label>
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

export default function WorkoutCheckinPage() {
  const [formData, setFormData] = useState<FormData>({
    workoutDate: '',
    sessionName: '',
    rpe: 0,
    volumeCompleted: false,
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

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      volumeCompleted: e.target.checked,
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
      <PageHeader title="WORKOUT CHECK-IN" />

      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="px-4 py-6 md:px-8 max-w-2xl mx-auto">
          {submitted && (
            <Card className="mb-6 p-4 bg-green-50 border-green-200">
              <p className="text-green-800 font-semibold uppercase text-sm">
                ✓ Workout check-in submitted successfully
              </p>
            </Card>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Workout Date */}
            <Input
              type="date"
              label="WORKOUT DATE"
              name="workoutDate"
              value={formData.workoutDate}
              onChange={handleInputChange}
              required
            />

            {/* Session Name */}
            <Input
              type="text"
              label="SESSION NAME"
              name="sessionName"
              placeholder="e.g. Upper Push, Lower A, Full Body"
              value={formData.sessionName}
              onChange={handleInputChange}
              required
            />

            {/* RPE Rating */}
            <RatingButtons
              value={formData.rpe}
              onChange={(val) =>
                setFormData((prev) => ({
                  ...prev,
                  rpe: val,
                }))
              }
            />

            {/* Volume Completed */}
            <div className="mb-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.volumeCompleted}
                  onChange={handleCheckboxChange}
                  className="w-6 h-6 rounded border-2 border-gray-300 cursor-pointer accent-[#FA0201]"
                />
                <span className="text-sm font-semibold uppercase">
                  Volume Completed
                </span>
              </label>
            </div>

            {/* Notes */}
            <Textarea
              label="NOTES"
              name="notes"
              placeholder="How did the session feel? Any observations?"
              value={formData.notes}
              onChange={handleInputChange}
            />

            {/* Submit Button */}
            <div className="pb-8">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                className="bg-[#FA0201] hover:bg-red-700"
              >
                SUBMIT
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
