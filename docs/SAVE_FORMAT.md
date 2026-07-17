# 세이브 포맷

ExGame은 원본 지형을 저장하지 않습니다.  
영속 데이터는 **스키마 버전 + Seed + 플레이어 상태 + 청크 변경분(delta)** 뿐입니다.

## 저장소

- 기술: IndexedDB (`exgame-saves`)
- 기본 슬롯: `slot-1`
- object store
  - `slots`: 슬롯 메타데이터와 플레이어 상태
  - `chunkDeltas`: 청크별 변경분 (`key = slotId:x,y`)

## SaveGame JSON (export/import)

```json
{
  "schemaVersion": 1,
  "metadata": {
    "slotId": "slot-1",
    "createdAtIso": "2026-07-17T00:00:00.000Z",
    "updatedAtIso": "2026-07-17T00:00:00.000Z"
  },
  "world": {
    "seed": "851294"
  },
  "player": {
    "position": {
      "chunk": { "x": 0, "y": 0 },
      "tile": { "x": 8, "y": 8 }
    },
    "stats": {
      "level": 1,
      "experience": 0,
      "health": 10,
      "maxHealth": 10
    },
    "inventory": {
      "capacity": 20,
      "stacks": [{ "itemId": "rock", "quantity": 3 }],
      "equipment": [],
      "quickSlots": ["rock", "wood", "coal", "iron", "ark"]
    }
  },
  "chunkDeltas": {
    "0,2": {
      "coordinate": { "x": 0, "y": 2 },
      "revision": 1,
      "blocks": [
        { "coordinate": { "x": 5, "y": 0 }, "blockId": null }
      ],
      "removedGeneratedEntityIds": ["monster-slime:0:-14"],
      "placedEntities": []
    }
  }
}
```

## 복원 규칙

1. Seed로 원본 청크를 재계산한다.
2. 해당 청크의 delta가 있으면 블록·엔티티 변경을 겹친다.
3. 플레이어 위치·레벨·체력·인벤토리를 복원한다.
4. 미방문·미변경 청크는 저장 파일에 존재하지 않는다.

## 마이그레이션

- `schemaVersion`이 현재보다 낮으면 등록된 마이그레이션을 연속 적용한다.
- 중간 버전 누락이나 검증 실패는 오류로 처리하며, 원본 슬롯을 덮어쓰지 않는다.

## 조작

- `S`: 수동 저장
- `L`: 불러오기
- `E`: JSON 내보내기
- `I`: JSON 가져오기
- 자동 저장: 20초 간격 + 창 종료 직전 시도
- 청크 delta: 블록/엔티티 변경 직후 저장, 청크 언로드 시에도 저장
