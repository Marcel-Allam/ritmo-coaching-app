'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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

const exerciseToForm = (exercise: ExerciseCatalogueRecord): ExerciseFormState => ({
  name: exercise.name,
  category: exercise.category,
  movementPattern: exercise.movement_pattern || '',
  primaryMuscles: exercise.primary_muscles.join(', '),
  equipment: exercise.equipment || '',
});

const summariseExercise = (exercise: ExerciseCatalogueRecord) => {
  return [exercise.category, exercise.movement_pattern, exercise.equipment].filter(Boolean).join(' · ');
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

  const selectedExercise = exercises.find((exercise) => exercise.id === editingId) || null;

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

  const resetExerciseBuilder = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormOpen(false);
  };

  const startNewExercise = () => {
    setFormOpen(true);
    setEditingId(null);
    setForm(emptyForm);
    setMessage(null);
    setError(null);
  };

  const handleEdit = (exercise: ExerciseCatalogueRecord) => {
    setEditingId(exercise.id);
    setForm(exerciseToForm(exercise));
    setFormOpen(true);
    setMessage(null);
    setError(null);
  };

  const saveExercise = async () => {
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

    resetExerciseBuilder();
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

  const deleteExercise = async () => {
    if (!isSupabaseConfigured || !selectedExercise) return;
    if (!window.confirm(`Permanently delete ${selectedExercise.name}? This cannot be undone. Existing workout templates will keep their copied exercise name.`)) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: deleteError } = await supabase.from('exercise_catalogue').delete().eq('id', selectedExercise.id);

    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }

    setMessage('Exercise deleted.');
    resetExerciseBuilder();
    setSaving(false);
    setLoading(true);
    await loadExercises();
  };

  const renderExerciseEditor = () => (
    <Card className="space-y-5 border-2 border-gray-200 bg-gray-50">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-black uppercase text-[#000000]">{editingId ? 'Edit exercise' : 'Create exercise'}</h2>
          <p className="mt-1 text-sm text-gray-600">Exercise Library edits affect future workout building and exercise selection.</p>
        </div>
        {selectedExercise && (
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <button
              type="button"
              onClick={() => handleSetActive(selectedExercise, !selectedExercise.is_active)}
              disabled={saving}
              className={`rounded-lg px-4 py-3 text-xs font-bold uppercase disabled:opacity-60 ${selectedExercise.is_active ? 'border border-red-300 bg-red-50 text-[#FA0201] hover:bg-red-100' : 'bg-black text-white hover:bg-gray-900'}`}
            >
              {selectedExercise.is_active ? 'Archive exercise' : 'Restore exercise'}
            </button>
            <button type="button" onClick={deleteExercise} disabled={saving} className="rounded-lg bg-[#FA0201] px-4 py-3 text-xs font-bold uppercase text-white hover:bg-red-700 disabled:opacity-60">
              Delete
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label>
          <span className="text-xs font-black uppercase text-gray-500">Exercise name</span>
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="e.g. Paused Bench Press"
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
          />
        </label>

        <label>
          <span className="text-xs font-black uppercase text-gray-500">Category</span>
          <input
            list="exercise-categories"
            value={form.category}
            onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
            placeholder="e.g. Upper Body"
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
          />
          <datalist id="exercise-categories">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </label>

        <label>
          <span className="text-xs font-black uppercase text-gray-500">Movement pattern</span>
          <input
            list="exercise-movement-patterns"
            value={form.movementPattern}
            onChange={(event) => setForm((current) => ({ ...current, movementPattern: event.target.value }))}
            placeholder="e.g. Horizontal Push"
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
          />
          <datalist id="exercise-movement-patterns">
            {movementPatterns.map((movement) => (
              <option key={movement} value={movement} />
            ))}
          </datalist>
        </label>

        <label>
          <span className="text-xs font-black uppercase text-gray-500">Equipment</span>
          <input
            list="exercise-equipment"
            value={form.equipment}
            onChange={(event) => setForm((current) => ({ ...current, equipment: event.target.value }))}
            placeholder="e.g. Barbell"
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
          />
          <datalist id="exercise-equipment">
            {equipmentOptions.map((equipment) => (
              <option key={equipment} value={equipment} />
            ))}
          </datalist>
        </label>

        <label className="md:col-span-2">
          <span className="text-xs font-black uppercase text-gray-500">Primary muscles</span>
          <input
            value={form.primaryMuscles}
            onChange={(event) => setForm((current) => ({ ...current, primaryMuscles: event.target.value }))}
            placeholder="e.g. Chest, Triceps, Front Delts"
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">Separate muscles with commas.</p>
        </label>
      </div>
    </Card>
  );

  const renderExerciseBuilderModal = () => (
    <div className="fixed inset-0 z-50 bg-black/75 p-3 md:p-6">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-col gap-4 border-b border-gray-800 bg-[#000000] px-5 py-4 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#FA0201]">Exercise Builder</p>
            <h2 className="mt-1 text-2xl font-black uppercase leading-tight">{editingId ? form.name || 'Edit exercise' : 'Create exercise'}</h2>
            <p className="mt-1 text-sm font-semibold text-gray-300">
              {editingId ? `${form.category || 'Uncategorised'} · ${form.equipment || 'No equipment set'}` : 'Add a reusable exercise for workout templates.'}
            </p>
          </div>
          <button type="button" onClick={saveExercise} disabled={saving} className="rounded-lg bg-[#FA0201] px-4 py-3 text-sm font-bold uppercase text-white hover:bg-red-700 disabled:opacity-60">
            {saving ? 'Saving...' : editingId ? 'Save exercise' : 'Create exercise'}
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto bg-gray-100 p-4 md:p-6">
          {message && <Card className="border-2 border-green-200 bg-green-50 text-sm font-semibold text-green-700">{message}</Card>}
          {error && <Card className="border-2 border-red-200 bg-red-50 text-sm font-semibold text-red-700">{error}</Card>}
          {renderExerciseEditor()}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <p className="text-sm font-semibold text-gray-700">Loading Exercise Library...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 md:p-8">
      <PageHeader title="EXERCISE LIBRARY" subtitle="Create, edit and organise reusable exercises for RITMO workout templates." />

      {!formOpen && message && <Card className="border-2 border-green-200 bg-green-50 text-sm font-semibold text-green-700">{message}</Card>}
      {!formOpen && error && <Card className="border-2 border-red-200 bg-red-50 text-sm font-semibold text-red-700">{error}</Card>}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-black uppercase text-[#000000]">Exercise catalogue</h2>
          <Button type="button" onClick={startNewExercise} className="bg-[#FA0201] hover:bg-red-700">Create Exercise</Button>
        </div>

        <Card className="border-2 border-gray-200 bg-white">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_0.28fr_0.28fr_0.28fr] lg:items-end">
            <label>
              <span className="text-xs font-black uppercase text-gray-500">Search exercises</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by exercise, muscle, movement, or equipment..."
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
              />
            </label>

            <label>
              <span className="text-xs font-black uppercase text-gray-500">Category</span>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm">
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-xs font-black uppercase text-gray-500">Movement</span>
              <select value={movementFilter} onChange={(event) => setMovementFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm">
                <option value="all">All movements</option>
                {movementPatterns.map((movement) => (
                  <option key={movement} value={movement}>{movement}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-xs font-black uppercase text-gray-500">Equipment</span>
              <select value={equipmentFilter} onChange={(event) => setEquipmentFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm">
                <option value="all">All equipment</option>
                {equipmentOptions.map((equipment) => (
                  <option key={equipment} value={equipment}>{equipment}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <label className="flex items-center gap-3 text-sm font-bold uppercase text-[#000000]">
              <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} className="h-5 w-5 accent-[#FA0201]" />
              Show archived exercises
            </label>
            <p className="text-xs font-bold uppercase text-gray-500">
              Showing {filteredExercises.length} of {exercises.length} exercises
            </p>
          </div>
        </Card>

        <div className="space-y-4">
          {filteredExercises.length === 0 ? <Card><p className="text-sm text-gray-600">No exercises match your filters.</p></Card> : filteredExercises.map((exercise) => (
            <Card key={exercise.id} className={`border-2 ${exercise.is_active ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-100 opacity-75'}`}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_0.18fr] md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold uppercase text-gray-500">{exercise.category}</p>
                    {!exercise.is_active && <Badge variant="secondary">Archived</Badge>}
                  </div>
                  <h3 className="mt-1 text-xl font-black uppercase text-[#000000]">{exercise.name}</h3>
                  <p className="mt-2 text-sm text-gray-600">{summariseExercise(exercise)}</p>
                  {exercise.primary_muscles.length > 0 && <p className="mt-2 text-sm text-gray-700">Primary: {exercise.primary_muscles.join(', ')}</p>}
                </div>
                <div className="flex flex-col gap-3 md:items-end">
                  <Badge variant="default">{exercise.equipment || 'No equipment'}</Badge>
                  <button type="button" onClick={() => handleEdit(exercise)} className="rounded-lg bg-[#FA0201] px-6 py-3 text-sm font-bold uppercase text-white hover:bg-red-700">Edit</button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {formOpen && renderExerciseBuilderModal()}
    </div>
  );
}
