import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore, selectUser } from '@/features/auth/store';
import { Button } from '@/components/ui/Button';
import { SyncIndicator } from '@/components/status/SyncIndicator';
import { MockBadge } from '@/components/status/MockBadge';

/**
 * Лэйаут оператора (десктоп-first, адаптируется на планшет).
 */
export function DesktopLayout() {
  const user = useAuthStore(selectUser);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  return (
    <div className="flex min-h-full flex-col bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-brand-700 text-white grid place-items-center font-bold">
              С
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold leading-tight text-ink-900">
                  Спецтехника
                </span>
                <MockBadge />
              </div>
              <div className="text-xs text-ink-500">ДКБИ · панель оператора</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SyncIndicator />
            <div className="text-sm text-ink-700">{user?.fullName}</div>
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
            >
              Выйти
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
