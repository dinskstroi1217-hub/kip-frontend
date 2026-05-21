import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

/**
 * Подтверждение акта простой электронной подписью (ПЭП).
 *
 * Юридическое обоснование (63-ФЗ «Об электронной подписи», ст. 9):
 *   - Идентификация: водитель уже вошёл по телефону + 4-значному PIN.
 *   - Фиксация действия: на бэке `audit_log` пишет actor, action, entity,
 *     timestamp и IP. Это и есть подтверждение факта подписания.
 *
 * Compared to canvas-подписи (signature_pad): canvas даёт картинку, но
 * аутентичность канваса доказать сложнее, чем аутентичность авторизованной
 * сессии. Картинка нужна была бы только если у водителя нет аккаунта (бумажный
 * акт). Здесь у каждого водителя — свой PIN.
 *
 * UX: чекбокс «Я, <ФИО>, подтверждаю…» + явный текст того, что подписывается.
 * Без галочки `confirmed` родитель не пускает дальше.
 */

interface ActConfirmationProps {
  /** Кто подписывает (ФИО, выводится в тексте). */
  signerName: string;
  /** Телефон подписанта (для прозрачности, выводится мелким шрифтом). */
  signerPhone?: string;
  /** Подзаголовок — что именно подписывается («Акт приёмки» / «Акт сдачи»). */
  actLabel?: string;
  /**
   * Дополнительный текст «суть подтверждения», например:
   * «Принимаю машину КамАЗ-65115 (А777АА77) в состоянии, зафиксированном выше».
   */
  body?: string;
  confirmed: boolean;
  onChange: (confirmed: boolean) => void;
  /** Подсказка под чекбоксом (опционально). */
  hint?: string;
}

export function ActConfirmation({
  signerName,
  signerPhone,
  actLabel,
  body,
  confirmed,
  onChange,
  hint,
}: ActConfirmationProps) {
  const [touched, setTouched] = useState(false);
  const showError = touched && !confirmed;

  return (
    <Card padded className={cn('space-y-3', showError && 'border-red-300')}>
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-500">
          {actLabel ?? 'Подтверждение'}
        </p>
        <p className="mt-0.5 text-base font-semibold text-ink-900">{signerName}</p>
        {signerPhone && (
          <p className="text-xs text-ink-500">{signerPhone}</p>
        )}
      </div>

      {body && (
        <p className="text-sm leading-relaxed text-ink-700">{body}</p>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-ink-200 bg-white p-3 transition-colors hover:border-brand-500 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => {
            setTouched(true);
            onChange(e.target.checked);
          }}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-brand-700"
        />
        <span className="text-sm leading-snug text-ink-900">
          Подтверждаю всё указанное выше. Действую под своей учётной записью
          (телефон+PIN) — это простая электронная подпись по 63-ФЗ.
        </span>
      </label>

      {hint && !showError && (
        <p className="text-xs text-ink-500">{hint}</p>
      )}
      {showError && (
        <p className="text-xs text-red-600">
          Без подтверждения акт не считается оформленным.
        </p>
      )}
    </Card>
  );
}
