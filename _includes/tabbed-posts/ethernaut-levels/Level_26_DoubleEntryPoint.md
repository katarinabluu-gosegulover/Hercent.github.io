# Ethernaut Level 26 - Double Entry Point

## 문제 설명

`CryptoVault`에서 `DET` 토큰이 `sweepToken`으로 빠져나가는 것을 Forta 봇으로 탐지하는 것이 목표이다.

---

## 컨트랙트 분석

```solidity
contract CryptoVault {
    address public underlying;  // DET 토큰 주소

    function sweepToken(IERC20 token) public {
        require(token != underlying, "Can't transfer underlying token");
        // LGT 토큰을 sweep하면 내부적으로 DET가 이동됨!
        token.transfer(sweptTokensRecipient, token.balanceOf(address(this)));
    }
}

contract DoubleEntryPoint {
    address public delegatedFrom;  // LGT 토큰 주소

    modifier fortaNotify() {
        address detectionBot = address(forta.usersDetectionBots(player));
        if (detectionBot == address(0)) { _; return; }
        uint256 beforeBalance = forta.botRaisedAlerts(detectionBot);
        _;
        uint256 afterBalance = forta.botRaisedAlerts(detectionBot);
        if (afterBalance == beforeBalance) { return; }
        require(
            afterBalance > beforeBalance,
            "Alert has been triggered, reverting"
        );
    }

    function delegateTransfer(address to, uint256 value, address origSender)
        public override onlyDelegateFrom fortaNotify returns (bool)
    {
        _transfer(origSender, to, value);
        return true;
    }
}
```

---

## 취약점 분석

### 이중 진입점 문제

`sweepToken(LGT)`를 호출하면:

```
CryptoVault.sweepToken(LGT)
→ LGT.transfer(recipient, amount)
→ LGT 내부에서 DET.delegateTransfer() 호출
→ DET (DoubleEntryPoint)가 CryptoVault의 DET를 이동
```

`LGT != DET`이므로 `sweepToken`의 require를 통과하지만,
실제로는 DET가 이동된다.

### Forta 봇의 역할

`delegateTransfer()` 호출 시 `origSender`가 `CryptoVault`이면
`raiseAlert()`를 호출해 트랜잭션을 revert시켜야 한다.

---

## 탐지 봇 구현

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IForta {
    function raiseAlert(address user) external;
}

contract DetectionBot {
    address public cryptoVault;

    constructor(address _vault) {
        cryptoVault = _vault;
    }

    function handleTransaction(address user, bytes calldata msgData) external {
        // delegateTransfer(address to, uint256 value, address origSender)
        // calldata: [selector 4bytes][to 32bytes][value 32bytes][origSender 32bytes]
        (, , address origSender) = abi.decode(
            msgData[4:],
            (address, uint256, address)
        );

        // origSender가 CryptoVault면 알림 발생
        if (origSender == cryptoVault) {
            IForta(msg.sender).raiseAlert(user);
        }
    }
}
```

---

## 공격 단계

### Step 1 — CryptoVault 주소 확인

```js
let vault = await contract.cryptoVault()
```

### Step 2 — DetectionBot 배포

```
_vault : CryptoVault 주소
```

### Step 3 — Forta에 봇 등록

```js
let fortaAddress = await contract.forta()
const fortaABI = [
    {"name": "setDetectionBot", "type": "function",
     "inputs": [{"name": "detectionBotAddress", "type": "address"}]}
]
const forta = new web3.eth.Contract(fortaABI, fortaAddress)
await forta.methods.setDetectionBot("DetectionBot주소").send({from: player})
```

### Step 4 — 확인

봇 등록 후 `sweepToken(LGT)` 호출 시 revert 확인

---

## 핵심 교훈

- 토큰 위임 구조에서 의도치 않은 자산 이동 경로가 생길 수 있음
- 온체인 탐지 봇(Forta)으로 실시간 이상 거래 감시 가능
- `delegateTransfer`의 `origSender` 파라미터로 실제 호출 출처 식별
- 스마트 컨트랙트 보안 모니터링의 중요성
