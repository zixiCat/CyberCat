import { Anchor } from 'antd';
import { Languages, Library, ScrollText } from 'lucide-react';

const navigationItems = [
  {
    key: 'command-library',
    href: '#command-library',
    title: (
      <span className="inline-flex items-center gap-2">
        <Library className="h-4 w-4" aria-hidden="true" />
        Command Library
      </span>
    ),
  },
  {
    key: 'execution-log',
    href: '#execution-log',
    title: (
      <span className="inline-flex items-center gap-2">
        <ScrollText className="h-4 w-4" aria-hidden="true" />
        Execution Log
      </span>
    ),
  },
  {
    key: 'selection-assistant',
    href: '#selection-assistant',
    title: (
      <span className="inline-flex items-center gap-2">
        <Languages className="h-4 w-4" aria-hidden="true" />
        Selection Assistant
      </span>
    ),
  },
];

export const WorkspaceNavigation = () => (
  <nav
    className="sticky top-0 z-20 px-5 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/95"
    aria-label="CyberCat workspace"
  >
    <div className="mx-auto w-full max-w-[1600px] overflow-x-auto">
      <Anchor
        affix={false}
        direction="horizontal"
        items={navigationItems}
        replace
        offsetTop={52}
        className="min-w-max"
      />
    </div>
  </nav>
);