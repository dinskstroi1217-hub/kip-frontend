import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { legalEntitiesApi } from '@/api/endpoints/sites';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';

/**
 * Контрагенты. ВРЕМЕННО: показывает текущие юрлица. Полный справочник
 * контрагентов будет подгружаться из выгрузки 1С (адрес источника
 * ожидается от заказчика — см. PILOT_TEST / HANDOFF). Импорт по аналогии
 * с сотрудниками (cron sync Excel → таблица → этот экран).
 */
export function OperatorCounterpartiesPage() {
  const items = useAsync(() => legalEntitiesApi.list(), []);

  return (
    <div className="space-y-5">
      <Link to="/operator" className="text-sm text-brand-700 underline">
        ← К дашборду
      </Link>

      <Section title="Контрагенты" description="Источник — выгрузка из 1С (подключается).">
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          ⏳ Загрузка контрагентов из 1С ещё настраивается. Пока показаны текущие
          юрлица. Когда укажете адрес выгрузки — список будет обновляться автоматически.
        </div>

        {items.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : items.error ? (
          <ErrorState
            title="Не удалось загрузить"
            message={describeError(items.error)}
            onRetry={items.refetch}
          />
        ) : (
          <div className="space-y-2">
            {(items.data ?? []).map((le) => (
              <Card key={le.id} padded>
                <div className="font-medium text-ink-900">{le.name}</div>
                {le.inn && <div className="text-sm text-ink-500">ИНН {le.inn}</div>}
              </Card>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
