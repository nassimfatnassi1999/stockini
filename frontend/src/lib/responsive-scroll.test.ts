import assert from 'node:assert/strict';
import test from 'node:test';
import { getHorizontalScrollState } from './responsive-scroll';

test('masque l’indicateur quand le tableau tient dans son conteneur', () => {
  assert.deepEqual(
    getHorizontalScrollState({ scrollWidth: 320, clientWidth: 320, scrollLeft: 0 }),
    { hasOverflow: false, isAtEnd: true },
  );
});

test('affiche l’indicateur tant que du contenu reste à droite', () => {
  assert.deepEqual(
    getHorizontalScrollState({ scrollWidth: 800, clientWidth: 320, scrollLeft: 100 }),
    { hasOverflow: true, isAtEnd: false },
  );
});

test('atténue l’indicateur à la fin du défilement', () => {
  assert.deepEqual(
    getHorizontalScrollState({ scrollWidth: 800, clientWidth: 320, scrollLeft: 480 }),
    { hasOverflow: true, isAtEnd: true },
  );
});
