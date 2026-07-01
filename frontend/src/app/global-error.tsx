'use client';

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#f8fafc',
          color: '#0f172a',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <main style={{ maxWidth: 480, padding: 32, textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>Impossible d’afficher l’application</h1>
          <p style={{ margin: '16px 0', lineHeight: 1.5, color: '#475569' }}>
            Le chargement de l’interface a échoué. Rechargez la page pour récupérer les fichiers de l’application.
          </p>
          <button
            type="button"
            onClick={() => {
              reset();
              window.location.reload();
            }}
            style={{
              border: 0,
              borderRadius: 6,
              padding: '10px 16px',
              background: '#2563eb',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Recharger
          </button>
        </main>
      </body>
    </html>
  );
}
