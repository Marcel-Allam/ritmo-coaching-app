'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type Programme = {
  id: string;
  name: string;
  category: string;
  goal: string | null;
  description: string | null;
};

type LibraryWorkout = {
  id: string;
  name: string;
  category: string;
  goal: string | null;
  instructions: string | null;
  is_active: boolean;
};

type ProgrammeWorkout = {
  id: string;
  library_programme_id: string;
  library_workout_id: string;
  workout_order: number;
  day_label: string | null;
  notes: string | null;
};

type ProgrammeForm = {
  name: string;
  category: string;
  description: string;
};

type ProgrammeWorkoutForm = {
  libraryWorkoutId: string;
  workoutOrder: string;
  dayLabel: string;
  notes: string;
};

const blankProgrammeForm: ProgrammeForm = {
  name: '',
  category: '',
  description: '',
};

const blankProgrammeWorkoutForm: ProgrammeWorkoutForm = {
  libraryWorkoutId: '',
  workoutOrder: '1',
  dayLabel: '',
  notes: '',
};

const toIntegerOrFallback = (value: string, fallback: number) => {
  if (!value.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const programmeToForm = (programme: Programme): ProgrammeForm => ({
  name: programme.name,
  category: programme.category,
  description: [programme.goal, programme.description].filter(Boolean).join('\n\n'),
});

const programmeWorkoutToForm = (programmeWorkout: ProgrammeWorkout): ProgrammeWorkoutForm => ({
  libraryWorkoutId: programmeWorkout.library_workout_id,
  workoutOrder: String(programmeWorkout.workout_order),
  dayLabel: programmeWorkout.day_label || '',
  notes: programmeWorkout.notes || '',
});

const getProgrammeDescription = (programme: Programme) => programme.description || programme.goal || '';

export default function ProgrammeLibraryPage() {
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [libraryWorkouts, setLibraryWorkouts] = useState<LibraryWorkout[]>([]);
  const [programmeWorkouts, setProgrammeWorkouts] = useState<ProgrammeWorkout[]>([]);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<string | null>(null);
  const [editingProgrammeWorkoutId, setEditingProgrammeWorkoutId] = useState<string | null>(null);
  const [isCreatingProgramme, setIsCreatingProgramme] = useState(false);
  const [programmeForm, setProgrammeForm] = useState<ProgrammeForm>(blankProgrammeForm);
  const [newProgrammeWorkoutForm, setNewProgrammeWorkoutForm] = useState<ProgrammeWorkoutForm>(blankProgrammeWorkoutForm);
  const [programmeWorkoutEdits, setProgrammeWorkoutEdits] = useState<Record<string, ProgrammeWorkoutForm>>({});
  const [programmeSearch, setProgrammeSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedProgramme = programmes.find((programme) => programme.id === selectedProgrammeId) || null;
  const isProgrammeBuilderOpen = isCreatingProgramme || Boolean(selectedProgramme);

  const workoutsById = useMemo(() => {
    return libraryWorkouts.reduce<Record<string, LibraryWorkout>>((accumulator, workout) => {
      accumulator[workout.id] = workout;
      return accumulator;
    }, {});
  }, [libraryWorkouts]);

  const selectedProgrammeWorkouts = useMemo(() => {
    if (!selectedProgrammeId) return [];
    return programmeWorkouts
      .filter((item) => item.library_programme_id === selectedProgrammeId)
      .sort((a, b) => a.workout_order - b.workout_order);
  }, [programmeWorkouts, selectedProgrammeId]);

  const filteredProgrammes = useMemo(() => {
    const query = programmeSearch.trim().toLowerCase();
    if (!query) return programmes;

    return programmes.filter((programme) => {
      const programmeItems = programmeWorkouts.filter((item) => item.library_programme_id === programme.id);
      const searchableText = [
        programme.name,
        programme.category,
        getProgrammeDescription(programme),
        ...programmeItems.map((item) => workoutsById[item.library_workout_id]?.name || ''),
        ...programmeItems.map((item) => item.day_label || ''),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [programmeSearch, programmeWorkouts, programmes, workoutsById]);

  const refreshLibrary = async (preferredProgrammeId?: string | null) => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const [programmeResult, workoutResult] = await Promise.all([
      supabase.from('library_programmes').select('id, name, category, goal, description').eq('is_active', true).order('category').order('name'),
      supabase.from('library_workouts').select('id, name, category, goal, instructions, is_active').order('category').order('name'),
    ]);

    if (programmeResult.error || workoutResult.error) {
      setError(programmeResult.error?.message || workoutResult.error?.message || 'Could not load Programme Library.');
      setLoading(false);
      return;
    }

    const nextProgrammes = (programmeResult.data ?? []) as Programme[];
    const nextWorkouts = (workoutResult.data ?? []) as LibraryWorkout[];
    const programmeIds = nextProgrammes.map((programme) => programme.id);

    const programmeWorkoutResult = programmeIds.length
      ? await supabase
          .from('library_programme_workouts')
          .select('id, library_programme_id, library_workout_id, workout_order, day_label, notes')
          .in('library_programme_id', programmeIds)
          .order('workout_order')
      : { data: [], error: null };

    if (programmeWorkoutResult.error) {
      setError(programmeWorkoutResult.error.message);
      setLoading(false);
      return;
    }

    const nextProgrammeWorkouts = (programmeWorkoutResult.data ?? []) as ProgrammeWorkout[];
    const retainedProgrammeId = preferredProgrammeId && nextProgrammes.some((programme) => programme.id === preferredProgrammeId) ? preferredProgrammeId : selectedProgrammeId;
    const retainedProgramme = nextProgrammes.find((programme) => programme.id === retainedProgrammeId) || null;
    const retainedProgrammeWorkouts = nextProgrammeWorkouts.filter((item) => item.library_programme_id === retainedProgramme?.id);

    setProgrammes(nextProgrammes);
    setLibraryWorkouts(nextWorkouts);
    setProgrammeWorkouts(nextProgrammeWorkouts);
    setSelectedProgrammeId(retainedProgramme?.id || null);
    setProgrammeWorkoutEdits(
      nextProgrammeWorkouts.reduce<Record<string, ProgrammeWorkoutForm>>((accumulator, item) => {
        accumulator[item.id] = programmeWorkoutToForm(item);
        return accumulator;
      }, {})
    );
    setNewProgrammeWorkoutForm({
      libraryWorkoutId: nextWorkouts.find((workout) => workout.is_active)?.id || '',
      workoutOrder: String(retainedProgrammeWorkouts.length + 1),
      dayLabel: retainedProgrammeWorkouts.length === 0 ? 'Day 1' : '',
      notes: '',
    });

    if (retainedProgramme) {
      setProgrammeForm(programmeToForm(retainedProgramme));
    }

    setLoading(false);
  };

  useEffect(() => {
    refreshLibrary();
  }, []);

  const chooseProgramme = (programme: Programme) => {
    setIsCreatingProgramme(false);
    setEditingProgrammeWorkoutId(null);
    setSelectedProgrammeId(programme.id);
    setProgrammeForm(programmeToForm(programme));
    const nextOrder = programmeWorkouts.filter((item) => item.library_programme_id === programme.id).length + 1;
    setNewProgrammeWorkoutForm((current) => ({
      ...current,
      libraryWorkoutId: current.libraryWorkoutId || libraryWorkouts.find((workout) => workout.is_active)?.id || '',
      workoutOrder: String(nextOrder),
      dayLabel: `Day ${nextOrder}`,
    }));
    setMessage(null);
    setError(null);
  };

  const startNewProgramme = () => {
    setIsCreatingProgramme(true);
    setEditingProgrammeWorkoutId(null);
    setSelectedProgrammeId(null);
    setProgrammeForm(blankProgrammeForm);
    setNewProgrammeWorkoutForm((current) => ({
      ...current,
      libraryWorkoutId: current.libraryWorkoutId || libraryWorkouts.find((workout) => workout.is_active)?.id || '',
      workoutOrder: '1',
      dayLabel: 'Day 1',
      notes: '',
    }));
    setMessage(null);
    setError(null);
  };

  const resetProgrammeBuilder = () => {
    setIsCreatingProgramme(false);
    setSelectedProgrammeId(null);
    setEditingProgrammeWorkoutId(null);
    setProgrammeForm(blankProgrammeForm);
  };

  const saveProgramme = async () => {
    if (!isSupabaseConfigured) return;
    if (!programmeForm.name.trim()) {
      setError('Programme name is required.');
      return;
    }
    if (!programmeForm.category.trim()) {
      setError('Programme category is required.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const payload = {
      name: programmeForm.name.trim(),
      category: programmeForm.category.trim(),
      goal: null,
      description: programmeForm.description.trim() || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    if (selectedProgrammeId) {
      const { error: updateError } = await supabase.from('library_programmes').update(payload).eq('id', selectedProgrammeId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }

      setMessage('Programme template updated.');
      setSaving(false);
      await refreshLibrary(selectedProgrammeId);
      resetProgrammeBuilder();
      return;
    }

    const { data, error: insertError } = await supabase.from('library_programmes').insert(payload).select('id').single();

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    const nextProgrammeId = data?.id as string;
    setMessage('Programme template created.');
    setSaving(false);
    await refreshLibrary(nextProgrammeId);
    setIsCreatingProgramme(false);
    setSelectedProgrammeId(nextProgrammeId);
  };

  const archiveProgramme = async () => {
    if (!isSupabaseConfigured || !selectedProgramme) return;
    if (!window.confirm(`Archive ${selectedProgramme.name}? Assigned client programmes will not be changed.`)) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: archiveError } = await supabase
      .from('library_programmes')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', selectedProgramme.id);

    if (archiveError) {
      setError(archiveError.message);
      setSaving(false);
      return;
    }

    setMessage('Programme template archived.');
    setSaving(false);
    resetProgrammeBuilder();
    await refreshLibrary(null);
  };

  const deleteProgramme = async () => {
    if (!isSupabaseConfigured || !selectedProgramme) return;
    if (!window.confirm(`Permanently delete ${selectedProgramme.name}? This cannot be undone. Assigned client programmes will not be changed.`)) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: deleteError } = await supabase.from('library_programmes').delete().eq('id', selectedProgramme.id);

    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }

    setMessage('Programme template deleted.');
    setSaving(false);
    resetProgrammeBuilder();
    await refreshLibrary(null);
  };

  const addProgrammeWorkout = async () => {
    if (!isSupabaseConfigured || !selectedProgrammeId) return;
    if (!newProgrammeWorkoutForm.libraryWorkoutId) {
      setError('Choose a workout template.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: insertError } = await supabase.from('library_programme_workouts').insert({
      library_programme_id: selectedProgrammeId,
      library_workout_id: newProgrammeWorkoutForm.libraryWorkoutId,
      workout_order: toIntegerOrFallback(newProgrammeWorkoutForm.workoutOrder, selectedProgrammeWorkouts.length + 1),
      day_label: newProgrammeWorkoutForm.dayLabel.trim() || null,
      notes: newProgrammeWorkoutForm.notes.trim() || null,
      updated_at: new Date().toISOString(),
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setMessage('Workout added to programme.');
    setSaving(false);
    await refreshLibrary(selectedProgrammeId);
  };

  const saveProgrammeWorkout = async (programmeWorkout: ProgrammeWorkout) => {
    if (!isSupabaseConfigured) return;
    const edit = programmeWorkoutEdits[programmeWorkout.id];

    if (!edit?.libraryWorkoutId) {
      setError('Choose a workout template.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('library_programme_workouts')
      .update({
        library_workout_id: edit.libraryWorkoutId,
        workout_order: toIntegerOrFallback(edit.workoutOrder, programmeWorkout.workout_order),
        day_label: edit.dayLabel.trim() || null,
        notes: edit.notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', programmeWorkout.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setMessage('Programme workout updated.');
    setEditingProgrammeWorkoutId(null);
    setSaving(false);
    await refreshLibrary(selectedProgrammeId);
  };

  const deleteProgrammeWorkout = async (programmeWorkoutId: string) => {
    if (!isSupabaseConfigured) return;
    if (!window.confirm('Remove this workout from the programme template?')) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: deleteError } = await supabase.from('library_programme_workouts').delete().eq('id', programmeWorkoutId);

    if (deleteError) {
      setError(deleteError.message);
      setSaving(false);
      return;
    }

    setMessage('Workout removed from programme.');
    setSaving(false);
    await refreshLibrary(selectedProgrammeId);
  };

  const renderProgrammeEditor = () => (
    <Card className="space-y-5 border-2 border-gray-200 bg-gray-50">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-black uppercase text-[#000000]">{isCreatingProgramme ? 'Create programme template' : 'Edit programme template'}</h2>
          <p className="mt-1 text-sm text-gray-600">Programme Library edits affect future assignments only, not already-assigned client programmes.</p>
        </div>
        {selectedProgramme && (
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <button type="button" onClick={archiveProgramme} disabled={saving} className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-xs font-bold uppercase text-[#FA0201] hover:bg-red-100 disabled:opacity-60">
              Archive template
            </button>
            <button type="button" onClick={deleteProgramme} disabled={saving} className="rounded-lg bg-[#FA0201] px-4 py-3 text-xs font-bold uppercase text-white hover:bg-red-700 disabled:opacity-60">
              Delete
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label>
          <span className="text-xs font-black uppercase text-gray-500">Name</span>
          <input value={programmeForm.name} onChange={(event) => setProgrammeForm((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
        </label>
        <label>
          <span className="text-xs font-black uppercase text-gray-500">Category</span>
          <input value={programmeForm.category} onChange={(event) => setProgrammeForm((current) => ({ ...current, category: event.target.value }))} placeholder="e.g. Strength, Fat Loss, Hypertrophy" className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
        </label>
        <label className="md:col-span-2">
          <span className="text-xs font-black uppercase text-gray-500">Description</span>
          <textarea value={programmeForm.description} onChange={(event) => setProgrammeForm((current) => ({ ...current, description: event.target.value }))} className="mt-1 min-h-24 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
        </label>
      </div>
    </Card>
  );

  const renderWorkoutSelectOptions = () => (
    libraryWorkouts
      .filter((workout) => workout.is_active)
      .map((workout) => (
        <option key={workout.id} value={workout.id}>{workout.name}</option>
      ))
  );

  const renderProgrammeWorkoutManager = () => {
    if (!selectedProgramme) return null;

    return (
      <Card className="space-y-5">
        <div>
          <h2 className="text-xl font-black uppercase text-[#000000]">Workouts in programme</h2>
          <p className="mt-1 text-sm text-gray-600">Add reusable workout templates and order them as programme days.</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_0.18fr_0.28fr] md:items-end">
            <label>
              <span className="text-xs font-black uppercase text-gray-500">Workout Library item</span>
              <select value={newProgrammeWorkoutForm.libraryWorkoutId} onChange={(event) => setNewProgrammeWorkoutForm((current) => ({ ...current, libraryWorkoutId: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm">
                <option value="">Choose workout</option>
                {renderWorkoutSelectOptions()}
              </select>
            </label>
            <label>
              <span className="text-xs font-black uppercase text-gray-500">Order</span>
              <input value={newProgrammeWorkoutForm.workoutOrder} onChange={(event) => setNewProgrammeWorkoutForm((current) => ({ ...current, workoutOrder: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
            </label>
            <label>
              <span className="text-xs font-black uppercase text-gray-500">Day label</span>
              <input value={newProgrammeWorkoutForm.dayLabel} onChange={(event) => setNewProgrammeWorkoutForm((current) => ({ ...current, dayLabel: event.target.value }))} placeholder="e.g. Day 1" className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
            </label>
            <label className="md:col-span-3">
              <span className="text-xs font-black uppercase text-gray-500">Notes</span>
              <input value={newProgrammeWorkoutForm.notes} onChange={(event) => setNewProgrammeWorkoutForm((current) => ({ ...current, notes: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="button" disabled={saving || libraryWorkouts.filter((workout) => workout.is_active).length === 0} onClick={addProgrammeWorkout} className="bg-[#FA0201] hover:bg-red-700">Add workout</Button>
          </div>
        </div>

        <div className="space-y-3">
          {selectedProgrammeWorkouts.length === 0 ? <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">No workouts in this programme yet.</p> : selectedProgrammeWorkouts.map((item) => {
            const workout = workoutsById[item.library_workout_id];
            const edit = programmeWorkoutEdits[item.id] || programmeWorkoutToForm(item);
            const isEditing = editingProgrammeWorkoutId === item.id;

            return (
              <div key={item.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[0.12fr_1fr_0.22fr] md:items-center">
                  <Badge variant="default">#{item.workout_order}</Badge>
                  <div>
                    <p className="text-sm font-black uppercase text-[#000000]">{workout?.name || 'Missing workout'}</p>
                    <p className="mt-1 text-xs font-bold uppercase text-gray-500">{item.day_label || `Day ${item.workout_order}`}{workout?.category ? ` · ${workout.category}` : ''}</p>
                    {item.notes && <p className="mt-1 text-xs text-gray-600">{item.notes}</p>}
                  </div>
                  <button type="button" onClick={() => (isEditing ? saveProgrammeWorkout(item) : setEditingProgrammeWorkoutId(item.id))} className="rounded-lg bg-[#FA0201] px-4 py-2 text-xs font-bold uppercase text-white hover:bg-red-700 disabled:opacity-60" disabled={saving}>{isEditing ? 'Save workout' : 'Edit'}</button>
                </div>

                {isEditing && (
                  <div className="mt-4 space-y-4 rounded-xl border border-gray-200 bg-white p-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_0.18fr_0.28fr] md:items-end">
                      <label>
                        <span className="text-xs font-black uppercase text-gray-500">Workout</span>
                        <select value={edit.libraryWorkoutId} onChange={(event) => setProgrammeWorkoutEdits((current) => ({ ...current, [item.id]: { ...edit, libraryWorkoutId: event.target.value } }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm">
                          {renderWorkoutSelectOptions()}
                          {workout && !workout.is_active && <option value={workout.id}>{workout.name}</option>}
                        </select>
                      </label>
                      <label>
                        <span className="text-xs font-black uppercase text-gray-500">Order</span>
                        <input value={edit.workoutOrder} onChange={(event) => setProgrammeWorkoutEdits((current) => ({ ...current, [item.id]: { ...edit, workoutOrder: event.target.value } }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                      </label>
                      <label>
                        <span className="text-xs font-black uppercase text-gray-500">Day label</span>
                        <input value={edit.dayLabel} onChange={(event) => setProgrammeWorkoutEdits((current) => ({ ...current, [item.id]: { ...edit, dayLabel: event.target.value } }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                      </label>
                      <label className="md:col-span-3">
                        <span className="text-xs font-black uppercase text-gray-500">Notes</span>
                        <input value={edit.notes} onChange={(event) => setProgrammeWorkoutEdits((current) => ({ ...current, [item.id]: { ...edit, notes: event.target.value } }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                      </label>
                    </div>
                    <div className="flex justify-end">
                      <button type="button" onClick={() => deleteProgrammeWorkout(item.id)} disabled={saving} className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-xs font-bold uppercase text-[#FA0201] hover:bg-red-100 disabled:opacity-60">Delete workout</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    );
  };

  const renderProgrammeBuilderModal = () => (
    <div className="fixed inset-0 z-50 bg-black/75 p-3 md:p-6">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-col gap-4 border-b border-gray-800 bg-[#000000] px-5 py-4 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#FA0201]">Programme Builder</p>
            <h2 className="mt-1 text-2xl font-black uppercase leading-tight">{isCreatingProgramme ? 'Create programme template' : selectedProgramme?.name}</h2>
            <p className="mt-1 text-sm font-semibold text-gray-300">
              {selectedProgramme ? `${selectedProgramme.category} · ${selectedProgrammeWorkouts.length} workout${selectedProgrammeWorkouts.length === 1 ? '' : 's'}` : 'Set up the template details first, then add workouts after saving.'}
            </p>
          </div>
          <button type="button" onClick={saveProgramme} disabled={saving} className="rounded-lg bg-[#FA0201] px-4 py-3 text-sm font-bold uppercase text-white hover:bg-red-700 disabled:opacity-60">
            {saving ? 'Saving...' : isCreatingProgramme ? 'Create programme' : 'Save programme'}
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto bg-gray-100 p-4 md:p-6">
          {message && <Card className="border-2 border-green-200 bg-green-50 text-sm font-semibold text-green-700">{message}</Card>}
          {error && <Card className="border-2 border-red-200 bg-red-50 text-sm font-semibold text-red-700">{error}</Card>}
          {renderProgrammeEditor()}
          {renderProgrammeWorkoutManager()}
        </div>
      </div>
    </div>
  );

  if (loading) return <div className="p-6 md:p-8"><Card>Loading Programme Library manager...</Card></div>;

  return (
    <div className="space-y-8 p-6 md:p-8">
      <PageHeader title="PROGRAMME LIBRARY" subtitle="Create, edit and organise reusable programme templates made from workout library items." />

      {!isProgrammeBuilderOpen && message && <Card className="border-2 border-green-200 bg-green-50 text-sm font-semibold text-green-700">{message}</Card>}
      {!isProgrammeBuilderOpen && error && <Card className="border-2 border-red-200 bg-red-50 text-sm font-semibold text-red-700">{error}</Card>}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-black uppercase text-[#000000]">Programme templates</h2>
          <Button type="button" onClick={startNewProgramme} className="bg-[#FA0201] hover:bg-red-700">Create Programme</Button>
        </div>

        <Card className="border-2 border-gray-200 bg-white">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_0.28fr] md:items-end">
            <label>
              <span className="text-xs font-black uppercase text-gray-500">Search programmes</span>
              <input
                value={programmeSearch}
                onChange={(event) => setProgrammeSearch(event.target.value)}
                placeholder="Search by programme, category, description, day, or workout..."
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
              />
            </label>
            <p className="text-xs font-bold uppercase text-gray-500 md:text-right">
              Showing {filteredProgrammes.length} of {programmes.length} programmes
            </p>
          </div>
        </Card>

        <div className="space-y-4">
          {programmes.length === 0 ? <Card><p className="text-sm text-gray-600">No programme templates yet.</p></Card> : filteredProgrammes.length === 0 ? <Card><p className="text-sm text-gray-600">No programmes match your search.</p></Card> : filteredProgrammes.map((programme) => {
            const programmeItems = programmeWorkouts.filter((item) => item.library_programme_id === programme.id);
            const isSelected = selectedProgrammeId === programme.id && !isCreatingProgramme;
            const programmeDescription = getProgrammeDescription(programme);

            return (
              <Card key={programme.id} className={`border-2 ${isSelected ? 'border-[#FA0201] bg-red-50' : 'border-gray-200 bg-white'}`}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_0.18fr] md:items-center">
                  <div>
                    <p className="text-xs font-bold uppercase text-gray-500">{programme.category}</p>
                    <h3 className="mt-1 text-xl font-black uppercase text-[#000000]">{programme.name}</h3>
                    {programmeDescription && <p className="mt-2 text-sm text-gray-600">{programmeDescription}</p>}
                  </div>
                  <div className="flex flex-col gap-3 md:items-end">
                    <Badge variant="default">{programmeItems.length} workouts</Badge>
                    <button type="button" onClick={() => chooseProgramme(programme)} className="rounded-lg bg-[#FA0201] px-6 py-3 text-sm font-bold uppercase text-white hover:bg-red-700">Edit</button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {isProgrammeBuilderOpen && renderProgrammeBuilderModal()}
    </div>
  );
}
