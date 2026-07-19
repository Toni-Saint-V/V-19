import type { ElementType } from 'react';

export type AdminToolbarTab<T extends string> = {
  count?: number;
  icon?: ElementType;
  id: T;
  label: string;
  tone?: string;
};

export {
  V19ContextToggle as AdminContextToggle,
  V19ListHeader as AdminListHeader,
  V19QueueToolbar as AdminQueueToolbar,
  V19ToolbarSelect as AdminToolbarSelect,
} from '../shared/ui/v19-design-system';
