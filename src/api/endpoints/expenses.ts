import { apiClient } from '@/api/client';
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
}

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
    status: raw.status,
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

  create: async (body: Partial<Expense>): Promise<Expense> => {
    const payload = {
      shift_id: body.shiftId,
      expense_date: body.date,
      category: body.category ? CATEGORY_TO_BACKEND[body.category] : 'other',
      amount: body.amount,
      description:
        body.comment ??
        (body.category ? EXPENSE_CATEGORY_LABEL[body.category] : 'Расход'),
      payment_method: body.paymentMethod,
    };
    const created = await apiClient.post<{ id: number } | { data: RawExpense } | RawExpense>(
      '/api/expenses',
      payload,
    );
    const c = created as { id?: number; data?: RawExpense };
    if (c.data) return normalize(c.data);
    if (typeof c.id === 'number') {
      // Бэк может вернуть просто {id} — мы возвращаем восстановленную запись
      return {
        id: String(c.id),
        shiftId: body.shiftId ?? null,
        date: body.date ?? new Date().toISOString().slice(0, 10),
        amount: body.amount ?? 0,
        category: body.category ?? 'other',
        paymentMethod: body.paymentMethod,
        comment: body.comment,
        status: 'submitted',
      };
    }
    return normalize(created as RawExpense);
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
      body,
    );
    return normalize(unwrap(r));
  },
};
