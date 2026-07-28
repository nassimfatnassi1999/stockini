# Coût fournisseur net et marge historique — 2026-07-28

## Cause racine

`PurchaseItem.unitCost` contenait le PU HT fournisseur brut et la remise était seulement utilisée pour le total documentaire. La réception augmentait la quantité sans transmettre de coût au mouvement et sans recalculer le coût produit. Les ventes figeaient donc `Product.purchasePrice`, souvent encore brut. La migration historique `20260715120000_sale_item_financial_snapshots_v2` contenait aussi un fallback additif fondé sur `marginPercent - discountPercent`, qui ne représente pas une marge calculée sur des montants nets.

## Stratégie retenue

Le modèle ne possède ni lot ni allocation FIFO. La stratégie explicite est donc le **CUMP HT net** :

`(valeur du stock courant + quantité reçue × coût fournisseur unitaire net) / quantité après réception`.

Une sortie ne change pas le CUMP. Une vente copie le CUMP dans `SaleItem.unitPurchaseCostHt`. Un retour ou une annulation réinjecte le coût historique de cette ligne et recalcule le CUMP. Les consolidations copient déjà les snapshots des lignes sources; les rapports excluent déjà les sources remplacées et agrègent ces lignes sans double comptage.

## Arrondis et formules

Tous les calculs utilisent Decimal, `ROUND_HALF_UP`, à trois décimales. La convention existante arrondit la remise unitaire avant de la soustraire :

- remise achat unitaire = `round3(PU brut × remise / 100)`;
- coût achat unitaire net = `round3(PU brut − remise unitaire)`;
- prix vente net = `round3(PU vente brut × (1 − remise client / 100))`;
- marge DT = `round3(prix vente net − coût historique net)`;
- marge sur coût = `marge / coût historique net × 100`;
- taux de marque = `marge / prix vente net × 100`.

TVA et timbre sont exclus de la marge produit.

Pour BATTERIE L2 : `276,990 − round3(276,990 × 25 %) = 207,742 DT`; `227,063 − 207,742 = +19,321 DT`; marge sur coût `+9,30 %`.

## Réparation contrôlée

`npm run costs:repair` est un dry-run. `npm run costs:repair -- --apply` écrit après sauvegarde explicite de la base.

Le réparateur met à jour les coûts nets explicites des achats. Il corrige un snapshot de vente estimé uniquement si tous les achats réceptionnés antérieurs disponibles donnent exactement le même coût net. Les autres ventes sont déclarées ambiguës. Le CUMP produit est recalculé uniquement en l'absence d'entrées/retours historiques non valorisables.
