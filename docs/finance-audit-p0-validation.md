# Validation des corrections financières P0

> Validation réalisée le 30 juillet 2026 à partir de `docs/finance-audit-report.md`.

## 1. Périmètre

Les corrections sont limitées aux deux incohérences P0 :

- classification Entrées / Sorties des mouvements de trésorerie ;
- source de vérité de la dette client.

Les calculs de bénéfice, marge, CUMP, coût historique, remises, TVA, timbre, paiements, avoirs et stock n'ont pas été modifiés.

## 2. Flux de caisse

### Avant

`CaisseService.recordMovement()` persistait correctement `montant = ABS(montant)` et le type métier du mouvement. `GET /caisse/summary` classait les flux à partir de listes de types, tandis que `GET /reports/overview` utilisait le signe du montant. Une dépense persistée avec `montant = 70.000` était donc comptée comme une entrée par Rapports.

Le test Rapports masquait l'erreur en injectant une sortie impossible en production : `CUSTOMER_CHANGE_OUT` avec `montant = -1.000`.

### Après

`CashMovementClassifier` est l'unique classificateur :

- entrées : `ENCAISSEMENT_VENTE`, `CASH_SURPLUS_IN`, `DEPOT_MANUEL`, `ANNULATION_ACHAT`, `ANNULATION_DEPENSE` ;
- sorties : `CUSTOMER_CHANGE_OUT`, `DECAISSEMENT_ACHAT`, `DEPENSE_GENERALE`, `RETRAIT_MANUEL`, `ANNULATION_VENTE`, `REFUND_OUT` ;
- `CASH_RESET` est une réconciliation de solde et reste exclu des flux.

Le classificateur normalise les montants en valeur absolue et ne consulte jamais leur signe pour déterminer la direction. Caisse, ses analytics, la liste des transactions et Rapports utilisent désormais cette règle centralisée.

### Résultat

Pour les mêmes mouvements persistés :

| KPI | Caisse | Rapports | Résultat |
|---|---:|---:|---|
| Entrées | somme des types IN | somme des types IN | identique |
| Sorties | somme des types OUT | somme des types OUT | identique |
| Flux net | entrées - sorties | entrées - sorties | identique |
| Solde | `solde + soldeBanque` | `solde + soldeBanque` | identique |

Le test de cohérence utilise des montants de production tous positifs : entrées `100 + 50`, sorties `30 + 20`, flux net `100`, solde global `100`.

## 3. Dette client

### Avant

Rapports et Paiements lisaient `Sale.remainingAmount`, mais Clients et Caisse reconstruisaient la dette depuis `total + stampDuty - paidAmount - totalRefunded`. Cette reconstruction omettait `Payment.acceptedDifference`. Une facture de 100 DT réglée par 99 DT avec un écart accepté de 1 DT affichait donc 0 DT dans Rapports et encore 1 DT dans Caisse/Clients.

L'historique client recalculait également ses lignes et son résumé depuis les paiements, ce qui pouvait réintroduire la même divergence.

### Après

`Sale.remainingAmount` est la source de vérité parce que les workflows transactionnels de paiement et d'avoir le maintiennent déjà avec :

- les paiements appliqués ;
- les écarts acceptés ;
- les avoirs et réductions de dette ;
- les annulations et suppressions de paiements.

`CustomerDebtCalculator` centralise la normalisation, la somme globale et le groupement par client. `customerDebtSaleWhere()` centralise le périmètre documentaire : Factures et BL non transformés, non annulés, non supprimés et hors sources consolidées actives.

Les consommateurs alignés sont :

- Dashboard : `operationnel.resteAEncaisser` utilise la dette globale courante ;
- Rapports : `financier.dettesClients` utilise le même périmètre global ;
- Caisse : `totalClientDebt` passe par `CustomersService` et le calculateur partagé ;
- Clients : liste, fiche, historique et résumé utilisent le solde stocké ;
- Paiements : les lignes exposent déjà le `remainingAmount` de la vente.

### Résultat

| Cas | Solde source `remainingAmount` | Dashboard | Rapports | Caisse | Clients / Paiements |
|---|---:|---:|---:|---:|---:|
| Facture 100, paiement 100 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| Facture 100, paiement 99, écart accepté 1 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| Facture 100, paiement 60 | 40.000 | 40.000 | 40.000 | 40.000 | 40.000 |
| Paiement 30, avoir 20, paiement 10 sur 100 | 40.000 | 40.000 | 40.000 | 40.000 | 40.000 |

## 4. Comparaison Dashboard / Rapports / Caisse

| KPI concerné | Dashboard | Rapports | Caisse | Source commune |
|---|---|---|---|---|
| Dette client courante | `operationnel.resteAEncaisser` | `financier.dettesClients` | `totalClientDebt` | `Sale.remainingAmount` + `CustomerDebtCalculator` |
| Entrées | non exposé sur la carte Dashboard | `financier.entreesCaisse` | `cashIn` / `entrees` | `CashMovementClassifier` |
| Sorties | non exposé sur la carte Dashboard | `financier.sortiesCaisse` | `cashOut` / `sorties` | `CashMovementClassifier` |
| Flux net | non exposé sur la carte Dashboard | `financier.fluxNetCaisse` | `cashIn - cashOut` | `CashMovementClassifier` |
| Solde | non exposé sur la carte Dashboard | `financier.soldeGlobal` | `cashBalance` / `soldeGlobal` | `CaisseConfig.solde + soldeBanque` |

Les KPI de période `impayesClients` et `resteAEncaisser` de Rapports restent disponibles pour leur usage analytique temporel. La dette globale courante est `dettesClients`.

## 5. Tests ajoutés ou adaptés

### Nouveaux tests

- `cash-movement-classifier.spec.ts`
  - couvre chaque type d'entrée ;
  - couvre chaque type de sortie ;
  - valide des montants persistés positifs ;
  - compare Entrées, Sorties, Flux net et Solde entre la synthèse Caisse et le calcul utilisé par Rapports.
- `customer-debt-calculator.spec.ts`
  - facture totalement payée ;
  - paiement à 99 DT avec écart accepté de 1 DT ;
  - paiement partiel laissant 40 DT ;
  - paiement partiel + avoir + paiement ;
  - garde-fou contre une dette négative.

### Tests adaptés

- le test Rapports de monnaie rendue utilise désormais `montant = 1.000`, comme `recordMovement()` ;
- les tests de synthèse Caisse utilisent des mouvements persistés positifs avec leur compte de trésorerie ;
- les fixtures Clients fournissent le `remainingAmount` maintenu par la vente.

## 6. Validation technique

Commandes exécutées :

```text
backend:  npm run build
backend:  npm test -- --runInBand
frontend: npm run build
frontend: npm test
```

Résultats :

- build backend : réussi ;
- tests backend : 44 suites, 419 tests, 419 réussis ;
- build frontend Next.js : réussi, typage et génération des 27 pages réussis ;
- tests frontend : 60 tests, 60 réussis ;
- `git diff --check` : aucune erreur d'espace ou de patch ;
- recherche statique : aucune classification de mouvement par comparaison positive/négative de `montant` restante.

## 7. Fichiers modifiés et justification

| Fichier | Changement | Justification |
|---|---|---|
| `backend/src/common/utils/cash-movement-classifier.ts` | classificateur et listes IN/OUT uniques | supprimer toute dépendance au signe |
| `backend/src/common/utils/cash-movement-classifier.spec.ts` | tests de classification et de cohérence Caisse/Rapports | couvrir P0-1, P0-2 et P0-6 |
| `backend/src/common/utils/customer-debt-calculator.ts` | source et périmètre de dette uniques | inclure implicitement les écarts acceptés via `remainingAmount` |
| `backend/src/common/utils/customer-debt-calculator.spec.ts` | quatre scénarios financiers et garde-fou | couvrir P0-3 à P0-5 |
| `backend/src/reports/reports-financial.utils.ts` | délégation au classificateur commun | corriger Entrées/Sorties Rapports |
| `backend/src/reports/reports.service.ts` | dette normalisée et globale partagée | aligner Rapports et Dashboard |
| `backend/src/reports/reports.service.spec.ts` | sortie positive réaliste | reproduire la persistance réelle |
| `backend/src/caisse/caisse.service.ts` | classificateur partagé pour synthèse, analytics et affichage | garantir la même ventilation que Rapports |
| `backend/src/caisse/caisse.service.summary.spec.ts` | fixtures de mouvements réels | éviter les faux montants signés |
| `backend/src/customers/customers.service.ts` | lecture exclusive de `remainingAmount` pour la dette | supprimer les reconstructions locales |
| `backend/src/customers/customers.service.spec.ts` | fixtures alignées sur la source stockée | vérifier la rétrocompatibilité des écrans Clients |
| `frontend/src/components/stockini/SimpleDashboard.tsx` | libellé de dette déclaré global | rendre le périmètre affiché explicite |

## 8. Conclusion

Les deux incohérences P0 sont corrigées sans réécriture du moteur financier. Les flux sont maintenant classés exclusivement par événement métier, et la dette est lue depuis le solde transactionnel unique qui inclut les écarts acceptés et les avoirs. Les contrats existants sont conservés ; seules les valeurs auparavant divergentes sont alignées.
