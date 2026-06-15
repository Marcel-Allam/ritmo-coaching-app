'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { Input } from '@/components/ui/input';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ExerciseCatalogueRecord = {
  id: string;
  name: string;
  category: string;
  movement_pattern: string | null;
  primary_muscles: string[];
  equipment: string | null;
  is_active: boolean;
};

type ExerciseFormState = {
  name: string;
  category: string;
  movementPattern: string;
  primaryMuscles: string;
  equipment: string;
};

const emptyForm: ExerciseFormState = {
  name: '',
  category: '',
  movementPattern: '',
  primaryMuscles: '',
  equipment: '',
};

const commonCategories = ['Upper Body', 'Lower Body', 'Core', 'Conditioning', 'Mobility'];
const commonMovementPatterns = [
  'Squat',
  'Hinge',
  'Horizontal Push',
  'Vertical Push',
  'Horizontal Pull',
  'Vertical Pull',
  'Single Leg',
  'Isolation',
  'Loaded Carry',
  'Anti-Extension',
  'Anti-Rotation',
];
const commonEquipment = ['Barbell', 'Dumbbells', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell', 'Band'];

const parseMuscles = (value: string) => {
  return value
    .split(',')
    .map((muscle) => muscle.trim())
    .filter(Boolean);
};

export default function ExerciseCataloguePage() {
  const [exercises, setExercises] = useState<ExerciseCatalogueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExerciseFormState>(emptyForm);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [movementFilter, setMovementFilter] = useState('all');
  const [equipmentFilter, setEquipmentFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);

  const loadExercises = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from('exercise_catalogue')
      .select('id, name, category, movement_pattern, primary_muscles, equipment, is_active')
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    setExercises((data ?? []) as ExerciseCatalogueRecord[]);
    setLoading(false);
  };

  useEffect(() => {
    loadExercises();
  }, []);

  const categories = useMemo(() => {
    return Array.from(new Set([...commonCategories, ...exercises.map((exercise) => exercise.category).filter(Boolean)])).sort();
  }, [exercises]);

  const movementPatterns = useMemo(() => {
    return Array.from(new Set([...commonMovementPatterns, ...exercises.map((exercise) => exercise.movement_pattern || '').filter(Boolean)])).sort();
  }, [exercises]);

  const equipmentOptions = useMemo(() => {
    return Array.from(new Set([...commonEquipment, ...exercises.map((exercise) => exercise.equipment || '').filter(Boolean)])).sort();
  }, [exercises]);

  const filteredExercises = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return exercises.filter((exercise) => {
      const matchesArchivedState = showArchived ? true : exercise.is_active;
      const matchesSearch =
        !normalizedSearch ||
        exercise.name.toLowerCase().includes(normalizedSearch) ||
        exercise.category.toLowerCase().includes(normalizedSearch) ||
        (exercise.movement_pattern || '').toLowerCase().includes(normalizedSearch) ||
        (exercise.equipment || '').toLowerCase().includes(normalizedSearch) ||
        exercise.primary_muscles.join(' ').toLowerCase().includes(normalizedSearch);
      const matchesCategory = categoryFilter === 'all' || exercise.category === categoryFilter;
      const matchesMovement = movementFilter === 'all' || exercise.movement_pattern === movementFilter;
      const matchesEquipment = equipmentFilter === 'all' || exercise.equipment === equipmentFilter;

      return matchesArchivedState && matchesSearch && matchesCategory && matchesMovement && matchesEquipment;
    });
  }, [categoryFilter, equipmentFilter, exercises, movementFilter, search, showArchived]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(false);
  };

  const handleEdit = (exercise: ExerciseCatalogueRecord) => {
    setEditingId(exercise.id);
    setForm({
      name: exercise.name,
      category: exercise.category,
      movementPattern: exercise.movement_pattern || '',
      primaryMuscles: exercise.primary_muscles.join(', '),
      equipment: exercise.equipment || '',
    });
    setFormOpen(true);
    setMessage(null);
    setError(null);
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isSupabaseConfigured) return;

    if (!form.name.trim()) {
      setError('Exercise name is required.');
      return;
    }

    if (!form.category.trim()) {
      setError('Category is required.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      movement_pattern: form.movementPattern.trim() || null,
      primary_muscles: parseMuscles(form.primaryMuscles),
      equipment: form.equipment.trim() || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    if (editingId) {
      const { error: updateError } = await supabase
        .from('exercise_catalogue')
        .update(payload)
        .eq('id', editingId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }

      setMessage('Exercise updated.');
    } else {
      const { error: insertError } = await supabase.from('exercise_catalogue').insert(payload);

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }

      setMessage('Exercise added.');
    }

    resetForm();
    setSaving(false);
    setLoading(true);
    await loadExercises();
  };

  const handleSetActive = async (exercise: ExerciseCatalogueRecord, isActive: boolean) => {
    if (!isSupabaseConfigured) return;

    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('exercise_catalogue')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', exercise.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage(isActive ? 'Exercise restored.' : 'Exercise archived.');
    await loadExercises();
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <p className="text-sm font-semibold text-gray-700">Loading exercise catalogue...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">Exercise Catalogue</h1>
          <p className="mt-1 text-sm text-gray-700">
            Manage the exercises that appear in the coach workout builder.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormOpen(true);
            setEditingId(null);
            setForm(emptyForm);
            setError(null);
            setMessage(null);
          }}
          className="rounded-lg bg-[#FA0201] px-4 py-3 text-sm font-bold uppercase text-white hover:bg-red-700"
        >
          Add Exercise
        </button>
      </div>

      {message && (
        <Card className="border-2 border-green-200 bg-green-50">
          <p className="text-sm font-semibold text-green-800">{message}</p>
        </Card>
      )}

      {error && (
        <Card className="border-2 border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-800">{error}</p>
        </Card>
      )}

      {formOpen && (
        <section>
          <SectionHeader title={editingId ? 'EDIT EXERCISE' : 'ADD EXERCISE'} accent />
          <Card className="border-2 border-[#FA0201]">
            <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Exercise name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. Paused Bench Press"
                required
              />

              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-gray-600">Category</label>
                <input
                  list="exercise-categories"
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                  placeholder="e.g. Upper Body"
                  required
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
                />
                <datalist id="exercise-categories">
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-gray-600">Movement pattern</label>
                <input
                  list="exercise-movement-patterns"
                  value={form.movementPattern}
                  onChange={(event) => setForm((current) => ({ ...current, movementPattern: event.target.value }))}
                  placeholder="e.g. Horizontal Push"
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
                />
                <datalist id="exercise-movement-patterns">
                  {movementPatterns.map((movement) => (
                    <option key={movement} value={movement} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-gray-600">Equipment</label>
                <input
                  list="exercise-equipment"
                  value={form.equipment}
                  onChange={(event) => setForm((current) => ({ ...current, equipment: event.target.value }))}
                  placeholder="e.g. Barbell"
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
                />
                <datalist id="exercise-equipment">
                  {equipmentOptions.map((equipment) => (
                    <option key={equipment} value={equipment} />
                  ))}
                </datalist>
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-xs font-bold uppercase text-gray-600">Primary muscles</label>
                <input
                  value={form.primaryMuscles}
                  onChange={(event) => setForm((current) => ({ ...current, primaryMuscles: event.target.value }))}
                  placeholder="e.g. Chest, Triceps, Front Delts"
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
                />
                <p className="mt-2 text-xs text-gray-500">Separate muscles with commas.</p>
              </div>

              <div className="md:col-span-2 flex flex-col gap-3 md:flex-row md:justify-end">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg bg-gray-200 px-5 py-3 text-sm font-bold uppercase text-[#000000] hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#FA0201] px-5 py-3 text-sm font-bold uppercase text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Exercise'}
                </button>
              </div>
            </form>
          </Card>
        </section>
      )}

      <section>
        <SectionHeader title="CATALOGUE" accent />
        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Input
              label="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, muscle, equipment..."
            />

            <div>
              <label className="mb-2 block text-xs font-bold uppercase text-gray-600">Category</label>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase text-gray-600">Movement</label>
              <select
                value={movementFilter}
                onChange={(event) => setMovementFilter(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
              >
                <option value="all">All movements</option>
                {movementPatterns.map((movement) => (
                  <option key={movement} value={movement}>{movement}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase text-gray-600">Equipment</label>
              <select
                value={equipmentFilter}
                onChange={(event) => setEquipmentFilter(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
              >
                <option value="all">All equipment</option>
                {equipmentOptions.map((equipment) => (
                  <option key={equipment} value={equipment}>{equipment}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="mt-4 flex items-center gap-3 text-sm font-semibold uppercase text-[#000000]">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="h-5 w-5 accent-[#FA0201]"
            />
            Show archived exercises
          </label>

          <div className="mt-6 space-y-3">
            {filteredExercises.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
                <p className="text-sm font-semibold text-gray-600">No exercises match the current filters.</p>
              </div>
            ) : (
              filteredExercises.map((exercise) => (
                <div
                  key={exercise.id}
                  className={`rounded-xl border p-4 ${exercise.is_active ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-100 opacity-70'}`}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-bold uppercase text-[#000000]">{exercise.name}</p>
                        {!exercise.is_active && (
                          <span className="rounded bg-gray-200 px-2 py-1 text-xs font-bold uppercase text-gray-700">Archived</span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        {exercise.category}
                        {exercise.movement_pattern ? ` • ${exercise.movement_pattern}` : ''}
                        {exercise.equipment ? ` • ${exercise.equipment}` : ''}
                      </p>
                      {exercise.primary_muscles.length > 0 && (
                        <p className="mt-2 text-sm text-gray-700">Primary: {exercise.primary_muscles.join(', ')}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <button
                        type="button"
                        onClick={() => handleEdit(exercise)}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold uppercase text-[#000000] hover:bg-gray-100"
                      >
                        Edit
                      </button>
                      {exercise.is_active ? (
                        <button
                          type="button"
                          onClick={() => handleSetActive(exercise, false)}
                          className="rounded-lg bg-[#FA0201] px-3 py-2 text-xs font-bold uppercase text-white hover:bg-red-700"
                        >
                          Archive
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSetActive(exercise, true)}
                          className="rounded-lg bg-black px-3 py-2 text-xs font-bold uppercase text-white hover:bg-gray-900"
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
