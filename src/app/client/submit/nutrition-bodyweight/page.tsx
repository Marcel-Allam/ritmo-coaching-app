'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/ui/section-header';

interface FormData {
  nutritionDate: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  nutritionAdherence: number;
  nutritionNotes: string;
  bodyweight: number;
  weightDate: string;
  bodyweightNotes: string;
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

export default function NutritionBodyweightPage() {
  const [formData, setFormData] = useState<FormData>({
    nutritionDate: '',
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
    nutritionAdherence: 0,
    nutritionNotes: '',
    bodyweight: 0,
    weightDate: '',
    bodyweightNotes: '',
  });

  const [submitted, setSubmitted] = useState(false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        name.includes('Date') || name.includes('Notes')
          ? value
          : parseFloat(value) || 0,
    }));
  };

  const handleRatingChange = (field: string, value: number) => {
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
      <PageHeader title="NUTRITION & BODYWEIGHT" />

      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="px-4 py-6 md:px-8 max-w-2xl mx-auto">
          {submitted && (
            <Card className="mb-6 p-4 bg-green-50 border-green-200">
              <p className="text-green-800 font-semibold uppercase text-sm">
                ✓ Nutrition & bodyweight data submitted successfully
              </p>
            </Card>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Nutrition Section */}
            <section>
              <SectionHeader title="NUTRITION" />

              <Input
                type="date"
                label="DATE"
                name="nutritionDate"
                value={formData.nutritionDate}
                onChange={handleInputChange}
                required
              />

              <div className="mt-6 grid grid-cols-2 gap-4">
                <Input
                  type="number"
                  label="CALORIES"
                  name="calories"
                  placeholder="Kcal"
                  value={formData.calories || ''}
                  onChange={handleInputChange}
                  step="10"
                />
                <Input
                  type="number"
                  label="PROTEIN (G)"
                  name="protein"
                  placeholder="grams"
                  value={formData.protein || ''}
                  onChange={handleInputChange}
                  step="1"
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <Input
                  type="number"
                  label="CARBS (G)"
                  name="carbs"
                  placeholder="grams"
                  value={formData.carbs || ''}
                  onChange={handleInputChange}
                  step="1"
                />
                <Input
                  type="number"
                  label="FATS (G)"
                  name="fats"
                  placeholder="grams"
                  value={formData.fats || ''}
                  onChange={handleInputChange}
                  step="1"
                />
              </div>

              <div className="mt-6">
                <RatingButtons
                  value={formData.nutritionAdherence}
                  onChange={(val) =>
                    handleRatingChange('nutritionAdherence', val)
                  }
                  label="Nutrition Adherence"
                />
              </div>

              <Textarea
                label="NUTRITION NOTES"
                name="nutritionNotes"
                placeholder="Any notes about your nutrition this period?"
                value={formData.nutritionNotes}
                onChange={handleInputChange}
              />
            </section>

            {/* Bodyweight Section */}
            <section>
              <SectionHeader title="BODYWEIGHT" />

              <Input
                type="number"
                label="WEIGHT (KG)"
                name="bodyweight"
                placeholder="Weight in kg"
                value={formData.bodyweight || ''}
                onChange={handleInputChange}
                step="0.1"
                required
              />

              <div className="mt-6">
                <Input
                  type="date"
                  label="DATE WEIGHED"
                  name="weightDate"
                  value={formData.weightDate}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="mt-6">
                <Textarea
                  label="BODYWEIGHT NOTES"
                  name="bodyweightNotes"
                  placeholder="Any observations about your bodyweight?"
                  value={formData.bodyweightNotes}
                  onChange={handleInputChange}
                />
              </div>
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
                SUBMIT
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
