import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { counterpartiesApi, type Counterparty } from '@/api/endpoints/counterparties';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/cn';

/**
 * Контрагенты. Список грузится из 1С (sync раз в сутки, бэк). Диспетчер
 * может скрыть контрагента от водителей галочкой «не показывать»
 * (по умолчанию видны все).
 */
export function OperatorCounterpartiesPage() {
  const items = useAsync(() => counterpartiesApi.list(), []);
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim().toLowerCase(), 200);
  const [busyId, setBusyId] = useState<number | null>(null);

  const filtered = (items.data ?? []).filter(
    (c) => !q || c.name.toLowerCase().includes(q) || (c.inn?.includes(q) ?? false),
  );

  async function toggle(c: Counterparty) {
    setBusyId(c.id);
    try {
      await counterpartiesApi.setVisible(c.id, !c.visibleToDrivers);
      await items.refetch();
    } catch (e) {
      alert(describeError(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/operator" className="text-sm text-brand-700 underline">
        ← К дашборду
      </Link>

      <Section title="Контрагенты" description="Источник — выгрузка из 1С (обновляется раз в сутки). «Не показывать» скрывает контрагента от водителей.">
        <Card padded className="mb-4">
          <Input
            type="search"
            placeholder="Поиск по названию или ИНН"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </Card>

        {items.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : items.error ? (
          <ErrorState title="Не удалось загрузить" message={describeError(items.error)} onRetry={items.refetch} />
        ) : filtered.length === 0 ? (
          <Card padded>
            <p className="py-4 text-center text-sm text-ink-500">
              {(items.data ?? []).length === 0
                ? 'Контрагенты ещё не загружены из 1С.'
                : 'Ничего не найдено.'}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => (
              <Card key={c.id} padded>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink-900">{c.name}</div>
                    {c.inn && <div className="text-sm text-ink-500">ИНН {c.inn}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(c)}
                    disabled={busyId === c.id}
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                      c.visibleToDrivers
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        : 'border-ink-300 bg-ink-50 text-ink-600 hover:bg-ink-100',
                    )}
                    title="Переключить видимость для водителей"
                  >
                    {c.visibleToDrivers ? '👁 Виден' : '🚫 Не показывать'}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
