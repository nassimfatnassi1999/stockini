export type KpiDefinitionKey =
  | 'netRevenue'
  | 'customerCollections'
  | 'customerReceivables'
  | 'averageBasket'
  | 'grossProfit'
  | 'costOfGoodsSold'
  | 'markupRate'
  | 'discounts'
  | 'salesCount'
  | 'purchaseCount'
  | 'pendingCustomerOrders'
  | 'pendingSupplierReceipts'
  | 'supplierPayments'
  | 'supplierPayables'
  | 'physicalCash'
  | 'bankBalance'
  | 'globalBalance'
  | 'periodExpenses'
  | 'totalPurchases'
  | 'quotesCount'
  | 'invoicesCount'
  | 'cancelledSalesCount'
  | 'creditNotesCount'
  | 'creditNotesAmount'
  | 'refundedAmount'
  | 'activeProducts'
  | 'lowStockProducts'
  | 'outOfStockProducts'
  | 'stockQuantity'
  | 'stockEntries'
  | 'stockExits'
  | 'stockAlerts'
  | 'customersCount'
  | 'currentCustomerDebt'
  | 'retainedSurplus'
  | 'cashInflows'
  | 'cashOutflows';

export type KpiTooltipConfig = {
  key: KpiDefinitionKey;
  title: string;
  description: string;
  formula?: string;
  included?: string[];
  excluded?: string[];
  interpretation?: string;
  warning?: string;
};

export const KPI_DEFINITIONS: Record<KpiDefinitionKey, KpiTooltipConfig> = {
  netRevenue: {
    key: 'netRevenue',
    title: 'CA net HT hors timbre',
    description: "Montant des ventes reconnues sur la période, hors taxes et hors timbre, après remises et impact des avoirs.",
    formula: 'Sous-total HT des ventes reconnues − sous-total HT des avoirs non annulés',
    included: ['Factures comptabilisées', 'Bons de livraison non transformés en facture', 'Remises déjà déduites'],
    excluded: ['TVA et timbre fiscal', 'Devis et bons de commande', 'Ventes annulées ou supprimées', 'BL déjà transformés en facture'],
    interpretation: 'Il mesure l’activité commerciale reconnue, pas les sommes réellement encaissées.',
  },
  customerCollections: {
    key: 'customerCollections',
    title: 'Encaissements clients',
    description: 'Sommes effectivement reçues des clients dont le paiement a été enregistré pendant la période.',
    formula: 'Somme des paiements clients avec impact de caisse confirmé, selon leur date de paiement',
    included: ['Paiements complets ou partiels', 'Règlements de ventes antérieures encaissés pendant la période'],
    excluded: ['Montants encore dus', 'Promesses de paiement', 'Paiements supprimés ou sans impact de caisse'],
    interpretation: "Un encaissement suit la date du paiement : il n’est donc pas nécessairement égal au CA de la même période.",
  },
  customerReceivables: {
    key: 'customerReceivables',
    title: 'Reste à encaisser',
    description: 'Créances encore dues sur les ventes reconnues dont la date de vente appartient à la période.',
    formula: 'Somme des montants restants des ventes reconnues après paiements, remboursements et crédits appliqués',
    included: ['Factures et BL non transformés reconnus dans la période', 'Ventes payées partiellement ou impayées'],
    excluded: ['Ventes hors période', 'Documents annulés, supprimés ou non comptabilisés'],
    interpretation: 'La sélection se fait par date de vente, et non par date d’échéance.',
  },
  averageBasket: {
    key: 'averageBasket',
    title: 'Panier moyen',
    description: 'Valeur moyenne des documents de vente reconnus pendant la période.',
    formula: 'CA net HT hors timbre ÷ nombre de ventes comptabilisées',
    included: ['Factures', 'BL non transformés en facture'],
    excluded: ['Devis', 'Bons de commande', 'Ventes annulées'],
    interpretation: 'Lorsque la période ne contient aucune vente comptabilisée, la valeur affichée est 0.',
  },
  grossProfit: {
    key: 'grossProfit',
    title: 'Bénéfice brut réel',
    description: 'Marge commerciale générée par les produits réellement vendus pendant la période.',
    formula: 'CA net HT hors timbre − coût historique net des produits vendus',
    included: ['Coût historique figé sur chaque ligne de vente', 'Retours : CA et coût restitué déduits'],
    excluded: ['TVA et timbre fiscal', 'Dépenses générales', 'Paiements fournisseurs', 'Mouvements de trésorerie'],
    interpretation: 'Une valeur positive signifie que les ventes couvrent leur coût produit. Elle ne représente pas le bénéfice net après dépenses.',
  },
  costOfGoodsSold: {
    key: 'costOfGoodsSold',
    title: 'Coût des produits vendus',
    description: 'Coût économique d’achat des quantités effectivement vendues, net des quantités retournées.',
    formula: 'Σ quantité vendue × coût d’achat HT historique de la ligne − coût historique des retours',
    included: ['Coût figé au moment de la vente', 'Coûts estimés signalés par le contrôle de qualité des données'],
    excluded: ['Prix d’achat actuel du produit', 'Paiements aux fournisseurs', 'Achats de stock non encore vendus'],
    interpretation: 'Ce KPI suit la sortie économique du stock ; ce n’est pas un flux de trésorerie.',
  },
  markupRate: {
    key: 'markupRate',
    title: 'Taux de marque sur vente',
    description: "Part du chiffre d’affaires net HT conservée sous forme de marge brute.",
    formula: 'Bénéfice brut réel ÷ CA net HT hors timbre × 100',
    interpretation: 'Plus le taux est élevé, plus la vente conserve de marge. À ne pas confondre avec le taux de marge calculé sur le coût.',
  },
  discounts: {
    key: 'discounts',
    title: 'Remises accordées',
    description: 'Total des réductions commerciales enregistrées sur les ventes reconnues de la période.',
    formula: 'Somme des remises HT stockées sur les documents de vente',
    included: ['Remises des factures et BL reconnus'],
    excluded: ['Avoirs, présentés séparément', 'Documents annulés ou supprimés'],
    interpretation: 'La remise réduit la base HT catalogue avant le calcul du CA net.',
  },
  salesCount: {
    key: 'salesCount',
    title: 'Nombre de ventes',
    description: 'Nombre de documents qui contribuent réellement au chiffre d’affaires de la période.',
    formula: 'Comptage des factures + BL non transformés en facture',
    excluded: ['Devis', 'Bons de commande', 'Documents annulés ou supprimés', 'BL déjà transformés en facture'],
    interpretation: 'Ce nombre sert aussi de dénominateur au panier moyen.',
  },
  purchaseCount: {
    key: 'purchaseCount',
    title: 'Achats / commandes',
    description: "Nombre de documents d’achat actifs créés pendant la période.",
    formula: "Comptage des achats non annulés, hors bons de commande fournisseur",
    excluded: ['Bons de commande fournisseur', 'Achats annulés ou supprimés'],
    interpretation: "Il s’agit d’un volume de documents, pas de leur montant.",
  },
  pendingCustomerOrders: {
    key: 'pendingCustomerOrders',
    title: 'Commandes clients en attente',
    description: 'Bons de commande clients encore au statut brouillon, créés dans la période.',
    formula: 'Nombre de bons de commande non supprimés au statut brouillon',
    interpretation: 'Ils ne contribuent ni au CA ni au nombre de ventes tant qu’ils ne sont pas transformés.',
  },
  pendingSupplierReceipts: {
    key: 'pendingSupplierReceipts',
    title: 'Réceptions fournisseurs en attente',
    description: 'Commandes fournisseurs de la période commandées ou seulement partiellement réceptionnées.',
    formula: 'Nombre de bons de commande au statut commandé ou partiellement reçu',
    excluded: ['Commandes annulées, supprimées ou totalement réceptionnées'],
  },
  supplierPayments: {
    key: 'supplierPayments',
    title: 'Paiements fournisseurs',
    description: 'Sommes réellement versées aux fournisseurs pendant la période.',
    formula: 'Somme des paiements fournisseurs avec impact de caisse confirmé, selon leur date de paiement',
    included: ['Règlements d’achats antérieurs payés pendant la période'],
    excluded: ['Dettes non réglées', 'Paiements supprimés ou sans impact de caisse'],
    interpretation: "Ce flux de trésorerie peut différer du montant des achats créés sur la même période.",
  },
  supplierPayables: {
    key: 'supplierPayables',
    title: 'Impayés fournisseurs',
    description: 'Dettes restant dues sur les achats actifs créés pendant la période.',
    formula: 'Somme des montants restants des achats non annulés, hors bons de commande',
    interpretation: "La sélection suit la date de l’achat, pas la date du paiement.",
  },
  physicalCash: {
    key: 'physicalCash',
    title: 'Caisse physique',
    description: 'Solde courant des espèces enregistré dans la caisse physique.',
    formula: 'Solde initial + entrées espèces − sorties espèces',
    interpretation: 'Il s’agit d’un solde courant : la période affichée ne limite pas cette valeur.',
  },
  bankBalance: {
    key: 'bankBalance',
    title: 'Trésorerie bancaire',
    description: 'Solde courant enregistré pour le compte banque et virements.',
    formula: 'Solde initial bancaire + entrées bancaires − sorties bancaires',
    interpretation: 'Il s’agit d’un solde courant, pas uniquement des mouvements de la période.',
  },
  globalBalance: {
    key: 'globalBalance',
    title: 'Solde global',
    description: 'Trésorerie courante totale suivie par Stockini.',
    formula: 'Caisse physique + trésorerie bancaire',
    interpretation: 'Ce solde ne doit pas être interprété comme un bénéfice.',
  },
  periodExpenses: {
    key: 'periodExpenses',
    title: 'Dépenses de la période',
    description: 'Somme des dépenses actives dont la date appartient à la période sélectionnée.',
    formula: 'Somme des dépenses au statut actif datées dans la période',
    excluded: ['Dépenses annulées ou supprimées', 'Dettes fournisseurs non payées', 'Paiements fournisseurs', 'Mouvements internes'],
    interpretation: 'Ce KPI sert au calcul du bénéfice net estimé, mais pas du bénéfice brut réel.',
  },
  totalPurchases: {
    key: 'totalPurchases',
    title: 'Total achats',
    description: "Montant des achats actifs créés pendant la période, hors bons de commande.",
    formula: 'Somme du total des achats + timbre fiscal',
    excluded: ['Achats annulés ou supprimés', 'Bons de commande fournisseur'],
    interpretation: "Ce montant est rattaché à la date de l’achat et ne correspond pas nécessairement aux paiements fournisseurs.",
  },
  quotesCount: {
    key: 'quotesCount', title: 'Devis', description: 'Nombre de devis non supprimés créés pendant la période.',
    formula: 'Comptage des documents de type devis par date de création',
    excluded: ['Factures, BL et bons de commande'], interpretation: 'Un devis ne contribue pas au chiffre d’affaires.',
  },
  invoicesCount: {
    key: 'invoicesCount', title: 'Factures', description: 'Nombre de factures non supprimées créées pendant la période.',
    formula: 'Comptage des documents de type facture par date de création',
  },
  cancelledSalesCount: {
    key: 'cancelledSalesCount', title: 'Ventes annulées', description: 'Nombre de documents de vente annulés pendant la période.',
    formula: 'Comptage des ventes au statut annulé par date de création',
    interpretation: 'Ces documents sont exclus du CA, des coûts vendus et du nombre de ventes comptabilisées.',
  },
  creditNotesCount: {
    key: 'creditNotesCount', title: 'Avoirs émis', description: 'Nombre d’avoirs non annulés dont la date d’avoir appartient à la période.',
    formula: 'Comptage des avoirs actifs par date d’avoir',
  },
  creditNotesAmount: {
    key: 'creditNotesAmount', title: 'Montant des avoirs', description: 'Montant total TTC, timbre inclus, des avoirs non annulés de la période.',
    formula: 'Somme du total des avoirs + timbre fiscal',
    interpretation: 'Pour le CA net HT, seule la base HT de ces avoirs est déduite.',
  },
  refundedAmount: {
    key: 'refundedAmount', title: 'Montant remboursé', description: 'Sommes effectivement remboursées aux clients au titre des avoirs de la période.',
    formula: 'Somme des montants remboursés enregistrés sur les avoirs',
  },
  activeProducts: {
    key: 'activeProducts', title: 'Produits actifs', description: 'Nombre de fiches produit actives et non supprimées.',
    formula: 'Comptage des produits actifs', interpretation: 'La valeur est globale et ne dépend pas de la période de vente.',
  },
  lowStockProducts: {
    key: 'lowStockProducts', title: 'Produits sous seuil', description: 'Produits dont la quantité est positive mais inférieure ou égale au seuil minimum configuré.',
    formula: 'Comptage des produits avec 0 < quantité ≤ stock minimum',
    interpretation: 'Ces produits sont encore disponibles mais nécessitent un réapprovisionnement.',
  },
  outOfStockProducts: {
    key: 'outOfStockProducts', title: 'Ruptures de stock', description: 'Produits dont la quantité disponible est nulle ou négative.',
    formula: 'Comptage des produits avec quantité ≤ 0',
  },
  stockQuantity: {
    key: 'stockQuantity', title: 'Quantité en stock', description: 'Somme des quantités actuellement disponibles pour tous les produits actifs.',
    formula: 'Σ quantité courante des produits actifs', interpretation: 'Il s’agit d’un état courant, indépendant de la période sélectionnée.',
  },
  stockEntries: {
    key: 'stockEntries', title: 'Entrées de stock', description: 'Quantités entrées en stock pendant la période.',
    included: ['Entrées manuelles', 'Réceptions fournisseur', 'Retours client'],
  },
  stockExits: {
    key: 'stockExits', title: 'Sorties de stock', description: 'Quantités sorties du stock pendant la période.',
    included: ['Sorties manuelles', 'Ventes', 'Retours fournisseur'],
  },
  stockAlerts: {
    key: 'stockAlerts', title: 'Alertes stock', description: 'Alertes de stock bas ou de rupture actuellement présentes.',
    interpretation: 'Le sous-total « non lues » indique les alertes qui n’ont pas encore été consultées.',
  },
  customersCount: {
    key: 'customersCount', title: 'Total clients', description: 'Nombre total de fiches client actives suivies par Stockini.',
    formula: 'Comptage des clients non supprimés', interpretation: 'Cette valeur est globale et ne dépend pas de la période du rapport.',
  },
  currentCustomerDebt: {
    key: 'currentCustomerDebt', title: 'Dettes clients', description: 'Total courant des montants que les clients doivent encore régler.',
    formula: 'Somme des créances clients encore ouvertes', interpretation: 'Cette valeur est un encours global, et non seulement la dette créée pendant la période.',
  },
  retainedSurplus: {
    key: 'retainedSurplus', title: 'Écarts encaissés', description: 'Monnaie non rendue conservée et classée comme autre revenu pendant la période.',
    formula: 'Somme des surplus de règlement conservés', excluded: ['Marge commerciale sur les produits'],
  },
  cashInflows: {
    key: 'cashInflows', title: 'Entrées de trésorerie', description: 'Total des mouvements entrants enregistrés sur le compte affiché pendant la période.',
    formula: 'Somme des mouvements de caisse entrants non effacés', interpretation: 'Une entrée de trésorerie ne constitue pas nécessairement du chiffre d’affaires.',
  },
  cashOutflows: {
    key: 'cashOutflows', title: 'Sorties de trésorerie', description: 'Total des mouvements sortants enregistrés sur le compte affiché pendant la période.',
    formula: 'Somme des mouvements de caisse sortants non effacés', interpretation: 'Une sortie de trésorerie ne constitue pas nécessairement une dépense commerciale.',
  },
};

export function formatKpiPeriod(
  label: string,
  range?: { from: string; to: string },
): string {
  if (!range || !label.toLowerCase().includes('personnalis')) return label;
  const format = (value: string) =>
    new Intl.DateTimeFormat('fr-TN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      .format(new Date(value));
  return `Du ${format(range.from)} au ${format(range.to)}`;
}
