/**
 * Объект (Site) — стройплощадка, карьер, объект клиента.
 *
 * assumption: endpoint GET /api/sites не описан в исходном ТЗ. Мы исходим
 * из того, что он либо есть, либо будет добавлен бэком. До его появления
 * — данные приходят из моков, либо оператор отдаёт справочник через
 * отдельный механизм (sync справочников при логине).
 */
export interface Site {
  id: string | number;
  name: string;
  address?: string;
  customer?: string;
  legalEntityId?: string | number;
  /** Виден ли объект водителям в мастере приёмки (задаёт диспетчер). */
  visibleToDrivers?: boolean;
  /** GPS-центр объекта — для будущих геозон. */
  gps?: { lat: number; lng: number };
}

/**
 * Юрлицо-арендодатель (наше юрлицо, от которого выезжает техника).
 * assumption: endpoint GET /api/legal-entities — аналогично выше.
 */
export interface LegalEntity {
  id: string | number;
  name: string;
  inn?: string;
}
