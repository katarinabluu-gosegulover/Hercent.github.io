# Ethernaut Level 18 - MagicNumber

## 문제 설명

`whatIsTheMeaningOfLife()` 호출 시 `42`를 반환하는 컨트랙트를 배포하되,
**최대 10 opcodes** 이하의 런타임 바이트코드로 작성해야 한다.

---

## 취약점 분석

Solidity로 컴파일하면 opcode가 너무 많아진다.
**Raw EVM bytecode**를 직접 작성해야 한다.

---

## EVM 바이트코드 설계

### 런타임 코드 (10 bytes)

```
PUSH1 0x2a   → 42를 스택에 push         (0x602a)
PUSH1 0x00   → 메모리 위치 0            (0x6000)
MSTORE       → 메모리에 저장            (0x52)
PUSH1 0x20   → 반환 길이 32바이트       (0x6020)
PUSH1 0x00   → 반환 시작 위치 0         (0x6000)
RETURN       → 반환                     (0xf3)
```

런타임 바이트코드: `602a60005260206000f3` (10 bytes ✅)

### 배포 코드 (init code)

```
PUSH10 runtime  → 런타임 코드 push      (0x69 + runtime_code)
PUSH1 0x00      → 메모리 위치           (0x6000)
MSTORE          → 메모리에 저장         (0x52)
PUSH1 0x0a      → 런타임 코드 크기 10   (0x600a)
PUSH1 0x16      → 메모리 내 offset 22   (0x6016)
RETURN          → 배포 완료             (0xf3)
```

전체 배포 바이트코드: `0x600a601c600039600a601cf3602a60005260206000f3`

---

## 공격 단계

### Step 1 — 콘솔에서 직접 배포

```js
let bytecode = "0x600a601c600039600a601cf3602a60005260206000f3"
let tx = await web3.eth.sendTransaction({
    from: player,
    data: bytecode
})
let solverAddress = tx.contractAddress
console.log("Solver deployed at:", solverAddress)
```

### Step 2 — solver 등록

```js
await contract.setSolver(solverAddress)
```

### Step 3 — 확인

트랜잭션 성공 확인 후 Submit

---

## 핵심 교훈

- EVM opcodes를 직접 이해하면 최소한의 바이트코드 작성 가능
- Solidity 컴파일러는 항상 최적의 코드를 생성하지 않음
- 보안 감사 시 바이트코드 수준 분석이 필요할 수 있음
- `MSTORE`는 32바이트 단위로 저장, 값은 우측 정렬됨
