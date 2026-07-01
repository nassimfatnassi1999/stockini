'use client';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6 text-text-primary">
      <section className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">Une erreur est survenue</h1>
        <p className="mt-3 text-sm text-text-secondary">
          Impossible d’afficher cette page. Vous pouvez réessayer sans quitter l’application.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white"
        >
          Réessayer
        </button>
        {error.digest ? (
          <p className="mt-3 text-xs text-text-secondary">Référence : {error.digest}</p>
        ) : null}
      </section>
    </main>
  );
}
