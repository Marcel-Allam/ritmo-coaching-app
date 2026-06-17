'use client';

import { useEffect } from 'react';

const HALF_HOUR_STEP_SECONDS = '1800';
const FIXED_CALL_DURATION_MINUTES = '30';

const isCoachDurationSelect = (select: HTMLSelectElement) => {
  const optionValues = Array.from(select.options).map((option) => option.value);
  return ['15', '30', '45', '60'].every((value) => optionValues.includes(value));
};

export function CoachCallRequestUiFixes() {
  useEffect(() => {
    const applyFixes = () => {
      const dateTimeInputs = document.querySelectorAll('input[type="datetime-local"]');
      dateTimeInputs.forEach((input) => {
        input.setAttribute('step', HALF_HOUR_STEP_SECONDS);
      });

      const durationSelects = Array.from(document.querySelectorAll('select')).filter((select) => {
        return select instanceof HTMLSelectElement && isCoachDurationSelect(select);
      }) as HTMLSelectElement[];

      for (const durationSelect of durationSelects) {
        durationSelect.value = FIXED_CALL_DURATION_MINUTES;
        durationSelect.dispatchEvent(new Event('change', { bubbles: true }));

        const durationContainer = durationSelect.closest('div');
        durationContainer?.setAttribute('hidden', 'true');
        durationContainer?.classList.add('hidden');
      }

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
