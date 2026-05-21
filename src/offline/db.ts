import Dexie, { type EntityTable } from 'dexie';
import type { SyncQueueItem, PhotoQueueItem } from '@/types/sync';
import type { Driver } from '@/types/user';
import type { Equipment } from '@/types/equipment';

/**
 * Локальная БД для офлайн-режима.
 *
 * Таблицы:
 *   outbox          — очередь мутаций (POST/PATCH/PUT)
 *   photosPending   — очередь фотографий на загрузку
 *   driversCache    — кэш справочника водителей (для офлайн-входа)
 *   equipmentCache  — кэш справочника техники
 *   shiftsCache     — кэш активных вахт водителя
 *   workDayDrafts   — черновики дней работы (до отправки)
 *
 * Не храним: PIN, фото подписи (живут в outbox-item.body как base64),
 * чувствительные данные.
 */

export interface ShiftCacheRow {
  id: string;
  payload: unknown;
  updatedAt: number;
}

export interface WorkDayDraft {
  id: string;
  shiftId: string;
  date: string;
  type: string;
  hours: number;
  comment?: string;
  updatedAt: number;
}

export class KipDatabase extends Dexie {
  outbox!: EntityTable<SyncQueueItem, 'id'>;
  photosPending!: EntityTable<PhotoQueueItem, 'id'>;
  driversCache!: EntityTable<Driver & { cachedAt: number }, 'id'>;
  equipmentCache!: EntityTable<Equipment & { cachedAt: number }, 'id'>;
  shiftsCache!: EntityTable<ShiftCacheRow, 'id'>;
  workDayDrafts!: EntityTable<WorkDayDraft, 'id'>;

  constructor() {
    super('kip-spetstehnika');
    this.version(1).stores({
      outbox: 'id, status, nextAttemptAt, entityType, entityId, createdAt',
      photosPending: 'id, status, nextAttemptAt, createdAt',
      driversCache: 'id, fullName, phone',
      equipmentCache: 'id, regNumber, type',
      shiftsCache: 'id, updatedAt',
      workDayDrafts: 'id, shiftId, date, updatedAt',
    });
  }
}

export const db = new KipDatabase();

/**
 * Запросить persistent-storage у браузера, чтобы данные не очищались
 * под памятью (особенно важно для iOS Safari, где квота урезана).
 * Идемпотентно — вызываем при первом логине и при старте.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  if (!('storage' in navigator) || !navigator.storage.persist) return false;
  try {
    const isPersisted = await navigator.storage.persisted();
    if (isPersisted) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
