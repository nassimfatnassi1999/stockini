# Prix de vente TTC et remise — 2026-07-28

## Cause technique

Le modèle produit nomme correctement `purchasePrice` comme HT et `purchasePriceTtc` comme TTC, mais la ligne de vente ne transportait que `purchasePriceHt`. Le moteur reconstruisait donc toujours le catalogue avec `PA HT arrondi × 1,40`. Pour un achat dont le montant métier de référence est `70,000 TTC`, le HT persisté `58,824` a déjà perdu une fraction de millime : le reconstruire donne `98,001 TTC` au lieu de `98,000 TTC`.

En parallèle, une réception mettait à jour le CUMP HT et son TTC mais laissait `Product.salePrice` inchangé. Les produits anciens pouvaient donc présenter trois valeurs désynchronisées. Enfin, le moteur ignorait un prix brut explicite quand un coût existait; une réouverture ou une modification de remise pouvait remplacer le brut au lieu de seulement recalculer le net.

## Règle corrigée

- Automatique : `PV TTC brut = round3(PA TTC net × 1,40)` puis `PV HT brut = round3(PV TTC brut / facteur TVA)`.
- Remise : `PV TTC net = round3(PV TTC brut × (1 − remise/100))` puis conversion HT.
- Le prix brut reste inchangé lors des changements de remise ou quantité.
- Un prix HT explicite n'est accepté par le backend que pour un devis sans coût ou pour un utilisateur autorisé à éditer le PU HT.
- Les documents déjà enregistrés ne sont pas recalculés.

La réception et le réparateur CUMP synchronisent maintenant `purchasePrice`, `purchasePriceTtc` et `salePrice` dans la même transaction.

## Diagnostic

```bash
npm run build
npm run pricing:diagnose -- --reference=FD01B13120L
```

Le script est strictement en lecture seule. Il compare les champs produit, la dernière réception, le CUMP issu des réceptions et le prix automatique résolu. La correction déterministe reste séparée :

Les commandes exécutent les fichiers compilés de `dist/` et ne nécessitent pas `ts-node` en production. Après chaque mise à jour du code, le backend doit donc avoir été compilé ou redéployé avant leur lancement.

```bash
npm run costs:repair
npm run costs:repair -- --apply
```

Une sauvegarde PostgreSQL est obligatoire avant `--apply`.
