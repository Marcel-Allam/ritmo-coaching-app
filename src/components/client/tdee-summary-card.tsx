'use client';

import { Card } from '@/components/ui/card';

export type ClientHubTargetSettings = {
  show_calorie_target: boolean;
  calorie_target: number | null;
  show_protein_target: boolean;
  protein_target_g: number | null;
  show_carb_target: boolean;
  carb_target_g: number | null;
  show_fat_target: boolean;
  fat_target_g: number | null;
  show_submit_bodyweight: boolean;
  target_notes: string | null;
};

const TargetTile = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl bg-gray-100 p-4">
    <p className="text-[10px] font-bold uppercase text-gray-500">{label}</p>
    <p className="mt-2 text-2xl font-black text-[#000000]">{value}</p>
  </div>
);

export function TdeeSummaryCard({ settings }: { settings: ClientHubTargetSettings }) {
  const visibleTargets = [
    settings.show_calorie_target && settings.calorie_target !== null ? { label: 'Calorie target', value: `${settings.calorie_target} kcal` } : null,
    settings.show_protein_target && settings.protein_target_g !== null ? { label: 'Protein target', value: `${settings.protein_target_g}g` } : null,
    settings.show_carb_target && settings.carb_target_g !== null ? { label: 'Carbohydrate target', value: `${settings.carb_target_g}g` } : null,
    settings.show_fat_target && settings.fat_target_g !== null ? { label: 'Fat target', value: `${settings.fat_target_g}g` } : null,
  ].filter((target): target is { label: string; value: string } => Boolean(target));

  return (
    <Card className="overflow-hidden p-0">
      <div className="bg-white p-6">
        <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Today's targets</p>
        {visibleTargets.length === 0 ? (
          <div className="mt-4 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-5">
            <h2 className="text-2xl font-black uppercase text-[#000000]">Targets not set yet</h2>
            <p className="mt-2 text-sm text-gray-700">Your coach has not set visible nutrition targets for your hub yet.</p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {visibleTargets.map((target) => <TargetTile key={target.label} label={target.label} value={target.value} />)}
          </div>
        )}
        {settings.target_notes && <p className="mt-4 text-sm font-semibold text-gray-700">{settings.target_notes}</p>}
      </div>
    </Card>
  );
}
