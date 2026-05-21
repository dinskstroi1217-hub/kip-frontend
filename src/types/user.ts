/**
 * Доменные типы пользователей.
 *
 * Driver и Operator — две основные роли MVP.
 * Mechanic / Accountant / Admin зарезервированы архитектурно — без UI.
 */

export type UserRole = 'driver' | 'operator' | 'mechanic' | 'accountant' | 'admin';

export interface BaseUser {
  id: string | number;
  fullName: string;
  phone: string;
  role: UserRole;
}

/**
 * Водитель из справочника.
 * assumption: backend возвращает поля `id`, `fullName` (либо `full_name`),
 * `phone`, опционально `hourlyRate`, `available`. Точный snake/camel формат
 * нормализуется в api/endpoints/drivers.ts.
 */
export interface Driver extends BaseUser {
  role: 'driver';
  hourlyRate?: number;
  available?: boolean;
}

export interface Operator extends BaseUser {
  role: 'operator';
}

export type AppUser = Driver | Operator;
