import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title = 'Не удалось загрузить',
  message,
  onRetry,
  retryLabel = 'Повторить',
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-8 text-center"
    >
      <div className="text-3xl" aria-hidden>
        ⚠
      </div>
      <h3 className="text-lg font-semibold text-red-900">{title}</h3>
      <p className="max-w-md text-sm text-red-800">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="md" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
