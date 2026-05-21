/**
 * Подотчётные / расходы водителя.
 */

export type ExpenseCategory =
  | 'per_diem' // суточные
  | 'lodging' // проживание
  | 'fuel' // топливо
  | 'meals' // питание
  | 'parts' // запчасти/расходники (research-расширение)
  | 'other';

export type ExpensePaymentMethod = 'cash' | 'driver_card' | 'corporate_card';

export type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface Expense {
  id: string;
  shiftId: string | null;
  date: string; // ISO yyyy-mm-dd
  amount: number; // в рублях
  category: ExpenseCategory;
  paymentMethod?: ExpensePaymentMethod;
  comment?: string;
  /**
   * Идентификатор фото чека в локальной очереди / на сервере.
   * Локально это UUID файла в IndexedDB photos_pending; после sync — серверный URL.
   */
  receiptPhotoId?: string;
  receiptPhotoUrl?: string;
  status: ExpenseStatus;
  rejectComment?: string;
}

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  per_diem: 'Суточные',
  lodging: 'Проживание',
  fuel: 'Топливо',
  meals: 'Питание',
  parts: 'Запчасти',
  other: 'Прочее',
};
