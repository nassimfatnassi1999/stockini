# ENHANCEMENT_PLAN.md

## Roadmap par phases

Objectif : sécuriser d'abord la cohérence financière et stock/caisse, puis améliorer les workflows métier, l'UX, les performances et les permissions.

## Phase 1 : corrections critiques

### Tâche 1.1 - Corriger les paiements initiaux de ventes

Objectif :
- Toute vente non devis avec `paidAmount > 0` doit créer un paiement et augmenter la caisse dans la même transaction.

Fichiers à modifier :
- `backend/src/sales/sales.service.ts`
- `backend/prisma/schema.prisma`
- migration Prisma à créer
- tests e2e backend

Logique attendue :
- Ajouter une protection `cashImpactDone` ou lier `CaisseMovement` à `Payment`.
- Dans `SalesService.create`, créer le `Payment`, puis le mouvement `ENCAISSEMENT_VENTE`.
- Refuser `paidAmount > total`.
- Exiger `paymentMethod` si `paidAmount > 0`.

Tests à faire :
- Créer DEVIS avec `paidAmount` envoyé : paiement/caisse restent à 0.
- Créer FACTURE payée : `Payment` créé, `CaisseMovement` créé, solde augmenté.
- Créer FACTURE partiellement payée : solde augmenté du partiel.
- Retry du même paiement : pas de double mouvement.

Critère d'acceptation :
- Le solde caisse correspond à la somme des encaissements réels après création facture payée.

### Tâche 1.2 - Corriger les paiements initiaux d'achats

Objectif :
- Un achat créé avec paiement initial doit diminuer la caisse et apparaître dans l'historique fournisseur.

Fichiers à modifier :
- `backend/src/purchases/purchases.service.ts`
- `backend/src/purchases/dto/purchase.dto.ts`
- `frontend/src/components/stockini/pages/PurchasesPage.tsx`
- tests e2e backend

Logique attendue :
- Option A recommandée : supprimer `paidAmount` de la création achat et imposer `/payments/purchases/:id/pay`.
- Option B : créer `Payment` `SUPPLIER_PAYMENT` + `CaisseMovement` `DECAISSEMENT_ACHAT` dans `PurchasesService.create`.
- Refuser `paidAmount > total`.

Tests à faire :
- Création achat sans paiement : pas de caisse.
- Création achat payé : caisse diminuée, paiement fournisseur visible.
- Solde insuffisant : transaction rollback, achat non créé si paiement obligatoire dans la même transaction.

Critère d'acceptation :
- Aucun achat ne peut être marqué payé sans historique paiement et caisse cohérents.

### Tâche 1.3 - Annulation/suppression de paiement cohérente

Objectif :
- Supprimer/annuler un paiement doit inverser la caisse et recalculer le document.

Fichiers à modifier :
- `backend/src/payments/payments.service.ts`
- `backend/src/payments/payments.controller.ts`
- `backend/prisma/schema.prisma`
- `frontend/src/components/stockini/pages/PaymentsPage.tsx`
- `frontend/src/components/stockini/DepensesPage.tsx`

Logique attendue :
- Remplacer delete physique par annulation/soft delete.
- Si paiement client : créer `ANNULATION_VENTE`, décrémenter `Sale.paidAmount`, recalculer `remainingAmount`/`paymentStatus`.
- Si paiement fournisseur : créer `ANNULATION_ACHAT`, décrémenter `Purchase.paidAmount`, recalculer statut.

Tests à faire :
- Paiement client annulé : facture repasse partielle/non payée, caisse diminuée.
- Paiement fournisseur annulé : achat repasse partiel/non payé, caisse augmentée.
- Double annulation : refusée.

Critère d'acceptation :
- Il n'existe plus de paiement supprimable sans mouvement inverse.

## Phase 2 : cohérence métier stock/caisse

### Tâche 2.1 - Annulation achat avec mouvements inverses

Objectif :
- Annuler un achat doit inverser le stock reçu et la caisse payée.

Fichiers à modifier :
- `backend/src/purchases/purchases.service.ts`
- `backend/prisma/schema.prisma`
- tests e2e backend

Logique attendue :
- Dans `cancel`, charger items + paiements.
- Créer `SUPPLIER_RETURN` pour chaque `receivedQuantity > 0`.
- Créer `ANNULATION_ACHAT` pour chaque paiement déjà impacté caisse.
- Marquer `status=CANCELLED`.
- Ajouter indicateurs anti double impact si nécessaire.

Tests à faire :
- Achat commandé non reçu annulé : aucun mouvement stock.
- Achat reçu annulé : stock diminué.
- Achat payé annulé : caisse augmentée.

Critère d'acceptation :
- Annulation et suppression achat produisent des effets métier cohérents.

### Tâche 2.2 - Séparer réservation et sortie stock

Objectif :
- Un bon de commande ne doit pas diminuer le stock physique.

Fichiers à modifier :
- `backend/prisma/schema.prisma`
- `backend/src/sales/sales.service.ts`
- `frontend/src/components/stockini/pages/SalesPage.tsx`
- `frontend/src/components/stockini/pages/ProductsPage.tsx`

Logique attendue :
- Ajouter `StockReservation` ou `Product.reservedQuantity`.
- `BON_COMMANDE reserveStock=true` crée une réservation, pas un `StockMovementType.SALE`.
- `BON_LIVRAISON`/`FACTURE` consomme la réservation puis diminue le stock.

Tests à faire :
- Bon de commande réservé : stock physique inchangé, disponible diminué.
- Validation facture : stock physique diminué une seule fois.
- Annulation commande réservée : réservation libérée.

Critère d'acceptation :
- Stock physique, stock réservé et stock disponible sont distingués.

### Tâche 2.3 - Bloquer les updates financiers génériques

Objectif :
- Interdire les changements de paiement hors endpoints dédiés.

Fichiers à modifier :
- `backend/src/sales/dto/sale.dto.ts`
- `backend/src/sales/sales.service.ts`
- `backend/src/purchases/dto/purchase.dto.ts`
- `backend/src/purchases/purchases.service.ts`

Logique attendue :
- Retirer `paidAmount` et `paymentStatus` des DTO update standards.
- Conserver `validate`, `cancel`, `paySale`, `payPurchase` comme seules portes métier.

Tests à faire :
- PATCH sale avec `paidAmount` : 400.
- PATCH purchase avec `paymentStatus` : 400.
- Paiement via endpoint dédié : OK.

Critère d'acceptation :
- Aucun document ne peut devenir payé sans `Payment` et `CaisseMovement`.

### Tâche 2.4 - Réception achat complète côté frontend

Objectif :
- Exposer le workflow backend de réception fournisseur.

Fichiers à modifier :
- `frontend/src/components/stockini/pages/PurchasesPage.tsx`
- `frontend/src/lib/stockini/types.ts`
- éventuellement composant modal dédié

Logique attendue :
- Ajouter action `Réceptionner`.
- Afficher les lignes avec commandé, déjà reçu, restant.
- Envoyer `receivePurchase(id, [{ purchaseItemId, quantity }])`.
- Invalider achats, produits, mouvements stock.

Tests à faire :
- Réception partielle.
- Réception totale.
- Quantité supérieure au restant bloquée côté UI et backend.

Critère d'acceptation :
- Un bon de réception validé augmente le stock depuis l'interface.

## Phase 3 : UX et recherche avancée

### Tâche 3.1 - Améliorer formulaires ventes/achats

Objectif :
- Réduire les erreurs de saisie et rendre HT/TTC/remise/marge explicites.

Fichiers à modifier :
- `frontend/src/components/stockini/pages/SalesPage.tsx`
- `frontend/src/components/stockini/pages/PurchasesPage.tsx`
- `frontend/src/components/stockini/shared/form-utils.ts`

Logique attendue :
- Montrer prix unitaire, remise, total HT, TVA, TTC et marge estimée avant soumission.
- Ne pas forcer `paidAmount` au total par défaut ; laisser `0`, partiel ou total.
- Valider `paidAmount <= total`.

Tests à faire :
- Vente impayée, partielle, payée.
- Remise max.
- Produit sans prix achat : message clair.

Critère d'acceptation :
- L'utilisateur comprend avant validation l'impact stock/caisse du document.

### Tâche 3.2 - Recherche et filtres serveur

Objectif :
- Remplacer les filtres client sur gros historiques.

Fichiers à modifier :
- `backend/src/sales/sales.controller.ts`
- `backend/src/sales/sales.service.ts`
- `backend/src/payments/payments.controller.ts`
- `backend/src/payments/payments.service.ts`
- `backend/src/stock/stock.controller.ts`
- `backend/src/stock/stock.service.ts`
- `backend/src/caisse/caisse.controller.ts`
- `backend/src/caisse/caisse.service.ts`
- pages frontend correspondantes

Logique attendue :
- Query params : `page`, `limit`, `search`, `dateFrom`, `dateTo`, `type`, `status`.
- Réponse standard : `{ data, total, page, limit, totalPages }`.

Tests à faire :
- Pagination stable.
- Filtres combinés.
- Recherche référence/client/produit.

Critère d'acceptation :
- Les pages stock, paiements, dépenses et ventes ne chargent plus tout l'historique.

### Tâche 3.3 - Feedback erreurs et responsive tables

Objectif :
- Améliorer l'usage mobile/tablette et la compréhension des erreurs métier.

Fichiers à modifier :
- `frontend/src/components/stockini/pages/PaymentsPage.tsx`
- `frontend/src/components/stockini/DepensesPage.tsx`
- `frontend/src/components/stockini/pages/StockMovementsPage.tsx`
- `frontend/src/components/stockini/pages/ProductsPage.tsx`

Logique attendue :
- Ajouter états vides filtrés, retry, messages backend affichés partout.
- Ajouter scroll horizontal contrôlé ou colonnes prioritaires sur mobile.
- Supprimer logs console.

Tests à faire :
- Vue mobile 375px.
- Erreurs 400 métier.
- Listes vides avec filtre.

Critère d'acceptation :
- Aucune table critique ne déborde de manière inutilisable sur mobile.

## Phase 4 : performance et reporting

### Tâche 4.1 - Index et recherche PostgreSQL

Objectif :
- Accélérer les recherches catalogue et historiques.

Fichiers à modifier :
- `backend/prisma/schema.prisma`
- migrations Prisma

Logique attendue :
- Ajouter index composés :
  - `Sale(documentType, status, createdAt)`
  - `Payment(type, createdAt)`
  - `StockMovement(productId, createdAt)`
  - `CaisseMovement(type, createdAt)`
- Évaluer trigram index pour `Product.reference`, `Product.name`, `Product.sku`, `Product.barcode`.

Tests à faire :
- EXPLAIN ANALYZE sur recherche produit.
- Pagination historique 10k+ lignes.

Critère d'acceptation :
- Recherches principales restent sous un seuil acceptable avec gros volume.

### Tâche 4.2 - Recalcul dernier prix vente incrémental

Objectif :
- Éviter suppression/reconstruction complète de `ProductPriceHistory`.

Fichiers à modifier :
- `backend/src/sales/sales.service.ts`
- `backend/src/admin/admin.controller.ts`
- tests unitaires service

Logique attendue :
- Sur validation facture/BL : upsert historique du document.
- Sur annulation/suppression : supprimer seulement les lignes du document puis recalculer le dernier prix du produit.
- Garder endpoint admin de reconstruction complète.

Tests à faire :
- Deux factures même produit : dernier prix = plus récente.
- Annulation de la plus récente : dernier prix = précédente.
- Suppression document : historique ajusté.

Critère d'acceptation :
- Recalcul par document sans `deleteMany` global.

### Tâche 4.3 - Reporting caisse/stock fiable

Objectif :
- Produire des états auditables.

Fichiers à modifier :
- `backend/src/reports/reports.service.ts`
- `backend/src/caisse/caisse.service.ts`
- pages rapports frontend

Logique attendue :
- Rapport journalier encaissements/décaissements.
- Rapport mouvements stock par période et produit.
- Totaux basés sur mouvements historisés, pas uniquement états courants.

Tests à faire :
- Journée avec vente, paiement, annulation, achat.
- Export CSV/PDF si existant.

Critère d'acceptation :
- Les totaux rapport correspondent aux mouvements source.

## Phase 5 : sécurité et permissions

### Tâche 5.1 - Durcir endpoint paiement générique

Objectif :
- Empêcher les paiements incohérents.

Fichiers à modifier :
- `backend/src/payments/payments.service.ts`
- `backend/src/payments/dto/payment.dto.ts`
- `backend/src/payments/payments.controller.ts`

Logique attendue :
- Restreindre ou supprimer `POST /payments` générique.
- Vérifier cohérence : `CUSTOMER_PAYMENT` exige `saleId` ou `customerId`, `SUPPLIER_PAYMENT` exige `purchaseId` ou `supplierId`.
- Tout paiement impactant doit passer par la caisse ou être marqué non-caisse explicitement.

Tests à faire :
- Paiement sans cible : 400.
- Type/cible incohérents : 400.
- Paiement valide : OK.

Critère d'acceptation :
- Aucun paiement orphelin ne peut être créé par API standard.

### Tâche 5.2 - CORS, logs et erreurs

Objectif :
- Réduire exposition de données et améliorer messages utilisateur.

Fichiers à modifier :
- `backend/src/main.ts`
- `backend/src/sales/sales.controller.ts`
- `frontend/src/components/stockini/pages/SalesPage.tsx`
- services backend avec messages anglais

Logique attendue :
- Configurer CORS via variables d'environnement.
- Supprimer logs DTO/payload.
- Uniformiser messages métier en français.

Tests à faire :
- Origine non autorisée refusée.
- Création vente invalide : message utilisateur exploitable.

Critère d'acceptation :
- Pas de logs sensibles en production et CORS restreint.

### Tâche 5.3 - Permissions fines admin/user

Objectif :
- Séparer actions courantes et actions irréversibles.

Fichiers à modifier :
- `backend/src/rbac/rbac.service.ts`
- controllers ventes, achats, paiements, stock, caisse
- pages frontend actions

Logique attendue :
- Permissions distinctes :
  - `payments.cancel`
  - `sales.cancel`
  - `sales.permanent_delete`
  - `purchases.cancel`
  - `caisse.manual_adjust`
  - `stock.adjust`
- Masquer les actions UI sans permission.

Tests à faire :
- User standard ne peut pas supprimer définitivement.
- Admin peut annuler avec mouvement inverse.
- Boutons masqués côté UI et refus backend.

Critère d'acceptation :
- Les actions destructrices ou financières sont réservées aux rôles explicitement autorisés.
