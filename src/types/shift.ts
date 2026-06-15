/**
 * вахта (sub-shift) — единица работы водителя на одном объекте,
 * одной машине, одном юрлице, в течение N дней.
 *
 * Жизненный цикл (ShiftStatus):
 *   free                  - пустой слот (только на стороне оператора)
 *   pending_acceptance    - назначена, но машина ещё не принята водителем
 *   active                - принята, в работе
 *   issue_idle            - простой (нерабочий день оплачивается иначе)
 *   issue_repair          - ремонт
 *   pending_verification  - сдана водителем, ждёт проверки оператором
 *   verified              - закрыта и подтверждена
 *
 * assumption: на бэке поля приходят в snake_case. Нормализация — в api-слое.
 */

export type ShiftStatus =
  | 'free'
  | 'pending_acceptance'
  | 'active'
  | 'issue_idle'
  | 'issue_repair'
  | 'pending_verification'
  | 'verified';

export interface Shift {
  id: string;
  driverId: string | number;
  equipmentId: string | number | null;
  siteId: string | number | null;
  legalEntityId: string | number | null;
  /** Контрагент (заказчик) — выбирается водителем при старте, источник 1С.
   *  Опционально в типе, чтобы не править общие mock-фикстуры; нормализатор
   *  бэка всегда проставляет (null для старых вахт). */
  counterpartyId?: string | number | null;
  status: ShiftStatus;
  startDate: string; // ISO date (yyyy-mm-dd) — assumption
  endDatePlanned: string | null;
  endDateActual: string | null;
  /**
   * Километраж старт/конец — вводит водитель.
   */
  odometerStart: number | null;
  odometerEnd: number | null;
  /**
   * Уровень топлива на приёмке / сдаче (литры) — вводит водитель.
   */
  fuelLevelStart: number | null;
  fuelLevelEnd: number | null;
  /**
   * Моточасы старт/конец.
   * (research-расширение, обоснование — docs/KIP_RESEARCH.md §4.2.
   * Спецтехника считается в моточасах, а не одометре. Если backend не
   * поддерживает эти поля — отправляются в `extra` JSON или игнорируются.)
   */
  motohoursStart: number | null;
  motohoursEnd: number | null;
  notes?: string;
  /**
   * Joined-поля справочников, приходят из бэка (`driver_name`, `driver_phone`,
   * `equipment_name`, `license_plate`, `object_name`, `object_address`,
   * `legal_entity_name`). Опциональные — для list/byId. Не пишутся при POST/PATCH.
   */
  driverName?: string;
  driverPhone?: string;
  equipmentName?: string;
  equipmentRegNumber?: string;
  siteName?: string;
  siteAddress?: string;
  legalEntityName?: string;
  counterpartyName?: string;
}

export interface ShiftSummary {
  id: string;
  driverFullName: string;
  equipmentName: string | null;
  siteName: string | null;
  status: ShiftStatus;
  daysElapsed: number;
  daysPlanned: number;
  hoursLogged: number;
  hasIssues: boolean;
}
