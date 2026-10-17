import type { AnnotationStyle } from '@/lib/types';

export const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#FACC15' },
  { name: 'Green', value: '#4ADE80' },
  { name: 'Blue', value: '#60A5FA' },
  { name: 'Pink', value: '#F472B6' },
  { name: 'Purple', value: '#A78BFA' },
  { name: 'Orange', value: '#FB923C' },
];

export const HIGHLIGHT_STYLES: { label: string; value: AnnotationStyle }[] = [
  { label: 'Highlight', value: 'highlight' },
  { label: 'Underline', value: 'underline' },
  { label: 'Strike', value: 'strikethrough' },
  { label: 'Squiggle', value: 'squiggly' },
];

export const DEFAULT_COLOR = HIGHLIGHT_COLORS[0].value;
