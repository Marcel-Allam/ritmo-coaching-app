'use client';

import { useEffect } from 'react';

const HALF_HOUR_STEP_SECONDS = '1800';
const FIXED_CALL_DURATION_MINUTES = '30';

export function CoachCallRequestUiFixes() {
  useEffect(() => {
    const applyFixes = () => {
      const durationLabels = Array.from(document.querySelectorAll('label')).filter((label) => {
        return label.textContent?.trim().toLowerCase() === 'duration';
      });

      for (const label of durationLabels) {
        const durationContainer = label.closest('div');
        const durationSelect = durationContainer?.querySelector('select');

        if (durationSelect instanceof HTMLSelectElement) {
          durationSelect.value = FIXED_CALL_DURATION_MINUTES;
          durationSelect.dispatchEvent(new Event('change', { bubbles: true }));
          durationContainer?.classList.add('hidden');
        }
      }

      const dateTimeInputs = document.querySelectorAll('input[type="datetime-local"]');
      dateTimeInputs.forEach((input) => {
        input.setAttribute('step', HALF_HOUR_STEP_SECONDS);
      });

      const statusLabels = Array.from(document.querySelectorAll('p')).filter((element) => {
        return element.textContent?.trim().toLowerCase() === 'requested';
      });

      for (const statusLabel of statusLabels) {
        statusLabel.classList.remove('text-green-400');
        statusLabel.classList.add('text-orange-400');
      }
    };

    applyFixes();

    const observer = new MutationObserver(applyFixes);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
