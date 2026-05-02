# Ethernaut Level 35 - Elliptic Token (EllipticCoin)

## 문제 설명

Bob이 만든 ERC20 토큰 `$ETK`에는 타원곡선 기반의 서명 시스템이 있다.
Bob이 ECDSA 알고리즘의 일부 단계를 "최적화"하면서 취약점이 생겼다.
Alice(0xA11CE...)가 방금 교환한 `$ETK` 토큰을 탈취하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract EllipticToken is Ownable, ERC20 {
    mapping(bytes32 => bool) public usedHashes;

    function redeemVoucher(
        uint256 amount,
        address receiver,
        bytes32 salt,
        bytes memory ownerSignature,
        bytes memory receiverSignature
    ) external {
        bytes32 voucherHash = keccak256(abi.encodePacked(amount, receiver, salt));
        require(!usedHashes[voucherHash], HashAlreadyUsed());
        require(ECDSA.recover(voucherHash, ownerSignature) == owner(), InvalidOwner());
        require(ECDSA.recover(voucherHash, receiverSignature) == receiver, InvalidReceiver());
        usedHashes[voucherHash] = true;
        _mint(receiver, amount);
    }

    function permit(
        uint256 amount,
        address spender,
        bytes memory tokenOwnerSignature,
        bytes memory spenderSignature
    ) external {
        bytes32 permitHash = keccak256(abi.encode(amount));
        require(!usedHashes[permitHash], HashAlreadyUsed());
        require(!usedHashes[bytes32(amount)], HashAlreadyUsed());  // ← bytes32(amount)도 체크

        // tokenOwner 복구: 해시 없이 amount 자체를 bytes32로 사용!
        address tokenOwner = ECDSA.recover(bytes32(amount), tokenOwnerSignature);

        bytes32 permitAcceptHash = keccak256(abi.encodePacked(tokenOwner, spender, amount));
        require(ECDSA.recover(permitAcceptHash, spenderSignature) == spender, InvalidSpender());

        usedHashes[permitHash] = true;
        _approve(tokenOwner, spender, amount);
    }
}
```

---

## 취약점 분석

### 1. permit()의 핵심 버그: 해시 없이 서명 검증

표준 ECDSA 서명은 **메시지를 해시한 값**에 서명한다:
```
sign(keccak256(message))
```

그러나 `permit()`에서는:
```solidity
address tokenOwner = ECDSA.recover(bytes32(amount), tokenOwnerSignature);
```

`amount`를 **그대로 bytes32로 캐스팅**하여 서명 복구에 사용한다.

→ ECDSA의 필수 단계인 **해시 단계(H step)가 누락**됨

### 2. 공격 원리: 서명 스푸핑

ECDSA 서명 생성 과정:
```
1. 메시지 m 선택
2. H = hash(m)  ← Bob이 생략!
3. 랜덤 k 선택
4. r = (k * G).x mod n
5. s = k^-1 * (H + r * privKey) mod n
```

`bytes32(amount)`를 해시처럼 사용하므로,
공격자는 `amount` 자체를 ECDSA "해시값"으로 역산할 수 있는 서명을 만들 수 있다.

구체적으로: `ecrecover(bytes32(amount), v, r, s) == Alice`를 만족하는
`(v, r, s)`를 역산하면 Alice의 허가를 위조할 수 있다.

### 3. Alice의 서명에서 역산

Alice가 `redeemVoucher`에서 사용한 `receiverSignature`에서:
- Alice의 공개키(주소)를 알고 있음
- `permitAcceptHash` 생성에 필요한 값들을 제어 가능

`permit()`은:
```
tokenOwner = ecrecover(bytes32(amount), tokenOwnerSignature)
```
우리가 `amount`와 `tokenOwnerSignature`를 자유롭게 선택 가능

→ Alice의 기존 서명 `(v, r, s)`를 재활용하여
  `ecrecover(bytes32(amount), v, r, s) == Alice`를 만족하는
  `amount`를 계산할 수 있음 (서명 스푸핑)

---

## 공격 단계

### Step 1 — Alice의 redeemVoucher 트랜잭션 확인

```js
// Alice의 트랜잭션에서 receiverSignature 추출
// Etherscan에서 Alice의 redeemVoucher 호출 트랜잭션 찾기
let aliceTx = await web3.eth.getTransaction("Alice의 트랜잭션 해시")
let decoded = web3.eth.abi.decodeParameters(
    ['uint256', 'address', 'bytes32', 'bytes', 'bytes'],
    '0x' + aliceTx.input.slice(10)
)
let [amount, receiver, salt, ownerSig, receiverSig] = decoded
```

### Step 2 — permit 호출 준비

```js
// Alice의 receiverSignature로부터 (v, r, s) 추출
let v = parseInt(receiverSig.slice(-2), 16)
let r = receiverSig.slice(0, 66)
let s = '0x' + receiverSig.slice(66, 130)

// ecrecover(bytes32(crafted_amount), v, r, s) == Alice 가 되는
// crafted_amount 계산
// voucherHash = keccak256(amount, receiver, salt)
let voucherHash = web3.utils.soliditySha3(
    {t: 'uint256', v: amount},
    {t: 'address', v: receiver},
    {t: 'bytes32', v: salt}
)
// voucherHash를 amount로 사용
let craftedAmount = BigInt(voucherHash)
```

### Step 3 — spender 서명 생성

```js
// permitAcceptHash = keccak256(tokenOwner, spender, amount)
// tokenOwner = Alice, spender = player
let permitAcceptHash = web3.utils.soliditySha3(
    {t: 'address', v: alice},
    {t: 'address', v: player},
    {t: 'uint256', v: craftedAmount}
)
// player가 permitAcceptHash에 서명
let spenderSig = await web3.eth.sign(permitAcceptHash, player)
```

### Step 4 — permit 호출

```js
await contract.permit(
    craftedAmount,     // amount = voucherHash
    player,            // spender
    receiverSig,       // tokenOwnerSignature (Alice의 기존 서명 재활용)
    spenderSig         // spenderSignature
)
```

### Step 5 — transferFrom으로 Alice 토큰 탈취

```js
let aliceBalance = await contract.balanceOf(alice)
await contract.transferFrom(alice, player, aliceBalance)
```

### Step 6 — 확인

```js
await contract.balanceOf(player)
// → Alice의 ETK 토큰 잔액
```

---

## 핵심 교훈

- ECDSA에서 **메시지 해싱(H 단계)은 생략할 수 없다**
- 해시 없이 원본 데이터에 서명 검증 시 서명 스푸핑 가능
- EIP-712를 사용한 구조화된 데이터 서명 권장

```solidity
// ❌ 위험 - 해시 없이 amount 직접 사용
address tokenOwner = ECDSA.recover(bytes32(amount), tokenOwnerSignature);

// ✅ 안전 - EIP-712 표준 준수
bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, amount, nonce, deadline));
bytes32 digest = _hashTypedDataV4(structHash);
address tokenOwner = ECDSA.recover(digest, signature);
```

- 기존 서명의 재사용(replay) 방지를 위해 nonce 또는 usedHashes 패턴 사용
- OpenZeppelin의 `ERC20Permit` 구현체 사용 권장
