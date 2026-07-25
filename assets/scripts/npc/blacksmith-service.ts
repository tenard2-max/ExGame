import type { InventoryModel } from '../inventory/inventory-model';
import {
  getItemDefinition,
  isEquipableArmor,
  isEquipableWeapon,
} from '../inventory/item-registry';
import type { ItemId } from '../inventory/item-types';
import type { PlayerStatsModel } from '../player/player-stats-model';
import {
  BLACKSMITH_CRAFT_RECIPES,
  BLACKSMITH_MAX_UPGRADE,
  BLACKSMITH_SERVICE_UNLOCK_LEVEL,
  getUpgradeTier,
  type CraftMaterial,
  type CraftRecipe,
} from './blacksmith-config';
import { rollIndependentOptions } from './equipment-affix';
import type { GearInstance, GearInstanceStore } from './gear-instance-store';

export type BlacksmithResult =
  | { readonly ok: true; readonly message: string; readonly gear?: GearInstance }
  | { readonly ok: false; readonly message: string };

/**
 * 대장장이 제조·강화 서비스입니다.
 * 실패 시에도 장비는 보존되고 재료만 소모됩니다.
 */
export class BlacksmithService {
  constructor(
    private readonly inventory: InventoryModel,
    private readonly gears: GearInstanceStore,
    private readonly playerStats: PlayerStatsModel,
  ) {}

  canUseServices(): boolean {
    return this.playerStats.getLevel() > BLACKSMITH_SERVICE_UNLOCK_LEVEL;
  }

  listCraftRecipes(): ReadonlyArray<CraftRecipe> {
    return BLACKSMITH_CRAFT_RECIPES;
  }

  craft(recipeId: string): BlacksmithResult {
    if (!this.canUseServices()) {
      return {
        ok: false,
        message: `제조·강화는 영웅 레벨 ${BLACKSMITH_SERVICE_UNLOCK_LEVEL + 1} 이상부터 가능합니다.`,
      };
    }
    const recipe = BLACKSMITH_CRAFT_RECIPES.find((entry) => entry.id === recipeId);
    if (!recipe) return { ok: false, message: '알 수 없는 제조 레시피입니다.' };
    if (this.playerStats.getLevel() <= recipe.unlockLevel) {
      return {
        ok: false,
        message: `${recipe.displayName} 제조는 레벨 ${recipe.unlockLevel + 1} 이상부터 가능합니다.`,
      };
    }
    if (!this.hasMaterials(recipe.materials)) {
      return { ok: false, message: '재료가 부족합니다.' };
    }
    if (!this.consumeMaterials(recipe.materials)) {
      return { ok: false, message: '재료 소모에 실패했습니다.' };
    }

    if (Math.random() >= recipe.successChance) {
      return {
        ok: false,
        message: `${recipe.displayName} 제조에 실패했습니다. (재료만 소모)`,
      };
    }

    const options = rollIndependentOptions(recipe.options, {});
    const gear = this.gears.add({
      itemId: recipe.resultItemId,
      upgradeLevel: 0,
      bonusAttack: 0,
      bonusDefense: 0,
      options,
    });
    const optionCount = Object.keys(options).length;
    const optionNote = optionCount > 0
      ? ` · 옵션 ${optionCount}개 부여`
      : '';
    return {
      ok: true,
      message: `${recipe.displayName} 제조 성공!${optionNote}`,
      gear,
    };
  }

  /**
   * 인벤 스택 장비를 기어로 등록한 뒤 강화합니다.
   * sourceStackItemId가 있으면 인벤에서 1개 소모 후 새 기어로 강화합니다.
   */
  upgrade(options: {
    readonly gearId?: string;
    readonly sourceStackItemId?: ItemId;
  }): BlacksmithResult {
    if (!this.canUseServices()) {
      return {
        ok: false,
        message: `제조·강화는 영웅 레벨 ${BLACKSMITH_SERVICE_UNLOCK_LEVEL + 1} 이상부터 가능합니다.`,
      };
    }

    let gear = options.gearId
      ? this.gears.findById(options.gearId)
      : null;
    let registeredFromStack = false;

    if (!gear && options.sourceStackItemId) {
      const itemId = options.sourceStackItemId;
      if (!isEquipableWeapon(itemId) && !isEquipableArmor(itemId)) {
        return { ok: false, message: '강화할 수 없는 아이템입니다.' };
      }
      if (this.inventory.getQuantity(itemId) <= 0) {
        return { ok: false, message: '인벤토리에 해당 장비가 없습니다.' };
      }
      // 재료·레벨 검사를 먼저 하고, 통과한 뒤에만 스택→기어 등록합니다.
      const previewLevel = 1;
      const previewTier = getUpgradeTier(previewLevel);
      if (this.playerStats.getLevel() <= previewTier.unlockLevel) {
        return {
          ok: false,
          message: `+${previewLevel} 강화는 레벨 ${previewTier.unlockLevel + 1} 이상부터 가능합니다.`,
        };
      }
      if (!this.hasMaterials(previewTier.materials)) {
        return { ok: false, message: '강화 재료가 부족합니다.' };
      }
      if (!this.inventory.remove(itemId, 1)) {
        return { ok: false, message: '장비 소모에 실패했습니다.' };
      }
      gear = this.gears.add({
        itemId,
        upgradeLevel: 0,
        bonusAttack: 0,
        bonusDefense: 0,
        options: {},
      });
      registeredFromStack = true;
    }

    if (!gear) return { ok: false, message: '강화할 장비를 선택하세요.' };
    if (gear.upgradeLevel >= BLACKSMITH_MAX_UPGRADE) {
      return { ok: false, message: '이미 최대 강화(+99)입니다.' };
    }

    const targetLevel = gear.upgradeLevel + 1;
    const tier = getUpgradeTier(targetLevel);
    if (this.playerStats.getLevel() <= tier.unlockLevel) {
      if (registeredFromStack) {
        this.gears.remove(gear.id);
        this.inventory.add(gear.itemId, 1);
      }
      return {
        ok: false,
        message: `+${targetLevel} 강화는 레벨 ${tier.unlockLevel + 1} 이상부터 가능합니다.`,
      };
    }
    if (!this.hasMaterials(tier.materials)) {
      if (registeredFromStack) {
        this.gears.remove(gear.id);
        this.inventory.add(gear.itemId, 1);
      }
      return { ok: false, message: '강화 재료가 부족합니다.' };
    }
    if (!this.consumeMaterials(tier.materials)) {
      if (registeredFromStack) {
        this.gears.remove(gear.id);
        this.inventory.add(gear.itemId, 1);
      }
      return { ok: false, message: '재료 소모에 실패했습니다.' };
    }

    const definition = getItemDefinition(gear.itemId);
    const isArmor = definition.kind === 'armor';

    if (Math.random() >= tier.successChance) {
      return {
        ok: false,
        message: `${definition.displayName} +${targetLevel} 강화 실패 (장비 보존 · 재료 소모)`,
      };
    }

    const rolledOptions = rollIndependentOptions(tier.options, gear.options);
    // 갑옷 강화 옵션 테이블은 무기 공격력 표기를 쓰므로, 갑옷이면 attack→defense 변환
    const nextOptions = isArmor
      ? remapWeaponOptionsToArmor(rolledOptions)
      : rolledOptions;

    const updated: GearInstance = {
      ...gear,
      upgradeLevel: targetLevel,
      bonusAttack: gear.bonusAttack + (isArmor ? 0 : tier.successAttack),
      bonusDefense: gear.bonusDefense + (isArmor ? tier.successDefense : 0),
      options: nextOptions,
    };
    this.gears.replace(updated);
    return {
      ok: true,
      message: `${definition.displayName} +${targetLevel} 강화 성공!`,
      gear: updated,
    };
  }

  private hasMaterials(materials: ReadonlyArray<CraftMaterial>): boolean {
    return materials.every(
      (mat) => this.inventory.getQuantity(mat.itemId) >= mat.amount,
    );
  }

  private consumeMaterials(materials: ReadonlyArray<CraftMaterial>): boolean {
    for (const mat of materials) {
      if (!this.inventory.remove(mat.itemId, mat.amount)) return false;
    }
    return true;
  }
}

function remapWeaponOptionsToArmor(
  options: GearInstance['options'],
): GearInstance['options'] {
  const next: GearInstance['options'] = {};
  for (const [grade, affix] of Object.entries(options)) {
    if (!affix) continue;
    next[grade as keyof typeof next] = {
      defense: affix.defense ?? affix.attack,
      maxHealth: affix.maxHealth,
      moveSpeedPercent: affix.moveSpeedPercent,
      attackSpeedPercent: affix.attackSpeedPercent,
    };
  }
  return next;
}
