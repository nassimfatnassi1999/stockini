# AUDIT_REPORT.md

## Résumé exécutif

Score global : **62/100**.

Le projet Stockini Gestion Stock v3 possède une base solide : validation globale NestJS stricte, enums Prisma déclarés, transactions sur les flux critiques de vente, réception achat, paiement et mouvements stock. Les champs `documentType`, `status`, `reference`, `stockImpactDone`, dernier prix de vente, historique stock et historique caisse existent partiellement.

Les risques principaux restent métier et financiers : les paiements initiaux créés avec une vente ou un achat ne génèrent pas de mouvement caisse, aucun champ `cashImpactDone`/`cash_impact_done` ne protège contre les doubles impacts caisse, la suppression de paiements ne recalcule ni document ni caisse, et l'annulation achat ne crée pas de mouvement inverse. Côté frontend, les pages ciblées chargent de gros tableaux sans pagination serveur et plusieurs workflows backend ne sont pas exposés correctement.

## Bugs critiques

### P0 - Paiement initial d'une vente sans impact caisse

Fichiers concernés :
- `backend/src/sales/sales.service.ts`
- `backend/prisma/schema.prisma`
- `frontend/src/components/stockini/pages/SalesPage.tsx`

Preuves :
- La création d'une vente non devis enregistre `paidAmount` et un `Payment` si `paidAmount > 0` (`backend/src/sales/sales.service.ts:145`, `backend/src/sales/sales.service.ts:210`), mais ne fait jamais `caisseService.recordMovement`.
- Les paiements postérieurs, eux, impactent la caisse dans `PaymentsService.paySale` (`backend/src/payments/payments.service.ts:105`).
- Le frontend envoie automatiquement `paidAmount` égal au total net pour tout document non devis (`frontend/src/components/stockini/pages/SalesPage.tsx:318`).

Risque métier :
- Une facture créée avec paiement immédiat apparaît payée, mais le solde caisse reste faux.
- Une annulation retire ensuite la caisse via `ANNULATION_VENTE` (`backend/src/sales/sales.service.ts:368`), ce qui peut créer un décaissement inverse d'un encaissement qui n'a jamais existé.

Recommandation exacte :
- Dans `SalesService.create`, après création du `Payment`, appeler `caisseService.recordMovement(tx, { type: ENCAISSEMENT_VENTE, montant: paidAmount, referenceDoc: payment.reference, userId: sellerId })`.
- Ajouter un champ `cashImpactDone Boolean @default(false)` sur `Sale` ou `Payment`, puis ne créer le mouvement caisse qu'une seule fois.
- Ajouter un test e2e : création FACTURE payée -> `Payment` créé, `CaisseMovement` créé, `CaisseConfig.solde` augmenté.

### P0 - Paiement initial d'un achat sans décaissement caisse

Fichiers concernés :
- `backend/src/purchases/purchases.service.ts`
- `frontend/src/components/stockini/pages/PurchasesPage.tsx`

Preuves :
- `PurchasesService.create` enregistre `paidAmount`, `remainingAmount` et `paymentStatus` (`backend/src/purchases/purchases.service.ts:46` à `backend/src/purchases/purchases.service.ts:60`) sans créer de `Payment` et sans appeler `caisseService.recordMovement`.
- Le frontend expose un champ `paidAmount` à la création achat (`frontend/src/components/stockini/pages/PurchasesPage.tsx:32`) et l'envoie au backend (`frontend/src/components/stockini/pages/PurchasesPage.tsx:42`).
- Les paiements fournisseurs postérieurs impactent bien la caisse (`backend/src/payments/payments.service.ts:157`).

Risque métier :
- Une commande achat créée avec paiement initial est marquée partiellement ou totalement payée, mais l'historique paiement fournisseur et la caisse ne reflètent pas la dépense.

Recommandation exacte :
- Soit supprimer `paidAmount` du DTO de création achat et imposer le paiement via `/payments/purchases/:id/pay`, soit créer dans la même transaction un `Payment` `SUPPLIER_PAYMENT` et un `CaisseMovement` `DECAISSEMENT_ACHAT`.
- Ajouter un test : création achat avec `paidAmount > 0` -> paiement fournisseur + mouvement caisse négatif.

### P0 - Absence de garde cash_impact_done contre double impact caisse

Fichiers concernés :
- `backend/prisma/schema.prisma`
- `backend/src/payments/payments.service.ts`
- `backend/src/sales/sales.service.ts`
- `backend/src/purchases/purchases.service.ts`

Preuves :
- `Sale` contient `stockImpactDone` (`backend/prisma/schema.prisma:279`) mais aucun `cashImpactDone`.
- `Payment` contient `reference`, `amount`, `saleId`, `purchaseId`, `deletedAt` (`backend/prisma/schema.prisma:385` à `backend/prisma/schema.prisma:413`) mais aucun indicateur d'impact caisse.
- `PaymentsService.paySale` et `payPurchase` créent un mouvement caisse à chaque appel accepté (`backend/src/payments/payments.service.ts:83`, `backend/src/payments/payments.service.ts:105`, `backend/src/payments/payments.service.ts:135`, `backend/src/payments/payments.service.ts:157`).

Risque métier :
- Les retries client, rejouements HTTP ou scripts correctifs peuvent générer plusieurs mouvements caisse pour un même paiement si l'opération est relancée dans des états intermédiaires.

Recommandation exacte :
- Ajouter `cashImpactDone` sur `Payment` ou une contrainte unique `CaisseMovement.referenceDoc` quand `referenceDoc` pointe vers un paiement.
- Dans `paySale`, `payPurchase`, créations initiales et annulations, vérifier cet indicateur dans la transaction.
- Ajouter des tests de double appel concurrent.

### P0 - Suppression de paiement sans mouvement inverse ni recalcul document

Fichiers concernés :
- `backend/src/payments/payments.service.ts`

Preuves :
- `remove` supprime directement le paiement (`backend/src/payments/payments.service.ts:58` à `backend/src/payments/payments.service.ts:60`).
- Il ne met pas à jour `Sale.paidAmount`, `Sale.remainingAmount`, `Sale.paymentStatus`, ni les champs équivalents achat.
- Il ne crée aucun mouvement `ANNULATION_VENTE` ou `ANNULATION_ACHAT`.

Risque métier :
- L'utilisateur peut supprimer une ligne de paiement tout en laissant la facture payée et la caisse impactée.

Recommandation exacte :
- Transformer la suppression en annulation fonctionnelle : soft delete paiement, recalcul du document, mouvement caisse inverse.
- Interdire la suppression physique hors rôle admin technique.

## Bugs majeurs

### P1 - Annulation achat ne reverse pas le stock reçu ni la caisse

Fichiers concernés :
- `backend/src/purchases/purchases.service.ts`

Preuves :
- `cancel` fait uniquement `status: CANCELLED` (`backend/src/purchases/purchases.service.ts:157` à `backend/src/purchases/purchases.service.ts:161`).
- La suppression achat, elle, inverse le stock reçu et la caisse (`backend/src/purchases/purchases.service.ts:198` à `backend/src/purchases/purchases.service.ts:221`).

Risque métier :
- Un bon de réception annulé peut laisser le stock augmenté.
- Un achat payé annulé peut laisser la caisse diminuée.

Recommandation exacte :
- Réimplémenter `cancel` sur le modèle de `remove`, mais sans delete : créer mouvements `SUPPLIER_RETURN` pour les quantités reçues, `ANNULATION_ACHAT` pour les paiements, puis passer le statut à `CANCELLED`.
- Ajouter `stockImpactDone`/`cashImpactDone` côté achat ou historiser par ligne reçue.

### P1 - Bon de commande peut diminuer le stock si reserveStock=true

Fichiers concernés :
- `backend/src/sales/sales.service.ts`
- `frontend/src/components/stockini/pages/SalesPage.tsx`

Preuves :
- Le backend applique un mouvement `SALE` dès la création d'un `BON_COMMANDE` avec `reserveStock` (`backend/src/sales/sales.service.ts:94` à `backend/src/sales/sales.service.ts:207`).
- Le frontend expose la case "Réserver le stock" pour `BON_COMMANDE` (`frontend/src/components/stockini/pages/SalesPage.tsx:208`).

Risque métier :
- Le besoin audit indique : "Bon de commande ne modifie pas stock par défaut". Le code respecte le "par défaut", mais l'option de réserve diminue réellement le stock au lieu de réserver séparément. Cela mélange stock physique et stock réservé.

Recommandation exacte :
- Créer un concept `reservedQuantity` ou `StockReservation`.
- Ne pas écrire de `StockMovementType.SALE` avant livraison/facture.
- Si l'option est conservée, renommer en "réservation" et exclure du stock physique.

### P1 - Mise à jour manuelle de statut/paiement contourne les impacts métier

Fichiers concernés :
- `backend/src/sales/sales.service.ts`
- `backend/src/purchases/purchases.service.ts`

Preuves :
- `SalesService.update` modifie `paymentStatus`, `paidAmount`, `remainingAmount` directement hors transaction caisse (`backend/src/sales/sales.service.ts:401` à `backend/src/sales/sales.service.ts:425`).
- `PurchasesService.update` fait la même chose côté achat (`backend/src/purchases/purchases.service.ts:164` à `backend/src/purchases/purchases.service.ts:187`).

Risque métier :
- Un utilisateur autorisé à mettre à jour peut déclarer un document payé sans historique paiement ni caisse.

Recommandation exacte :
- Retirer `paidAmount` et `paymentStatus` des endpoints génériques.
- Imposer les endpoints paiement dédiés pour tout changement financier.

### P1 - Dernier prix vente recalculé avec suppression/recréation massive d'historique

Fichiers concernés :
- `backend/src/sales/sales.service.ts`
- `backend/prisma/schema.prisma`

Preuves :
- `recalculateLastSalePricesForProducts` commence par `deleteMany` sur `ProductPriceHistory` (`backend/src/sales/sales.service.ts:506`).
- Puis recharge des `saleItem.findMany` et upsert l'historique (`backend/src/sales/sales.service.ts:512`, `backend/src/sales/sales.service.ts:527`).

Risque technique :
- Opération coûteuse sur un gros historique.
- Risque de verrouillage et perte temporaire d'historique si une erreur survient hors transaction appelante.

Recommandation exacte :
- Ajouter une stratégie incrémentale : insérer/mettre à jour seulement les lignes du document validé ou annulé, puis recalculer uniquement le dernier prix du produit concerné.
- Garder un job admin de reconstruction complète séparé.

### P1 - Listes critiques sans pagination serveur

Fichiers concernés :
- `backend/src/sales/sales.service.ts`
- `backend/src/purchases/purchases.service.ts`
- `backend/src/payments/payments.service.ts`
- `backend/src/stock/stock.service.ts`
- `backend/src/caisse/caisse.service.ts`
- `frontend/src/components/stockini/pages/StockMovementsPage.tsx`
- `frontend/src/components/stockini/pages/PaymentsPage.tsx`
- `frontend/src/components/stockini/DepensesPage.tsx`

Preuves :
- `findAll` ventes, achats, paiements et historiques font des `findMany` sans `take/skip` (`backend/src/sales/sales.service.ts:315`, `backend/src/purchases/purchases.service.ts:69`, `backend/src/payments/payments.service.ts:33`, `backend/src/stock/stock.service.ts:86`, `backend/src/caisse/caisse.service.ts:56`).
- `StockMovementsPage` charge tout puis filtre côté client (`frontend/src/components/stockini/pages/StockMovementsPage.tsx:88` à `frontend/src/components/stockini/pages/StockMovementsPage.tsx:132`).
- `PaymentsPage` et `DepensesPage` filtrent les paiements côté client (`frontend/src/components/stockini/pages/PaymentsPage.tsx:56`, `frontend/src/components/stockini/DepensesPage.tsx:114`).

Risque performance/UX :
- Temps de chargement et mémoire navigateur dégradés dès que l'historique grossit.

Recommandation exacte :
- Ajouter pagination, filtres serveur, tri et total count aux endpoints ventes, achats, paiements, stock movements et caisse.
- Ajouter index composés utiles : `Sale(documentType, status, createdAt)`, `Payment(type, createdAt)`, `StockMovement(productId, createdAt)`, `CaisseMovement(type, createdAt)`.

## Bugs mineurs

### P2 - Logs debug en production

Fichier concerné :
- `frontend/src/components/stockini/pages/SalesPage.tsx`
- `backend/src/sales/sales.controller.ts`

Preuves :
- `console.log` payload frontend (`frontend/src/components/stockini/pages/SalesPage.tsx:297`, `frontend/src/components/stockini/pages/SalesPage.tsx:328`, `frontend/src/components/stockini/pages/SalesPage.tsx:401`).
- `console.log('DTO RECEIVED')` backend (`backend/src/sales/sales.controller.ts:24`).

Recommandation exacte :
- Supprimer ou remplacer par `Logger.debug` conditionné à l'environnement.

### P2 - Validation frontend incomplète sur limites numériques

Fichiers concernés :
- `frontend/src/components/stockini/pages/ProductsPage.tsx`
- `frontend/src/components/stockini/pages/PurchasesPage.tsx`
- `frontend/src/components/stockini/DepensesPage.tsx`

Preuves :
- Produit : validation TVA seulement `< 0`, pas `> 100`, malgré input `max=100` (`frontend/src/components/stockini/pages/ProductsPage.tsx:128`).
- Achat : le formulaire envoie `quantity`, `unitCost`, `paidAmount` depuis `cleanPayload` sans validation UI métier (`frontend/src/components/stockini/pages/PurchasesPage.tsx:39` à `frontend/src/components/stockini/pages/PurchasesPage.tsx:44`).
- Dépôt/retrait caisse : soumission basée sur `!caisseForm.montant`, pas sur `Number(montant) > 0` (`frontend/src/components/stockini/DepensesPage.tsx:136` à `frontend/src/components/stockini/DepensesPage.tsx:153`).

Recommandation exacte :
- Ajouter validation locale cohérente avec DTOs : quantité entière > 0, prix > 0 si requis, TVA 0..100, montant > 0.

### P2 - UI achat ne permet pas la réception

Fichiers concernés :
- `frontend/src/components/stockini/pages/PurchasesPage.tsx`
- `frontend/src/lib/stockini/api.ts`

Preuves :
- L'API frontend expose `receivePurchase` (`frontend/src/lib/stockini/api.ts:72`), mais `PurchasesPage` ne fournit aucune action de réception, seulement delete (`frontend/src/components/stockini/pages/PurchasesPage.tsx:91`).

Recommandation exacte :
- Ajouter action "Réceptionner" sur achats `ORDERED`/`PARTIALLY_RECEIVED`.
- Afficher `receivedQuantity` par ligne et bloquer les quantités supérieures au restant.

### P2 - Historique caisse sans référence unique ou lien métier fort

Fichiers concernés :
- `backend/prisma/schema.prisma`
- `backend/src/caisse/caisse.service.ts`

Preuves :
- `CaisseMovement.referenceDoc` est une simple chaîne non unique et non indexée (`backend/prisma/schema.prisma:598`, index absents à `backend/prisma/schema.prisma:603` à `backend/prisma/schema.prisma:605`), alimentée par `CaisseService.recordMovement` (`backend/src/caisse/caisse.service.ts:101`).
- Le service stocke seulement `Math.abs(input.montant)` et encode le sens par type (`backend/src/caisse/caisse.service.ts:94` à `backend/src/caisse/caisse.service.ts:103`).

Recommandation exacte :
- Ajouter `paymentId`, `saleId`, `purchaseId` optionnels ou une contrainte unique par source.
- Ajouter index sur `referenceDoc`.

## Risques métier

- Devis : le code force `paidAmount=0` et refuse la validation (`backend/src/sales/sales.service.ts:145`, `backend/src/sales/sales.service.ts:248`) : conforme.
- Bon de commande : pas d'impact par défaut, mais `reserveStock` crée un vrai mouvement de sortie : risque de confusion stock réservé/physique.
- Bon de livraison/facture : validation diminue le stock (`backend/src/sales/sales.service.ts:258` à `backend/src/sales/sales.service.ts:285`) : conforme.
- Bon de réception : `receive` augmente le stock (`backend/src/purchases/purchases.service.ts:124`) : conforme, mais UI manquante.
- Paiement encaissé/dépense : endpoints dédiés impactent la caisse, mais pas les paiements initiaux ni suppression/annulation paiement.
- Annulation : vente inverse stock/caisse partiellement ; achat annulation ne fait pas d'inverse.
- Double impact : stock protégé par `stockImpactDone`, caisse non protégée.

## Risques techniques

- Transactions présentes sur les opérations fortes, mais plusieurs mises à jour financières génériques restent non atomiques avec la caisse.
- Recalcul dernier prix vente coûteux et destructif.
- Recherche produit utilise `contains` insensible à la casse sans index trigram/full text (`backend/src/products/products.service.ts:46` à `backend/src/products/products.service.ts:54`).
- Gros tableaux sans pagination serveur.
- Références générées avec `ReferenceCounter` et unique DB : bonne base, mais `peekNextReference` est seulement indicatif et peut diverger en concurrence (`backend/src/references/reference-generator.service.ts:110`).

## Risques sécurité

- Validation globale stricte activée (`backend/src/main.ts:9` à `backend/src/main.ts:14`) : point positif.
- Permissions présentes sur controllers ventes, achats, paiements, stock.
- Risque : `CreatePaymentDto` permet de créer un paiement arbitraire via `/payments` sans vérifier cohérence sale/purchase/customer/supplier et sans impact caisse (`backend/src/payments/payments.service.ts:20` à `backend/src/payments/payments.service.ts:30`).
- Risque : logs payload/DTO peuvent exposer données commerciales.
- Risque : CORS ouvert sans restriction (`backend/src/main.ts:7`).

## Synthèse des priorités

- P0 : impacts caisse initiaux, `cashImpactDone`, suppression paiement.
- P1 : annulation achat, séparation réservation/stock physique, blocage updates financiers génériques, pagination serveur.
- P2 : réception achat UI, validations frontend, logs debug, index recherche.
- P3 : polish UX responsive, libellés métiers, exports/reporting.
