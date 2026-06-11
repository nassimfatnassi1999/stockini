-- Migration: add_designation_to_sale_item
--
-- Ajoute un champ "designation" optionnel sur SaleItem.
-- Ce champ stocke un snapshot de la désignation telle que saisie
-- sur le document commercial (Devis, BC, BL, Facture).
-- Il n'impacte jamais Product.name.

ALTER TABLE "SaleItem" ADD COLUMN "designation" TEXT;
