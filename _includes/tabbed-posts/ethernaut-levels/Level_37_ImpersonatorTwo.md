# Ethernaut Level 37 - ImpersonatorTwo

## 문제 설명

`ImpersonatorTwo` 컨트랙트는 OWNER의 서명으로 잠금 해제 및 관리자 변경이 가능하다.
인스턴스 배포 시 OWNER의 개인키로 두 개의 서명이 생성되는데,
**두 서명에 동일한 랜덤값 k가 사용**되어 개인키가 유출된다.
복구한 개인키로 유효한 서명을 생성해 `admin`을 탈취하고 ETH를 인출하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract ImpersonatorTwo {
    address public admin;
    bool public locked;

    // 배포 시 두 서명 사용:
    // SWITCH_LOCK_SIG  - 잠금 초기 설정
    // SET_ADMIN_SIG    - 어드민 초기 설정

    function switchLock(bytes memory signature) public {
        // signature로 OWNER 복구 후 검증
        // 사용된 서명은 재사용 불가 처리
    }

    function setAdmin(bytes memory signature, address newAdmin) public {
        // signature로 OWNER 복구 후 검증
        // admin = newAdmin
    }

    function withdraw() public {
        require(msg.sender == admin);
        payable(admin).transfer(address(this).balance);
    }
}
```

---

## 취약점 분석

### 1. ECDSA 서명 생성 알고리즘

ECDSA 서명은 다음과 같이 생성된다:

```
1. 랜덤 k 선택  ← 매번 반드시 달라야 함!
2. r = (k * G).x mod n
3. s = k⁻¹ * (z + r * sk) mod n
   (z = 메시지 해시, sk = 개인키)
4. 서명 = (r, s)
```

### 2. 동일 k 재사용 시 개인키 유출 (PlayStation 3 취약점)

두 서명에 **같은 k**를 사용하면 `r` 값이 동일하다:

```
서명1: s₁ = k⁻¹ * (z₁ + r * sk) mod n
서명2: s₂ = k⁻¹ * (z₂ + r * sk) mod n
```

두 식을 빼면:

```
s₁ - s₂ = k⁻¹ * (z₁ - z₂) mod n
```

k를 풀면:

```
k = (s₁ - s₂)⁻¹ * (z₁ - z₂) mod n
```

k를 알면 개인키도 풀 수 있다:

```
sk = r⁻¹ * (s₁ * k - z₁) mod n
```

### 3. 실제 취약 데이터

배포 이벤트에서 추출한 두 서명의 `r` 값이 동일:

```
SWITCH_LOCK_SIG: r = 0xe5648161...c40  ← 동일!
SET_ADMIN_SIG:   r = 0xe5648161...c40  ← 동일!
```

→ 동일한 k로 두 메시지에 서명한 것이 확인됨

---

## 공격 스크립트 (Python)

```python
from sympy import mod_inverse
from ecutils.curves import get as get_curve
from ecdsa import SigningKey, SECP256k1

secp256k1 = get_curve('secp256k1')

# 배포 시 사용된 두 서명값 (이벤트에서 추출)
# SWITCH_LOCK_SIG
r_1 = 0xe5648161e95dbf2bfc687b72b745269fa906031e2108118050aba59524a23c40
s_1 = 0x70026fc30e4e02a15468de57155b080f405bd5b88af05412a9c3217e028537e3
z_1 = 0x937fa99fb61f6cd81c00ddda80cc218c11c9a731d54ce8859cb2309c77b79bf3

# SET_ADMIN_SIG
r_2 = 0xe5648161e95dbf2bfc687b72b745269fa906031e2108118050aba59524a23c40
s_2 = 0x4c3ac03b268ae1d2aca1201e8a936adf578a8b95a49986d54de87cd0ccb68a79
z_2 = 0x6a0d6cd0c2ca5d901d94d52e8d9484e4452a3668ae20d63088909611a7dccc51

# r_1 == r_2 → 동일한 k 사용 확인
r = r_1

# Step 1: k 복구
# s₁ - s₂ = k⁻¹ * (z₁ - z₂) mod n
# k = (s₁ - s₂)⁻¹ * (z₁ - z₂) mod n
k = mod_inverse(s_1 - s_2, secp256k1.n) * (z_1 - z_2) % secp256k1.n

# Step 2: 개인키 복구
# sk = r⁻¹ * (s₁ * k - z₁) mod n
owner_sk = mod_inverse(r, secp256k1.n) * (s_1 * k - z_1) % secp256k1.n

# Step 3: 서명 객체 생성
sk = SigningKey.from_string(bytes.fromhex(hex(owner_sk)[2:]), curve=SECP256k1)

# Step 4: setAdmin용 새 서명 생성
SET_ADMIN_2_DIGEST = "a697d71f95302311583a240bee39aefcf3eb87df3ee1ca2f3001e038fde9922e"
set_admin_2_signature = sk.sign_digest(bytes.fromhex(SET_ADMIN_2_DIGEST), k=k)
sa_r = set_admin_2_signature.hex()[0:64]
sa_s = set_admin_2_signature.hex()[64:128]
# s 상위 절반 정규화 (malleability 방지)
if sa_s > hex(SECP256k1.order // 2)[2:]:
    sa_s = hex(SECP256k1.order - int(sa_s, base=16))[2:]
print("set admin r:", sa_r)
print("set admin s:", sa_s)

# Step 5: switchLock용 새 서명 생성
SWITCH_LOCK_3_DIGEST = "22e1cf10d1c8bed2463521c56b4047a50cff188a411bf5c94f820e244eb01d35"
switch_lock_3_signature = sk.sign_digest(bytes.fromhex(SWITCH_LOCK_3_DIGEST), k=k)
sl_r = switch_lock_3_signature.hex()[0:64]
sl_s = switch_lock_3_signature.hex()[64:128]
if sl_s > hex(SECP256k1.order // 2)[2:]:
    sl_s = hex(SECP256k1.order - int(sl_s, base=16))[2:]
print("switch lock r:", sl_r)
print("switch lock s:", sl_s)
```

---

## 공격 단계

### Step 1 — 의존성 설치

```bash
pip install sympy ecutils ecdsa
```

### Step 2 — 서명값 수집

```js
// Etherscan 또는 이벤트 로그에서 배포 시 사용된 서명 추출
// r 값이 동일한지 확인
let events = await instance.getPastEvents('allEvents', { fromBlock: 0 })
```

### Step 3 — Python 스크립트 실행

```bash
python3 ImpersonatorTwo.py
```

출력 예시:
```
set admin r: e5648161e95dbf2bfc687b72b745269fa906031e2108118050aba59524a23c40
set admin s: 701d59ccb1c72824452441d95444aa250ef592082f0f81957de7c9a7b5c14553
switch lock r: e5648161e95dbf2bfc687b72b745269fa906031e2108118050aba59524a23c40
switch lock s: 2a04aa67c7760a7bec982fde4b387e1e62dc26ba69dd74444e68ffe28851375e
```

### Step 4 — Foundry 테스트로 검증 및 실행

```solidity
function testSolve() public {
    vm.startPrank(player);

    bytes memory setAdminSig = abi.encodePacked(
        hex"e5648161e95dbf2bfc687b72b745269fa906031e2108118050aba59524a23c40", // r
        hex"701d59ccb1c72824452441d95444aa250ef592082f0f81957de7c9a7b5c14553", // s
        uint8(28) // v
    );
    bytes memory switchLockSig = abi.encodePacked(
        hex"e5648161e95dbf2bfc687b72b745269fa906031e2108118050aba59524a23c40", // r
        hex"2a04aa67c7760a7bec982fde4b387e1e62dc26ba69dd74444e68ffe28851375e", // s
        uint8(28) // v
    );

    instance.setAdmin(setAdminSig, player);   // admin = player
    instance.switchLock(switchLockSig);        // locked = false
    instance.withdraw();                       // ETH 인출

    assertTrue(submitLevelInstance(ethernaut, address(instance)));
}
```

### Step 5 — 콘솔에서 직접 실행

```js
// 위 스크립트로 생성한 서명값 사용
let setAdminSig = "0x" + r + s + "1c"  // v=28
let switchLockSig = "0x" + r + s2 + "1c"

await instance.setAdmin(setAdminSig, player)
await instance.switchLock(switchLockSig)
await instance.withdraw()
```

---

## 수학적 증명 요약

```
주어진 값:
  (r, s₁, z₁) - SWITCH_LOCK_SIG
  (r, s₂, z₂) - SET_ADMIN_SIG  (r이 동일 → 같은 k!)

k 복구:
  s₁ = k⁻¹(z₁ + r·sk) mod n  ...(1)
  s₂ = k⁻¹(z₂ + r·sk) mod n  ...(2)

  (1)-(2): s₁-s₂ = k⁻¹(z₁-z₂) mod n
  ∴ k = (s₁-s₂)⁻¹ · (z₁-z₂) mod n

개인키 복구:
  s₁ = k⁻¹(z₁ + r·sk) mod n
  s₁·k = z₁ + r·sk mod n
  r·sk = s₁·k - z₁ mod n
  ∴ sk = r⁻¹ · (s₁·k - z₁) mod n
```

---

## 핵심 교훈

- ECDSA에서 **k(nonce)는 서명마다 반드시 달라야 한다**
- 동일 k 재사용 시 두 서명만으로 개인키 완전 복구 가능
- 이 취약점은 **PlayStation 3 해킹(2010)**에서 실제로 악용된 바 있음
  - Sony가 PS3 펌웨어 서명에 고정된 k를 사용
  - 개인키가 유출되어 불법 복사 방지 시스템 붕괴

```python
# ❌ 위험 - 고정 k 사용
signature = sk.sign_digest(hash, k=FIXED_K)

# ✅ 안전 - RFC 6979 결정론적 k 생성 (랜덤성 불필요)
# k = HMAC-SHA256(sk, z) → 동일 메시지엔 동일 k, 다른 메시지엔 다른 k
from ecdsa import SigningKey, SECP256k1
sk = SigningKey.generate(curve=SECP256k1)
signature = sk.sign_digest_deterministic(hash)  # RFC 6979
```

- OpenZeppelin의 `ECDSA.recover()`는 서명 검증만 하며, k 재사용 탐지는 오프체인에서 처리해야 함
- 온체인에서는 **사용된 서명 해시를 mapping으로 무효화**하는 방식으로 replay는 방지 가능
  (단, k 재사용 자체는 개인키 유출이므로 온체인 방어 불가)
