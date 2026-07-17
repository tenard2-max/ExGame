# ExGame 핵심 아키텍처

이 문서는 3단계에서 확정한 코드 계약과 불변식을 설명합니다. 구현 세부는 이후 단계에서 추가합니다.

## 핵심 원칙

> 월드는 무한 배열이 아니라 필요할 때 계산되는 함수다.

```text
generate(worldSeed, chunkX, chunkY) -> GeneratedChunk
```

- 같은 Seed와 청크 좌표는 언제나 같은 `GeneratedChunk`를 반환해야 합니다.
- 생성 코드에서 `Math.random()`을 직접 사용하지 않습니다.
- 숫자 정밀도 손실을 막기 위해 `WorldSeed`는 문자열로 직렬화합니다.
- 생성된 원본 청크는 저장하지 않습니다.
- 저장 데이터는 Seed, 플레이어 상태, 청크 변경분(delta)만 포함합니다.

## 생성 파이프라인

```text
WorldGenerator
├─ WorldGenerationPipeline
│  └─ Seed → Biome → Terrain → River → Forest
└─ ContentGenerationPipeline
   └─ Ore → Dungeon → NPC → Treasure → Monster
```

월드 지형과 콘텐츠 계약을 분리하여 광석·던전·NPC·몬스터를 추가해도 지형 생성 계약을 바꾸지 않도록 합니다.

모든 생성 단계는 `GenerationContext`로 Seed, 청크 좌표, `DeterministicRandom`을 전달받습니다. 하위 생성기는 이름이 고정된 namespace로 난수 스트림을 `fork`해야 합니다. 한 생성기에 난수 호출이 추가되어도 다른 생성기의 결과가 밀리지 않게 하기 위함입니다.

## 청크 수명주기

`ChunkManager.syncAround(center)`가 플레이어의 중심 청크 변경을 처리합니다.

1. 중심 주변 3×3 좌표를 계산합니다.
2. 아직 없는 좌표만 로컬 변경분 조회 후 Seed로 생성합니다.
3. 변경분을 생성 결과에 적용합니다.
4. 범위를 벗어난 청크의 변경분 저장을 완료합니다.
5. 저장이 성공한 청크만 메모리에서 해제합니다.

불변식:

- 선행 생성(prefetch) 금지
- 메모리의 활성 청크는 최대 9개
- 저장 완료 전에 언로드 금지
- 저장 데이터가 없어도 Seed로 같은 청크를 복구할 수 있어야 함

## 저장 모델

```text
SaveGame
├─ schemaVersion
├─ metadata
├─ world.seed
├─ player
└─ chunkDeltas
   ├─ 변경/제거된 블록
   ├─ 제거된 생성 엔티티 ID
   └─ 플레이어가 배치한 엔티티
```

`ChunkDelta`에 원본 `GeneratedChunk`를 넣지 않습니다. 최종 청크는 다음 식으로 복원합니다.

```text
finalChunk = generate(seed, x, y) + chunkDelta(x, y)
```

## 스키마 버전과 마이그레이션

- 현재 버전은 `SAVE_SCHEMA_VERSION`에서 단일 관리합니다.
- 저장 루트의 `schemaVersion`은 필수입니다.
- 마이그레이션은 `SaveMigrationRegistry`에 연속된 버전 단위로 등록합니다.
- 알 수 없는 버전, 중간 버전 누락, 검증 실패는 조용히 무시하지 않고 오류로 처리합니다.
- 마이그레이션 전 원본 데이터는 덮어쓰지 않습니다.

## 현재 구현 경계

- 타입·인터페이스와 스키마: 3단계 완료
- 입력·캐릭터·카메라: 4단계 완료
- 결정적 PRNG·지형·광석·3×3 청크 스트리밍: 5단계 완료
- 채굴·설치와 변경분(delta) localStorage 저장: 6단계 완료
- 광맥 채굴·자원 티어·인벤토리·핫바: 7단계 완료
- 몬스터·보물·NPC·던전과 레벨·전투: 8단계 완료
- IndexedDB 세이브 슬롯·플레이어 상태 영속화: 9단계
