import { Navigate, Route, BrowserRouter, Routes, useLocation } from 'react-router-dom';
import { useAuthStore, selectRole } from '@/features/auth/store';
import { LoginPage } from '@/pages/auth/LoginPage';
import { DriverDashboardPage } from '@/pages/driver/DriverDashboardPage';
import { ShiftStartPage } from '@/pages/driver/ShiftStartPage';
import { ShiftActivePage } from '@/pages/driver/ShiftActivePage';
import { ShiftEndPage } from '@/pages/driver/ShiftEndPage';
import { OperatorDashboardPage } from '@/pages/operator/OperatorDashboardPage';
import { VerifyShiftPage } from '@/pages/operator/VerifyShiftPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { MobileLayout } from './layout/MobileLayout';
import { DesktopLayout } from './layout/DesktopLayout';

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
  // basename берётся из vite-config base (на GH Pages — /kip-frontend/),
  // в dev — '/'. react-router сам убирает trailing-slash при сравнении.
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
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
        </Route>

        <Route path="/" element={<RoleHome />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
