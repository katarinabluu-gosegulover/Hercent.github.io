# Ethernaut Level 32 - Impersonator

## 문제 설명

IoT 도어락을 스마트 컨트랙트로 구현한 `ECLocker`에서,
누구나 문을 열 수 있도록 시스템을 탈취하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract ECLocker {
    uint256 public immutable lockId;
    bytes32 public immutable msgHash;
    address public controller;
    mapping(bytes32 => bool) public usedSignatures;

    constructor(uint256 _lockId, bytes memory _signature) {
        // msgHash 계산: "\x19Ethereum Signed Message:\n32" + lockId
        // v, r, s 순서로 ecrecover 호출 (비표준!)
        // ← assembly에서 v, r, s 순서가 뒤바뀜
    }

    function _isValidSignature(uint8 v, bytes32 r, bytes32 s) internal returns (address) {
        address _address = ecrecover(msgHash, v, r, s);
        require(_address == controller, InvalidController());

        bytes32 signatureHash = keccak256(abi.encode([uint256(r), uint256(s), uint256(v)]));
        require(!usedSignatures[signatureHash], SignatureAlreadyUsed());

        usedSignatures[signatureHash] = true;
        return _address;
    }
}
```

---

## 취약점 분석

### 1. 생성자의 v, r, s 순서 오류

표준 `ecrecover` 파라미터 순서: `ecrecover(hash, v, r, s)`

그러나 생성자의 어셈블리 코드를 보면:

```solidity
mstore(add(ptr, 32), mload(add(_signature, 0x60))) // v 위치에 → s 값!
mstore(add(ptr, 64), mload(add(_signature, 0x20))) // r 위치에 → r 값
mstore(add(ptr, 96), mload(add(_signature, 0x40))) // s 위치에 → s 값
```

`_signature`의 메모리 레이아웃:
```
0x00      : length
0x20      : r  (32 bytes)
0x40      : s  (32 bytes)
0x60      : v  (32 bytes)
```

즉 생성자에서 `ecrecover(hash, s, r, s)`로 호출하고 있다!
→ controller는 `ecrecover(hash, v, r, s)`가 아닌 **`ecrecover(hash, s, r, s)`의 결과**

### 2. Signature Malleability (서명 가변성)

ECDSA 서명 `(v, r, s)`에는 수학적으로 동일한 서명 쌍이 존재한다:

```
원본:  (v,  r,  s)
변형:  (v', r, -s mod n)

secp256k1 곡선에서:
s' = n - s  (n은 곡선의 위수)
v' = v % 2 == 0 ? v + 1 : v - 1  (27↔28)
```

두 서명 모두 `ecrecover`로 동일한 주소를 복구한다.

### 3. 공격 흐름

```
1. 배포 시 사용된 signature = (r, s, v) 이벤트에서 획득
2. 생성자는 ecrecover(hash, s, r, s)로 controller 설정
   → controller = ecrecover(hash, s, r, s)의 결과 주소
3. _isValidSignature는 ecrecover(hash, v, r, s) 사용
   → 표준 서명으로는 controller 불일치
4. Malleable 서명 계산:
   s' = n - s
   v' = v % 2 == 0 ? v+1 : v-1
5. ecrecover(hash, v', r, s') == ecrecover(hash, s, r, s) == controller
   → _isValidSignature 통과!
6. changeController(v', r, s', player) 호출 → controller = player
```

---

## 공격 단계

### Step 1 — 배포 이벤트에서 signature 확인

```js
// NewLock 이벤트에서 signature 추출
let events = await impersonator.getPastEvents('NewLock', { fromBlock: 0 })
let sig = events[0].returnValues.signature
// sig = r(32) + s(32) + v(1) 형태
let r = sig.slice(0, 66)
let s = '0x' + sig.slice(66, 130)
let v = parseInt(sig.slice(130, 132), 16)
```

### Step 2 — Malleable 서명 계산

```js
const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')

// s' = n - s
let sBig = BigInt(s)
let sPrime = n - sBig
let sPrimeHex = '0x' + sPrime.toString(16).padStart(64, '0')

// v' = 27↔28 토글
let vPrime = v === 27 ? 28 : 27
```

### Step 3 — changeController 호출

```js
await locker.changeController(vPrime, r, sPrimeHex, player)
```

### Step 4 — 확인

```js
await locker.controller()
// → 내 지갑 주소
```

---

## 핵심 교훈

- 어셈블리로 `ecrecover` 호출 시 파라미터 순서를 반드시 검증
- ECDSA 서명은 **Signature Malleability** 취약점이 있음
  - `(v, r, s)`와 `(v', r, n-s)` 모두 동일한 주소를 복구
- OpenZeppelin의 `ECDSA.recover()`는 s가 상위 절반 범위인지 검증하여 malleability 방지

```solidity
// ✅ 안전 - OpenZeppelin ECDSA 사용
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
address signer = ECDSA.recover(hash, signature);

// ❌ 위험 - 직접 ecrecover 사용 시 s 범위 검증 필수
require(uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0);
```
