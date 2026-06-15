import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Section } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { sitesApi } from '@/api/endpoints/sites';
import { legalEntitiesApi } from '@/api/endpoints/sites';
import { describeError } from '@/api/errors';
import { useAsync } from '@/hooks/useAsync';
import { cn } from '@/lib/cn';
import type { Site } from '@/types/site';

/**
 * Управление объектами (оператор). Диспетчер создаёт объекты и решает,
 * виден ли объект водителям в мастере приёмки (visible_to_drivers).
 */
export function OperatorObjectsPage() {
  const objects = useAsync(() => sitesApi.list(), []);
  const legalEntities = useAsync(() => legalEntitiesApi.list(), []);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [legalEntityId, setLegalEntityId] = useState<string>('');
  const [visible, setVisible] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | number | null>(null);

  async function handleCreate() {
    if (!name.trim()) {
      setCreateError('Введите название объекта');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await sitesApi.create({
        name: name.trim(),
        address: address.trim() || undefined,
        legalEntityId: legalEntityId || null,
        visibleToDrivers: visible,
      });
      setName('');
      setAddress('');
      setLegalEntityId('');
      setVisible(true);
      await objects.refetch();
    } catch (e) {
      setCreateError(describeError(e));
    } finally {
      setCreating(false);
    }
  }

  async function toggleVisible(o: Site) {
    setBusyId(o.id);
    try {
      await sitesApi.update(o.id, { visibleToDrivers: !o.visibleToDrivers });
      await objects.refetch();
    } catch (e) {
      alert(describeError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(o: Site) {
    if (!confirm(`Удалить объект «${o.name}»? Он исчезнет из списков. Уже созданные вахты сохранят ссылку на него.`)) {
      return;
    }
    setBusyId(o.id);
    try {
      // «Удаление» = архивация (is_active=0): сохраняет целостность для вахт,
      // объект пропадает из выдачи и у диспетчера, и у водителя.
      await sitesApi.update(o.id, { isActive: false });
      await objects.refetch();
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

      <Section title="Объекты" description="Создавайте объекты и управляйте их видимостью для водителей.">
        {/* Форма создания */}
        <Card padded className="mb-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Название объекта *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Напр., ЖК Радужный"
            />
            <Input
              label="Адрес"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Город, улица"
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Юрлицо</label>
              <select
                value={legalEntityId}
                onChange={(e) => setLegalEntityId(e.target.value)}
                className="w-full rounded-lg border border-ink-300 bg-white p-3 text-base text-ink-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600"
              >
                <option value="">— не указано —</option>
                {(legalEntities.data ?? []).map((le) => (
                  <option key={le.id} value={le.id}>
                    {le.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 self-end pb-3 text-sm text-ink-800">
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
                className="h-5 w-5 rounded border-ink-300"
              />
              Виден водителям
            </label>
          </div>
          {createError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {createError}
            </div>
          )}
          <div className="mt-4">
            <Button onClick={handleCreate} loading={creating} disabled={!name.trim()}>
              + Создать объект
            </Button>
          </div>
        </Card>

        {/* Список */}
        {objects.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : objects.error ? (
          <ErrorState
            title="Не удалось загрузить объекты"
            message={describeError(objects.error)}
            onRetry={objects.refetch}
          />
        ) : (objects.data ?? []).length === 0 ? (
          <Card padded>
            <p className="py-4 text-center text-sm text-ink-500">Объектов пока нет — создайте первый выше.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {(objects.data ?? []).map((o) => (
              <Card key={o.id} padded>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink-900">{o.name}</div>
                    <div className="truncate text-sm text-ink-500">
                      {o.address || '— адрес не указан —'}
                      {o.customer && ` · ${o.customer}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleVisible(o)}
                      disabled={busyId === o.id}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                        o.visibleToDrivers
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          : 'border-ink-300 bg-ink-50 text-ink-600 hover:bg-ink-100',
                      )}
                      title="Переключить видимость для водителей"
                    >
                      {o.visibleToDrivers ? '👁 Виден водителям' : '🚫 Скрыт'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(o)}
                      disabled={busyId === o.id}
                      className="grid h-8 w-8 place-items-center rounded-full border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                      title="Удалить объект"
                      aria-label={`Удалить объект ${o.name}`}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
