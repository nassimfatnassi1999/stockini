import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isAdministratorRole, isExactConfirmation } from "./bulk-delete";
import { BulkDeleteDialog } from "@/components/stockini/shared/BulkDeleteDialog";

test("autorise uniquement les rôles administrateur à afficher la purge", () => {
  assert.equal(isAdministratorRole("ADMIN"), true);
  assert.equal(isAdministratorRole("super_admin"), true);
  assert.equal(isAdministratorRole("STOCK_MANAGER"), false);
  assert.equal(isAdministratorRole(""), false);
});

test("exige exactement SUPPRIMER pour la purge des logs", () => {
  assert.equal(isExactConfirmation("", "SUPPRIMER"), false);
  assert.equal(isExactConfirmation("supprimer", "SUPPRIMER"), false);
  assert.equal(isExactConfirmation("SUPPRIMER ", "SUPPRIMER"), false);
  assert.equal(isExactConfirmation("SUPPRIMER", "SUPPRIMER"), true);
});

test("une confirmation simple ne demande aucun texte", () => {
  assert.equal(isExactConfirmation("", undefined), true);
});

test("la modale reste absente avant le premier clic", () => {
  const html = renderToStaticMarkup(React.createElement(BulkDeleteDialog, {
    open: false,
    title: "Supprimer ?",
    message: "Irréversible",
    confirmLabel: "Supprimer",
    pending: false,
    onCancel: () => undefined,
    onConfirm: () => undefined,
  }));
  assert.equal(html, "");
});

test("la confirmation audit affiche SUPPRIMER et désactive l’action initiale", () => {
  const html = renderToStaticMarkup(React.createElement(BulkDeleteDialog, {
    open: true,
    title: "Supprimer tous les logs d’audit ?",
    message: "Cette action est irréversible.",
    confirmLabel: "Supprimer tous les logs",
    confirmationText: "SUPPRIMER",
    pending: false,
    onCancel: () => undefined,
    onConfirm: () => undefined,
  }));
  assert.match(html, /role="dialog"/);
  assert.match(html, /SUPPRIMER/);
  assert.match(html, /disabled=""[^>]*>.*Supprimer tous les logs/s);
  assert.match(html, />Annuler</);
});

test("la modale matérialise l’état de chargement", () => {
  const html = renderToStaticMarkup(React.createElement(BulkDeleteDialog, {
    open: true,
    title: "Supprimer ?",
    message: "Irréversible",
    confirmLabel: "Supprimer",
    pending: true,
    onCancel: () => undefined,
    onConfirm: () => undefined,
  }));
  assert.match(html, /Suppression…/);
  assert.match(html, /disabled=""/);
});
