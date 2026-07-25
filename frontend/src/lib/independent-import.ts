export type IndependentImportKind = "postgres" | "minio";

export function buildIndependentImportRequest(file: File) {
  const data = new FormData();
  data.append("file", file);
  return {
    data,
    config: {
      timeout: 0,
      suppressErrorToast: true,
    },
  };
}

export function independentImportErrorMessage(
  error: unknown,
  kind: IndependentImportKind,
): string {
  const message = (
    error as { response?: { data?: { message?: string | string[] } } }
  )?.response?.data?.message;
  const apiMessage = Array.isArray(message) ? message[0] : message;
  if (apiMessage) return apiMessage;
  return kind === "postgres"
    ? "Impossible d’importer le dump PostgreSQL."
    : "Impossible d’importer l’export MinIO.";
}
