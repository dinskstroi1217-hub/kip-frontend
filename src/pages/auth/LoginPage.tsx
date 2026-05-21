import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { PinInput } from '@/components/ui/PinInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { MockBadge } from '@/components/status/MockBadge';
import { authApi } from '@/api/endpoints/auth';
import { driversApi } from '@/api/endpoints/drivers';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuthStore, selectIsAuthenticated, selectRole } from '@/features/auth/store';
import { cn } from '@/lib/cn';
import { formatRuPhone, isValidRuPhone, normalizePhone } from '@/lib/phone';
import type { Driver } from '@/types/user';

/**
 * Экран входа.
 *
 * Два режима, переключаются вкладками:
 *  - Driver — выбор водителя из списка + 4-значный PIN.
 *  - Operator — ввод телефона (маска +7 ___ ___-__-__) + 4-значный PIN.
 *
 * Список водителей грузится с GET /api/drivers
 * (assumption: endpoint публичный для экрана входа — см. api/endpoints/drivers.ts).
 *
 * PIN не сохраняется. После успешного логина — JWT в sessionStorage, переход по роли.
 */

type Role = 'driver' | 'operator';

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const role = useAuthStore(selectRole);

  // Если уже залогинен — сразу уводим на главную роли
  useEffect(() => {
    if (isAuthenticated && role) {
      navigate(role === 'operator' ? '/operator' : '/driver', { replace: true });
    }
  }, [isAuthenticated, role, navigate]);

  const [mode, setMode] = useState<Role>('driver');
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Driver-режим
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim().toLowerCase(), 150);

  // Operator-режим
  const [phoneInput, setPhoneInput] = useState('');

  const drivers = useAsync(() => driversApi.list(), [], { immediate: mode === 'driver' });

  const filteredDrivers = useMemo(() => {
    if (!drivers.data) return [];
    if (!debouncedSearch) return drivers.data;
    return drivers.data.filter(
      (d) =>
        d.fullName.toLowerCase().includes(debouncedSearch) ||
        d.phone.includes(debouncedSearch),
    );
  }, [drivers.data, debouncedSearch]);

  // Когда меняем режим — сбрасываем PIN и ошибку
  function switchMode(next: Role) {
    setMode(next);
    setPin('');
    setSubmitError(null);
    if (next === 'driver' && !drivers.data && !drivers.isLoading) void drivers.refetch();
  }

  // Валидация submit
  const canSubmit =
    pin.length === 4 &&
    (mode === 'driver' ? selectedDriver !== null : isValidRuPhone(phoneInput)) &&
    !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const phone =
        mode === 'driver' ? (selectedDriver?.phone ?? '') : normalizePhone(phoneInput);
      const resp =
        mode === 'driver'
          ? await authApi.driverLogin({ phone, pin })
          : await authApi.operatorLogin({ phone, pin });
      setSession(resp);
      navigate(mode === 'operator' ? '/operator' : '/driver', { replace: true });
    } catch (e) {
      setSubmitError(describeError(e));
      setPin('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-full bg-ink-50">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 pb-8 pt-8 sm:pt-12">
        {/* Шапка с лого */}
        <header className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-700 text-xl font-bold text-white">
            С
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold leading-tight text-ink-900">Спецтехника</h1>
              <MockBadge />
            </div>
            <p className="text-sm text-ink-600">ДКБИ · учёт работы</p>
          </div>
        </header>

        {/* Переключатель ролей */}
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1">
          <button
            type="button"
            onClick={() => switchMode('driver')}
            className={cn(
              'min-h-tap rounded-lg text-base font-medium transition-colors',
              mode === 'driver'
                ? 'bg-white text-ink-900 shadow-card'
                : 'text-ink-600 hover:text-ink-900',
            )}
            aria-pressed={mode === 'driver'}
          >
            Водитель
          </button>
          <button
            type="button"
            onClick={() => switchMode('operator')}
            className={cn(
              'min-h-tap rounded-lg text-base font-medium transition-colors',
              mode === 'operator'
                ? 'bg-white text-ink-900 shadow-card'
                : 'text-ink-600 hover:text-ink-900',
            )}
            aria-pressed={mode === 'operator'}
          >
            Оператор
          </button>
        </div>

        {/* Основная форма */}
        <Card padded className="flex-1">
          {mode === 'driver' ? (
            <DriverModeBlock
              drivers={filteredDrivers}
              allDriversCount={drivers.data?.length ?? 0}
              isLoading={drivers.isLoading}
              error={drivers.error}
              onRetry={drivers.refetch}
              search={search}
              onSearch={setSearch}
              selected={selectedDriver}
              onSelect={setSelectedDriver}
            />
          ) : (
            <OperatorModeBlock phone={phoneInput} onPhoneChange={setPhoneInput} />
          )}

          {/* PIN-блок появляется только когда выбран контекст */}
          {(mode === 'operator' || selectedDriver) && (
            <div className="mt-6 border-t border-ink-200 pt-5">
              <p className="mb-3 text-center text-sm font-medium text-ink-700">
                Введите PIN-код
              </p>
              <PinInput
                value={pin}
                onChange={setPin}
                autoFocus
                error={!!submitError}
                disabled={submitting}
                onComplete={() => {
                  // Авто-submit при полном PIN — UX-приятно, экономит тап
                  if (
                    (mode === 'driver' ? selectedDriver !== null : isValidRuPhone(phoneInput)) &&
                    !submitting
                  ) {
                    void handleSubmit();
                  }
                }}
              />
              {submitError && (
                <p role="alert" className="mt-3 text-center text-sm text-red-600">
                  {submitError}
                </p>
              )}
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                loading={submitting}
                fullWidth
                size="xl"
                className="mt-5"
              >
                Войти
              </Button>
            </div>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-ink-500">
          {import.meta.env.MODE === 'development' ? 'dev · ' : ''}версия 0.0.1
        </p>
      </div>
    </div>
  );
}

interface DriverModeBlockProps {
  drivers: Driver[];
  allDriversCount: number;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  search: string;
  onSearch: (v: string) => void;
  selected: Driver | null;
  onSelect: (d: Driver | null) => void;
}

function DriverModeBlock({
  drivers,
  allDriversCount,
  isLoading,
  error,
  onRetry,
  search,
  onSearch,
  selected,
  onSelect,
}: DriverModeBlockProps) {
  if (selected) {
    return (
      <div>
        <p className="mb-2 text-sm font-medium text-ink-700">Вход как:</p>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-ink-900">
              {selected.fullName}
            </div>
            <div className="text-sm text-ink-600">{formatRuPhone(selected.phone)}</div>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="shrink-0 rounded-lg p-2 text-ink-600 hover:bg-white hover:text-ink-900"
            aria-label="Сменить водителя"
          >
            Сменить
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Не удалось загрузить список водителей"
        message={describeError(error)}
        onRetry={onRetry}
      />
    );
  }

  return (
    <div>
      <Input
        label="Выберите водителя"
        placeholder="Поиск по ФИО или телефону"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        autoComplete="off"
        inputMode="search"
        type="search"
        leadingIcon={<SearchIcon />}
      />
      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
        {isLoading ? (
          <>
            <DriverRowSkeleton />
            <DriverRowSkeleton />
            <DriverRowSkeleton />
          </>
        ) : drivers.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-ink-500">
            {allDriversCount === 0
              ? 'Список водителей пуст. Проверьте справочник.'
              : 'Никого не найдено'}
          </p>
        ) : (
          drivers.map((d) => (
            <button
              key={String(d.id)}
              type="button"
              onClick={() => onSelect(d)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-3 py-3 text-left transition-colors hover:bg-ink-50 active:bg-ink-100"
            >
              <div className="min-w-0">
                <div className="truncate text-base font-medium text-ink-900">{d.fullName}</div>
                <div className="text-sm text-ink-500">{formatRuPhone(d.phone)}</div>
              </div>
              <span aria-hidden className="text-ink-300">
                ›
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function DriverRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-ink-200 p-3">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

function OperatorModeBlock({
  phone,
  onPhoneChange,
}: {
  phone: string;
  onPhoneChange: (v: string) => void;
}) {
  return (
    <div>
      <Input
        label="Телефон оператора"
        placeholder="+7 900 000-00-00"
        value={phone}
        onChange={(e) => onPhoneChange(e.target.value)}
        inputMode="tel"
        autoComplete="tel"
        type="tel"
        hint="Формат: +7 ___ ___-__-__"
        error={phone.length > 0 && !isValidRuPhone(phone) ? 'Введите корректный номер' : undefined}
      />
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
