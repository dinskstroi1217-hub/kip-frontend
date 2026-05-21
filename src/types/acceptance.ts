/**
 * Акт приёмки / сдачи техники с подписями водителя и представителя объекта.
 */

export interface AcceptanceChecklist {
  oilLevel: 'ok' | 'issue';
  fuelStartLiters: number;
  odometerStart: number;
  motohoursStart?: number; // research-расширение
  hasVisibleDamage: boolean;
  damageDescription?: string;
  tires: 'ok' | 'attention';
}

export interface AcceptanceAct {
  id: string;
  shiftId: string;
  checklist: AcceptanceChecklist;
  photoIds: string[];
  gps: GpsTag | null;
  driverSignatureBase64?: string;
  representativeFullName?: string; // research-расширение
  representativeRole?: string; // research-расширение
  representativeSignatureBase64?: string;
  createdAt: string;
}

export interface ReturnAct {
  id: string;
  shiftId: string;
  odometerEnd: number;
  fuelEndLiters: number;
  motohoursEnd?: number;
  fuelConsumptionLper100km?: number; // авто-расчёт
  photoIds: string[];
  reportPhotoIds: string[]; // фото сменного рапорта
  gps: GpsTag | null;
  driverSignatureBase64?: string;
  representativeSignatureBase64?: string;
  createdAt: string;
}

export interface GpsTag {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}
