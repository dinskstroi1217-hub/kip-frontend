import { db } from './db';
import { newId } from '@/lib/uuid';
import type { PhotoQueueItem } from '@/types/sync';

/**
 * Очередь фотографий.
 *
 * MVP-skeleton — реальная загрузка/сжатие будет на этапе Photo-Uploader
 * (browser-image-compression уже в зависимостях).
 */

export interface EnqueuePhotoArgs {
  blob: Blob;
  mime: string;
  attachTo: PhotoQueueItem['attachTo'];
  exifGps?: { lat: number; lng: number };
  exifTakenAt?: number;
  width?: number;
  height?: number;
}

export async function enqueuePhoto(args: EnqueuePhotoArgs): Promise<PhotoQueueItem> {
  const item: PhotoQueueItem = {
    id: newId(),
    blob: args.blob,
    mime: args.mime,
    width: args.width,
    height: args.height,
    exifGps: args.exifGps,
    exifTakenAt: args.exifTakenAt,
    attachTo: args.attachTo,
    status: 'pending',
    attempts: 0,
    createdAt: Date.now(),
  };
  await db.photosPending.add(item);
  return item;
}

export async function countPendingPhotos(): Promise<number> {
  return db.photosPending.where('status').anyOf('pending', 'failed', 'in_flight').count();
}
