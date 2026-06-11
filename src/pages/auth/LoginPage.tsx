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
import { employeesApi, type EmployeeLoginable } from '@/api/endpoints/employees';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuthStore, selectIsAuthenticated, selectRole } from '@/features/auth/store';
import { cn } from '@/lib/cn';

/**
 * Экран входа — новая модель аутентификации через сотрудников 1С.
 *
 * Источник данных: GET /api/employees/loginable — список сотрудников
 * у которых оператор уже назначил роль (driver|dispatcher).
 *
 * UX:
 *   1. Поиск по фамилии в общем списке (driver+dispatcher вместе)
 *   2. Клик по карточке → раскрывается поле для ввода пароля
 *   3. Для driver — 8 цифр ДДММГГГГ (дата рождения)
 *      для dispatcher — обычный текстовый пароль
 *   4. POST /api/employees/login {fullName, password}
 *
 * После успеха — JWT в sessionStorage, редирект по роли.
 */

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const role = useAuthStore(selectRole);

  // Если уже залогинен — сразу уводим на главную роли
  useEffect(() => {
    if (isAuthenticated && role) {
      navigate(role === 'operator' || role === 'admin' ? '/operator' : '/driver', {
        replace: true,
      });
    }
  }, [isAuthenticated, role, navigate]);

  // Список сотрудников с активной ролью
  const employees = useAsync(() => employeesApi.loginable(), []);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim().toLowerCase(), 200);

  const filtered = useMemo(() => {
    const list = employees.data ?? [];
    if (!debouncedSearch) return list;
    return list.filter((e) => e.fullName.toLowerCase().includes(debouncedSearch));
  }, [employees.data, debouncedSearch]);

  const [selected, setSelected] = useState<EmployeeLoginable | null>(null);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // При выборе нового сотрудника сбрасываем пароль и ошибку
  function selectEmployee(emp: EmployeeLoginable) {
    setSelected(emp);
    setPassword('');
    setSubmitError(null);
  }

  function clearSelection() {
    setSelected(null);
    setPassword('');
    setSubmitError(null);
  }

  // Авто-сабмит для driver когда введено 8 цифр (UX как был для PIN)
  useEffect(() => {
    if (!selected || selected.role !== 'driver') return;
    if (password.length === 8 && /^\d{8}$/.test(password)) {
      void handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password, selected]);

  async function handleSubmit() {
    if (!selected) return;
    if (selected.role === 'driver' && !/^\d{8}$/.test(password)) {
      setSubmitError('Дата рождения — 8 цифр в формате ДДММГГГГ');
      return;
    }
    if (selected.role === 'dispatcher' && password.length < 4) {
      setSubmitError('Введите пароль (мин. 4 символа)');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const resp = await authApi.employeeLogin({
        fullName: selected.fullName,
        password,
      });
      setSession(resp);
      // Редирект сделает useEffect выше
    } catch (e) {
      setSubmitError(describeError(e));
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-5 px-4 py-6">
      <header className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-700 text-2xl font-bold text-white">
          С
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink-900">Спецтехника</h1>
          <p className="text-sm text-ink-600">ДКБИ · учёт работы</p>
        </div>
        <div className="ml-auto">
          <MockBadge />
        </div>
      </header>

      {!selected ? (
        <EmployeeList
          employees={filtered}
          search={search}
          onSearchChange={setSearch}
          loading={employees.isLoading}
          error={employees.error}
          onRetry={employees.refetch}
          onSelect={selectEmployee}
          totalCount={employees.data?.length ?? 0}
        />
      ) : (
        <PasswordForm
          employee={selected}
          password={password}
          onPasswordChange={setPassword}
          onBack={clearSelection}
          onSubmit={() => void handleSubmit()}
          submitting={submitting}
          submitError={submitError}
        />
      )}

      <p className="mt-auto text-center text-xs text-ink-500">
        {import.meta.env.DEV ? 'dev · ' : ''}версия {import.meta.env.VITE_APP_VERSION ?? '0.0.1'}
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function EmployeeList({
  employees,
  search,
  onSearchChange,
  loading,
  error,
  onRetry,
  onSelect,
  totalCount,
}: {
  employees: EmployeeLoginable[];
  search: string;
  onSearchChange: (s: string) => void;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onSelect: (e: EmployeeLoginable) => void;
  totalCount: number;
}) {
  return (
    <Card padded className="flex flex-col gap-3">
      <label className="text-sm font-medium text-ink-700">Выберите себя из списка</label>
      <Input
        type="search"
        placeholder="Поиск по ФИО"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        autoComplete="off"
        autoFocus
      />

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      ) : error ? (
        <ErrorState
          title="Не удалось загрузить список"
          message={describeError(error)}
          onRetry={onRetry}
        />
      ) : employees.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-500">
          {totalCount === 0
            ? 'В списке нет сотрудников с ролью. Обратитесь к оператору, чтобы он назначил вам роль.'
            : 'Никого не найдено по поиску'}
        </p>
      ) : (
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {employees.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelect(e)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-3 py-3 text-left transition-colors hover:bg-ink-50 active:bg-ink-100"
            >
              <div className="min-w-0">
                <div className="truncate text-base font-medium text-ink-900">{e.fullName}</div>
                <div className="text-sm text-ink-500">
                  {e.role === 'driver' ? 'Водитель' : 'Диспетчер'}
                </div>
              </div>
              <span aria-hidden className="text-ink-300">
                ›
              </span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function PasswordForm({
  employee,
  password,
  onPasswordChange,
  onBack,
  onSubmit,
  submitting,
  submitError,
}: {
  employee: EmployeeLoginable;
  password: string;
  onPasswordChange: (s: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string | null;
}) {
  const isDriver = employee.role === 'driver';

  return (
    <Card padded className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-ink-500">Вход как</p>
          <p className="truncate text-base font-semibold text-ink-900">{employee.fullName}</p>
          <p className="text-xs text-ink-600">{isDriver ? 'Водитель' : 'Диспетчер'}</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="self-center text-sm font-medium text-brand-700 underline-offset-2 hover:underline"
        >
          Сменить
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-3"
      >
        {isDriver ? (
          <>
            <p className="text-center text-sm text-ink-700">
              Введите дату рождения в формате <b>ДДММГГГГ</b>
            </p>
            <PinInput
              value={password}
              onChange={onPasswordChange}
              length={8}
              disabled={submitting}
              autoFocus
              aria-label="Дата рождения"
            />
          </>
        ) : (
          <>
            <label htmlFor="pw" className="text-sm font-medium text-ink-700">
              Пароль диспетчера
            </label>
            <Input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              autoComplete="current-password"
              autoFocus
              disabled={submitting}
            />
          </>
        )}

        {submitError && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {submitError}
          </div>
        )}

        <Button
          type="submit"
          size="xl"
          fullWidth
          disabled={
            submitting ||
            (isDriver ? !/^\d{8}$/.test(password) : password.length < 4)
          }
          loading={submitting}
        >
          Войти
        </Button>
      </form>
    </Card>
  );
}

// Утилитарный класс не используется, оставлен на случай расширения
void cn;
