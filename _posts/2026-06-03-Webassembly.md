---
layout: post
title: Webassembly
page_description: Webassembly 알아보기
category_key: development
summary: Webassembly 알아보기
lead: Webassembly 알아보기
featured: false
feature_order: 0
---

# WebAssembly  — WAT로 웹 계산기 구현하고 분석하기

> WAT 작성 → 컴파일 → JS 연동 → DevTools/WABT 분석

---

## 목차

1. [왜 WebAssembly인가?](#1-왜-webassembly인가)
2. [핵심 개념](#2-핵심-개념)
3. [WAT 작성](#3-wat-작성)
4. [JS 연동 웹앱 제작](#4-js-연동-웹앱-제작)
5. [DevTools & WABT 분석](#5-devtools--wabt-분석)
6. [실무 활용과 한계](#6-실무-활용과-한계)

---

## 1. 왜 WebAssembly인가? - WebAssembly를 사용하는 이유

JavaScript는 유연하지만 무겁다. 이미지 처리, 암호화, 게임 엔진처럼 연산이 많은 작업에서는 속도 한계가 뚜렷하다. WebAssembly(Wasm)는 이 문제를 해결하기 위해 등장했다. 브라우저에서 네이티브에 가까운 속도로 실행되는 바이너리 포맷으로, C/C++, Rust, AssemblyScript 등 다양한 언어로 작성한 코드를 `.wasm` 으로 컴파일해 웹에서 실행할 수 있다.

---

## 2. 핵심 개념

### Module / Instance

`.wasm` 파일은 **Module**이고, 이를 메모리에 올려 실행 가능한 상태로 만든 것이 **Instance**다.

```javascript
const { instance } = await WebAssembly
  .instantiateStreaming(fetch('calculator.wasm'), imports);
```

`instantiateStreaming`은 다운로드와 컴파일을 동시에 처리한다. `arrayBuffer()`로 받은 뒤 컴파일하는 방식보다 빠르고 메모리도 효율적이다.

### Linear Memory

Wasm은 `WebAssembly.Memory` 객체로 JS와 메모리를 공유한다. 1 page = 64KB 단위로 관리된다.

```javascript
const memory = new WebAssembly.Memory({ initial: 1, maximum: 10 });
const view = new Uint8Array(memory.buffer);
```

### Imports / Exports

- **Imports** — JS가 Wasm에 넣어주는 함수/메모리 (JS → Wasm)
- **Exports** — Wasm이 JS에 노출하는 함수/메모리 (Wasm → JS)

```javascript
// imports: JS → Wasm
const imports = { env: { log: (v) => console.log('[wasm]', v) } };

// exports: Wasm → JS
const { add, subtract, multiply } = instance.exports;
```

### 타입 시스템

Wasm의 기본 타입은 딱 4가지다. 문자열 타입은 없으며, 문자열은 메모리에 바이트로 저장하고 i32 포인터로 다룬다.

| 타입 | 의미 | 크기 |
|---|---|---|
| `i32` | integer 32bit | 4바이트 |
| `i64` | integer 64bit | 8바이트 |
| `f32` | float 32bit | 4바이트 |
| `f64` | float 64bit | 8바이트 |

### Stack Machine

Wasm은 스택 기반 가상머신이다. 명령어가 스택에서 값을 꺼내고(pop), 계산 후 결과를 다시 넣는다(push).

```
local.get $a   → 스택: [a]
local.get $b   → 스택: [a, b]
i32.add        → 스택: [a+b]   (2개 pop → 결과 push)
```

---

## 3. WAT 작성

WAT는 **WebAssembly Text format**의 줄임말로, `.wasm` 바이너리를 사람이 읽을 수 있는 텍스트로 표현한 포맷이다. `wat2wasm` / `wasm2wat` 으로 상호 변환이 가능하다.

### calculator.wat

```
(module
  (import "env" "log" (func $log (param i32)))

  ;; memory 선언 (1 page = 64KB), JS에서 접근 가능하게 export
  (memory (export "memory") 1)

  ;; add: a + b
  (func $add (export "add")
    (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.add
  )

  ;; subtract: a - b
  (func $sub (export "subtract")
    (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.sub
  )

  ;; multiply: a * b
  (func $mul (export "multiply")
    (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.mul
  )

  ;; 메모리 주소 0에 값 저장
  (func $store (export "store")
    (param $val i32)
    i32.const 0
    local.get $val
    i32.store
  )

  ;; 메모리 주소 0에서 값 읽기
  (func $load (export "load") (result i32)
    i32.const 0
    i32.load
  )
)
```

---

## 4. JS 연동 웹앱 제작

### 프로젝트 구조

```
calculator/
├── calculator.wat    ← WAT 소스
├── calculator.wasm   ← wat2wasm으로 컴파일한 결과
└── index.html        ← JS 연동 코드 포함
```

### 컴파일 및 실행

```bash
# 1. WAT → Wasm 컴파일
wat2wasm calculator.wat -o calculator.wasm

# 2. 로컬 서버 실행 (file:// 로 열면 fetch가 막힘)
npx serve .
# 또는
python -m http.server 8080
# 필자는 VSCode에서 LiveServer로 실행하여 진행함.
```

### index.html

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>Wasm Calculator</title>
</head>
<body>
  <h2>Wasm Calculator</h2>
  <input id="a" type="number" value="10">
  <select id="op">
    <option value="add">+</option>
    <option value="subtract">-</option>
    <option value="multiply">×</option>
  </select>
  <input id="b" type="number" value="3">
  <button onclick="calculate()">계산</button>
  <p>결과: <strong id="result">-</strong></p>

  <script>
  let wasmExports;

  const imports = {
    env: { log: (val) => console.log('[wasm]', val) }
  };

  WebAssembly
    .instantiateStreaming(fetch('calculator.wasm'), imports)
    .then(({ instance }) => {
      wasmExports = instance.exports;
      console.log('✅ Wasm 로드 완료', wasmExports);
    });

  function calculate() {
    const a = parseInt(document.getElementById('a').value);
    const b = parseInt(document.getElementById('b').value);
    const op = document.getElementById('op').value;
    const result = wasmExports[op](a, b);
    document.getElementById('result').textContent = result;
  }
  </script>
</body>
</html>
```

---

## 5. DevTools & WABT 분석

### 5-1. Wasm 바이너리 구조

모든 `.wasm` 파일은 반드시 아래 8바이트로 시작한다.

```
0000000: 0061 736d   ; WASM_BINARY_MAGIC   (= .asm)
0000004: 0100 0000   ; WASM_BINARY_VERSION (= 1)
```

`61 73 6D` 은 ASCII로 `asm`이다. 이후는 섹션들의 나열이며, 각 섹션은 `섹션ID + 크기 + 내용` 형식이다.

### 5-2. 섹션 구조 (`wasm-objdump -h`)

```
     Type start=0x0000000a end=0x00000021 (size=0x00000017) count: 3
   Import start=0x00000023 end=0x0000002e (size=0x0000000b) count: 1
   Memory start=0x00000030 end=0x00000033 (size=0x00000003) count: 1
 Function start=0x00000035 end=0x0000003b (size=0x00000006) count: 5
   Export start=0x0000003d end=0x00000068 (size=0x0000002b) count: 6
     Code start=0x0000006a end=0x00000097 (size=0x0000002d) count: 5
```

| 섹션 ID | 이름 | 역할 |
|---|---|---|
| `0x01` | Type | 함수 시그니처 정의 |
| `0x02` | Import | 외부에서 받는 함수/메모리 |
| `0x05` | Memory | 선형 메모리 선언 |
| `0x03` | Function | 함수와 타입 인덱스 매핑 |
| `0x07` | Export | JS에 노출할 함수/메모리 |
| `0x0A` | Code | 실제 함수 바이트코드 |

### 5-3. 섹션 상세 (`wasm-objdump -x`)

```
Type[3]:
 - type[0] (i32) -> nil           ← log, store 함수용
 - type[1] (i32, i32) -> i32     ← add/subtract/multiply 공용
 - type[2] () -> i32              ← load 함수용

Import[1]:
 - func[0] sig=0 <env.log> <- env.log

Memory[1]:
 - memory[0] pages: initial=1

Function[5]:
 - func[1] sig=1 <add>
 - func[2] sig=1 <subtract>
 - func[3] sig=1 <multiply>
 - func[4] sig=0 <store>
 - func[5] sig=2 <load>

Export[6]:
 - memory[0] -> "memory"
 - func[1] <add> -> "add"
 - func[2] <subtract> -> "subtract"
 - func[3] <multiply> -> "multiply"
 - func[4] <store> -> "store"
 - func[5] <load> -> "load"

Code[5]:
 - func[1] size=7 <add>
 - func[2] size=7 <subtract>
 - func[3] size=7 <multiply>
 - func[4] size=9 <store>
 - func[5] size=7 <load>
```

**타입 중복 제거 최적화** — 함수가 5개이지만 타입은 3개만 등록됐다. `add`, `subtract`, `multiply` 3개가 `(i32, i32) -> i32` 타입을 공유하기 때문이다.

**함수 인덱스가 1부터 시작하는 이유** — `func[0]`은 import된 `env.log`가 차지한다. Wasm은 import된 함수도 함수 인덱스에 포함시키기 때문에 직접 정의한 함수는 `func[1]`부터 시작한다.

### 5-4. 바이트 단위 분석 (`wat2wasm -v`)

#### add 함수 — 7바이트

```
000004b: 00   ; local decl count
000004c: 20   ; local.get
000004d: 00   ; local index 0
000004e: 20   ; local.get
000004f: 01   ; local index 1
0000050: 6a   ; i32.add
0000051: 0b   ; end
```

#### store 함수 — 9바이트

```
0000086: 00   ; local decl count
0000087: 41   ; i32.const
0000088: 00   ; i32 literal 0 (주소)
0000089: 20   ; local.get
000008a: 00   ; local index 0
000008b: 36   ; i32.store
000008c: 02   ; alignment
000008d: 00   ; store offset
000008e: 0b   ; end
```

`store`가 `add`보다 2바이트 더 큰 이유는 메모리 접근 명령어가 **alignment(1바이트) + offset(1바이트)** 를 추가로 가지기 때문이다.

#### 주요 opcode 정리

| 명령어 | opcode | 크기 |
|---|---|---|
| `local.get` | `0x20` | 2바이트 |
| `i32.const` | `0x41` | 2바이트 |
| `i32.add` | `0x6A` | 1바이트 |
| `i32.sub` | `0x6B` | 1바이트 |
| `i32.mul` | `0x6C` | 1바이트 |
| `i32.load` | `0x28` | 3바이트 |
| `i32.store` | `0x36` | 3바이트 |
| `end` | `0x0B` | 1바이트 |

### 5-5. WAT 역변환 (`wasm2wat`)

```
(module
  (type (;0;) (func (param i32)))
  (type (;1;) (func (param i32 i32) (result i32)))
  (type (;2;) (func (result i32)))
  (import "env" "log" (func (;0;) (type 0)))
  (func (;1;) (type 1) (param i32 i32) (result i32)
    local.get 0
    local.get 1
    i32.add)
  ...
  (memory (;0;) 1)
  (export "memory" (memory 0))
  (export "add" (func 1))
  (export "subtract" (func 2))
  (export "multiply" (func 3))
  (export "store" (func 4))
  (export "load" (func 5)))
```

원본 WAT와 역변환 WAT의 차이:

| 항목 | 원본 WAT | 역변환 WAT |
|---|---|---|
| 함수 이름 | `$add` | `(;1;)` (인덱스) |
| 파라미터 이름 | `$a`, `$b` | 이름 없음 |
| export 위치 | 함수 내부 | 함수 외부 분리 |

이름 정보는 바이너리에 저장되지 않아 역변환 시 사라진다. `--debug-names` 옵션을 주면 이름을 Name section에 별도 저장할 수 있다.

### 5-6. Memory 분석

```javascript
const { store, load, memory } = instance.exports;

console.log(memory.buffer.byteLength); // 65536 (= 64KB)

store(42);
console.log(load());                   // 42

const view = new Int32Array(memory.buffer);
console.log(view[0]);                  // 42

const bytes = new Uint8Array(memory.buffer);
console.log([...bytes.slice(0, 8)]
  .map(b => b.toString(16).padStart(2, '0')).join(' '));
// 출력: 2a 00 00 00 00 00 00 00
```

`42`의 hex 값은 `0x2A`다. 출력이 `2a 00 00 00`인 이유는 Wasm이 **little-endian** 방식으로 저장하기 때문이다. 낮은 바이트(`2A`)가 먼저 저장되고 나머지 3바이트는 `00`으로 채워진다.

```
big-endian    00 00 00 2A   ← 높은 바이트 먼저
little-endian 2A 00 00 00   ← 낮은 바이트 먼저 (Wasm)
```

### 5-7. DevTools에서 확인한 것

- **Sources 탭** — `fetch()`로 로드한 `.wasm` 클릭 시 자동으로 WAT 디컴파일 뷰 표시. WAT 코드에 브레이크포인트 설정 가능
- **Network 탭** — 응답 헤더에 `Content-Type: application/wasm` 확인. 이 헤더가 없으면 `instantiateStreaming()` 실패
- `Uint8Array`로 직접 로드하면 네트워크 요청이 없어 Sources 탭에 파일이 등록되지 않는다

---

## 6. 실무 활용과 한계

### 유용한 상황

- **연산 집약적 작업** — 이미지/영상 처리, 암호화, 압축
- **기존 C/C++/Rust 라이브러리를 웹에 포팅** — 네이티브 성능 유지
- **게임 엔진** — Unity, Unreal 등이 Wasm으로 웹 빌드 지원
- **보안이 중요한 로직** — JS보다 리버스 엔지니어링이 어려움

### 한계

- **DOM 직접 접근 불가** — UI 조작은 반드시 JS를 거쳐야 함
- **문자열 처리 불편** — 기본 타입에 string이 없어 메모리를 직접 다뤄야 함
- **디버깅 어려움** — 바이너리라 스택 트레이스가 불친절
- **파일 크기** — JS보다 초기 번들 크기가 커질 수 있음
- **가비지 컬렉션 없음** — 메모리 관리를 직접 해야 함 (GC 제안 진행 중)

---

## 참고 링크

- [WebAssembly 공식 문서](https://developer.mozilla.org/en-US/docs/WebAssembly/Guides)
- [WABT GitHub](https://github.com/WebAssembly/wabt)
- [Chrome DevTools Wasm 디버깅](https://developer.chrome.com/docs/devtools/wasm)
