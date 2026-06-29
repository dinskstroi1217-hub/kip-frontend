import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { employeesApi, type Employee, type EmployeeRole } from '@/api/endpoints/employees';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';
import { useDebounce } from '@/hooks/useDebounce';

/**
 * Админская страница «Сотрудники» (только для operator/admin).
 *
 * Что делает:
 *   - GET /api/employees → список 214 сотрудников из 1С-выгрузки
 *   - Поиск по ФИО (case-insensitive, debounce 200мс)
 *   - Фильтр по роли (все / водители / диспетчеры / без роли)
 *   - Тоггл «только активные» (по дефолту on — неактивных в 1С уже нет)
 *   - Dropdown смены роли → PATCH /api/employees/:id (мгновенный optimistic update)
 *
 * Что НЕ делает (отложено):
 *   - Bulk-выделение / массовое назначение
 *   - Создание employees вручную (источник истины — Excel из 1С)
 *   - Удаление (только деактивация через is_active в импорте)
 */

type RoleFilter = 'all' | 'driver' | 'dispatcher' | 'none';

const FILTER_LABEL: Record<RoleFilter, string> = {
  all: 'Все',
  driver: 'Водители',
  dispatcher: 'Диспетчеры',
  none: 'Без роли',
};

export function OperatorEmployeesPage() {
  const { data, error, isLoading, refetch } = useAsync(() => employeesApi.list(), []);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim().toLowerCase(), 200);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [activeOnly, setActiveOnly] = useState(true);

  // Локальные изменения (optimistic): id → новая роль
  const [pending, setPending] = useState<Record<number, EmployeeRole>>({});
  // Ошибки PATCH-запросов (showtoast: id → текст)
  const [errors, setErrors] = useState<Record<number, string>>({});
  // id сотрудников, у которых сейчас переключается видимость в списке входа
  const [hidingBusy, setHidingBusy] = useState<Record<number, boolean>>({});
  // id сотрудников, у которых сейчас сохраняется тариф (₽/час и суточные)
  const [rateBusy, setRateBusy] = useState<Record<number, boolean>>({});
  const [perDiemBusy, setPerDiemBusy] = useState<Record<number, boolean>>({});

  const saveRate = useCallback(
    async (id: number, rate: number | null) => {
      setErrors((prev) => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
      setRateBusy((p) => ({ ...p, [id]: true }));
      try {
        await employeesApi.setHourlyRate(id, rate);
        await refetch();
      } catch (e) {
        setErrors((prev) => ({ ...prev, [id]: describeError(e) }));
      } finally {
        setRateBusy((p) => {
          const { [id]: _, ...rest } = p;
          return rest;
        });
      }
    },
    [refetch],
  );

  const savePerDiem = useCallback(
    async (id: number, rate: number | null) => {
      setErrors((prev) => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
      setPerDiemBusy((p) => ({ ...p, [id]: true }));
      try {
        await employeesApi.setPerDiemRate(id, rate);
        await refetch();
      } catch (e) {
        setErrors((prev) => ({ ...prev, [id]: describeError(e) }));
      } finally {
        setPerDiemBusy((p) => {
          const { [id]: _, ...rest } = p;
          return rest;
        });
      }
    },
    [refetch],
  );

  const toggleHidden = useCallback(
    async (id: number, hidden: boolean) => {
      setHidingBusy((p) => ({ ...p, [id]: true }));
      try {
        await employeesApi.setHidden(id, hidden);
        await refetch();
      } catch (e) {
        setErrors((prev) => ({ ...prev, [id]: describeError(e) }));
      } finally {
        setHidingBusy((p) => {
          const { [id]: _, ...rest } = p;
          return rest;
        });
      }
    },
    [refetch],
  );

  const filtered = useMemo(() => {
    const list = data ?? [];
    return list
      .filter((e) => (activeOnly ? e.isActive : true))
      .filter((e) => {
        const effRole = e.id in pending ? pending[e.id] : e.role;
        if (roleFilter === 'all') return true;
        if (roleFilter === 'none') return effRole === null;
        return effRole === roleFilter;
      })
      .filter((e) => {
        if (!debouncedSearch) return true;
        // Поиск работает по ФИО и должности
        return (
          e.fullName.toLowerCase().includes(debouncedSearch) ||
          (e.jobTitle?.toLowerCase().includes(debouncedSearch) ?? false)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
  }, [data, debouncedSearch, roleFilter, activeOnly, pending]);

  // Счётчики (для бейджей фильтра)
  const counts = useMemo(() => {
    const list = (data ?? []).filter((e) => (activeOnly ? e.isActive : true));
    const eff = (e: Employee) => (e.id in pending ? pending[e.id] : e.role);
    return {
      all: list.length,
      driver: list.filter((e) => eff(e) === 'driver').length,
      dispatcher: list.filter((e) => eff(e) === 'dispatcher').length,
      none: list.filter((e) => eff(e) === null).length,
    };
  }, [data, activeOnly, pending]);

  const changeRole = useCallback(
    async (id: number, role: EmployeeRole) => {
      setErrors((prev) => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
      setPending((prev) => ({ ...prev, [id]: role }));
      try {
        await employeesApi.updateRole(id, role);
        // Перечитаем — чтобы updated_at и пр. синхронизировались
        await refetch();
        setPending((prev) => {
          const { [id]: _, ...rest } = prev;
          return rest;
        });
      } catch (e) {
        setErrors((prev) => ({ ...prev, [id]: describeError(e) }));
        // откатываем optimistic
        setPending((prev) => {
          const { [id]: _, ...rest } = prev;
          return rest;
        });
      }
    },
    [refetch],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link to="/operator" className="text-sm text-brand-700 underline">
          ← К дашборду
        </Link>
      </div>

      <Section
        title="Сотрудники ДКБИ"
        description="Источник: выгрузка 1С (обновляется каждый час). Роль задаётся здесь — без роли сотрудник не сможет логиниться в приложение. Тарифы (₽/час и суточные ₽/сут) видят и меняют только диспетчеры — водителям они не показываются. Суточные начисляются за каждый подтверждённый день вахты."
      >
        <Card padded className="space-y-3">
          <Input
            type="search"
            placeholder="Поиск по ФИО или должности"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />

          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(FILTER_LABEL) as RoleFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setRoleFilter(f)}
                className={
                  'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ' +
                  (roleFilter === f
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50')
                }
              >
                {FILTER_LABEL[f]} ({counts[f]})
              </button>
            ))}

            <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                className="h-4 w-4 accent-brand-600"
              />
              только активные
            </label>
          </div>
        </Card>
      </Section>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Не удалось загрузить список"
          message={describeError(error)}
          onRetry={refetch}
        />
      ) : filtered.length === 0 ? (
        <Card padded>
          <EmptyState
            title="Никого не найдено"
            description="Сбрось фильтры или измени поиск."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-xs uppercase text-ink-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">ФИО</th>
                <th className="px-4 py-2 text-left font-medium">Должность</th>
                <th className="px-4 py-2 text-left font-medium">Дата рождения</th>
                <th className="px-4 py-2 text-left font-medium">Роль</th>
                <th className="px-4 py-2 text-left font-medium">Тариф, ₽/час</th>
                <th className="px-4 py-2 text-left font-medium">Суточные, ₽/сут</th>
                <th className="px-4 py-2 text-left font-medium">В списке входа</th>
                <th className="px-4 py-2 text-left font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const effRole = e.id in pending ? pending[e.id] : e.role;
                const isPending = e.id in pending;
                const err = errors[e.id];
                return (
                  <tr
                    key={e.id}
                    className="border-t border-ink-100 transition-colors hover:bg-ink-50/60"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-ink-900">{e.fullName}</div>
                      {err && (
                        <div className="mt-0.5 text-xs text-red-700">⚠ {err}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-ink-700">
                      <div className="max-w-xs text-sm">{e.jobTitle ?? '—'}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-700">
                      {formatBirthDate(e.birthDate)}
                    </td>
                    <td className="px-4 py-2.5">
                      <RoleSelect
                        value={effRole}
                        disabled={isPending}
                        onChange={(r) => void changeRole(e.id, r)}
                      />
                      {e.roleSource === 'auto' && effRole && !isPending && (
                        <div className="mt-0.5 text-xs text-ink-400">
                          🤖 auto (по должности)
                        </div>
                      )}
                      {e.roleSource === 'manual' && effRole && !isPending && (
                        <div className="mt-0.5 text-xs text-ink-400">
                          ✋ вручную
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {effRole === 'driver' ? (
                        <RateCell
                          value={e.hourlyRate}
                          disabled={!!rateBusy[e.id]}
                          onSave={(rate) => void saveRate(e.id, rate)}
                        />
                      ) : (
                        <span className="text-xs text-ink-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {effRole === 'driver' ? (
                        <RateCell
                          value={e.perDiemRate}
                          disabled={!!perDiemBusy[e.id]}
                          onSave={(rate) => void savePerDiem(e.id, rate)}
                          unit="₽/сут"
                          step={100}
                        />
                      ) : (
                        <span className="text-xs text-ink-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {effRole ? (
                        <button
                          type="button"
                          onClick={() => void toggleHidden(e.id, !e.hiddenFromLogin)}
                          disabled={hidingBusy[e.id]}
                          className={
                            'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ' +
                            (e.hiddenFromLogin
                              ? 'border-ink-300 bg-ink-50 text-ink-600 hover:bg-ink-100'
                              : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100')
                          }
                          title="Показывать ли сотрудника в списке входа"
                        >
                          {e.hiddenFromLogin ? '🚫 Скрыт' : '👁 Виден'}
                        </button>
                      ) : (
                        <span className="text-xs text-ink-300">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {!e.isActive ? (
                        <div>
                          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">
                            уволен
                          </span>
                          {e.deactivatedAt && (
                            <div className="mt-0.5 text-xs text-ink-400">
                              {formatDateShort(e.deactivatedAt)}
                            </div>
                          )}
                        </div>
                      ) : isPending ? (
                        <span className="text-xs text-ink-500">сохранение…</span>
                      ) : (
                        <span className="text-xs text-ink-400">
                          {formatUpdated(e.updatedAt)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function RoleSelect({
  value,
  disabled,
  onChange,
}: {
  value: EmployeeRole;
  disabled?: boolean;
  onChange: (r: EmployeeRole) => void;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange((e.target.value || null) as EmployeeRole)}
      disabled={disabled}
      className={
        'rounded-lg border border-ink-200 bg-white px-2 py-1 text-sm text-ink-900 ' +
        'focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 ' +
        'disabled:cursor-wait disabled:opacity-60'
      }
    >
      <option value="">— без роли</option>
      <option value="driver">Водитель</option>
      <option value="dispatcher">Диспетчер</option>
    </select>
  );
}

/**
 * Ячейка тарифа (₽/час или суточные ₽/сут). Целые рубли. Сохранение — ТОЛЬКО
 * по ЯВНОЙ кнопке «Применить» (или Enter), не по blur: оператор осознанно
 * фиксирует новый тариф. Кнопка появляется, когда значение изменено. Пусто =
 * очистить тариф (null). Невалидный ввод (минус/буквы) при применении отклоняется.
 * Новый тариф действует только для НОВЫХ вахт (модель «снимок на старте вахты»);
 * уже идущие/архивные вахты не пересчитываются.
 */
function RateCell({
  value,
  disabled,
  onSave,
  unit = '₽/ч',
  step = 50,
}: {
  value: number | null;
  disabled?: boolean;
  onSave: (rate: number | null) => void;
  unit?: string;
  step?: number;
}) {
  const [draft, setDraft] = useState<string>(value == null ? '' : String(value));
  // Синхронизация после refetch (внешнее изменение value)
  useEffect(() => {
    setDraft(value == null ? '' : String(value));
  }, [value]);

  const saved = value == null ? '' : String(value);
  const dirty = draft.trim() !== saved;

  const commit = () => {
    const t = draft.trim();
    if (t === '') {
      if (value != null) onSave(null);
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) {
      setDraft(saved); // откат невалидного
      return;
    }
    const rounded = Math.round(n);
    if (rounded !== value) onSave(rounded);
    else setDraft(String(rounded));
  };

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={step}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        placeholder="—"
        className={
          'w-20 rounded-lg border border-ink-200 bg-white px-2 py-1 text-sm text-ink-900 ' +
          'focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 ' +
          'disabled:cursor-wait disabled:opacity-60'
        }
      />
      <span className="whitespace-nowrap text-xs text-ink-400">{unit}</span>
      {dirty && !disabled && (
        <button
          type="button"
          onClick={commit}
          className="whitespace-nowrap rounded-md border border-brand-600 bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700"
        >
          Применить
        </button>
      )}
    </div>
  );
}

function formatBirthDate(iso: string | null): string {
  if (!iso) return '—';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function formatUpdated(iso: string): string {
  if (!iso) return '';
  // Бэк отдаёт строки вроде "2026-05-26 11:35:17"
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `обновлён ${m[3]}.${m[2]}` : '';
}

function formatDateShort(iso: string): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}
