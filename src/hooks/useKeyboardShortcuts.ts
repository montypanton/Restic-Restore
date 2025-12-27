import { useEffect } from 'react';

interface UseKeyboardShortcutsParams {
  /** Called when ESC is pressed */
  onEscape?: () => void;
  /** Enable shortcuts (default: true) */
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  onEscape,
  enabled = true
}: UseKeyboardShortcutsParams): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        onEscape();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onEscape, enabled]);
}
