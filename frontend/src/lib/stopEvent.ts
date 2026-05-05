import type { SyntheticEvent } from 'react';

/**
 * Stops both bubbling and default behavior for any synthetic React event.
 * Use on every interactive element inside a navigable row / card / link wrapper.
 */
export function stopEvent(e: SyntheticEvent): void {
  e.preventDefault();
  e.stopPropagation();
}
