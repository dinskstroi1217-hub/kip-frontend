/**
 * Инцидент: простой, поломка/ремонт, повреждение.
 */

export type IncidentType = 'idle' | 'repair' | 'damage' | 'other';
export type IncidentStatus = 'open' | 'in_progress' | 'resolved';

export interface Incident {
  id: string;
  shiftId: string;
  type: IncidentType;
  description: string;
  status: IncidentStatus;
  reportedAt: string; // ISO datetime
  resolvedAt?: string;
  photoIds?: string[];
}
