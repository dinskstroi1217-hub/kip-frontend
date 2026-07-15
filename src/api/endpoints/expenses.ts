import { apiClient } from '@/api/client';
import { submitOrQueue } from '@/offline/submit';
import type {
  Expense,
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseStatus,
} from '@/types/expense';
import { EXPENSE_CATEGORY_LABEL } from '@/types/expense';

/**
 * Расходы.
 *
 * Реальный бэк (kip-spetstehnika v1.0.0):
 *   GET  /api/expenses?shift_id=
 *        → {data: [{id, shift_id, driver_id, work_day_id, expense_date,
 *                   category, amount, description, receipt_photo, status, ...}]}
 *   POST /api/expenses
 *        body: { shift_id, expense_date, category, amount, description,
 *                fuel_liters?, fuel_price_per_liter?, fuel_station?, ... }
 *
 * Категории бэка vs фронта (см. *_CATEGORY ниже).
 */

// frontend → backend
const CATEGORY_TO_BACKEND: Record<ExpenseCategory, string> = {
  per_diem: 'other',
  lodging: 'accommodation',
  fuel: 'fuel',
  meals: 'food',
  parts: 'parts',
  other: 'other',
};

// backend → frontend
const CATEGORY_FROM_BACKEND: Record<string, ExpenseCategory> = {
  fuel: 'fuel',
  repair: 'other',
  parts: 'parts',
  accommodation: 'lodging',
  food: 'meals',
  road: 'other',
  parking: 'other',
  other: 'other',
};

interface RawExpense {
  id: number;
  shift_id: number | null;
  driver_id?: number;
  expense_date: string;
  category: string;
  amount: number;
  description?: string;
  receipt_photo?: string | null;
  payment_method?: string | null;
  status: ExpenseStatus;
  fuel_liters?: number | null;
  /** Сумма FuelIn-событий ГЛОНАСС за expense_date по технике вахты (бэк). */
  glonass_liters?: number | null;
}

// backend → frontend: бэк создаёт расход в статусе 'pending' (ждёт решения
// оператора) — для нашего UI это то же, что 'submitted' (кнопки Принять/Вернуть).
const STATUS_FROM_BACKEND: Record<string, ExpenseStatus> = {
  draft: 'draft',
  pending: 'submitted',
  submitted: 'submitted',
  approved: 'approved',
  rejected: 'rejected',
};

function normalize(raw: RawExpense): Expense {
  return {
    id: String(raw.id),
    shiftId: raw.shift_id != null ? String(raw.shift_id) : null,
    date: raw.expense_date,
    amount: raw.amount,
    category: CATEGORY_FROM_BACKEND[raw.category] ?? 'other',
    paymentMethod: (raw.payment_method as ExpensePaymentMethod | undefined) ?? undefined,
    comment: raw.description,
    receiptPhotoUrl: raw.receipt_photo ?? undefined,
    status: STATUS_FROM_BACKEND[raw.status] ?? 'submitted',
    fuelLiters: raw.fuel_liters ?? undefined,
    glonassLiters: raw.glonass_liters ?? null,
  };
}

function unwrap<T>(raw: T | { data: T }): T {
  return (raw as { data?: T }).data ?? (raw as T);
}

export const expensesApi = {
  list: async (params?: { shiftId?: string }): Promise<Expense[]> => {
    const q = params?.shiftId ? `?shift_id=${params.shiftId}` : '';
    const raw = await apiClient.get<{ data: RawExpense[] } | RawExpense[]>(
      '/api/expenses' + q,
    );
    const arr = Array.isArray(raw) ? raw : (raw.data ?? []);
    return arr.map(normalize);
  },

  /** Нормализовать raw-расходы из агрегата (verify.ts). */
  fromRawList: (arr: unknown): Expense[] => (Array.isArray(arr) ? arr : []).map((r) => normalize(r as RawExpense)),

  /**
   * Создание расхода. Всегда multipart (multer на бэке кладёт поля в req.body
   * и в обоих случаях, чек — опционален). Контракт бэка — плоские snake_case
   * поля; payment_method колонки нет, способ оплаты дописываем в description.
   */
  create: async (body: Partial<Expense> & { receipt?: Blob }): Promise<Expense> => {
    const payLabel =
      body.paymentMethod === 'cash'
        ? 'наличные'
        : body.paymentMethod === 'driver_card'
          ? 'карта водителя'
          : body.paymentMethod === 'corporate_card'
            ? 'корп. карта'
            : undefined;
    const baseDescr =
      body.comment?.trim() ||
      (body.category ? EXPENSE_CATEGORY_LABEL[body.category] : 'Расход');
    const fd = new FormData();
    fd.append('shift_id', String(body.shiftId ?? ''));
    fd.append('expense_date', body.date ?? new Date().toISOString().slice(0, 10));
    fd.append('category', body.category ? CATEGORY_TO_BACKEND[body.category] : 'other');
    fd.append('amount', String(body.amount ?? 0));
    fd.append('description', payLabel ? `${baseDescr} (оплата: ${payLabel})` : baseDescr);
    if (body.fuelLiters) fd.append('fuel_liters', String(body.fuelLiters));
    if (body.receipt) fd.append('receipt', body.receipt, 'receipt.jpg');

    // Восстановленная запись (когда бэк вернул только {id}, либо мутация
    // ушла в офлайн-очередь — id вида 'local:<key>' до реальной отправки).
    const fallback = (id: string): Expense => ({
      id,
      shiftId: body.shiftId ?? null,
      date: body.date ?? new Date().toISOString().slice(0, 10),
      amount: body.amount ?? 0,
      category: body.category ?? 'other',
      paymentMethod: body.paymentMethod,
      comment: body.comment,
      fuelLiters: body.fuelLiters,
      status: 'submitted',
    });

    const { result, queued, queuedId } = await submitOrQueue<
      { id: number } | { data: RawExpense } | RawExpense
    >({
      url: '/api/expenses',
      method: 'POST',
      formData: fd,
      entityType: 'expense',
      entityId: body.shiftId ?? undefined,
    });
    if (queued) return fallback(`local:${queuedId}`);

    const c = result as { id?: number; data?: RawExpense };
    if (c.data) return normalize(c.data);
    if (typeof c.id === 'number') return fallback(String(c.id));
    return normalize(result as RawExpense);
  },

  approve: async (id: string): Promise<Expense> => {
    const r = await apiClient.post<{ data: RawExpense } | RawExpense>(
      `/api/expenses/${id}/approve`,
    );
    return normalize(unwrap(r));
  },
  reject: async (id: string, body: { comment: string }): Promise<Expense> => {
    const r = await apiClient.post<{ data: RawExpense } | RawExpense>(
      `/api/expenses/${id}/reject`,
      // Бэк читает req.body.reason (не comment) — иначе причина отклонения расхода
      // теряется (водитель не знает, что не так). Контракт: reason.
      { reason: body.comment },
    );
    return normalize(unwrap(r));
  },
};
