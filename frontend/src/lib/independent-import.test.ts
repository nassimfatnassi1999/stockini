import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIndependentImportRequest,
  independentImportErrorMessage,
} from "./independent-import";

test("construit un multipart avec le champ file sans Content-Type manuel", () => {
  const file = new File(["PGDMP"], "backup.dump", {
    type: "application/octet-stream",
  });

  const request = buildIndependentImportRequest(file);

  assert.equal(request.data.get("file"), file);
  assert.equal("headers" in request.config, false);
  assert.equal(request.config.suppressErrorToast, true);
});

test("affiche le message backend sans produire une seconde erreur générique", () => {
  const error = {
    response: {
      data: {
        message: "Le fichier sélectionné n'est pas un dump PostgreSQL valide.",
      },
    },
  };

  assert.equal(
    independentImportErrorMessage(error, "postgres"),
    "Le fichier sélectionné n'est pas un dump PostgreSQL valide.",
  );
});

test("utilise un message spécifique à chaque import en absence de détail API", () => {
  assert.equal(
    independentImportErrorMessage({}, "postgres"),
    "Impossible d’importer le dump PostgreSQL.",
  );
  assert.equal(
    independentImportErrorMessage({}, "minio"),
    "Impossible d’importer l’export MinIO.",
  );
});
