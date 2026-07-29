import { Camera, Node, Vec3, view } from 'cc';

/** 디자인 해상도(2560×1440) UI 좌표계 기준 HUD 배치 상수입니다. */

export const DESIGN_WIDTH = 2560;
export const DESIGN_HEIGHT = 1440;

const uiToScreenPos = new Vec3();
const uiToWorldPos = new Vec3();

/**
 * getUILocation(가시 영역) → 디자인 좌표(2560×1440)로 변환합니다.
 * SHOW_ALL 레터박스·창 리사이즈 시 히트테스트 어긋남을 막습니다.
 */
export function normalizeUiToDesign(uiX: number, uiY: number): { x: number; y: number } {
  const visible = view.getVisibleSize();
  const origin = view.getVisibleOrigin();
  const width = Math.max(1, visible.width);
  const height = Math.max(1, visible.height);
  return {
    x: ((uiX - origin.x) / width) * DESIGN_WIDTH,
    y: ((uiY - origin.y) / height) * DESIGN_HEIGHT,
  };
}

/**
 * getUILocation → Canvas 로컬 픽셀(카메라 뷰 공간).
 * HUD·툴팁 배치용만 사용.
 *
 * @deprecated-for-world-hit 월드 오브젝트 히트에는 쓰지 말 것.
 *   → `world-ui-hit.ts` (`getEntityUIBounds` / `hitTestWorldEntity` / `getChunkTileUIBounds`).
 *   과거 줌 보정(÷World.scale, probe, 경험식) 경로의 잔여 — tooltip canvasLocal 전용으로 유지.
 */
export function uiLocationToCanvasLocal(
  uiX: number,
  uiY: number,
  cameraNode: Node,
): { x: number; y: number } {
  const camera = cameraNode.getComponent(Camera);
  const visible = view.getVisibleSize();
  const origin = view.getVisibleOrigin();
  if (!camera) {
    return {
      x: cameraNode.position.x + (uiX - origin.x) - visible.width / 2,
      y: cameraNode.position.y + (uiY - origin.y) - visible.height / 2,
    };
  }

  const viewport = view.getViewportRect();
  const scaleX = view.getScaleX() || 1;
  const scaleY = view.getScaleY() || 1;
  uiToScreenPos.set(
    (uiX - origin.x) * scaleX + viewport.x,
    (uiY - origin.y) * scaleY + viewport.y,
    0,
  );
  camera.screenToWorld(uiToScreenPos, uiToWorldPos);

  const canvas = cameraNode.parent;
  if (!canvas) {
    return { x: uiToWorldPos.x, y: uiToWorldPos.y };
  }
  return {
    x: uiToWorldPos.x - canvas.worldPosition.x,
    y: uiToWorldPos.y - canvas.worldPosition.y,
  };
}

export const HOTBAR_SLOT_SIZE = 84;
export const HOTBAR_SLOT_GAP = 12;
export const HOTBAR_BOTTOM_MARGIN = 22;
export const HOTBAR_SLOT_COUNT = 6;

export const SAVE_BUTTON_WIDTH = 200;
export const SAVE_BUTTON_HEIGHT = 48;
export const SAVE_BUTTON_GAP = 10;
export const SAVE_BUTTON_COUNT = 4;
export const SAVE_MARGIN = 16;

/** 좌측 상단 톱니바퀴(설정) 버튼 크기입니다. */
export const SETTINGS_GEAR_SIZE = 96;
export const SETTINGS_GEAR_GAP = 12;

export const SETTINGS_PANEL_WIDTH = 560;
export const SETTINGS_PANEL_HEIGHT = 1040;
export const SETTINGS_ROW_HEIGHT = 34;
export const SETTINGS_BUTTON_SIZE = 32;
/** 설정 목록 스크롤 영역 높이(헤더·푸터 제외). */
export const SETTINGS_LIST_VIEW_HEIGHT = 820;
/** @deprecated 오디오는 별도 DOM 패널로 분리됨. 호환용 상수. */
export const SETTINGS_BGM_SECTION_HEIGHT = 0;

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
  const design = normalizeUiToDesign(uiX, uiY);
  return isOverHotbar(design.x, design.y)
    || isOverSaveHud(design.x, design.y)
    || isOverSettingsGear(design.x, design.y)
    || isOverSettingsPanel(design.x, design.y)
    || isOverPotionMenu(design.x, design.y)
    || isOverInventoryMenu(design.x, design.y)
    || isOverLoadMenu(design.x, design.y)
    || isOverTeleporterMenu(design.x, design.y)
    || isOverBlacksmithMenu(design.x, design.y)
    || isOverMerchantMenu(design.x, design.y)
    || isOverBankerMenu(design.x, design.y);
}

/** 설정 패널이 열려 있을 때 패널 전체(반투명 배경 포함)를 막습니다. */
let settingsPanelOpen = false;
/** 포션 선택 메뉴가 열려 있을 때 월드 탭을 막습니다. */
let potionMenuOpen = false;
/** 아이템 창이 열려 있을 때 월드 탭을 막습니다. */
let inventoryMenuOpen = false;
/** 불러오기 목록이 열려 있을 때 월드 탭을 막습니다. */
let loadMenuOpen = false;
/** Media Timeline Editor 가 열려 있을 때 월드 입력·휠 줌을 막습니다. */
let mediaEditorOpen = false;
/** 텔레포터 UI가 열려 있을 때 월드 탭을 막습니다. */
let teleporterMenuOpen = false;
/** 대장장이 UI가 열려 있을 때 월드 탭을 막습니다. */
let blacksmithMenuOpen = false;
/** 상인 UI가 열려 있을 때 월드 탭을 막습니다. */
let merchantMenuOpen = false;
/** 은행 UI가 열려 있을 때 월드 탭을 막습니다. */
let bankerMenuOpen = false;

export function setSettingsPanelOpen(isOpen: boolean): void {
  settingsPanelOpen = isOpen;
}

export function isSettingsPanelOpen(): boolean {
  return settingsPanelOpen;
}

export function setPotionMenuOpen(isOpen: boolean): void {
  potionMenuOpen = isOpen;
}

export function isPotionMenuOpen(): boolean {
  return potionMenuOpen;
}

export function setInventoryMenuOpen(isOpen: boolean): void {
  inventoryMenuOpen = isOpen;
}

export function isInventoryMenuOpen(): boolean {
  return inventoryMenuOpen;
}

export function setLoadMenuOpen(isOpen: boolean): void {
  loadMenuOpen = isOpen;
}

export function isLoadMenuOpen(): boolean {
  return loadMenuOpen;
}

export function setMediaEditorOpen(isOpen: boolean): void {
  mediaEditorOpen = isOpen;
}

export function isMediaEditorOpen(): boolean {
  return mediaEditorOpen;
}

/** 모달 UI가 열려 포인터 이동/탭을 월드에 넘기면 안 될 때. */
export function isModalMenuBlockingPointer(): boolean {
  return settingsPanelOpen
    || potionMenuOpen
    || inventoryMenuOpen
    || loadMenuOpen
    || mediaEditorOpen
    || teleporterMenuOpen
    || blacksmithMenuOpen
    || merchantMenuOpen
    || bankerMenuOpen;
}

export function setTeleporterMenuOpen(isOpen: boolean): void {
  teleporterMenuOpen = isOpen;
}

export function isTeleporterMenuOpen(): boolean {
  return teleporterMenuOpen;
}

export function setBlacksmithMenuOpen(isOpen: boolean): void {
  blacksmithMenuOpen = isOpen;
}

export function isBlacksmithMenuOpen(): boolean {
  return blacksmithMenuOpen;
}

export function setMerchantMenuOpen(isOpen: boolean): void {
  merchantMenuOpen = isOpen;
}

export function isMerchantMenuOpen(): boolean {
  return merchantMenuOpen;
}

export function setBankerMenuOpen(isOpen: boolean): void {
  bankerMenuOpen = isOpen;
}

export function isBankerMenuOpen(): boolean {
  return bankerMenuOpen;
}

export function getSettingsGearCenter(): { x: number; y: number } {
  // SettingsHud 루트(좌상단 18,18) 기준 톱니 위치와 일치시킵니다.
  return {
    x: 18 + SETTINGS_GEAR_SIZE / 2,
    y: DESIGN_HEIGHT - 18 - 72 - SETTINGS_GEAR_SIZE / 2,
  };
}

/** 설정 톱니 히트 여유(px, 디자인 좌표). */
export const SETTINGS_GEAR_HIT_PAD = 28;

export function hitTestSettingsGear(uiX: number, uiY: number): boolean {
  const design = normalizeUiToDesign(uiX, uiY);
  return isOverSettingsGear(design.x, design.y);
}

export function hitTestHotbarSlot(uiX: number, uiY: number): number | null {
  const design = normalizeUiToDesign(uiX, uiY);
  if (!isOverHotbar(design.x, design.y)) return null;
  for (let index = 0; index < HOTBAR_SLOT_COUNT; index += 1) {
    const centerX = getHotbarSlotCenterX(index);
    const centerY = getHotbarCenterY();
    if (
      Math.abs(design.x - centerX) <= HOTBAR_SLOT_SIZE / 2
      && Math.abs(design.y - centerY) <= HOTBAR_SLOT_SIZE / 2
    ) {
      return index;
    }
  }
  return null;
}

export function hitTestSaveButton(uiX: number, uiY: number): number | null {
  const design = normalizeUiToDesign(uiX, uiY);
  if (!isOverSaveHud(design.x, design.y)) return null;
  for (let index = 0; index < SAVE_BUTTON_COUNT; index += 1) {
    const centerX = DESIGN_WIDTH - SAVE_MARGIN - SAVE_BUTTON_WIDTH / 2;
    const centerY = DESIGN_HEIGHT
      - SAVE_MARGIN
      - index * (SAVE_BUTTON_HEIGHT + SAVE_BUTTON_GAP)
      - SAVE_BUTTON_HEIGHT / 2;
    if (
      Math.abs(design.x - centerX) <= SAVE_BUTTON_WIDTH / 2
      && Math.abs(design.y - centerY) <= SAVE_BUTTON_HEIGHT / 2
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
  // 화면 스케일에 따른 히트 오차를 흡수하도록 상하 여유를 둡니다.
  const pad = SAVE_BUTTON_GAP + 4;
  const left = DESIGN_WIDTH - SAVE_MARGIN - SAVE_BUTTON_WIDTH - pad;
  const right = DESIGN_WIDTH - SAVE_MARGIN + pad;
  const top = DESIGN_HEIGHT - SAVE_MARGIN + pad;
  const bottom = top
    - SAVE_BUTTON_COUNT * SAVE_BUTTON_HEIGHT
    - (SAVE_BUTTON_COUNT - 1) * SAVE_BUTTON_GAP
    - pad * 2;
  return uiX >= left && uiX <= right && uiY >= bottom && uiY <= top;
}

function isOverSettingsGear(uiX: number, uiY: number): boolean {
  const center = getSettingsGearCenter();
  const half = SETTINGS_GEAR_SIZE / 2 + SETTINGS_GEAR_HIT_PAD;
  return Math.abs(uiX - center.x) <= half
    && Math.abs(uiY - center.y) <= half;
}

function isOverSettingsPanel(uiX: number, uiY: number): boolean {
  // 패널이 열려 있으면 화면 어디를 눌러도 월드 입력을 막습니다.
  if (!settingsPanelOpen) return false;
  return uiX >= 0 && uiX <= DESIGN_WIDTH && uiY >= 0 && uiY <= DESIGN_HEIGHT;
}

function isOverPotionMenu(uiX: number, uiY: number): boolean {
  if (!potionMenuOpen) return false;
  const panelCenterUiX = DESIGN_WIDTH / 2;
  const panelCenterUiY = DESIGN_HEIGHT / 2 - 80;
  const halfW = 230;
  const halfH = 150;
  return Math.abs(uiX - panelCenterUiX) <= halfW
    && Math.abs(uiY - panelCenterUiY) <= halfH;
}

function isOverInventoryMenu(uiX: number, uiY: number): boolean {
  if (!inventoryMenuOpen) return false;
  const panelCenterUiX = DESIGN_WIDTH / 2;
  const panelCenterUiY = DESIGN_HEIGHT / 2 - 40;
  const halfW = 280;
  const halfH = 280;
  return Math.abs(uiX - panelCenterUiX) <= halfW
    && Math.abs(uiY - panelCenterUiY) <= halfH;
}

function isOverLoadMenu(uiX: number, uiY: number): boolean {
  // 열려 있으면 화면 전체에서 월드 탭을 막아 스크롤·탭이 월드로 새지 않게 합니다.
  if (!loadMenuOpen) return false;
  return uiX >= 0 && uiX <= DESIGN_WIDTH && uiY >= 0 && uiY <= DESIGN_HEIGHT;
}

function isOverTeleporterMenu(uiX: number, uiY: number): boolean {
  if (!teleporterMenuOpen) return false;
  return uiX >= 0 && uiX <= DESIGN_WIDTH && uiY >= 0 && uiY <= DESIGN_HEIGHT;
}

function isOverBlacksmithMenu(uiX: number, uiY: number): boolean {
  if (!blacksmithMenuOpen) return false;
  return uiX >= 0 && uiX <= DESIGN_WIDTH && uiY >= 0 && uiY <= DESIGN_HEIGHT;
}

function isOverMerchantMenu(uiX: number, uiY: number): boolean {
  if (!merchantMenuOpen) return false;
  return uiX >= 0 && uiX <= DESIGN_WIDTH && uiY >= 0 && uiY <= DESIGN_HEIGHT;
}

function isOverBankerMenu(uiX: number, uiY: number): boolean {
  if (!bankerMenuOpen) return false;
  return uiX >= 0 && uiX <= DESIGN_WIDTH && uiY >= 0 && uiY <= DESIGN_HEIGHT;
}
