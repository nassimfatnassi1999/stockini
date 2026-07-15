# Dashboard et rapports financiers — 15 juillet 2026

## Audit initial

Les modèles audités sont `Sale`, `SaleItem`, `CreditNote`, `CreditNoteItem`, `Payment`,
`Purchase`, `PurchaseItem`, `Product`, `Expense`, `User`, `Role` et `UserPermission`.
Les services ventes, achats, avoirs, paiements, produits, caisse, RBAC et rapports ont été
contrôlés ainsi que les pages Dashboard et Rapports.

Écarts corrigés :

- la remise retirait des points au taux de marge au lieu de réduire le prix catalogue ;
- `/rapports` exposait une vue très générale et le dashboard privilégiait les volumes de stock ;
- la série temporelle lançait plusieurs requêtes par point (N+1) ;
- la période précédente n'avait pas toujours la même durée ;
- le dashboard ne limitait pas toutes ses données au vendeur non autorisé ;
- les libellés confondaient bénéfice, marge sur coût et taux de marque ;
- le classement produit était uniquement quantitatif.

## Architecture et règles centrales

`reports-financial.utils.ts` contient la règle unique de reconnaissance du revenu : facture
validée ou BL validé non transformé, jamais devis, commande, brouillon, document supprimé ou
annulé. Le filtre Prisma est défini à côté de `isRevenueRecognizedDocument`.

Les calculs utilisent `Decimal`, une précision interne élevée et un arrondi final
`ROUND_HALF_UP` à trois décimales :

- `brut HT ligne = quantité × prix catalogue unitaire HT` ;
- `remise HT ligne = brut HT ligne × remise % / 100` ;
- `CA net HT ligne = brut HT ligne - remise HT ligne` ;
- `coût vendu = quantité × unitPurchaseCostHt` ;
- `bénéfice brut = CA net HT - coût vendu` ;
- `taux de marge sur coût = bénéfice brut / coût vendu × 100` ;
- `taux de marque sur vente = bénéfice brut / CA net HT × 100` ;
- `bénéfice net indicatif = bénéfice brut - dépenses actives` ;
- `reste à encaisser = total final à payer - montant payé`.

TVA et timbre sont exclus du CA HT et du bénéfice. Un avoir daté dans la période soustrait son
HT net, la quantité retournée et le coût snapshot correspondant. Les divisions par zéro
retournent zéro.

## Snapshots et historique

`SaleItem.unitPurchaseCostHt` est figé à la création/modification de la ligne et recopié lors
d'une transformation. `purchaseCostEstimated` identifie les coûts historiques reconstruits.
La migration existante `20260715120000_sale_item_financial_snapshots_v2` préserve les montants
légaux historiques ; aucune valeur manquante n'est inventée. Les rapports signalent les lignes
incomplètes ou estimées.

Les nouvelles lignes utilisent `calculationVersion = 4`, qui signifie : `unitPrice` brut HT,
`finalUnitPrice` net HT et remise multiplicative sur le brut. Les anciens documents ne sont pas
réécrits automatiquement.

## API, filtres, performance et sécurité

- `GET /reports/overview` exige `reports.view` et `reports.financial.view`.
- `GET /reports/dashboard` exige `dashboard.view`.
- périodes : aujourd'hui, hier, 7 jours, semaine, 30 jours, mois, trimestre, année, personnalisé ;
- filtres backend : vendeur, client, produit, catégorie, type de document et statut de paiement ;
- le dashboard d'un utilisateur sans droit financier est limité à `sellerId = user.id` ;
- coûts, bénéfices, valorisation d'achat et séries sensibles sont supprimés de sa réponse API ;
- les séries chargent chaque source une fois, puis agrègent les points sans requête par point ;
- la migration `20260715143000_reports_financial_indexes` ajoute des index analytiques additifs.

## Interface

Le dashboard démarre sur Aujourd'hui et affiche CA HT net, encaissements, reste à encaisser,
nombre de ventes/panier moyen. Les KPI coût, bénéfice, taux de marque et remises ne sont rendus
que si l'API les fournit.

Rapports affiche les KPI financiers explicites, les séries CA/coût/bénéfice, les classements par
bénéfice, le tableau des produits déficitaires ou sous 10 % de taux de marque, les créances et
les répartitions existantes. L'export CSV reprend les valeurs du même objet filtré que l'écran.

## Migration

Avant déploiement, conserver la sauvegarde PostgreSQL puis exécuter depuis `backend` :

```bash
npx prisma migrate deploy
npx prisma generate
```

La nouvelle migration ne modifie ni documents ni numéros ; elle crée uniquement quatre index.
