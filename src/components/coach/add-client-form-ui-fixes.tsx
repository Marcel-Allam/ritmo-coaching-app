'use client';

import { useEffect } from 'react';

const labelsToHide = ['email', 'next review date'];

export function AddClientFormUiFixes() {
  useEffect(() => {
    const applyFixes = () => {
      const labels = Array.from(document.querySelectorAll('label'));

      for (const label of labels) {
        const labelText = label.textContent?.trim().toLowerCase();
        if (!labelText || !labelsToHide.includes(labelText)) continue;

        const fieldWrapper = label.closest('div');
        fieldWrapper?.setAttribute('hidden', 'true');
        fieldWrapper?.classList.add('hidden');
      }
    };

    applyFixes();

    const observer = new MutationObserver(applyFixes);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
