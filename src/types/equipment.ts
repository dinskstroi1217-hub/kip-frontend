/**
 * Техника (Equipment).
 * assumption: backend хранит `regNumber` (госномер), `type`, `status`.
 * Точную форму уточним при первом GET /api/equipment.
 */

export type EquipmentType =
  | 'truck'
  | 'crane'
  | 'excavator'
  | 'concrete_mixer'
  | 'dump_truck'
  | 'loader'
  | 'other';

export type EquipmentStatus = 'available' | 'in_use' | 'maintenance' | 'out_of_service';

export interface Equipment {
  id: string | number;
  regNumber: string;
  name?: string;
  type: EquipmentType;
  status: EquipmentStatus;
  /**
   * Последние известные показания. Источник — водитель (MVP), либо ГЛОНАСС (v3).
   */
  lastOdometer?: number;
  lastMotohours?: number;
  serviceDueDate?: string; // ISO
  insuranceDueDate?: string; // ISO
  glonassId?: string | null;
  /** Юрлицо-владелец машины (наша фирма группы). Используется, чтобы подставить
   *  юрлицо смены автоматически — водитель его не выбирает. */
  legalEntityId?: number | null;
}

export const EQUIPMENT_TYPE_LABEL: Record<EquipmentType, string> = {
  truck: 'Грузовик',
  crane: 'Кран',
  excavator: 'Экскаватор',
  concrete_mixer: 'Бетоносмеситель',
  dump_truck: 'Самосвал',
  loader: 'Погрузчик',
  other: 'Прочее',
};
