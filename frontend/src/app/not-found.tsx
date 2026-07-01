import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6 text-text-primary">
      <section className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">Page introuvable</h1>
        <p className="mt-3 text-sm text-text-secondary">
          La page demandée n’existe pas ou a été déplacée.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-white"
        >
          Retour au tableau de bord
        </Link>
      </section>
    </main>
  );
}
