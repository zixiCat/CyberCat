import { Anchor } from 'antd';
import { Languages, Library, ScrollText } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

const WORKSPACE_ANCHORS = ['command-library', 'execution-log', 'selection-assistant'] as const;

export interface WorkspaceNavigationHandle {
  navigateTo: (anchor: string) => void;
}

interface WorkspaceNavigationProps {
  onNavigate?: (anchor: string) => void;
}

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

export const WorkspaceNavigation = forwardRef<WorkspaceNavigationHandle, WorkspaceNavigationProps>(
  ({ onNavigate }, ref) => {
  const anchorRef = useRef<HTMLDivElement>(null);

  const clickAnchor = useCallback(
    (anchor: string) => {
      const link = Array.from(anchorRef.current?.querySelectorAll('a') ?? []).find(
        (element) => element.getAttribute('href') === `#${anchor}`
      );

      link?.click();
      onNavigate?.(anchor);
    },
    [onNavigate]
  );

  useImperativeHandle(ref, () => ({
    navigateTo: clickAnchor,
  }));

  useEffect(() => {
    const moveWorkspaceTab = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.key !== 'Tab') {
        return;
      }

      const currentAnchor = window.location.hash.slice(1);
      const currentIndex = WORKSPACE_ANCHORS.indexOf(currentAnchor as (typeof WORKSPACE_ANCHORS)[number]);
      const startIndex = currentIndex === -1 ? 0 : currentIndex;
      const direction = event.shiftKey ? -1 : 1;
      const nextIndex = (startIndex + direction + WORKSPACE_ANCHORS.length) % WORKSPACE_ANCHORS.length;

      event.preventDefault();
      clickAnchor(WORKSPACE_ANCHORS[nextIndex]);
    };

    window.addEventListener('keydown', moveWorkspaceTab);

    return () => {
      window.removeEventListener('keydown', moveWorkspaceTab);
    };
  }, [clickAnchor]);

  return (
    <nav className="workspace-navigation" aria-label="CyberCat workspace">
      <div className="workspace-navigation-inner" ref={anchorRef}>
        <Anchor
          affix={false}
          direction="horizontal"
          items={navigationItems}
          replace
          offsetTop={52}
          className="workspace-anchor"
          onChange={(anchor) => onNavigate?.(anchor.slice(1))}
        />
      </div>
    </nav>
    );
  }
);