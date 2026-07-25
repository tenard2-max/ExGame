/**
 * 한글 IME가 켜져 있어도 물리 키를 안정적으로 판별합니다.
 * `event.key`는 조합 중 한글이 될 수 있어 단축키에는 `event.code`를 씁니다.
 */

export function isEscapeKey(event: KeyboardEvent): boolean {
  return event.code === 'Escape' || event.key === 'Escape' || event.key === 'Esc';
}

export function matchesKeyCode(
  event: KeyboardEvent,
  code: string,
): boolean {
  return event.code === code;
}

/** Ctrl(또는 Meta)만 눌린 상태인지 — Alt 조합은 제외합니다. */
export function isPrimaryModifier(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey;
}

export function consumeKeyEvent(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}
