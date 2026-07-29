# Audit financier complet — 29 juillet 2026

## Résumé exécutif

Le flux financier repose désormais sur un CUMP HT net fournisseur, un prix de
vente net HT après remise client et un snapshot de coût historique attaché à la
sortie de stock. Les rapports calculent la marge brute avec ce snapshot, retirent
les avoirs au prorata et ne confondent plus paiements, timbre, achats ou caisse
avec la marge produit.

L'audit a néanmoins trouvé deux causes racines encore actives : les devis et
commandes figeaient trop tôt le coût puis le recopiaient lors de leur
transformation, et les calculateurs d'avoirs UI/utilitaire utilisaient encore
`number` et `Math.round`. Ces chemins sont corrigés. Une migration additive met
en quarantaine les anciens snapshots explicitement estimés sans modifier les
montants légaux. La migration historique contenant l'ancienne formule inverse
reste immuable pour préserver les checksums Prisma, mais son résultat est annulé
par la nouvelle migration et n'est plus consommé comme coût fiable.

## Flux financier actuel

`Achat (PU HT brut + remise fournisseur)` → `coût unitaire HT net` →
`réception valorisée` → `mouvement de stock` → `CUMP HT net Product.purchasePrice`
→ `BL/facture ou transformation ayant impact stock` →
`SaleItem.unitPurchaseCostHt immuable` → `marge ligne/vente` →
`avoir au prix net et coût historiques` → `rapports/dashboard/caisse`.

Les devis et bons de commande conservent désormais un snapshot nul. Le CUMP
valide est capturé lors de la validation ou transformation qui décrémente le
stock. Une transformation BL → facture conserve le snapshot du BL et ne crée ni
seconde sortie ni seconde marge. Une consolidation copie les lignes sources ;
les filtres de revenu excluent les sources membres actives.

Fichiers et familles contrôlés :

- schéma et migrations : `backend/prisma/schema.prisma`, migrations prix,
  snapshots, rapports, consolidations, avoirs et CUMP de 2026-05 à 2026-07 ;
- backend : `common/utils/{sales,purchase,pricing,commercial-document}*`,
  `purchases`, `stock`, `sales`, `avoirs`, `credit-notes`, `payments`, `caisse`,
  `expenses`, `reports`, `documents`, `products` et leurs tests ;
- données : `repair-net-purchase-costs.ts`, `diagnose-product-pricing.ts` ;
- frontend : calculateurs vente/achat/avoir, grilles de saisie, pages achats,
  ventes, avoirs, produits, détails vente, dashboard, caisse et rapports ;
- sorties : PDF backend, PDF frontend, CSV du rapport et données dashboard.

## Problèmes détectés

1. Snapshot trop précoce : devis/BC copiaient `Product.purchasePrice` à la
   création. Une hausse de CUMP avant transformation ne se reflétait pas dans le
   coût historique de la sortie réelle.
2. Transformation incorrecte : devis/BC → BL/facture recopiait ce coût ancien et
   valorisait le mouvement avec celui-ci.
3. Avoirs : deux utilitaires parallèles faisaient les multiplications TVA et les
   arrondis avec les nombres flottants JavaScript.
4. Données historiques : les lignes `purchaseCostEstimated=true` pouvaient
   provenir du prix produit courant ou d'une ancienne inversion
   marge/remise ; aucune de ces sources ne prouve le CUMP historique.
5. Diagnostic incomplet : le réparateur ne publiait pas le nombre total de
   ventes/lignes auditées ni le détail des snapshots manquants/estimés.
6. Documentation interne : un commentaire de rapport décrivait encore
   `CA − achats`, alors que l'implémentation correcte utilise
   `CA − coût historique vendu − dépenses`.

## Causes racines

- confusion entre estimation commerciale d'un document sans stock et coût
  comptable historique d'une vente réalisée ;
- copie uniforme des lignes pendant toutes les transformations ;
- duplication ancienne des calculateurs d'avoirs frontend/backend ;
- absence historique de lot/FIFO et de snapshot fiable avant juillet 2026 ;
- compatibilité des migrations appliquées : une migration existante ne peut pas
  être réécrite sans casser son checksum de déploiement.

## Formules normalisées

- remise achat unitaire = `round3(PA brut HT × remise fournisseur / 100)` ;
- coût achat net = `round3(PA brut HT − remise achat unitaire)` ;
- CUMP = `round3((stock × ancien CUMP + réception × coût net) / quantité totale)` ;
- prix vente net HT = `round3(PV brut HT × (1 − remise client / 100))` ;
- marge unitaire = `round3(PV net HT − coût historique net HT)` ;
- marge ligne = `round3(marge unitaire × quantité)` ;
- taux de marge sur coût = `round3(marge / coût × 100)`, zéro si coût nul ;
- taux de marque = `round3(marge / vente nette × 100)`, zéro si vente nulle ;
- bénéfice net = `marge brute réelle − dépenses actives`.

Toutes les opérations corrigées utilisent Decimal, `ROUND_HALF_UP`, trois
décimales. TVA et timbre sont séparés de la marge HT. Paiement, dette, avance et
encaissement restent des flux de trésorerie.

## Modifications backend

- `sales.service.ts` ne fige plus de coût sur devis/BC ; validation et
  transformation vers BL/facture capturent le CUMP courant dans la transaction ;
- BL → facture préserve le snapshot et n'impacte pas le stock deux fois ;
- le mouvement issu d'une transformation référence la nouvelle ligne vendue ;
- le calculateur d'avoir utilise Decimal au lieu de `Math.round` ;
- le réparateur audite toutes les lignes et publie les compteurs de qualité ;
- le commentaire des KPI a été aligné sur la formule réellement exécutée.

## Modifications frontend

Le calculateur d'avoirs utilise désormais Decimal avec le même arrondi HALF_UP
que le backend. L'affichage conserve des nombres sérialisables, mais aucun calcul
monétaire intermédiaire de ce chemin ne dépend plus du flottant natif.

## Migration des données

`20260729120000_quarantine_unreliable_cost_estimates` met
`unit_purchase_cost_ht` à NULL uniquement si `purchase_cost_estimated=true`.
Les snapshots fiables, prix de vente, TVA, totaux, paiements et stocks ne sont
pas modifiés. Le réparateur est dry-run par défaut, transactionnel et ne corrige
une ancienne vente que lorsqu'un coût historique unique est démontrable par les
réceptions antérieures. Les cas ambigus restent journalisés sans coût inventé.

Déploiement sûr : sauvegarde PostgreSQL, `prisma migrate deploy`, build, puis
`npm run costs:repair`. Examiner le rapport avant un éventuel
`npm run costs:repair -- --apply`. Le rollback des écritures applicatives repose
sur la transaction et la sauvegarde préalable ; la mise à NULL de données non
fiables est restaurable depuis cette sauvegarde.

## Tests exécutés

- backend Jest : **42 suites, 400 tests réussis** ;
- frontend Node test : **60 tests réussis** ;
- build Nest : réussi ;
- build Next production et vérification TypeScript : réussis ;
- `prisma validate` : réussi ;
- `git diff --check` : réussi ;
- diagnostic base : non exécuté, connexion PostgreSQL refusée (`ECONNREFUSED`) ;
  aucune donnée lue ou modifiée.

Les tests ajoutés couvrent 276,990 à 10 %, le CUMP 53,333, la vente 98 avec
15 % de remise et quantité 4, taux de marge/taux de marque, arrondi d'avoir et
capture du CUMP 90 lors d'une transformation devis → facture. Les suites
existantes couvrent avoir partiel, consolidation, paiements, dépenses, rapports
et immutabilité des snapshots déjà réalisés.

## Résultats avant/après

| Cas | Avant | Après |
|---|---:|---:|
| Achat 276,990, remise 10 % | risque de coût brut 276,990 | coût net 249,291 |
| Vente 98,000, remise 15 % | formules historiques divergentes | net 83,300 |
| Coût 70,000, quantité 4 | marge susceptible d'être recalculée | marge 53,200 |
| Taux sur coût / taux de marque | parfois confondus | 19,000 % / 15,966 % |
| CUMP 10×50 + 5×60 | coût réception brut possible | 53,333 |
| Devis créé à coût 70 puis vendu à CUMP 90 | snapshot 70 recopié | snapshot 90 à la sortie |
| Avoir partiel 3/10 | flottant natif dans l'utilitaire | Decimal, annulation 30 % |

## Risques et recommandations

- Les ventes anciennes sans preuve restent volontairement sans coût ; leurs KPI
  exposent `dataQuality.unknownCostLines` et ne doivent pas être certifiés avant
  traitement du rapport dry-run.
- La formule interdite demeure uniquement dans l'historique immuable d'une
  migration déjà appliquée. La modifier casserait les checksums Prisma ; la
  migration additive neutralise toutes les valeurs explicitement estimées.
- Le système est CUMP, pas FIFO. Une traçabilité par lot exigerait un nouveau
  modèle d'allocation, hors refactorisation ciblée.
- Plusieurs écrans utilisent encore `Number` pour la saisie ou le formatage et
  certains graphiques arrondissent les pixels/labels. Les sources financières
  backend restent Decimal ; poursuivre la convergence frontend évitera de
  futurs calculateurs parallèles.
- Rejouer le diagnostic sur une copie restaurée de production avant tout
  `--apply`, archiver le JSON/tableau avant-après et faire valider les lignes
  ambiguës par la comptabilité.
