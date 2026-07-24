/**
 * Reserve a tab synchronously while the browser still considers the action a
 * direct user gesture, then populate it once the authenticated PDF request has
 * completed. This avoids production popup blockers caused by network latency.
 */
export async function openPdfInNewTab(loadPdf: () => Promise<Blob>): Promise<void> {
  const tab = window.open('', '_blank');
  if (!tab) {
    throw new Error('POPUP_BLOCKED');
  }

  tab.document.title = 'Chargement du document…';
  tab.document.body.textContent = 'Chargement du document…';

  try {
    const blob = await loadPdf();
    if (blob.type && !blob.type.toLowerCase().startsWith('application/pdf')) {
      throw new Error('INVALID_PDF_RESPONSE');
    }
    const url = URL.createObjectURL(
      blob.type.toLowerCase().startsWith('application/pdf')
        ? blob
        : new Blob([blob], { type: 'application/pdf' }),
    );
    tab.location.replace(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab.close();
    throw error;
  }
}

export function pdfOpenErrorMessage(error: unknown): string {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 404) {
    return "Le fichier PDF n'est pas disponible après la restauration de la base. Vous pouvez le régénérer à partir des données enregistrées.";
  }
  if (status === 401 || status === 403) return 'Accès refusé — permission ou session invalide.';
  if (error instanceof Error && error.message === 'POPUP_BLOCKED') {
    return "L’ouverture a été bloquée par le navigateur. Autorisez les popups pour Stockini.";
  }
  return "Impossible d’ouvrir le document.";
}
