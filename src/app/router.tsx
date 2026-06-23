import { lazy, Suspense } from 'react';
import { Navigate, Route, BrowserRouter, Routes, useLocation } from 'react-router-dom';
import { useAuthStore, selectRole } from '@/features/auth/store';
import { MobileLayout } from './layout/MobileLayout';
import { DesktopLayout } from './layout/DesktopLayout';

// Перф: страницы грузятся лениво (свой JS-чанк на маршрут). Водителю не качается
// код доски/финотчёта/сотрудников и наоборот — меньше JS на телефоне.
const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const DriverDashboardPage = lazy(() => import('@/pages/driver/DriverDashboardPage').then((m) => ({ default: m.DriverDashboardPage })));
const ShiftStartPage = lazy(() => import('@/pages/driver/ShiftStartPage').then((m) => ({ default: m.ShiftStartPage })));
const ShiftActivePage = lazy(() => import('@/pages/driver/ShiftActivePage').then((m) => ({ default: m.ShiftActivePage })));
const ShiftEndPage = lazy(() => import('@/pages/driver/ShiftEndPage').then((m) => ({ default: m.ShiftEndPage })));
const DriverHistoryPage = lazy(() => import('@/pages/driver/DriverHistoryPage').then((m) => ({ default: m.DriverHistoryPage })));
const OperatorDashboardPage = lazy(() => import('@/pages/operator/OperatorDashboardPage').then((m) => ({ default: m.OperatorDashboardPage })));
const VerifyShiftPage = lazy(() => import('@/pages/operator/VerifyShiftPage').then((m) => ({ default: m.VerifyShiftPage })));
const OperatorEmployeesPage = lazy(() => import('@/pages/operator/OperatorEmployeesPage').then((m) => ({ default: m.OperatorEmployeesPage })));
const OperatorObjectsPage = lazy(() => import('@/pages/operator/OperatorObjectsPage').then((m) => ({ default: m.OperatorObjectsPage })));
const OperatorCounterpartiesPage = lazy(() => import('@/pages/operator/OperatorCounterpartiesPage').then((m) => ({ default: m.OperatorCounterpartiesPage })));
const OperatorPayrollPage = lazy(() => import('@/pages/operator/OperatorPayrollPage').then((m) => ({ default: m.OperatorPayrollPage })));
const OperatorBoardPage = lazy(() => import('@/pages/operator/OperatorBoardPage').then((m) => ({ default: m.OperatorBoardPage })));
const OperatorRevenuePage = lazy(() => import('@/pages/operator/OperatorRevenuePage').then((m) => ({ default: m.OperatorRevenuePage })));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

/**
 * Маршрутизация по ролям.
 *
 *  /login                          — публичный
 *  /driver                         — главный экран водителя
 *  /driver/shift/start             — начало вахты
 *  /driver/shift/:id               — текущая вахта
 *  /driver/shift/:id/end           — завершение вахты
 *  /operator                       — панель оператора
 *
 * Guards:
 *  - RequireAuth — редиректит на /login если не авторизован.
 *  - RequireRole — редиректит на главную своей роли при чужом маршруте.
 */

function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  if (status === 'idle' || status === 'restoring') {
    return (
      <div className="flex h-full items-center justify-center text-ink-600">Загрузка…</div>
    );
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}

// admin имеет все права operator + плюс админ-функции (которых пока нет в UI).
// Для роутинга — admin считается за operator.
function isOperatorLike(role: string | null | undefined): boolean {
  return role === 'operator' || role === 'admin';
}

function RequireRole({
  role,
  children,
}: {
  role: 'driver' | 'operator';
  children: React.ReactNode;
}) {
  const userRole = useAuthStore(selectRole);
  if (!userRole) return <>{children}</>;
  const ok = role === 'driver' ? userRole === 'driver' : isOperatorLike(userRole);
  if (!ok) {
    return <Navigate to={isOperatorLike(userRole) ? '/operator' : '/driver'} replace />;
  }
  return <>{children}</>;
}

function RoleHome() {
  const role = useAuthStore(selectRole);
  if (isOperatorLike(role)) return <Navigate to="/operator" replace />;
  if (role === 'driver') return <Navigate to="/driver" replace />;
  return <Navigate to="/login" replace />;
}

export function AppRouter() {
  // basename: обычно из vite base (BASE_URL). НО в single-file сборке (corp)
  // vite-plugin-singlefile делает base относительным ('./'), и BASE_URL='./'
  // ломает react-router (Routes ничего не матчат → пустой экран). Поэтому в
  // corp задаём базу явно через VITE_ROUTER_BASE (=/kipapp/).
  const basename = import.meta.env.VITE_ROUTER_BASE || import.meta.env.BASE_URL;
  return (
    <BrowserRouter basename={basename}>
      <Suspense fallback={<div className="flex h-full items-center justify-center text-ink-600">Загрузка…</div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          element={
            <RequireAuth>
              <RequireRole role="driver">
                <MobileLayout />
              </RequireRole>
            </RequireAuth>
          }
        >
          <Route path="/driver" element={<DriverDashboardPage />} />
          <Route path="/driver/shift/start" element={<ShiftStartPage />} />
          <Route path="/driver/shift/:id" element={<ShiftActivePage />} />
          <Route path="/driver/shift/:id/end" element={<ShiftEndPage />} />
          <Route path="/driver/history" element={<DriverHistoryPage />} />
        </Route>

        <Route
          element={
            <RequireAuth>
              <RequireRole role="operator">
                <DesktopLayout />
              </RequireRole>
            </RequireAuth>
          }
        >
          <Route path="/operator" element={<OperatorDashboardPage />} />
          <Route path="/operator/shift/:id" element={<VerifyShiftPage />} />
          <Route path="/operator/employees" element={<OperatorEmployeesPage />} />
          <Route path="/operator/objects" element={<OperatorObjectsPage />} />
          <Route path="/operator/counterparties" element={<OperatorCounterpartiesPage />} />
          <Route path="/operator/payroll" element={<OperatorPayrollPage />} />
          <Route path="/operator/board" element={<OperatorBoardPage />} />
          <Route path="/operator/revenue" element={<OperatorRevenuePage />} />
        </Route>

        <Route path="/" element={<RoleHome />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
