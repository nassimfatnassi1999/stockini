import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { formatAlertDate, getAlertTypePresentation, getAlertViewModel } from './alerts-presentation';
import type { Alert } from './stockini/types';

test('traduit les types d’alerte et leur associe une tonalité', () => {
  assert.deepEqual(getAlertTypePresentation('low stock'), { label: 'Stock faible', tone: 'warning' });
  assert.deepEqual(getAlertTypePresentation('OUT_OF_STOCK'), { label: 'Rupture de stock', tone: 'danger' });
  assert.deepEqual(getAlertTypePresentation('UNPAID_INVOICE'), { label: 'Facture impayée', tone: 'neutral' });
});

test('préserve les stocks nuls et utilise les données produit en fallback', () => {
  const alert = {
    id: 'alert-1', type: 'LOW_STOCK', title: 'Titre', message: 'Message', isRead: false, createdAt: '2026-07-27T12:30:41.000Z',
    currentStock: 0, minimumStock: null,
    product: { name: 'PATIN DE FREIN', reference: 'GDB2080', quantity: 12, minStock: 3 },
  } as Alert;

  assert.deepEqual(getAlertViewModel(alert), {
    designation: 'PATIN DE FREIN', reference: 'GDB2080', currentStock: 0, minimumStock: 3,
  });
});

test('affiche un tiret cadratin pour une date absente ou invalide', () => {
  assert.equal(formatAlertDate(undefined), '—');
  assert.equal(formatAlertDate('date-invalide'), '—');
  assert.match(formatAlertDate('2026-07-27T12:30:41.000Z', true), /2026/);
});

test('la vue alertes conserve ses garde-fous compacts, responsive et accessibles', () => {
  const page = readFileSync(join(process.cwd(), 'src/components/stockini/pages/AlertsPage.tsx'), 'utf8');
  const drawer = readFileSync(join(process.cwd(), 'src/components/stockini/alerts/AlertDetailsDrawer.tsx'), 'utf8');

  assert.doesNotMatch(page, /<th[^>]*>Message<\/th>/);
  assert.match(page, /Voir les détails/);
  assert.match(page, /ariaLabel="Actions de l’alerte"/);
  assert.match(page, /sm:hidden/);
  assert.match(page, /hidden sm:block/);
  assert.match(page, /Aucune alerte trouvée/);
  assert.match(page, /LoadingRows/);
  assert.match(page, /DataTablePagination/);
  assert.match(drawer, /Dialog\.Content/);
  assert.match(drawer, /Message complet/);
  assert.match(drawer, /aria-label="Fermer les détails"/);
});
