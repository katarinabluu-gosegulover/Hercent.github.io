# Ethernaut Level 0 - Hello ethernaut

## 문제 설명

Level 0은 Ethernaut 플랫폼 사용법을 익히는 튜토리얼입니다. 브라우저 개발자 콘솔에서 Web3.js를 사용해 컨트랙트와 직접 상호작용하는 방법을 배웁니다.

---

## 컨트랙트 분석

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Instance {
    string public password;
    uint8 public infoNum = 42;
    string public theMethodName = "The method name is method7123949.";
    bool private cleared = false;

    // constructor
    constructor(string memory _password) {
        password = _password;
    }

    function info() public pure returns (string memory) {
        return "You will find what you need in info1().";
    }

    function info1() public pure returns (string memory) {
        return 'Try info2(), but with "hello" as a parameter.';
    }

    function info2(string memory param) public pure returns (string memory) {
        if (keccak256(abi.encodePacked(param)) == keccak256(abi.encodePacked("hello"))) {
            return "The property infoNum holds the number of the next info method to call.";
        }
        return "Wrong parameter.";
    }

    function info42() public pure returns (string memory) {
        return "theMethodName is the name of the next method.";
    }

    function method7123949() public pure returns (string memory) {
        return "If you know the password, submit it to authenticate().";
    }

    function authenticate(string memory passkey) public {
        if (keccak256(abi.encodePacked(passkey)) == keccak256(abi.encodePacked(password))) {
            cleared = true;
        }
    }

    function getCleared() public view returns (bool) {
        return cleared;
    }
}
```

`string public password;` 으로 "password" 가 노출되어 있습니다.

함수 호출을 이용하여 비밀번호를 알아내고, 제출하면 됩니다.

---

## 공격 단계

---

### Step 1 — 개발자 콘솔 열기

브라우저에서 `F12` → **Console** 탭으로 이동합니다.

```javascript
// 인스턴스가 제대로 로드됐는지 확인
await contract.address
// → "0x1234...abcd"
```

---

### Step 2 — ABI 및 사용 가능한 메서드 확인

```javascript
// 컨트랙트 ABI 확인
await contract.abi

// 호출 가능한 메서드 목록 확인
contract
```

콘솔에 `contract`를 입력하면 사용 가능한 모든 메서드가 출력됩니다.

```javascript
Object { constructor: r(), methods: {…}, abi: (11) […],
address: "0x6FB97c3f243b08959c5eeb7Ca6B40882F325C38b", transactionHash: undefined,
contract: {…}, authenticate: send(), getCleared: call(), info: call(), info1: call(), … }
​
abi: Array(11) [ {…}, {…}, {…}, … ]
​
address: "0x6FB97c3f243b08959c5eeb7Ca6B40882F325C38b"
​
allEvents: function allEvents(n)
​
authenticate: function send()
​
​
arguments: null
​
​
call: function call()
​
​
caller: null
​
​
estimateGas: function estimate()
​
​
length: 0
​
​
name: ""
​
​
prototype: Object { … }
​
​
request: function request()
​
​
sendTransaction: function send()
​
​
<prototype>: function ()
​
call: function call()
​
constructor: function r()
​
contract: Object { setProvider: setProvider(), currentProvider: Getter & Setter, _requestManager: {…}, … }
​
estimateGas: function estimate()
​
getCleared: function call()
​
getPastEvents: function getPastEvents(n, a)
​
info: function call()
​
info1: function call()
​
info2: function call()
​
info42: function call()
​
infoNum: function call()
​
method7123949: function call()
​
methods: Object { "authenticate(string)": send(), "getCleared()": call(), "info()": call(), … }
​
password: function call()
​
send: function send(e)
​
sendTransaction: function send()
​
theMethodName: function call()
​
transactionHash: undefined
​
<prototype>: Object {  }
```

`contract.info()` 를 통해 안에 있는 메세지를 확인하고 그것에 따라 여러 "info()" 함수들을 호출합니다.

그러면 "contract.method7123949()" 까지 도달하게 되고 "If you know the password, submit it to authenticate()." 라는 문구를 확인할 수 있습니다.

---

### Step 3 — password 읽기

```javascript
await contract.password()
// → "ethernaut0"
```
---

### Step 4 — authenticate 호출

읽어온 패스워드를 그대로 전달합니다.

```javascript
await contract.authenticate("ethernaut0")
```
