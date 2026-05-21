import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Утилита для склейки tailwind-классов с разрешением конфликтов.
 * cn('px-2 py-1', condition && 'bg-red-500', { 'opacity-50': disabled })
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
