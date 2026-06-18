'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const activeTabClassName = 'rounded-md px-4 py-2 text-xs font-black uppercase bg-[#FA0201] text-white';
const inactiveTabClassName = 'rounded-md px-4 py-2 text-xs font-black uppercase text-[#000000] hover:bg-yellow-100';

const findSectionByExactText = (text: string) => {
  const elements = Array.from(document.querySelectorAll('h2, h3, p, div'));
  const match = elements.find((element) => element.textContent?.trim() === text);
  return match?.closest('section') || null;
};

const getTabButtons = (section: Element) => {
  return Array.from(section.querySelectorAll('button')).filter((button) => {
    const label = button.textContent?.trim().toLowerCase();
    return label === 'unscheduled' || label === 'scheduled' || label === 'busy time';
  });
};

const getTabContentContainer = (section: Element) => {
  const containers = Array.from(section.querySelectorAll('div.space-y-3'));
  return containers.at(-1) || null;
};

const setTabButtonState = (section: Element, activeLabel: 'unscheduled' | 'scheduled' | 'busy time') => {
  getTabButtons(section).forEach((button) => {
    const label = button.textContent?.trim().toLowerCase();
    button.className = label === activeLabel ? activeTabClassName : inactiveTabClassName;
  });
};

const buildEmptyBusyState = () => {
  const card = document.createElement('div');
  card.className = 'rounded-xl border border-gray-200 bg-white p-6';

  const text = document.createElement('p');
  text.className = 'text-sm text-gray-600';
  text.textContent = 'No busy time added this week.';

  card.appendChild(text);
  return card;
};

const syncCalendarBusyTimeTab = () => {
  const callSection = findSectionByExactText('Call requests');
  const busySection = findSectionByExactText('BUSY TIME THIS WEEK');

  if (!callSection || !busySection) return;
  if (callSection.getAttribute('data-calendar-busy-tab-ready') === 'true') return;

  const tabButtons = getTabButtons(callSection);
  const tabButtonContainer = tabButtons.at(0)?.parentElement;
  const callTabContent = getTabContentContainer(callSection);
  const busyList = busySection.querySelector('div.space-y-3');

  if (!tabButtonContainer || !callTabContent) return;

  const busyButton = document.createElement('button');
  busyButton.type = 'button';
  busyButton.textContent = 'Busy time';
  busyButton.className = inactiveTabClassName;

  const busyTabContent = document.createElement('div');
  busyTabContent.className = 'space-y-3';
  busyTabContent.setAttribute('data-calendar-busy-tab-content', 'true');
  busyTabContent.style.display = 'none';

  const busyItems = busyList ? Array.from(busyList.children) : [];

  if (busyItems.length === 0) {
    busyTabContent.appendChild(buildEmptyBusyState());
  } else {
    busyItems.forEach((item) => busyTabContent.appendChild(item.cloneNode(true)));
  }

  callTabContent.parentElement?.insertBefore(busyTabContent, callTabContent.nextSibling);
  tabButtonContainer.appendChild(busyButton);

  busyButton.onclick = () => {
    callTabContent.style.display = 'none';
    busyTabContent.style.display = 'block';
    setTabButtonState(callSection, 'busy time');
  };

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      callTabContent.style.display = 'block';
      busyTabContent.style.display = 'none';
    });
  });

  (busySection as HTMLElement).style.display = 'none';
  callSection.setAttribute('data-calendar-busy-tab-ready', 'true');
};

export function CalendarBusyTimeTab() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/coach/calendar') return;

    syncCalendarBusyTimeTab();

    const observer = new MutationObserver(syncCalendarBusyTimeTab);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
