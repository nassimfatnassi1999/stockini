# Audit et correction des KPI financiers

## Résumé exécutif

Les rapports séparent désormais explicitement la performance commerciale des flux de trésorerie. Le CA, le coût vendu et la marge suivent la date de validation/impact stock (`Sale.recognizedAt`). Les encaissements et décaissements suivent la date du paiement ou du mouvement de caisse. Les avoirs diminuent le CA et restituent le coût historique de la ligne originale.

## Anciennes formules trouvées

- La marge utilisait déjà le snapshot `SaleItem.unitPurchaseCostHt`, et non le total des achats de la période.
- Les avoirs actifs diminuaient déjà le sous-total HT et le coût historique retourné.
- La période commerciale utilisait encore `Sale.createdAt`, même lorsqu’un brouillon était validé plus tard.
- Le rapport exposait les encaissements et paiements fournisseurs, mais pas la ventilation complète des mouvements de caisse.
- Le libellé « Impayés clients » ne distinguait pas l’encours des ventes de la période de la dette client globale.

## Causes racines

1. Absence d’une date persistée de reconnaissance commerciale.
2. Modèle de rapport centré sur les ventes, sans agrégat typé de tous les mouvements de caisse.
3. Noms historiques ambigus (`beneficeEstime`, `impayesClients`) conservés dans le contrat API.

## Formules corrigées

```text
CA net HT = Σ sous-totaux HT nets des ventes reconnues − Σ sous-totaux HT des avoirs actifs
Coût vendu = Σ (unitPurchaseCostHt × quantité vendue) − coût historique des quantités retournées
Marge brute = CA net HT − coût vendu
Bénéfice net commercial = marge brute − dépenses actives datées dans la période
Flux net de caisse = somme des mouvements entrants − somme absolue des mouvements sortants
```

Les calculs backend utilisent `Prisma.Decimal`, `ROUND_HALF_UP` et trois décimales. Les valeurs `number` retournées par l’API ne sont produites qu’après l’arrondi final.

## Différence bénéfice / encaissement

Une vente de 1 000,000 DT HT dont le coût snapshot est 700,000 DT produit immédiatement une marge de 300,000 DT à sa validation, même si elle n’est pas payée. Un paiement de 300,000 DT reçu ultérieurement produit un encaissement de 300,000 DT à la date du paiement, sans recalculer la marge.

Avec 329,000 DT dus et 330,000 DT donnés :

- si 1,000 DT est rendu, les entrées brutes valent 330,000 DT, la monnaie rendue 1,000 DT et le flux net 329,000 DT ;
- si 1,000 DT est conservé, le paiement de vente vaut 329,000 DT, le surplus vaut 1,000 DT et le flux net 330,000 DT ; la marge produit ne change pas.

## Statuts inclus et exclus

Sont inclus : `COMPLETED`, `PARTIALLY_REFUNDED`, `REFUNDED`, `RETURNED`, uniquement pour les factures et les BL non transformés, non supprimés et non membres actifs d’une consolidation comptée par son document parent.

Sont exclus : `DRAFT`, `CANCELLED`, devis, bons de commande, documents supprimés, BL transformés, sources d’une consolidation active, paiements supprimés ou sans impact caisse, dépenses `CANCELLED` et avoirs `CANCELLED`.

## Gestion des périodes

- Aujourd’hui : minuit local `Africa/Tunis` jusqu’à maintenant.
- Semaine : lundi 00:00 local jusqu’à maintenant.
- Mois : premier jour 00:00 local jusqu’à maintenant.
- Année : 1er janvier 00:00 local jusqu’à maintenant.
- Personnalisée : début inclus et fin incluse jusqu’à 23:59:59.999 local.

La vente utilise `recognizedAt`, l’avoir `dateAvoir`, la dépense économique `expenseDate`, et chaque flux de trésorerie `createdAt` du paiement ou du mouvement.

## Modifications backend

- Ajout et migration de `Sale.recognizedAt`, avec reprise historique depuis `createdAt` pour les ventes ayant déjà impacté le stock.
- Écriture de `recognizedAt` à la création validée, à la validation d’un brouillon et à la transformation ; une transformation BL vers facture conserve la date de reconnaissance originale.
- Utilisation de `recognizedAt` dans les agrégats, classements produits/clients et séries temporelles.
- Ajout des entrées, sorties, flux net, dépenses payées, remboursements d’avoirs, monnaie rendue, surplus non rendus et dettes globales.
- Exclusion des mouvements `CASH_RESET` du flux de période.

## Modifications frontend

- Affichage distinct du bénéfice net commercial et des encaissements clients.
- Ajout des cartes entrées, sorties, flux net, dépenses payées, remboursements, monnaie rendue et surplus.
- Distinction entre reste à encaisser sur les ventes de la période et dette client globale.
- Alignement de l’export CSV sur les valeurs déjà calculées par le backend.

## Tests ajoutés

- Bornes temporelles locales jusqu’à maintenant.
- Filtrage commercial par `recognizedAt`.
- Monnaie rendue : 330,000 − 1,000 = 329,000 DT net.
- Surplus non rendu : 329,000 + 1,000 = 330,000 DT, avec surplus séparé.
- Les suites existantes couvrent les remises fournisseur/client, quantités multiples, coût snapshot, achat non vendu, paiements partiels, ancienne facture payée aujourd’hui, vente impayée, dépense active, avoir partiel et consolidations.

## Résultats avant/après

| Cas | Avant | Après |
| --- | --- | --- |
| Brouillon créé lundi, validé jeudi | CA/marge rattachés au lundi | CA/marge rattachés au jeudi |
| Ancienne facture payée aujourd’hui | Encaissement déjà séparé | CA 0 aujourd’hui, encaissement daté aujourd’hui |
| Monnaie rendue | Visible dans la caisse mais absente du rapport complet | Entrée brute, monnaie rendue et flux net séparés |
| Surplus conservé | Mouvement distinct mais non affiché dans le rapport | Surplus affiché, sans impact sur la marge produit |
| Dette | Encours de période seulement | Reste de période et dette globale distingués |

| KPI | Formule | Date utilisée |
| --- | --- | --- |
| CA net HT | ventes nettes après remise − avoirs HT | date de validation vente / date d’avoir |
| Coût vendu | snapshot historique × quantité nette retournée | date de validation vente / date d’avoir |
| Marge brute | CA net − coût vendu | date de validation vente |
| Bénéfice net | marge brute − dépenses actives | dates vente, avoir et dépense |
| Encaissements | paiements clients confirmés appliqués | date de paiement |
| Décaissements | mouvements sortants confirmés | date du mouvement caisse |
| Flux net caisse | entrées − sorties | date des mouvements |

## Risques résiduels

- Le backfill ne peut pas reconstruire une ancienne date de validation absente : il conserve `createdAt` pour ne pas déplacer l’historique existant.
- Les lignes historiques sans snapshot fiable restent signalées par `dataQuality`; elles ne sont pas remplacées silencieusement par le prix courant.
- Les flux de caisse globaux ne peuvent pas être ventilés par produit ou vendeur lorsque le mouvement ne porte pas cette relation ; le filtre temporel reste exact.
- La migration doit être appliquée avant le déploiement du backend mis à jour.
