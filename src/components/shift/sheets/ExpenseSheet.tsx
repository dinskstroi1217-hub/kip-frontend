import { useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PhotoUploader, type UploadedPhoto } from '@/components/photo/PhotoUploader';
import { expensesApi } from '@/api/endpoints/expenses';
import { describeError } from '@/api/errors';
import { cn } from '@/lib/cn';
import {
  EXPENSE_CATEGORY_LABEL,
  type Expense,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from '@/types/expense';

/**
 * Универсальный шит для расхода. Используется и для «Расход», и для «Заправка»
 * (с предустановленной категорией 'fuel'). Фото чека — обязательно для расхода >0.
 */

interface ExpenseSheetProps {
  open: boolean;
  onClose: () => void;
  shiftId: string;
  /** Предустановленная категория (для кнопки «Заправка» = 'fuel'). */
  initialCategory?: ExpenseCategory;
  titleOverride?: string;
  onSuccess: (exp: Expense) => void;
}

const CATEGORIES: ExpenseCategory[] = ['per_diem', 'lodging', 'fuel', 'meals', 'parts', 'other'];

const PAYMENTS: { value: ExpensePaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Наличные' },
  { value: 'driver_card', label: 'Карта водителя' },
  { value: 'corporate_card', label: 'Корп. карта' },
];

export function ExpenseSheet({
  open,
  onClose,
  shiftId,
  initialCategory,
  titleOverride,
  onSuccess,
}: ExpenseSheetProps) {
  const [category, setCategory] = useState<ExpenseCategory>(initialCategory ?? 'other');
  const [amount, setAmount] = useState('');
  const [liters, setLiters] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>('cash');
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState<UploadedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNum = Number(amount.replace(/[^\d]/g, ''));
  const valid = amountNum > 0 && photo.length >= 1;

  function reset() {
    setCategory(initialCategory ?? 'other');
    setAmount('');
    setLiters('');
    setPaymentMethod('cash');
    setComment('');
    photo.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhoto([]);
    setError(null);
  }

  async function handleSubmit() {
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      // Весь контракт с бэком (snake_case, маппинг категорий, чек) — в
      // адаптере expensesApi.create, здесь только данные формы.
      const exp = await expensesApi.create({
        shiftId,
        date: new Date().toISOString().slice(0, 10),
        amount: amountNum,
        category,
        paymentMethod,
        comment: comment.trim() || undefined,
        // Литры для заправки — по ним оператор сверяет чек с ГЛОНАСС
        fuelLiters: category === 'fuel' && Number(liters) > 0 ? Number(liters) : undefined,
        receipt: photo[0]?.blob,
      });
      onSuccess(exp);
      reset();
      onClose();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        if (submitting) return;
        reset();
        onClose();
      }}
      title={titleOverride ?? 'Расход'}
      description={initialCategory === 'fuel' ? 'Чек заправки → подотчёт' : 'Чек → авансовый отчёт'}
      footer={
        <Button fullWidth size="xl" loading={submitting} disabled={!valid} onClick={handleSubmit}>
          Сохранить расход
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-ink-700">Категория</p>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  'min-h-tap rounded-lg border-2 px-2 py-2 text-sm font-medium transition-colors',
                  category === c
                    ? 'border-brand-700 bg-brand-50 text-brand-900'
                    : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
                )}
              >
                {EXPENSE_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Сумма, ₽"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
          inputMode="numeric"
          placeholder="Напр., 1850"
        />

        {category === 'fuel' && (
          <Input
            label="Литры по чеку"
            value={liters}
            onChange={(e) => setLiters(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))}
            inputMode="decimal"
            placeholder="Напр., 50"
            hint="Диспетчер сверит с данными ГЛОНАСС"
          />
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-ink-700">Способ оплаты</p>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENTS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPaymentMethod(p.value)}
                className={cn(
                  'min-h-tap rounded-lg border-2 px-2 py-2 text-sm font-medium transition-colors',
                  paymentMethod === p.value
                    ? 'border-brand-700 bg-brand-50 text-brand-900'
                    : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {paymentMethod === 'cash' && (
            <p className="mt-1 text-xs text-ink-500">
              Расход наличными попадёт в авансовый отчёт автоматически.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-700">
            Комментарий (опц.)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder={initialCategory === 'fuel' ? 'Напр., 45 л ДТ · АЗС Лукойл' : 'Что куплено / где'}
            className="w-full rounded-lg border border-ink-300 bg-white p-3 text-base text-ink-900 placeholder:text-ink-400 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600"
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink-700">Фото чека</p>
          <PhotoUploader value={photo} onChange={setPhoto} min={1} max={1} />
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
