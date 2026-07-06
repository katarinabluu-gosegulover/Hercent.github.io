---
layout: post
title: Fuzzing & Fuzzer
page_description: Fuzzing이 무엇인지 알아보고 Fuzzing 과 Fuzzer 의 종류를 알아보기
category_key: blog-docs
summary: Fuzzing이 무엇인지 알아보고 Fuzzing 과 Fuzzer 의 종류를 알아보기
lead: Fuzzing이 무엇인지 알아보고 Fuzzing 과 Fuzzer 의 종류를 알아보기
featured: false
feature_order: 0
---

## 1. Fuzzing이란?

**Fuzzing**이란 프로그램에 예상치 못한, 혹은 잘못된 형식의 입력을 대량으로 자동 투입해 비정상 동작(크래시, 어설션 실패, 메모리 오류 등)을 탐지하는 소프트웨어 테스팅 기법이다.

기원은 1988년 Barton Miller 교수(위스콘신대)의 연구로, 랜덤 입력이 UNIX 유틸리티를 얼마나 쉽게 죽이는지 확인하는 실험에서 시작됐다.

### 퍼징이 찾을 수 있는 취약점들

| 유형 | 예시 |
|---|---|
| 메모리 오류 | Buffer Overflow, Use-After-Free, Heap Corruption |
| 정수 오류 | Integer Overflow, Off-by-one |
| 논리 오류 | Null Dereference, Assertion Failure |
| 파싱 버그 | XML/JSON/PDF 파서의 크래시 |

ASan은 레드존 침범이나 해제된 메모리 접근을 탐지하는 건데, FSB에서 `%x`로 스택 값을 읽는 건 유효한 스택 메모리 범위 안이라 ASan이 탐지하지 못 함.
`%n`으로 임의 주소에 쓰기를 시도할 때도, 해당 주소가 매핑된 영역이면 ASan 레드존에 걸리지 않아서 그냥 통과할 수 있다.
즉, FSB는 퍼징 + ASan 조합으로는 안정적으로 탐지하기 어렵다.

### 퍼징의 한계

- **복잡한 조건 통과 어려움** → `if (x == 0xDEADBEEF)` 같은 매직 넘버 체크는 랜덤 퍼징으로 거의 통과 불가
- **코드 커버리지 보장 없음** (특히 블랙박스)
- **의미론적(semantic) 오류** 탐지 어려움 (크래시가 없어도 취약한 경우)

---

## 2. Fuzzing의 종류

퍼징은 **타겟 지식 수준**과 **피드백 유무**에 따라 세 가지로 나뉜다.

### 2.1 Black-box Fuzzing

프로그램 내부 구조를 전혀 모르는 상태에서 입력만 던진다. 소스코드도, 바이너리 분석도 없다.

```
Input → [?? Program ??] → Crash?
```

**장점**: 구현이 쉽고, 소스코드가 없어도 된다  
**단점**: 커버리지가 낮고, 깊은 코드 경로에 도달하기 어렵다  
**대표 도구**: Peach Fuzzer, Boofuzz, Sulley

**예시 — 네트워크 프로토콜 퍼징 (Boofuzz)**:
```python
from boofuzz import *

session = Session(target=Target(connection=TCPSocketConnection("127.0.0.1", 8080)))
s_initialize("HTTP GET")
s_string("GET", fuzzable=False)
s_delim(" ")
s_string("/fuzz_target")
s_delim(" ")
s_string("HTTP/1.1\r\n\r\n")
session.connect(s_get("HTTP GET"))
session.fuzz()
```

위 코드는 HTTP GET 요청을 퍼징하는 예시다. `s_string("/fuzz_target")`처럼
`fuzzable=True`인 필드를 자동으로 변이시켜 서버에 전송하고,
응답이 없거나 연결이 끊기면 크래시로 판단한다.

---

### 2.2 White-box Fuzzing (= Concolic Testing / DSE)

소스코드나 바이너리를 완전히 분석해 **동적 기호 실행(Dynamic Symbolic Execution)** 으로 경로 조건을 SMT 솔버로 풀어 입력을 생성한다.

```
Source Code → SMT Solver → Constraint Solving → Input
```

**장점**: 이론상 높은 코드 커버리지 달성 가능, 매직 넘버도 뚫을 수 있음  
**단점**: **경로 폭발(Path Explosion)** 문제, 느림, SMT 솔버 한계  
**대표 도구**: KLEE, S2E, Triton, angr

**KLEE 예시 — 심볼릭 실행**:
```c
#include <klee/klee.h>

int main() {
    char buf[8];
    klee_make_symbolic(buf, sizeof(buf), "buf");
    // KLEE가 buf의 모든 경우의 수를 탐색
    if (buf[0] == 'A' && buf[1] == 'B') {
        int *p = NULL;
        *p = 1; // NPE → KLEE가 탐지
    }
    return 0;
}
```

`klee_make_symbolic()`으로 buf를 심볼릭 변수로 선언하면,
KLEE가 `buf[0] == 'A' && buf[1] == 'B'` 조건을 SMT 솔버로 풀어
해당 분기에 도달하는 입력을 자동으로 생성한다.
랜덤 퍼징으로는 거의 통과 못 하는 조건도 뚫을 수 있다는 게 핵심이다.

---

### 2.3 Grey-box Fuzzing (Coverage-guided Fuzzing)

현재 가장 많이 쓰이는 방식. 바이너리를 **계측(Instrumentation)** 해서 실행 커버리지 피드백을 받아, 새로운 경로를 여는 입력을 중심으로 변이(mutation)한다.

```
Seed Corpus → Mutate → Run → Coverage Feedback → 새 경로? → Corpus 추가
                  ↑_______________________________________↓
```

**장점**: 속도와 커버리지의 균형, 실용적  
**단점**: 구조화된 입력(파서 등)에서 커버리지 정체(plateau) 발생 가능  
**대표 도구**: **AFL++**, **libFuzzer**, **honggfuzz**

---

### 퍼저 파이프라인

퍼저는 단순히 입력을 던지는 게 아니라 아래 단계를 반복하는 루프다.

```
입력 생성 → 실행 → 커버리지 확인 → 새 경로? → Corpus 추가
→ 크래시?  → 저장 후 분류
```

**1. 입력 생성 (Input Generation)**  
Seed corpus를 기반으로 변이(mutation)해 새 입력을 만든다. Seed corpus란 퍼저가 변이의 기반으로 사용하는 입력 파일들의 집합이다. 예를 들어 PDF 파서를 퍼징한다면 정상적인 PDF 파일 몇 개를 corpus로 넣고 시작한다.

**2. 실행 (Execution)**  
생성된 입력으로 타겟을 실행한다. AFL++는 매 입력마다 fork해서 실행하고, libFuzzer는 in-process 방식으로 함수를 직접 호출한다.

**3. 커버리지 확인 (Feedback Collection)**  
실행 후 계측 정보를 통해 새로운 edge(분기 전이)가 열렸는지 확인한다. 새 경로를 열었으면 해당 입력을 corpus에 추가해 이후 변이의 기반으로 삼는다. 이 피드백 루프 덕분에 랜덤 퍼징보다 훨씬 효율적으로 깊은 코드 경로에 도달할 수 있다.

**4. 오라클 판단 (Oracle)**  
비정상 동작인지 판단하는 기준이다. 기본은 segfault 같은 크래시이고, ASan/UBSan 같은 새니타이저를 붙이면 크래시 없이도 메모리 오류를 탐지할 수 있어 탐지 범위가 넓어진다.

**5. 크래시 분류 (Crash Triage)**  
크래시 발생 시 중복 제거(deduplication)와 최소화(minimization)를 거쳐 저장한다. AFL++는 크래시 입력을 `crashes/` 디렉터리에 자동 저장한다.

---

## 3. 주요 퍼저 비교

### 3.1 AFL / AFL++

> 미하엘 자레우스키(lcamtuf)가 개발. 현재는 커뮤니티 포크인 **AFL++** 이 메인스트림.

**작동 방식**:
1. 바이너리를 컴파일 시 계측 (`afl-cc`로 컴파일)
2. Seed 입력에서 시작, **bitflip/byteflip/arithmetic/splice** 등 뮤테이션
3. 새로운 커버리지(edge) 발견 시 큐에 추가
4. 크래시/타임아웃 → `crashes/` 디렉터리에 저장

```bash
CC=afl-cc ./configure && make
afl-fuzz -i seeds/ -o output/ -- ./target @@
# @@은 퍼저가 입력 파일 경로로 치환
```

**AFL++ 주요 개선점**:
- `CMPLOG` 모드: 비교 연산 로깅으로 매직 넘버 돌파
- `MOpt` 뮤테이터: 뮤테이션 전략을 강화학습으로 최적화
- 다양한 계측 백엔드 (LLVM, QEMU, Unicorn, Frida)

| 항목 | 내용 |
|---|---|
| 계측 방식 | 컴파일 타임 (기본) / QEMU (바이너리 전용) |
| 피드백 | Edge coverage (branch transition) |
| 뮤테이션 | Bit/byte flip, arithmetic, dictionary, splice |
| 병렬화 | `-M`(master) / `-S`(slave) 모드 |

---

### 3.2 libFuzzer

> LLVM 프로젝트 내장 퍼저. Clang의 SanitizerCoverage 계측 사용.

타겟 바이너리 안에 퍼저 자체가 링크된 **인-프로세스(in-process)** 방식이다.

```c
// LLVMFuzzerTestOneInput: libFuzzer가 호출하는 진입점
extern "C" int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
    std::string input(data, data + size);
    MyParser::parse(input);
    return 0;
}
```

```bash
clang++ -fsanitize=fuzzer,address -o fuzz_target fuzz_target.cpp
./fuzz_target corpus/
```

**AFL++ vs libFuzzer 비교**:

| 항목 | AFL++ | libFuzzer |
|---|---|---|
| 실행 모델 | Out-of-process (fork) | In-process (함수 호출) |
| 속도 | 약간 느림 (fork 오버헤드) | 빠름 (프로세스 재사용) |
| 크래시 격리 | 완전 격리 | 퍼저 자체도 죽을 수 있음 |
| 계측 | afl-cc, QEMU 등 다양 | Clang/LLVM만 |
| 사용 난이도 | 쉬움 | 하네스 코드 작성 필요 |

- libFuzzer: LLVMFuzzerTestOneInput 이라는 특정 형태의 하네스가 구조적으로 강제됨
- AFL++: 하네스 없이도 돌아가지만, 퍼징 효율을 위해 persistent mode 하네스를 쓰는 게 일반적이다.

---

### 3.3 honggfuzz

> 구글이 만든 고성능 커버리지 가이드 퍼저.

- `perf_event` / `ptrace` 기반의 **하드웨어 지원 커버리지** (Intel PT, BTS)
- **네트워크 퍼징** 네이티브 지원
- 소스 없이도 바이너리 퍼징 가능

```bash
CC=hfuzz-clang ./configure && make
honggfuzz -i seeds/ -- ./target ___FILE___
```

소스코드 없는 바이너리 퍼징에서 AFL QEMU보다 빠른 경우가 많고, 네트워크 서비스 퍼징에 유리하다고 알려져 있다.

---

### 3.4 syzkaller

> 구글이 개발한 **리눅스 커널 시스템콜 퍼저**.

단순한 바이너리 퍼저가 아니라, 시스템콜 시퀀스를 자동으로 생성하고 조합한다.

```
syz-manager → VM 생성 → syz-executor → syscall 시퀀스 실행 → 커널 패닉?
```

- **Grammar-based**: syzlang으로 시스템콜 시그니처를 정의해 의미론적으로 올바른 입력 생성
- **커버리지**: KCOV (Kernel Coverage) 사용
- **크래시 분류**: KASAN, KMSAN, UBSAN 등 새니타이저 연동

```
# syzlang 예시
r0 = open(&(0x7f0000000000)="./file\x00", 0x0, 0x0)
read(r0, &(0x7f0000000100)="", 0x10)
```

수백 개의 리눅스 커널 CVE를 발굴한 실적이 있다고 한다.

---

### 3.5 Grammar-based Fuzzer

일반 비트 뮤테이션은 파서의 초기 검증을 통과하지 못해 커버리지가 정체되는 경우가 많다. 이를 해결하기 위해 입력 형식의 문법(BNF/ANTLR 등)을 정의해 의미론적으로 유효한 입력을 생성한다.

- **Grammarinator**: ANTLR 문법 → 퍼저 자동 생성
- **Dharma**: 웹 API/JS 엔진 퍼징용 (Firefox, Chrome 취약점 다수 발굴)
- **Nautilus**: 문법 정의 + AFL++ 결합

```
# Dharma 문법 예시
value :=
    %value% + %value%
    | %value% * %value%
    | Math.sqrt(%value%)
    | %num%

num :=
    0 | 1 | 42 | -1
```

---

## 4. 퍼저 비교 요약

| 퍼저 | 방식 | 대상 | 계측 | 특징 |
|---|---|---|---|---|
| **AFL++** | Grey-box | 파일 기반 바이너리 | 컴파일타임/QEMU/Frida | 범용, 가장 많이 쓰임 |
| **libFuzzer** | Grey-box | 라이브러리 함수 | LLVM SanitizerCov | In-process, 빠름 |
| **honggfuzz** | Grey-box | 파일/네트워크 | HW(Intel PT), 컴파일 | HW 커버리지, 네트워크 퍼징 |
| **syzkaller** | Grey-box + Grammar | 리눅스 커널 syscall | KCOV | 커널 전용 |
| **Boofuzz** | Black-box | 네트워크 프로토콜 | 없음 | 프로토콜 퍼징 특화 |
| **KLEE** | White-box (DSE) | LLVM IR 프로그램 | 심볼릭 실행 | 높은 커버리지, 느림 |
| **Dharma** | Grammar-based | JS 엔진, DOM API | 없음 | 브라우저 퍼징 특화 |

---

## 5. 추가 궁금증 ( Fuzzing 과 Brute force의 차이 )

### Fuzzing vs 브루트포스

핵심 차이는 **목적**과 **입력 생성 방식**이다.

**브루트포스**는 **정답을 찾는 것**이 목적이다.
입력 공간을 전수 탐색해서 "맞는 값"을 찾는다.

```
password 크래킹: aaa → aab → aac → ... → 정답 발견
```

- 탐색 공간이 명확하고 유한함
- 성공 기준이 명확 (맞다/틀리다)
- 예: 패스워드 크래킹, 암호 키 복구

**퍼징**은 **버그를 찾는 것**이 목적이다.
프로그램이 예상치 못한 입력에 어떻게 반응하는지 본다.

```
파서 퍼징: 정상 PDF → 변이 → 변이 → 크래시 발생!
```

- 탐색 공간이 무한에 가까움 (임의 바이트 조합)
- 성공 기준이 "비정상 동작" (크래시, 예외, 메모리 오류)
- 예: 취약점 발굴, 버그 헌팅

| | 브루트포스 | 퍼징 |
|---|---|---|
| 목적 | 정답 찾기 | 버그 찾기 |
| 입력 | 체계적 전수 탐색 | 변이/랜덤 생성 |
| 성공 기준 | 조건 일치 | 비정상 동작 |
| 피드백 활용 | 없음 | 있음 (grey-box) |

---

## 참고 자료

- [AFL++ 공식 GitHub](https://github.com/AFLplusplus/AFLplusplus)
- [libFuzzer 공식 문서](https://llvm.org/docs/LibFuzzer.html)
- [honggfuzz 공식 GitHub](https://github.com/google/honggfuzz)
- [Google syzkaller](https://github.com/google/syzkaller)
- [The Fuzzing Book (Andreas Zeller 외)](https://www.fuzzingbook.org/)
- Barton Miller et al., "An Empirical Study of the Reliability of UNIX Utilities" (1990)
