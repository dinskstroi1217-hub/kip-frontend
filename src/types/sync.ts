/**
 * Элемент очереди синхронизации (outbox-pattern).
 * Все мутации (POST/PATCH) сначала пишутся в outbox, потом отправляются
 * на сервер с retry-backoff.
 */

export type SyncOperation = 'POST' | 'PATCH' | 'PUT';

export type SyncStatus = 'pending' | 'in_flight' | 'failed' | 'done';

export interface SyncQueueItem {
  id: string; // UUIDv7 — также используется как Idempotency-Key
  op: SyncOperation;
  url: string;
  body?: unknown;
  contentType?: string; // 'application/json' | 'multipart/form-data'
  status: SyncStatus;
  attempts: number;
  lastAttemptAt?: number; // epoch ms
  nextAttemptAt?: number; // epoch ms — для backoff
  lastError?: string;
  createdAt: number; // epoch ms
  /**
   * Логическая ссылка на сущность, которой принадлежит мутация
   * (нужна для UI и для cleanup при logout некоторых типов).
   */
  entityType?: 'work_day' | 'expense' | 'acceptance' | 'return' | 'incident' | 'report';
  entityId?: string;
}

export interface PhotoQueueItem {
  id: string; // UUIDv7
  blob: Blob;
  mime: string;
  width?: number;
  height?: number;
  /**
   * GPS+timestamp из EXIF — сохраняем для anti-fraud, владельца удаляем.
   */
  exifGps?: { lat: number; lng: number };
  exifTakenAt?: number;
  /**
   * К какой сущности привязано (на момент попытки отправки).
   */
  attachTo: {
    entityType: 'expense' | 'acceptance' | 'return' | 'report' | 'incident';
    entityId: string;
    field?: string;
  };
  status: SyncStatus;
  attempts: number;
  nextAttemptAt?: number;
  lastError?: string;
  createdAt: number;
}
