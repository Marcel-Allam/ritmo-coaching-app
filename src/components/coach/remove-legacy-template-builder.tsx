'use client';

import { useEffect } from 'react';

const legacyButtonLabels = ['Open template builder', 'Hide template builder'];

const removeLegacyTemplateBuilder = () => {
  const templateHeading = Array.from(document.querySelectorAll('h2')).find(
    (heading) => heading.textContent?.trim().toUpperCase() === 'ASSIGN FROM TEMPLATE'
  );

  templateHeading?.closest('section')?.remove();

  for (const button of Array.from(document.querySelectorAll('button'))) {
    const buttonText = button.textContent?.trim();
    if (buttonText && legacyButtonLabels.includes(buttonText)) {
      button.remove();
    }
  }
};

export function RemoveLegacyTemplateBuilder() {
  useEffect(() => {
    removeLegacyTemplateBuilder();

    const observer = new MutationObserver(() => {
      removeLegacyTemplateBuilder();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
