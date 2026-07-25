/**
 * 선택 가능한 플레이어 캐릭터 정의입니다.
 * 초상화·플레이 스프라이트는 textures/characters 아래에 둡니다.
 */

export type CharacterId = string;

export interface CharacterDefinition {
  readonly id: CharacterId;
  readonly displayName: string;
  readonly portraitUrl: string;
  readonly playUrl: string;
}

export const DEFAULT_CHARACTER_ID: CharacterId = 'rainbow_sword';

const CHARACTER_ENTRIES: ReadonlyArray<{ id: CharacterId; displayName: string }> = [
  { id: 'rainbow_sword', displayName: '무지개 검사' },
  { id: 'pink_rogue', displayName: '핑크 도적' },
  { id: 'jade_mage', displayName: '비취 마법사' },
  { id: 'turquoise_priest', displayName: '청록 사제' },
  { id: 'silver_noble', displayName: '은빛 귀족' },
  { id: 'jade_staff', displayName: '비취 지팡이' },
  { id: 'blossom_mage', displayName: '벚꽃 무녀' },
  { id: 'gold_warrior', displayName: '황금 전사' },
  { id: 'forest_axe', displayName: '숲의 도끼전사' },
  { id: 'crimson_knight', displayName: '홍안 기사' },
  { id: 'scarlet_elf', displayName: '진홍 엘프' },
  { id: 'aurora_mage', displayName: '오로라 마법사' },
  { id: 'crimson_whip', displayName: '진홍 채찍' },
  { id: 'scarlet_gunner', displayName: '진홍 건슬링어' },
  { id: 'pink_halberd', displayName: '분홍 극창' },
  { id: 'ruby_glaive', displayName: '루비 창기사' },
  { id: 'peach_archer', displayName: '복숭아 궁수' },
  { id: 'rose_archer', displayName: '장미 궁수' },
  { id: 'golden_sniper', displayName: '황금 저격수' },
  { id: 'lotus_archer', displayName: '연꽃 궁수' },
  { id: 'holy_grimoire', displayName: '성서의 사제' },
  { id: 'crimson_bow', displayName: '진홍 은궁' },
  { id: 'orange_grimoire', displayName: '주황 마도서' },
  { id: 'lavender_fencer', displayName: '라벤더 펜서' },
];

export const PLAYABLE_CHARACTERS: ReadonlyArray<CharacterDefinition> = CHARACTER_ENTRIES.map(
  (entry) => ({
    id: entry.id,
    displayName: entry.displayName,
    portraitUrl: `./characters/portraits/${entry.id}.png`,
    playUrl: `./characters/play/${entry.id}.png`,
  }),
);

export function getCharacterDefinition(
  characterId: CharacterId | null | undefined,
): CharacterDefinition {
  const found = PLAYABLE_CHARACTERS.find((entry) => entry.id === characterId);
  return found ?? PLAYABLE_CHARACTERS[0]!;
}

export function isKnownCharacterId(characterId: string): boolean {
  return PLAYABLE_CHARACTERS.some((entry) => entry.id === characterId);
}
