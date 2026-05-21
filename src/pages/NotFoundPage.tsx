import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-50 px-6 text-center">
      <div className="text-6xl font-bold text-ink-300">404</div>
      <h1 className="text-xl font-semibold text-ink-900">Страница не найдена</h1>
      <p className="text-ink-600">Возможно, ссылка устарела или вы ввели её вручную.</p>
      <Link to="/">
        <Button>На главную</Button>
      </Link>
    </div>
  );
}
