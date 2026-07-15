# Corrections des calculs financiers — 15 juillet 2026

## Définitions appliquées

- `prixVenteBrutHT = prixAchatHT × (1 + margeBrute / 100)`
- `margeNettePct = margeBrutePct - remisePct`
- `margeNetteDT = margeBruteDT × (margeNettePct / margeBrutePct)`
- `prixVenteNetHT = prixAchatHT + margeNetteDT`
- `CA net HT = lignes vendues HT - lignes retournées HT`, hors TVA et timbre
- `marge brute réelle = CA net HT - coût historique net des produits vendus`
- `bénéfice réel = marge brute réelle - dépenses actives de la période`

Les montants unitaires, de ligne et de document sont arrondis à trois décimales avec
`ROUND_HALF_UP`. Le document somme les lignes déjà arrondies.

## Sémantique de SaleItem

À partir de `calculationVersion = 3` :

- `unitPurchaseCostHt` : coût d'achat HT figé lors de la vente ;
- `unitPrice` : prix unitaire brut HT avant remise ;
- `finalUnitPrice` : prix unitaire net HT après remise ;
- `discountPercent` : réduction en points du taux de marge ;
- `marginPercent` : marge brute saisie sur coût avant remise ;
- `total` : total net HT de la ligne ;
- `purchaseCostEstimated = false` pour les nouvelles ventes.

Une transformation commerciale recopie ces champs sans les recalculer. Un avoir utilise
`finalUnitPrice` (ou le total légal historique) et conserve le lien vers la ligne de vente.

## Compatibilité historique

La migration `20260715120000_sale_item_financial_snapshots_v2` ne modifie aucun subtotal,
total, taxe, remise, paiement ou reste à payer existant. Les versions 1 et 2 conservent leurs
montants légaux et leurs snapshots. Seules les nouvelles créations ou les lignes explicitement
modifiées sont enregistrées en version 3.

Pour une ancienne ligne possédant `marginPercent`, le coût est reconstruit depuis le prix net
et l'ancienne formule, puis marqué `purchaseCostEstimated = true`. Lorsque cette reconstruction
n'est pas démontrable (`marginPercent IS NULL` notamment), `unitPurchaseCostHt` reste `NULL`.
Les rapports affichent alors un avertissement de qualité : cette marge historique ne peut pas
être complétée automatiquement sans une source comptable externe.

## Périmètre des agrégats

Le CA exclut les devis, commandes client, brouillons, annulations et BL déjà transformés en
facture. Les indicateurs achats excluent les bons de commande fournisseur non activés. Le
Dashboard consomme désormais l'agrégat backend `/reports/dashboard` au lieu de sommer une page
de listes paginées.
