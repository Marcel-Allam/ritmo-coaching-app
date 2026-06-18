'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const builderLabels = ['Workout Builder', 'Exercise Builder', 'Programme Builder'];

const closeButtonClassName = 'rounded-lg border border-white/30 bg-white/10 px-4 py-3 text-sm font-bold uppercase text-white hover:bg-white/20 disabled:opacity-60';

const findBuilderHeaders = () => {
  return Array.from(document.querySelectorAll('div')).filter((element) => {
    const text = element.textContent || '';
    const className = element.getAttribute('class') || '';

    return builderLabels.some((label) => text.includes(label)) && className.includes('border-b') && className.includes('bg-[#000000]');
  });
};

const addCloseButtonToHeader = (header: Element) => {
  const existingCloseButton = Array.from(header.querySelectorAll('button')).some((button) => button.textContent?.trim().toLowerCase() === 'close');

  if (existingCloseButton) return;

  const actionButton = Array.from(header.querySelectorAll('button')).at(-1);
  if (!actionButton) return;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Close';
  closeButton.className = closeButtonClassName;
  closeButton.setAttribute('data-library-builder-close', 'true');
  closeButton.onclick = () => {
    window.location.reload();
  };

  const buttonParent = actionButton.parentElement;

  if (buttonParent && buttonParent !== header) {
    buttonParent.insertBefore(closeButton, actionButton);
    return;
  }

  header.insertBefore(closeButton, actionButton);
};

export function LibraryBuilderCloseButton() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith('/coach/library') && pathname !== '/coach/exercise-catalogue') return;

    const syncCloseButtons = () => {
      findBuilderHeaders().forEach(addCloseButtonToHeader);
    };

    syncCloseButtons();

    const observer = new MutationObserver(syncCloseButtons);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
