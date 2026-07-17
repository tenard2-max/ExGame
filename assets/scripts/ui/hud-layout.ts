/** 디자인 해상도(1280×720) UI 좌표계 기준 HUD 배치 상수입니다. */

export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;

export const HOTBAR_SLOT_SIZE = 84;
export const HOTBAR_SLOT_GAP = 12;
export const HOTBAR_BOTTOM_MARGIN = 22;
export const HOTBAR_SLOT_COUNT = 5;

export const SAVE_BUTTON_WIDTH = 132;
export const SAVE_BUTTON_HEIGHT = 44;
export const SAVE_BUTTON_GAP = 10;
export const SAVE_BUTTON_COUNT = 4;
export const SAVE_MARGIN = 16;

export function getHotbarCenterY(): number {
  return HOTBAR_BOTTOM_MARGIN + HOTBAR_SLOT_SIZE / 2;
}

export function getHotbarSlotCenterX(index: number): number {
  const totalWidth = HOTBAR_SLOT_COUNT * HOTBAR_SLOT_SIZE
    + (HOTBAR_SLOT_COUNT - 1) * HOTBAR_SLOT_GAP;
  return DESIGN_WIDTH / 2
    - totalWidth / 2
    + HOTBAR_SLOT_SIZE / 2
    + index * (HOTBAR_SLOT_SIZE + HOTBAR_SLOT_GAP);
}

/** 월드 상호작용이 먹히면 안 되는 HUD 영역인지 판정합니다. */
export function isUiLocationOverHud(uiX: number, uiY: number): boolean {
  return isOverHotbar(uiX, uiY) || isOverSaveHud(uiX, uiY);
}

export function hitTestHotbarSlot(uiX: number, uiY: number): number | null {
  if (!isOverHotbar(uiX, uiY)) return null;
  for (let index = 0; index < HOTBAR_SLOT_COUNT; index += 1) {
    const centerX = getHotbarSlotCenterX(index);
    const centerY = getHotbarCenterY();
    if (
      Math.abs(uiX - centerX) <= HOTBAR_SLOT_SIZE / 2
      && Math.abs(uiY - centerY) <= HOTBAR_SLOT_SIZE / 2
    ) {
      return index;
    }
  }
  return null;
}

export function hitTestSaveButton(uiX: number, uiY: number): number | null {
  if (!isOverSaveHud(uiX, uiY)) return null;
  for (let index = 0; index < SAVE_BUTTON_COUNT; index += 1) {
    const centerX = DESIGN_WIDTH - SAVE_MARGIN - SAVE_BUTTON_WIDTH / 2;
    const centerY = DESIGN_HEIGHT
      - SAVE_MARGIN
      - index * (SAVE_BUTTON_HEIGHT + SAVE_BUTTON_GAP)
      - SAVE_BUTTON_HEIGHT / 2;
    if (
      Math.abs(uiX - centerX) <= SAVE_BUTTON_WIDTH / 2
      && Math.abs(uiY - centerY) <= SAVE_BUTTON_HEIGHT / 2
    ) {
      return index;
    }
  }
  return null;
}

function isOverHotbar(uiX: number, uiY: number): boolean {
  const totalWidth = HOTBAR_SLOT_COUNT * HOTBAR_SLOT_SIZE
    + (HOTBAR_SLOT_COUNT - 1) * HOTBAR_SLOT_GAP;
  const left = DESIGN_WIDTH / 2 - totalWidth / 2;
  const right = left + totalWidth;
  const bottom = HOTBAR_BOTTOM_MARGIN;
  const top = bottom + HOTBAR_SLOT_SIZE;
  return uiX >= left && uiX <= right && uiY >= bottom && uiY <= top;
}

function isOverSaveHud(uiX: number, uiY: number): boolean {
  const left = DESIGN_WIDTH - SAVE_MARGIN - SAVE_BUTTON_WIDTH;
  const right = DESIGN_WIDTH - SAVE_MARGIN;
  const top = DESIGN_HEIGHT - SAVE_MARGIN;
  const bottom = top
    - SAVE_BUTTON_COUNT * SAVE_BUTTON_HEIGHT
    - (SAVE_BUTTON_COUNT - 1) * SAVE_BUTTON_GAP;
  return uiX >= left && uiX <= right && uiY >= bottom && uiY <= top;
}
