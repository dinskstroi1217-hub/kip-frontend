import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { OfflineBanner } from '@/components/status/OfflineBanner';
import { MockBadge } from '@/components/status/MockBadge';
import { useAuthStore, selectUser } from '@/features/auth/store';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

/**
 * Мобильный лэйаут для водителя.
 * - Sticky offline-banner вверху
 * - Простая шапка с ФИО + logout
 * - Контент с safe-area отступами
 * - Нижнее меню (Главная / Закрытые) — action-first навигация (ТЗ «упрощение экранов»)
 */
export function MobileLayout() {
  const user = useAuthStore(selectUser);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell flex min-h-full flex-col bg-ink-50">
      <OfflineBanner />
      <header className="flex items-center justify-between gap-3 border-b border-ink-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold text-ink-900">
              {user?.fullName ?? '—'}
            </span>
            <MockBadge />
          </div>
          <div className="text-xs text-ink-500">Водитель · Спецтехника ДКБИ</div>
        </div>
        <Button variant="ghost" size="md" onClick={handleLogout}>
          Выйти
        </Button>
      </header>
      <main className="flex-1 px-4 py-4 pb-24">
        <Outlet />
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 border-t border-ink-200 bg-white"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <BottomTab to="/driver" label="Главная" />
        <BottomTab to="/driver/history" label="Закрытые" />
      </nav>
    </div>
  );
}

function BottomTab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          'flex min-h-[52px] items-center justify-center py-2 text-sm font-medium transition-colors',
          isActive ? 'text-brand-700' : 'text-ink-500 hover:text-ink-800',
        )
      }
    >
      {label}
    </NavLink>
  );
}
