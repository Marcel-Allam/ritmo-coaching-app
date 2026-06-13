'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface FormData {
  exerciseName: string;
  topSetWeight: number;
  topSetReps: number;
  notes: string;
}

export default function KeyLiftPage() {
  const [formData, setFormData] = useState<FormData>({
    exerciseName: '',
    topSetWeight: 0,
    topSetReps: 0,
    notes: '',
  });

  const [submitted, setSubmitted] = useState(false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'exerciseName' ? value : parseFloat(value) || 0,
    }));
  };

  // Calculate estimated 1RM using the Epley formula: weight * (1 + reps/30)
  const calculateEstimated1RM = (): string => {
    if (formData.topSetWeight && formData.topSetReps) {
      const estimated1RM =
        formData.topSetWeight * (1 + formData.topSetReps / 30);
      return estimated1RM.toFixed(1);
    }
    return '-';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted:', {
      ...formData,
      estimated1RM: calculateEstimated1RM(),
    });
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader title="KEY LIFT / TOP SET" />

      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="px-4 py-6 md:px-8 max-w-2xl mx-auto">
          {submitted && (
            <Card className="mb-6 p-4 bg-green-50 border-green-200">
              <p className="text-green-800 font-semibold uppercase text-sm">
                ✓ Key lift submitted successfully
              </p>
            </Card>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Exercise Name */}
            <Input
              type="text"
              label="EXERCISE NAME"
              name="exerciseName"
              placeholder="e.g. Barbell Squat, Bench Press"
              value={formData.exerciseName}
              onChange={handleInputChange}
              required
            />

            {/* Top Set Weight */}
            <Input
              type="number"
              label="TOP SET WEIGHT (KG)"
              name="topSetWeight"
              placeholder="Weight in kg"
              value={formData.topSetWeight || ''}
              onChange={handleInputChange}
              step="0.5"
              required
            />

            {/* Top Set Reps */}
            <Input
              type="number"
              label="TOP SET REPS"
              name="topSetReps"
              placeholder="Number of reps"
              value={formData.topSetReps || ''}
              onChange={handleInputChange}
              step="1"
              required
            />

            {/* Estimated 1RM Display */}
            <Card className="p-6 bg-[#000000] text-white border-gray-800">
              <p className="text-sm font-semibold uppercase opacity-75 mb-2">
                Estimated 1RM (Epley Formula)
              </p>
              <div className="text-3xl font-bold">
                {calculateEstimated1RM()} kg
              </div>
              <p className="text-xs opacity-50 mt-2">
                Auto-calculated from weight x (1 + reps/30)
              </p>
            </Card>

            {/* Notes */}
            <Textarea
              label="NOTES"
              name="notes"
              placeholder="How did the lift feel? Any technique notes?"
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
