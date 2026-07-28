const GENERIC_SERVER_MESSAGES = new Set([
  "Internal server error",
  "Request failed with status code 500",
]);

export function getApiErrorMessage(
  error: unknown,
  fallback = "Une erreur est survenue. Veuillez réessayer.",
): string {
  const candidate = (
    error as {
      response?: { status?: number; data?: { message?: unknown } };
      message?: unknown;
    }
  )?.response?.data?.message;
  const businessMessage = Array.isArray(candidate) ? candidate[0] : candidate;
  if (
    typeof businessMessage === "string" &&
    businessMessage.trim() &&
    !GENERIC_SERVER_MESSAGES.has(businessMessage)
  ) {
    return businessMessage;
  }

  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  if (status === 401)
    return "Votre session a expiré. Veuillez vous reconnecter.";
  if (status === 403)
    return "Vous n'avez pas la permission d'effectuer cette action.";
  if (status === 404) return "Le document demandé est introuvable.";
  if (status === 409) return "Ce paiement a déjà été enregistré.";
  if (status === 422 || status === 400)
    return "Le montant ou les informations du paiement sont invalides.";
  if (typeof status === "number" && status >= 500) return fallback;

  const localMessage = (error as { message?: unknown })?.message;
  return typeof localMessage === "string" &&
    localMessage.trim() &&
    !GENERIC_SERVER_MESSAGES.has(localMessage)
    ? localMessage
    : fallback;
}
