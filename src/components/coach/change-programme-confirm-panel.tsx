'use client';

import { useState } from 'react';
import { AssignFromLibraryPanel } from '@/components/coach/assign-from-library-panel';

export function ChangeProgrammeConfirmPanel() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="px-6 pb-4 pt-0 md:px-8">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black uppercase text-[#000000]">Change programme</p>
            <p className="mt-1 text-xs font-semibold uppercase text-gray-500">Choose another Library programme for this client.</p>
          </div>
          <button type="button" onClick={() => setIsOpen((current) => !current)} className="rounded-lg bg-[#FA0201] px-5 py-3 text-center text-sm font-bold uppercase text-white hover:bg-red-700">
            {isOpen ? 'Close' : 'Change programme'}
          </button>
        </div>

        {isOpen && (
          <div className="mt-5 border-t border-gray-200 pt-5">
            <AssignFromLibraryPanel embedded hideHeader actionLabel="Confirm" savingLabel="Confirming..." helperText="Confirm to apply the selected Library programme to this client." />
          </div>
        )}
      </div>
    </div>
  );
}
