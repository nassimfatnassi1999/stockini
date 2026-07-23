# Avoirs traçables — modèle final

## Principe

Le BL, la facture, le BLG ou la FACG d'origine n'est ni supprimé ni réécrit.
L'avoir est un document distinct. Ses lignes conservent
`originalSaleId`, `originalSaleItemId` et `sourceReference`. Les champs ajoutés
sur la vente (`creditedAmount`, `creditedQuantity`, `creditStatus`,
`effectiveTotal`, `remainingAmount`) sont uniquement des états dérivés.

La création est atomique dans une transaction Prisma sérialisée par verrouillage
du document sélectionné et de ses sources. Elle crée :

1. le `CreditNote` et ses `CreditNoteItem` ;
2. un `StockMovement` `RETURN_IN` par ligne physiquement retournée ;
3. au plus un `Payment` de règlement de l'avoir ;
4. au plus un `CaisseMovement` `REFUND_OUT` si de l'argent sort réellement ;
5. éventuellement un crédit client, sans mouvement de trésorerie ;
6. un `AuditLog` contenant les valeurs financières avant/après et les sources.

## Quantités et consolidations

Pour chaque ligne source :

```text
returnableQty = soldQty - qtyAlreadyCredited - qtyAlreadyCancelled
```

Les contrôles sont refaits sous verrou dans la transaction. Pour un BLG/FACG,
les lignes chargées sont celles des ventes originales, pas les copies du
document consolidé. Une demande agrégée par produit est répartie dans l'ordre
des sources (`displayOrder`), puis dans l'ordre stable des lignes : FIFO.

Exemple :

```text
BL1 A × 3 + BL2 A × 2 + BL3 B × 4
retour demandé A × 4 + B × 1
=> BL1/A × 3, BL2/A × 1, BL3/B × 1
```

Cette allocation exacte est persistée dans les lignes d'avoir.

## Calcul financier

Les montants sont calculés avec `Prisma.Decimal` et arrondis à 3 décimales :

```text
lineHt = unitNetPriceHt × returnedQty
lineTax = lineHt × taxRate / 100
lineTtc = lineHt + lineTax
creditAmount = Σ(lineTtc) + refundableStampDuty

effectiveTotalBefore = originalTotal - previousCredits
effectivePaidBefore = originalPaid - previousRefundsOrCustomerCredits
debtReduction = min(creditAmount, max(effectiveTotalBefore - effectivePaidBefore, 0))
effectiveTotalAfter = max(effectiveTotalBefore - creditAmount, 0)
settleableOverpayment = min(creditAmount, max(effectivePaidBefore - effectiveTotalAfter, 0))
effectivePaidAfter = effectivePaidBefore - settleableOverpayment
remaining = max(effectiveTotalAfter - effectivePaidAfter, 0)
overpaid = max(effectivePaidAfter - effectiveTotalAfter, 0)
```

`settleableOverpayment` devient soit un remboursement réel, soit un crédit
client selon la méthode choisie. `NONE` ne crée aucun règlement. Le timbre vaut
zéro par défaut et ne peut être remboursé qu'une seule fois, explicitement, si
toutes les quantités du document sont retournées.

## Déploiement

Appliquer la migration
`20260723000000_credit_notes_source_traceability` avant de déployer le backend.
Elle ajoute les statuts et champs de traçabilité, crée les index et initialise
les champs dérivés pour les avoirs historiques.
