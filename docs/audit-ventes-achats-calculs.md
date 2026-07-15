# Audit des calculs — Ventes et Achats

Date de l'audit : 15 juillet 2026  
Révision analysée : `797643f` (`main`)  
Périmètre : frontend Next.js, API NestJS, Prisma/PostgreSQL, documents, paiements, Dashboard et Rapports.

## 1. Résumé exécutif

Le backend est la source de vérité lors de l'enregistrement : il recalcule les lignes, les taxes et les totaux à partir des produits et des données de ligne. Les montants calculés par le frontend servent surtout à la prévisualisation et aux contrôles avant envoi.

Les principaux constats sont les suivants :

1. La remise d'une vente n'est pas appliquée comme un pourcentage du prix de vente brut. Le moteur soustrait directement le nombre de points de remise au taux de marge :

   `marge nette % = marge brute % - remise %`

   puis :

   `prix net HT = prix d'achat HT × (1 + marge nette % / 100)`

   Une « remise 15 % » n'est donc pas une réduction de 15 % du prix affiché avant remise.

2. Cette formule explique l'erreur de marge après remise. Avec un coût de 100 DT, une marge brute de 40 % et une remise de 15 %, le système produit 125 DT et annonce 25 % de marge. Une remise commerciale conventionnelle produirait 119 DT et une marge réelle sur coût de 19 %.

3. L'origine technique est confirmée par l'historique Git. Le commit `482688a` (« corriger le marge ») avait introduit la remise multiplicative, la conservation du prix brut et `decimal.js`; le commit suivant `25dbd23` avait ajouté le snapshot du coût d'achat. Le rollback global `797643f` a supprimé ces changements et restauré la formule `marge - remise`, les calculs en `number` et l'absence de snapshot du coût.

4. Frontend et backend utilisent actuellement le même moteur de vente dupliqué, donc ils concordent dans le cas standard. Cette concordance valide toutefois une convention de calcul incorrecte ou, au minimum, trompeuse par rapport au libellé « Remise % ».

5. Les achats utilisent bien une remise multiplicative conventionnelle :

   `net HT = quantité × coût unitaire × (1 - remise % / 100)`

   En revanche, le frontend arrondit chaque étape à 3 décimales alors que le backend calcule plusieurs étapes en `number` sans arrondi explicite avant insertion. PostgreSQL arrondit ensuite chaque champ `Decimal(12,3)`. Des écarts de 0,001 DT sont donc possibles.

6. Le « bénéfice estimé » des rapports n'est pas une marge commerciale : il vaut `CA TTC avec timbre - achats TTC avec timbre`. Il ne repose ni sur le coût des marchandises réellement vendues, ni sur un snapshot du coût, et ne déduit pas les dépenses. Il inclut aussi tous les achats non annulés, y compris les bons de commande.

7. Les rapports peuvent compter deux fois un flux transformé `BON_LIVRAISON → FACTURE`, car le filtre de chiffre d'affaires inclut les deux types sans exclure le BL dont `transformedToId` est renseigné.

## 2. Architecture des modules

### 2.1 Ventes

```text
Page Ventes
  frontend/src/app/(dashboard)/ventes/page.tsx
        │
        ├─ grille et recalcul de ligne
        │  frontend/src/components/stockini/register/ProductLineRow.tsx
        │  frontend/src/components/stockini/register/ProductRegisterGrid.tsx
        │
        ├─ fonctions métier frontend
        │  frontend/src/lib/salesCalculations.ts
        │  frontend/src/lib/stockini/register-utils.ts
        │
        └─ POST/PATCH /api/sales
                 │
                 ├─ validation DTO
                 │  backend/src/sales/dto/sale.dto.ts
                 │
                 ├─ recalcul autoritaire
                 │  backend/src/sales/sales.service.ts
                 │  backend/src/common/utils/sales-calculations.ts
                 │
                 ├─ Prisma/PostgreSQL
                 │  Sale, SaleItem, Product, ProductPriceHistory
                 │
                 ├─ enrichissement de réponse
                 │  CommercialDocumentInterceptor
                 │
                 └─ consommateurs
                    PDF / Documents / Paiements / Dashboard / Rapports
```

Types de documents : `DEVIS`, `BON_COMMANDE`, `BON_LIVRAISON`, `FACTURE`; les avoirs suivent un module séparé. `BON_LIVRAISON` et `FACTURE` impactent immédiatement le stock. Les transformations créent une nouvelle ligne `Sale` et lient source/cible par `sourceDocumentId` et `transformedToId`.

### 2.2 Achats

```text
Page Achats
  frontend/src/app/(dashboard)/achats/page.tsx
        │
        ├─ grille et recalcul de ligne
        │  PurchaseLineRow.tsx / PurchaseRegisterGrid.tsx
        │
        ├─ fonctions partagées
        │  frontend/src/lib/stockini/register-utils.ts
        │
        └─ POST/PATCH /api/purchases
                 │
                 ├─ validation DTO
                 │  backend/src/purchases/dto/purchase.dto.ts
                 │
                 ├─ recalcul autoritaire
                 │  backend/src/purchases/purchases.service.ts
                 │
                 ├─ Prisma/PostgreSQL
                 │  Purchase, PurchaseItem, Product
                 │
                 └─ transformation/réception/paiement/rapports
```

Tous les achats sont initialement créés comme `BON_COMMANDE`, puis éventuellement transformés en `BON_RECEPTION` ou `FACTURE_FOURNISSEUR`. Un bon de commande n'est pas payable, mais ses montants sont néanmoins inclus dans les agrégats généraux des rapports.

### 2.3 Produits et prix de référence

Le prix d'achat maître se trouve dans `Product.purchasePrice` et représente un prix HT. À la création ou modification manuelle d'un produit, le backend dérive :

- `purchasePriceTtc = round3(purchasePrice × (1 + TVA / 100))` ;
- `salePrice = round3(purchasePrice × 1,4)` ;
- marge catalogue par défaut : 40 % sur le coût HT ;
- `salePrice` est HT depuis la migration `20260518000000_fix_sale_price_ht`.

Une réception d'achat modifie le stock, mais ne remplace pas `Product.purchasePrice`, `purchasePriceTtc` ou `salePrice` par le coût de la ligne reçue. Il n'existe donc ni coût moyen pondéré ni mise à jour automatique du prix d'achat depuis les achats.

## 3. Inventaire des fonctions et formules actuelles

### 3.1 Frontend — prix produits

Fichier : `frontend/src/lib/stockini/pricing.ts`

| Fonction | Formule actuelle | Arrondi interne |
|---|---|---|
| `calcPurchasePriceTtc` | `achat HT × (1 + TVA / 100)` | aucun |
| `calcSalePrice` | `achat HT × 1,4` | aucun |
| `roundPrice` | `Math.round(valeur × 10^d) / 10^d` | 3 décimales par défaut |

Les écrans Produits appellent ensuite `roundPrice`. Le backend effectue directement l'arrondi à 3 décimales dans son utilitaire équivalent.

### 3.2 Frontend — moteur de vente

Fichier : `frontend/src/lib/salesCalculations.ts`

`calculateSalesLine` applique, dans cet ordre :

```text
PA_HT                 = max(0, prixAchatHT)
margeBrutePct         = marge fournie, sinon 40
remisePct             = max(0, remise)
TVAPct                 = max(0, TVA)
quantité               = max(0, quantité)

margeNettePct         = round3(margeBrutePct - remisePct)
PU_HT_avant_remise    = round3(PA_HT × (1 + margeBrutePct / 100))
PU_HT                 = round3(PA_HT × (1 + margeNettePct / 100))
PU_TTC                 = round3(PU_HT × (1 + TVAPct / 100))
montantRemiseLigne    = round3((PU_HT_avant_remise - PU_HT) × quantité)
margeDTUnitaire       = round3(PU_HT - PA_HT)
totalHTLigne          = round3(PU_HT × quantité)
TVAligne              = round3(totalHTLigne × TVAPct / 100)
totalTTCLigne         = round3(totalHTLigne + TVAligne)
```

`salesRound3` utilise `Math.round(value × 1000) / 1000`. `toSalesNumber` convertit les chaînes et accepte la virgule en la remplaçant par un point.

### 3.3 Frontend — registre Ventes/Achats

Fichier : `frontend/src/lib/stockini/register-utils.ts`

Fonctions de vente :

| Fonction | Rôle / formule |
|---|---|
| `calcDefaultSellingPriceHt` | `round3(PA_HT × 1,4)` |
| `calcNetUnitPriceHt` | `round3(PU_HT × (1 - remise / 100))` |
| `calcMargeAmount` | `calcNetUnitPriceHt(PU_HT, remise) - PA_HT` |
| `calcMargePercent` | `(prix net - PA_HT) / PA_HT × 100`, arrondi à 2 décimales |
| `recalculateSaleLine` | appelle le moteur `calculateSalesLine`, donc utilise réellement `marge - remise` |
| `calculateSalesDocumentTotals` | somme les résultats déjà arrondis du moteur de vente |
| `calculateSaleMargeTotals` | `Σ(marge unitaire × quantité)` puis division par `Σ(PA_HT × quantité)` |

Il existe donc deux familles de fonctions contradictoires dans le même fichier :

- `calcNetUnitPriceHt`, `calcMargeAmount` et `calcMargePercent` décrivent une remise multiplicative conventionnelle ;
- le flux Ventes actif (`recalculateSaleLine`) ne les utilise pas et passe par `calculateSalesLine`, qui soustrait la remise à la marge.

Les fonctions `calcMargeAmount` et `calcMargePercent` sont utilisées par `recalculateLine`, le flux générique d'achat, où leurs résultats de marge ne sont pas affichés. Elles ne pilotent pas la marge de la vente.

Totaux Ventes actifs :

```text
totalHT       = round3(Σ totalHTLigne)
totalRemise   = round3(Σ montantRemiseLigne)
totalTVA      = round3(Σ TVAligne)
totalTTC      = round3(totalHT + totalTVA)
timbre        = 1,000 DT fixe
totalFinal    = round3(totalTTC + timbre)
```

Marge totale affichée dans la grille Ventes :

```text
margeTotaleDT = round3(Σ(margeDTUnitaire × quantité))
coûtTotalHT   = round3(Σ(PA_HT × quantité))
margeTotale%  = margeTotaleDT / coûtTotalHT × 100
```

Il s'agit d'un taux de marque sur coût, pas d'un taux de marge sur chiffre d'affaires.

Fonctions d'achat :

```text
brutHTLigne        = round3(quantité × PU_achat_HT)
remiseLigne        = round3(brutHTLigne × remisePct / 100)
netHTLigne         = round3(brutHTLigne - remiseLigne)
netTTCLigne        = round3(netHTLigne × (1 + TVA / 100))

totalBrutHT        = round3(Σ brutHTLigne)
totalHT            = round3(Σ netHTLigne)
totalRemise        = round3(totalBrutHT - totalHT)
totalTVA           = round3(Σ round3(netHTLigne × TVA / 100))
totalTTC           = round3(totalHT + totalTVA)
totalFinal         = round3(totalTTC + timbre saisi)
```

Note : `PurchaseRegisterGrid` affiche un timbre fixe de 1 DT issu de `calculateDocumentTotals`, tandis que la page Achats possède un champ de timbre modifiable et recalcule séparément `totalToPay = totals.totalTtc + stampDutyNum`. La valeur réellement envoyée et persistée est celle du champ de la page.

### 3.4 Frontend — saisie manuelle et vue détail

Dans `ProductLineRow.tsx`, une modification manuelle du PU HT est convertie en marge brute implicite :

```text
margeBruteSaisie = ((nouveauPU / PA_HT) - 1) × 100 + remisePct
```

Le moteur soustrait ensuite `remisePct`, ce qui reconstitue le PU saisi. Le champ `manualUnitPriceHt` est documenté comme devant figer le prix, mais `recalculateSaleLine` ne lit jamais ce booléen dans la version courante.

Dans `SaleDetailsModal.tsx`, la marge nette est recalculée ainsi :

```text
margeNette% = (SaleItem.unitPrice - Product.purchasePrice courant)
              / Product.purchasePrice courant × 100
```

Cette vue utilise le coût actuel du produit, pas le coût au jour de la vente. Une modification ultérieure de `Product.purchasePrice` change donc rétroactivement la marge affichée sur les anciennes ventes.

### 3.5 Backend — prix produits

Fichier : `backend/src/common/utils/pricing.util.ts`

```text
purchasePriceTtc = round3(purchasePriceHt × (1 + TVA / 100))
salePriceHt      = round3(purchasePriceHt × 1,4)
```

Ces formules sont appelées par `ProductsService.derivePrices` à la création et lors d'une modification de `purchasePrice` ou `tva`.

### 3.6 Backend — Ventes

Fichiers : `backend/src/common/utils/sales-calculations.ts` et `backend/src/sales/sales.service.ts`.

Le moteur backend est presque une copie du moteur frontend et utilise les mêmes formules `margeBrute - remise` et les mêmes arrondis intermédiaires à 3 décimales.

À la création et à la modification d'une vente :

1. le backend recharge le produit et prend `Product.purchasePrice` et `Product.tva` comme autorités ;
2. il recalcule chaque ligne avec `calculateSalesLine` ;
3. si le prix d'achat est positif, le `unitPrice` envoyé par le frontend est ignoré au profit du prix recalculé ;
4. il bloque hors devis si le prix d'achat est nul ;
5. il bloque sous 20 % de marge nette sauf permission `sales.allow_low_margin` ;
6. il somme les lignes et persiste les résultats.

Persistance d'une ligne de vente actuelle :

```text
SaleItem.unitPrice      = PU HT déjà net selon (marge - remise)
SaleItem.discountPercent= remise saisie, conservée comme métadonnée
SaleItem.marginPercent  = marge brute saisie
SaleItem.finalUnitPrice = même PU HT net
SaleItem.total          = PU HT net × quantité
```

`unitPrice` ne représente donc pas un prix brut avant remise, malgré la présence séparée de `discountPercent`. Réappliquer `discountPercent` à `unitPrice` provoquerait une double remise sur les lignes récentes.

Persistance du document :

```text
Sale.subtotal = Σ SaleItem.total = total HT net
Sale.discount = Σ différence entre prix fondé sur marge brute
                et prix fondé sur (marge - remise)
Sale.tax      = Σ TVA sur HT net
Sale.total    = subtotal + tax = TTC hors timbre
Sale.stampDuty= 1,000 DT, non accepté dans le DTO de vente
```

Le nom `subtotal` désigne donc un total HT après remise. `discount` est informatif et ne doit pas être soustrait une seconde fois.

### 3.7 Backend — Achats

Fichier : `backend/src/purchases/purchases.service.ts`.

Création et modification avec tarification par ligne :

```text
brutHTLigne     = quantité × unitCost
remiseLigne     = brutHTLigne × remisePct / 100
netHTLigne      = brutHTLigne - remiseLigne
TVAligne        = netHTLigne × TVAPct / 100

subtotal        = Σ netHTLigne
discount        = Σ remiseLigne
tax             = Σ TVAligne
total           = subtotal + tax
totalFinal      = round3(total + stampDuty)
remainingAmount = totalFinal à la création
```

Pour compatibilité avec d'anciens appels sans `discountPercent` ni `tvaPercent`, le service peut utiliser les montants documentaires `dto.discount` et `dto.tax`. La page Achats actuelle envoie toujours les taux de ligne, donc les montants documentaires reçus sont ignorés au profit du recalcul backend.

`PurchaseItem.unitCost` est le coût unitaire brut HT avant remise et `PurchaseItem.total` est le net HT de la ligne. Le prix maître du produit n'est pas mis à jour.

### 3.8 Timbre fiscal, paiement et reste à payer

Fonction commune : `commercialTotalFinal` dans `backend/src/common/utils/commercial-document.ts`.

```text
totalFinal = round3(totalTTC_hors_timbre + timbreFiscal)
remainingAmount = max(totalFinal - paidAmount, 0)
```

Valeur par défaut : 1 DT.

- Ventes : timbre imposé à 1 DT par le backend ; le DTO ne permet pas de le saisir.
- Achats : timbre saisi par l'UI et accepté par le DTO, défaut 1 DT.
- Paiements : après ajout ou suppression, `paidAmount` est recomposé et le reste à payer est recalculé avec le timbre.
- Statut : `UNPAID` si payé ≤ 0, `PARTIAL` si payé < total final, `PAID` sinon.
- L'intercepteur global ajoute aux réponses `totalHT=subtotal`, `totalTVA=tax`, `totalTTC=total` et `totalFinal=total+stampDuty` sans modifier les colonnes persistées.

### 3.9 Dernier prix de vente

`SalesService.recalculateLastSalePricesForProducts` alimente `ProductPriceHistory.prixVente` et `Product.lastSellingPrice` en TTC.

- Ligne historique (`marginPercent IS NULL`) : `unitPrice × quantité × (1 - remise/100)`.
- Ligne récente (`marginPercent IS NOT NULL`) : `unitPrice × quantité`, car `unitPrice` contient déjà le net de remise.
- Une éventuelle remise documentaire historique résiduelle est répartie au prorata des lignes.
- Le net TTC unitaire est arrondi via `Prisma.Decimal(...).toDecimalPlaces(3)`.

Cette branche de compatibilité confirme que la sémantique du champ `unitPrice` varie selon l'âge des données.

## 4. Flux complet UI → API → base → Dashboard/Rapports

### 4.1 Vente

1. L'utilisateur sélectionne un produit. L'UI charge `purchasePrice`, `salePrice` et `tva` depuis `/products`.
2. Si `purchasePrice > 0`, l'UI ignore `salePrice` et construit le PU à partir du coût, de la marge par défaut de 40 % et de la remise.
3. La grille recalcule marge, net HT, net TTC et totaux à chaque modification.
4. Le payload contient `productId`, quantité, `unitPrice`, `discountPercent` et `marginPercent`. Il n'envoie ni TVA ni totaux documentaires.
5. Le DTO convertit et valide les nombres.
6. `SalesService` recharge le produit, reprend son coût et sa TVA courants, ignore le PU soumis pour un produit avec coût, puis recalcule tout.
7. Prisma écrit les nombres JS dans des colonnes `Decimal`; PostgreSQL les quantifie à l'échelle déclarée.
8. L'intercepteur enrichit la réponse avec les alias de totaux.
9. Les PDF et vues détail lisent les montants persistés. Les PDF ne recalculent pas la remise ; ils affichent `unitPrice`, `SaleItem.total`, `Sale.discount`, TVA et timbre.
10. Les paiements travaillent sur `Sale.total + stampDuty`.
11. Les rapports agrègent `Sale.total`, `stampDuty`, `totalRefunded` et `remainingAmount` après conversion des `Decimal` en `number`.

### 4.2 Achat

1. L'utilisateur sélectionne un produit ; le coût proposé est `Product.purchasePrice`.
2. L'UI permet de modifier coût, remise, TVA et timbre, puis recalcule les lignes et totaux.
3. Le payload envoie aussi `discount` et `tax`, mais surtout chaque `unitCost`, `discountPercent` et `tvaPercent`.
4. Le backend détecte la tarification par ligne, ignore alors les montants documentaires envoyés et recalcule les lignes.
5. Prisma persiste le document et ses lignes en `Decimal(12,3)` / `Decimal(5,2)`.
6. La transformation en réception applique les mouvements de stock, sans changer les prix du produit.
7. Les paiements ne deviennent possibles qu'après transformation hors `BON_COMMANDE`.
8. Les rapports agrègent pourtant tous les achats non annulés, y compris les bons de commande.

### 4.3 Dashboard et Rapports

Le Dashboard principal actif (`SimpleDashboard`) charge des listes paginées via `/sales` et `/purchases`, puis :

- compte toutes les ventes non annulées sans filtrer le type de document ;
- construit le CA graphique avec `Σ Sale.total`, sans timbre et sans remboursement ;
- ne calcule pas de marge commerciale ;
- ne récupère que la première page par défaut, donc ses nombres et séries peuvent être incomplets au-delà de 20 enregistrements.

La page Rapports (`AnalyticsDashboard`) consomme `/reports/overview`. Le backend calcule :

```text
CA net = Σ(Sale.total + Sale.stampDuty - Sale.totalRefunded)
         pour FACTURE et BON_LIVRAISON non annulés

Total achats = Σ(Purchase.total + Purchase.stampDuty)
               pour tout achat non annulé

Bénéfice estimé = CA net - Total achats
Marge rapport % = Bénéfice estimé / CA net × 100
```

Conséquences :

- le CA et les achats sont TTC et incluent le timbre ;
- les dépenses sont calculées et affichées séparément mais non soustraites du bénéfice ;
- le coût des achats de la période remplace le coût des articles effectivement vendus ;
- les variations de stock ne sont pas intégrées ;
- un achat commandé mais non reçu réduit déjà le bénéfice ;
- un stock acheté avant la période mais vendu pendant la période n'a aucun coût dans ce bénéfice ;
- un achat fait pendant la période pour du stock non vendu réduit entièrement le bénéfice ;
- un BL transformé en facture peut être agrégé deux fois, le BL source restant non annulé et le filtre des rapports n'excluant pas `transformedToId != null`.

Le Dashboard historique `/reports/dashboard`, encore exposé mais non utilisé par le Dashboard principal actuel, calcule `salesTotal = Σ(total + stampDuty)` uniquement sur les factures terminées.

La Caisse emploie également le mot « Profit », mais sa formule est un flux de trésorerie : `entrées - sorties`. Elle ne doit pas être confondue avec la marge brute ni avec le bénéfice estimé des rapports.

## 5. Différences Frontend / Backend

| Sujet | Frontend | Backend | Risque |
|---|---|---|---|
| Vente standard | moteur `marge - remise` | même moteur | concordant mais sémantique de remise incorrecte/trompeuse |
| PU vente soumis | calculé et envoyé | ignoré si coût produit > 0 | backend autoritaire ; le champ envoyé n'est pas la source de vérité |
| TVA vente | affichée depuis le produit | relue depuis le produit | changement concurrent possible entre affichage et sauvegarde |
| Timbre vente | 1 DT fixe | 1 DT fixe | concordant |
| Remise achat | multiplicative et arrondie par étape | multiplicative, sans arrondi explicite par étape | écarts possibles de 0,001 DT |
| Timbre achat affiché dans la grille | 1 DT fixe | valeur du champ de page | grille potentiellement incohérente si le timbre est modifié |
| Totaux achat soumis | envoyés | recalculés/ignorés si taux de ligne présents | backend autoritaire |
| Marge vue détail | coût produit courant | aucun calcul de marge persisté | historique instable |
| Bénéfice rapport | affichage seul | CA TTC - achats TTC | ne mesure pas le bénéfice commercial réel |
| Dashboard principal | calcul local sur première page | fournit seulement les listes paginées | données incomplètes et filtres différents des rapports |

## 6. Arrondis, `Number` et `Decimal`

### 6.1 Stockage Prisma

Principales échelles :

- montants : `Decimal(12,3)` ;
- remise et TVA : `Decimal(5,2)` ;
- marge de ligne : `Decimal(7,3)` ;
- quantités de vente/achat : `Int`.

Prisma renvoie des `Prisma.Decimal`, mais la majorité des services les convertit immédiatement avec `Number(...)`, effectue les calculs en virgule flottante IEEE-754, puis laisse la base arrondir à 3 décimales lors de l'écriture.

### 6.2 Ventes

Les moteurs frontend et backend arrondissent explicitement à 3 décimales à presque chaque étape. Cela limite les divergences UI/API, mais produit un modèle « somme de lignes arrondies ». `Math.round` n'ajoute pas `Number.EPSILON` et n'exprime pas explicitement un mode comptable tel que `ROUND_HALF_UP` ; certains cas binaires proches d'un demi-millime peuvent donc être arrondis de manière inattendue.

### 6.3 Achats

Le frontend arrondit brut, remise, net, TVA et totaux. Le backend conserve les valeurs binaires non arrondies jusqu'à l'insertion. De plus :

- `PurchaseItem.total` est arrondi par la colonne de ligne ;
- `Purchase.subtotal` est arrondi séparément à partir de la somme non arrondie ;
- la somme des `PurchaseItem.total` persistés peut donc différer de `Purchase.subtotal` de quelques millimes sur plusieurs lignes.

### 6.4 Rapports

Les agrégats SQL sont exacts en `Decimal`, puis `num()` les convertit en `number`. Les résultats finaux monétaires utilisent `toFixed(3)` puis l'opérateur unaire `+`; les pourcentages utilisent `toFixed(2)`. L'exactitude décimale est donc perdue au stade des opérations métier, même si l'affichage revient à 3 décimales.

### 6.5 Régression historique

Le commit `482688a` utilisait `decimal.js` avec précision 28 et `ROUND_HALF_UP` dans les deux moteurs Ventes. Le rollback `797643f` a supprimé la dépendance et rétabli `number`/`Math.round`. Cette suppression est directement liée à la version actuellement auditée.

## 7. Exemple détaillé

Hypothèses :

- prix d'achat HT : 100 DT ;
- marge brute : 40 % ;
- remise affichée : 15 % ;
- quantité : 2 ;
- TVA : 19 % ;
- timbre : 1 DT.

### 7.1 Résultat actuel

```text
Marge nette             = 40 - 15 = 25 %
PU HT avant remise      = 100 × 1,40 = 140,000
PU HT actuel            = 100 × 1,25 = 125,000
Remise enregistrée      = (140 - 125) × 2 = 30,000
Total HT                = 125 × 2 = 250,000
TVA                     = 250 × 19 % = 47,500
Total TTC               = 297,500
Total à payer           = 298,500
Marge DT                = (125 - 100) × 2 = 50,000
Marge sur coût          = 50 / 200 = 25,00 %
```

La réduction effective par rapport au prix brut est `15 / 140 = 10,714 %`, pas 15 %.

### 7.2 Résultat d'une remise commerciale conventionnelle

```text
PU HT brut              = 100 × 1,40 = 140,000
Remise unitaire         = 140 × 15 % = 21,000
PU HT net               = 140 - 21 = 119,000
Remise totale           = 42,000
Total HT                = 238,000
TVA                     = 45,220
Total TTC               = 283,220
Total à payer           = 284,220
Marge DT                = (119 - 100) × 2 = 38,000
Marge sur coût          = 38 / 200 = 19,00 %
```

Écart causé par la formule actuelle :

- prix net surévalué de 6 DT par unité ;
- remise sous-évaluée de 12 DT sur deux unités ;
- marge annoncée 25 % au lieu de 19 % ;
- le contrôle de seuil à 20 % autorise la vente actuelle, alors que la marge réelle après une remise conventionnelle serait de 19 % et devrait être bloquée sans permission.

## 8. Origine probable du bug de marge

La cause immédiate se trouve dans `calculateSalesLine`, frontend et backend :

```text
netMarginPercent = grossMarginPercent - discountPercent
unitPriceHt       = purchasePriceHt × (1 + netMarginPercent / 100)
```

Cette formule assimile deux pourcentages qui n'ont pas la même base :

- la marge est exprimée sur le coût d'achat ;
- la remise commerciale est normalement exprimée sur le prix de vente brut.

Mathématiquement, avec une marge brute `m` et une remise `r`, la marge nette sur coût devrait être :

```text
margeNetteSurCoût = ((1 + m/100) × (1 - r/100) - 1) × 100
```

et non `m - r`.

La cause historique est le rollback global `797643f`, qui annule notamment la correction de marge de `482688a` et les snapshots financiers ajoutés par `25dbd23`. Son diff retire précisément :

- `grossSalePriceHt` comme entrée et valeur persistée ;
- `netSalePriceHt = grossSalePriceHt × (1 - remise/100)` ;
- le calcul de marge à partir du net et du coût ;
- le snapshot du coût d'achat par ligne ;
- `decimal.js` et l'arrondi `ROUND_HALF_UP` ;
- les totaux centralisés `calculateSalesTotals`.

La migration `20260703010000_add_sale_item_margin_percent` conserve pourtant un commentaire indiquant que `marginPercent` est la marge brute et que les anciennes lignes utilisaient une remise multiplicative. La version applicative courante utilise au contraire `marginPercent != null` comme marqueur des nouvelles lignes dont `unitPrice` est déjà net selon `marge - remise`. Le schéma, les commentaires de migration et le comportement courant ne racontent donc plus exactement la même histoire.

## 9. Autres anomalies et risques connexes

### Critiques

1. Aucune ligne de vente ne fige le coût d'achat historique. Le modèle ne permet pas de recalculer fiablement la marge réelle après modification du produit.
2. `unitPrice` a deux sémantiques selon les données : brut pour certaines lignes historiques, net pour les lignes actuelles.
3. Les rapports peuvent doubler BL et facture issus d'une transformation.
4. Le bénéfice estimé compare chiffre d'affaires et achats de période au lieu du coût des marchandises vendues.

### Importants

1. Les bons de commande fournisseur sont inclus dans `totalAchats` et le bénéfice.
2. Les dépenses sont absentes de la formule du bénéfice malgré leur agrégation.
3. La grille achat affiche toujours 1 DT de timbre même si le champ de page contient une autre valeur.
4. Le Dashboard principal calcule ses séries sur une liste paginée et avec des filtres différents des rapports.
5. Les achats n'ont pas une politique d'arrondi commune entre frontend et backend.

### Modérés

1. `manualUnitPriceHt` est un état mort par rapport à son commentaire.
2. Le DTO de vente accepte `discount` et `tax`, mais le service ne les utilise pas dans le flux actuel.
3. Le montant `discount` est présenté comme « remise incluse » : cette formulation est indispensable puisque `subtotal` est déjà net ; une autre couche pourrait facilement le soustraire à tort.
4. Les PDF affichent le PU net actuel à côté d'une remise incluse au niveau du résumé, ce qui ne permet pas de reconstituer intuitivement le prix brut.

## 10. Fichiers concernés

### Frontend

- `frontend/src/app/(dashboard)/ventes/page.tsx`
- `frontend/src/app/(dashboard)/achats/page.tsx`
- `frontend/src/components/stockini/register/ProductLineRow.tsx`
- `frontend/src/components/stockini/register/ProductRegisterGrid.tsx`
- `frontend/src/components/stockini/register/PurchaseLineRow.tsx`
- `frontend/src/components/stockini/register/PurchaseRegisterGrid.tsx`
- `frontend/src/lib/salesCalculations.ts`
- `frontend/src/lib/stockini/register-utils.ts`
- `frontend/src/lib/stockini/pricing.ts`
- `frontend/src/components/stockini/SaleDetailsModal.tsx`
- `frontend/src/lib/stockini/salesPdf.ts`
- `frontend/src/components/stockini/SimpleDashboard.tsx`
- `frontend/src/components/stockini/AnalyticsDashboard.tsx`
- `frontend/src/lib/stockini/api.ts`
- `frontend/src/lib/stockini/types.ts`

### Backend

- `backend/src/common/utils/sales-calculations.ts`
- `backend/src/common/utils/pricing.util.ts`
- `backend/src/common/utils/commercial-document.ts`
- `backend/src/common/interceptors/commercial-document.interceptor.ts`
- `backend/src/sales/sales.service.ts`
- `backend/src/sales/dto/sale.dto.ts`
- `backend/src/purchases/purchases.service.ts`
- `backend/src/purchases/dto/purchase.dto.ts`
- `backend/src/products/products.service.ts`
- `backend/src/payments/payments.service.ts`
- `backend/src/reports/reports.service.ts`
- `backend/src/caisse/caisse.service.ts`
- `backend/src/documents/pdf.service.ts`
- `backend/src/documents/documents.service.ts`

### Prisma / migrations

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260508120000_product_pricing_ht_ttc/migration.sql`
- `backend/prisma/migrations/20260518000000_fix_sale_price_ht/migration.sql`
- `backend/prisma/migrations/20260703010000_add_sale_item_margin_percent/migration.sql`
- `backend/prisma/migrations/20260704000000_add_commercial_document_stamp_duty/migration.sql`
- `backend/prisma/migrations/20260707010000_add_purchase_editing/migration.sql`

## 11. Plan de correction recommandé

Ce plan est volontairement séquencé pour éviter de corriger l'UI sans traiter la compatibilité des données existantes.

### Phase 1 — fixer les définitions métier

1. Valider que « Remise % » signifie bien un pourcentage du prix de vente brut HT.
2. Nommer explicitement les deux indicateurs :
   - taux de marque sur coût : `(PV net HT - coût HT) / coût HT` ;
   - taux de marge sur CA : `(PV net HT - coût HT) / PV net HT`.
3. Décider lequel porte le seuil de 20 % et lequel est affiché dans les rapports.
4. Définir si le timbre et la TVA doivent être exclus des métriques de marge/bénéfice — recommandation : oui.

### Phase 2 — créer une source de vérité décimale partagée

1. Restaurer un moteur canonique avec les entrées `coût HT`, `prix brut HT`, `remise`, `TVA`, `quantité`.
2. Formule recommandée :

   ```text
   prixNetHT = prixBrutHT × (1 - remise/100)
   margeDT   = prixNetHT - coûtHT
   marque%   = margeDT / coûtHT × 100
   margeCA%  = margeDT / prixNetHT × 100
   ```

3. Utiliser `Prisma.Decimal` ou `decimal.js` pour les calculs backend et une politique `ROUND_HALF_UP` à 3 décimales.
4. Définir une règle unique d'arrondi : idéalement arrondir les montants unitaires légaux, puis les lignes, puis sommer les lignes persistées.
5. Partager des vecteurs de tests identiques frontend/backend, même si le code ne peut pas être partagé directement.

### Phase 3 — clarifier et migrer le modèle de données

1. Ajouter au minimum un snapshot `unitPurchaseCostHt` dans `SaleItem`.
2. Définir sans ambiguïté :
   - `unitPrice` = prix brut HT avant remise ;
   - `finalUnitPrice` = prix net HT après remise ;
   - `total` = net HT ligne.
3. Ajouter un marqueur/version de formule plutôt que déduire la sémantique de `marginPercent IS NULL`.
4. Écrire une migration/backfill prudente pour distinguer lignes historiques multiplicatives et lignes actuelles `marge-remise`.
5. Ne pas réinterpréter silencieusement les anciennes factures : conserver leurs montants légaux et seulement reconstruire les champs dérivés quand c'est prouvable.

### Phase 4 — aligner les flux Ventes/Achats

1. Faire recalculer le frontend et le backend avec les mêmes vecteurs de référence.
2. Rendre le timbre de la grille Achats dépendant du champ réellement saisi.
3. Appliquer la même politique d'arrondi aux achats côté backend.
4. Supprimer ou renommer les helpers contradictoires et les états morts.
5. Continuer à considérer le backend comme autorité et retourner un détail explicite des calculs pour comparaison UI.

### Phase 5 — corriger Dashboard et Rapports

1. Exclure les BL déjà transformés en facture du CA ou dédupliquer par chaîne documentaire.
2. Exclure les `BON_COMMANDE` fournisseurs du coût économique tant qu'ils ne sont ni reçus ni facturés.
3. Calculer le coût des marchandises vendues à partir des snapshots des lignes de vente : `Σ(coût snapshot × quantité nette vendue/retournée)`.
4. Calculer au minimum :

   ```text
   margeBruteDT = CA net HT hors timbre - coût des marchandises vendues
   margeBrute%  = margeBruteDT / CA net HT hors timbre × 100
   résultatEstimé = margeBruteDT - dépenses de période
   ```

5. Traiter les avoirs et retours sur les quantités, le CA HT et le coût associé.
6. Remplacer les calculs locaux paginés du Dashboard par un endpoint d'agrégation backend cohérent avec les rapports.
7. Renommer le « Profit » de caisse en « Flux net de trésorerie ».

### Phase 6 — sécuriser par les tests

Ajouter des tests de contrat couvrant au minimum :

- coût 100, marge 40 %, remise 15 %, TVA 19 %, quantité 2 ;
- remise 0 %, 100 %, marge négative et seuil exact de 20 % ;
- plusieurs lignes provoquant des demi-millimes ;
- modification du prix d'achat après une vente ;
- transformation BL → facture sans double comptage ;
- achat commandé, reçu puis payé ;
- avoir partiel avec restitution de coût ;
- cohérence `Σ lignes = document` et `totalFinal = totalTTC + timbre`.

## 12. Conclusion

Le bug de marge n'est pas une simple erreur d'affichage. Il vient de la définition même de la remise dans le moteur courant et se propage dans le prix net, la marge DT, la marge %, le contrôle du seuil, les totaux et la persistance. La correction devra donc être atomique sur frontend, backend, modèle de données et rapports.

Le code actuel permet de reproduire précisément les montants existants, mais il ne permet pas de produire une marge historique fiable ni un bénéfice commercial fiable. La priorité recommandée est de figer les définitions métier, restaurer un calcul décimal canonique et versionner la sémantique des lignes avant toute migration des données.
