import { Anchor } from 'antd';
import { Languages, Library, ScrollText } from 'lucide-react';

const navigationItems = [
  {
    key: 'command-library',
    href: '#command-library',
    title: (
      <span className="navigation-label">
        <Library aria-hidden="true" />
        Command Library
      </span>
    ),
  },
  {
    key: 'execution-log',
    href: '#execution-log',
    title: (
      <span className="navigation-label">
        <ScrollText aria-hidden="true" />
        Execution Log
      </span>
    ),
  },
  {
    key: 'selection-assistant',
    href: '#selection-assistant',
    title: (
      <span className="navigation-label">
        <Languages aria-hidden="true" />
        Selection Assistant
      </span>
    ),
  },
];

export const WorkspaceNavigation = () => (
  <nav className="workspace-navigation" aria-label="CyberCat workspace">
    <div className="workspace-navigation-inner">
      <Anchor
        affix={false}
        direction="horizontal"
        items={navigationItems}
        replace
        offsetTop={52}
        className="workspace-anchor"
      />
    </div>
  </nav>
);