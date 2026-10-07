---
layout: post
title: 나만의 Python 디버거 만들기
page_description: sys.settrace()로 나만의 Python 디버거 만들기
category_key: development
summary: sys.settrace()로 나만의 Python 디버거 만들기
lead: sys.settrace()로 나만의 Python 디버거 만들기
featured: false
feature_order: 0
---

# `sys.settrace()`로 나만의 Python 디버거 만들기

> [Python Debugger URL](https://github.com/katarinabluu-gosegulover/python-mini-debugger)

디버거는 프로그램을 멈추는 도구라고만 생각하기 쉽다. 그런데 안을 들여다보면 하는 일이 조금 더 많다.
Python 인터프리터가 보내 주는 실행 이벤트를 받고, 지금 실행 중인 프레임을 살펴본 뒤, 사용자의 명령이 올 때까지 실행을 붙잡아 두는 프로그램이다. 
이 글은 The Debugging Book의 세 챕터를 읽고 `sys.settrace()`만으로 작은 대화형 디버거를 만든 과정을 정리한 것이다.

## 1. 디버깅의 정의

「Introduction to Debugging」은 문제의 흐름을 다음처럼 구분한다.

```text
사람의 실수(mistake)
        ↓
코드의 결함(defect)
        ↓
실행 상태의 잘못(fault)
        ↓
외부에서 관찰되는 실패(failure)
```

핵심은 실패가 보이는 마지막 줄만 고치는 게 아니라는 점이다. 올바르던 상태가 처음으로 잘못된 상태로 바뀐 지점을 찾아야 한다. 
그리고 고치기 전에는 “왜 이 코드가 실패를 만들었는가”(인과성)와 “왜 이 코드가 올바르지 않은가”(부정확성)를 둘 다 설명할 수 있어야 한다.[^intro]

이렇게 보면 디버거가 할 일도 분명해진다. 디버거는 답을 대신 알려 주는 도구가 아니다. 
원인에서 결과로 이어지는 중간 상태를 직접 들여다보고, 세워 둔 가설을 실험해 보게 해 주는 도구다.

## 2. Python 실행을 관찰하는 `sys.settrace()`

Python은 `sys.settrace(trace_function)`으로 현재 스레드에 추적 함수를 설치할 수 있다.
추적 함수는 다음 세 인자를 받는다.[^python-settrace]

```python
def trace(frame, event, arg):
    ...
    return trace
```

- `frame`: 지금 실행 중인 프레임
- `event`: `call`, `line`, `return`, `exception`, `opcode` 중 하나
- `arg`: 이벤트별 부가 값. 예를 들어 `return`이면 반환값

`call` 이벤트에서 반환한 함수는 그 새 스코프의 로컬 추적 함수가 된다. `line` 이벤트는 새 소스 줄을 실행하기 직전에 발생하는데, 반복문의 조건을 다시 실행할 때도 같은 줄에서 또 발생할 수 있다.[^python-settrace] 이 프로젝트에서는 `call`, `line`, `return` 세 이벤트만으로 함수 중단점, 한 줄 실행, 함수 종료까지 실행을 구현했다.

가장 작은 추적기는 다음과 같이 생겼다.

```python
import sys

def trace(frame, event, arg):
    print(event, frame.f_code.co_name, frame.f_lineno)
    return trace

sys.settrace(trace)
target_function()
sys.settrace(None)
```

The Debugging Book의 「Tracing Executions」도 실행을 관찰할 수 있어야 대화형 디버깅이 가능하다고 설명한다. 거기서는 중단점을 코드 위치에 대한 조건으로, 감시점을 상태 변화에 대한 이벤트로 구분한다.[^tracer]

## 3. 프레임 안에 들어 있는 것

프레임 객체는 함수 호출 하나의 실행 상태를 담고 있다. 구현에서 주로 쓴 속성은 아래와 같다.

| 속성 | 사용처 |
|---|---|
| `f_code.co_name` | 현재 함수 이름, 함수 중단점 |
| `f_code.co_filename` | 소스 파일 식별 |
| `f_lineno` | 현재 줄과 줄 중단점 |
| `f_locals` | 지역 변수 출력과 표현식 평가 |
| `f_globals` | 전역 이름을 포함한 표현식 평가 |
| `f_back` | 호출자 방향으로 스택 탐색 |

Python 데이터 모델 문서도 `f_back`을 호출자 방향의 이전 프레임으로, `f_locals`와 `f_globals`를 지역·전역 이름 검색에 쓰는 매핑으로 정의한다.[^python-frame]

이 정보만 있으면 `print x + 1` 같은 명령은 이렇게 구현할 수 있다.

```python
result = eval(expression, frame.f_globals, frame.f_locals)
print(repr(result))
```

다만 `eval()`은 단순한 파서가 아니라 실제로 Python 코드를 실행한다. 그래서 디버거에 입력한 표현식은 대상 프로그램과 같은 권한으로 돌아간다. 편리한 만큼, 신뢰할 수 없는 표현식을 넣어서는 안 된다.

## 4. 컨텍스트 매니저를 이용한 추적 및 수명 관리

디버거를 `with` 문으로 쓰면 추적이 언제 시작하고 언제 끝나는지가 분명해진다.

```python
with MiniDebugger():
    target_function()
```

`with` 문은 `__enter__()`가 성공하면 블록이 어떻게 끝나든 `__exit__()`을 호출하도록 정의되어 있다.[^python-with] 그래서 `__enter__()`에서 기존 추적 함수를 저장하고 새 추적 함수를 설치한 뒤, `__exit__()`에서 원래 값으로 되돌렸다.

CLI에서는 대상 파일을 읽어 `compile()`하고, 별도의 `__main__` 이름 공간에서 `exec()`한다. 이렇게 하면 새로 실행되는 모듈 프레임부터 추적 이벤트를 받을 수 있다.

## 5. “멈춤”을 상태와 정지 정책으로 나누기

디버거가 “멈춰 있다”는 말에는 사실 이야기가 두 개 섞여 있다. 하나는 지금 멈춰 있는지 실행 중인지(상태), 다른 하나는 실 중이라면 언제 다시 멈출지(정책)다. 이 둘을 나눠서 보면 구조가 훨씬 깔끔해진다.

실행 상태는 세 가지다.

| 실행 상태 | 의미 |
|---|---|
| `PAUSED` | 대상 실행을 멈추고 사용자 명령을 기다리는 상태 |
| `RUNNING` | 대상 코드를 실행하면서 추적 이벤트를 검사하는 상태 |
| `TERMINATED` | `quit`을 입력했거나 대상 프로그램이 끝난 상태 |

`RUNNING`에는 “어떤 조건에서 `PAUSED`로 돌아갈 것인가”를 나타내는 정지 정책이 하나 붙는다.


| 정지 정책 | `PAUSED`로 돌아가는 조건 |
|---|---|
| `STEP` | 다음 `line` 이벤트 |
| `CONTINUE` | 중단점 일치 또는 감시값 변경 |
| `NEXT` | 명령을 입력한 프레임의 다음 `line` 또는 그 프레임의 `return` |
| `UNTIL` | 같은 프레임에서 기준보다 큰 줄의 `line` 또는 `return` |
| `FINISH` | 명령을 입력한 프레임의 `return` |

아래 그림에서 실행 상태는 둥근 사각형으로만 그렸다. 명령과 추적 이벤트는 상태 사이의 화살표에 적었다. `STEP`, `CONTINUE`, `NEXT`, `UNTIL`, `FINISH`는 별도의 상태가 아니라 `RUNNING`에 붙는 정지 정책이다. 같은 상태가 여러 번 나오는 것은 정책별 전이를 한 줄씩 따라 읽기 쉽게 하려고 반복해서 그린 것이다.

![Python 미니 디버거의 실행 상태 전이. PAUSED에서 명령을 입력하면 정지 정책을 가진 RUNNING으로 전이하고, 정책별 추적 이벤트와 조건이 충족되면 PAUSED로 돌아간다.]({{ '/assets/images/python-debugger-state-machine.svg' | relative_url }})

예를 들어 첫 번째 줄은 다음 순서로 읽는다.

```text
현재 상태: PAUSED
  ── 입력: step 명령 / 동작: policy를 STEP으로 설정 ──>
다음 상태: RUNNING
  ── 이벤트: line ──>
다음 상태: PAUSED
```

여기서 `step`은 상태가 아니라 `PAUSED → RUNNING` 전이를 일으키는 입력이다. 그 뒤에 `line` 이벤트가 들어오면 `policy == STEP` 조건에 따라 `RUNNING → PAUSED`로 돌아간다. `next`도 흐름은 같지만, 명령을 입력했던 프레임에서 시작 줄과 다른 `line` 이벤트가 발생하거나 그 프레임의 `return` 이벤트가 발생해야 멈춘다. 그리고 어떤 정책이든 중단점 일치와 감시값 변경은 정책 자체의 조건보다 먼저 `PAUSED` 전이를 일으킨다.

실제 코드는 `phase`와 `policy`를 열거형으로 나누지 않았다. `_mode` 문자열 하나에 `stopped`, `step`, `continue`, `next`, `until`, `finish`를 모두 담았다. 구현은 두 개념을 한 변수로 뭉뚱그렸지만, 동작을 이해할 때는 `PAUSED/RUNNING/TERMINATED`와 `STEP~FINISH`를 서로 다른 층위로 보는 편이 정확하다. 참고로 `TERMINATED`도 `_mode`에 저장되는 값이 아니다. 추적 함수가 해제되고 대상 실행이 끝난 뒤를 가리키는 수명주기 상태다.

### 문제 1 : `next`가 `step`처럼 움직이는 것

`sys.settrace()`는 호출된 함수 안에서도 `call`과 `line` 이벤트를 보낸다.[^python-settrace] 그래서 “다음 `line`에서 멈춘다”로만 구현하면 `next`가 호출한 함수 안으로 들어가 버리고, 결국 `step`과 똑같아진다.

이를 막으려고 `next`를 입력한 시점의 프레임을 `_resume_frame`에 저장해 두고, 이후 이벤트의 `frame is _resume_frame`이 참일 때만 줄 정지 조건을 검사했다. 하위 함수에서 일어나는 이벤트도 추적은 하지만, `next`의 정지 조건으로는 쓰지 않는다.

하위 함수에 따로 건 중단점이 없다면 호출 전체를 건너뛰고 호출한 쪽의 다음 줄에서 멈춘다. 반대로 `step`은 프레임을 제한하지 않으니 하위 함수의 첫 실행 줄에서 멈춘다. 이 차이는 Exercise 2가 설명하는 두 명령의 차이와 같다.[^debugger-ex2]

### 문제 2 : `next`가 중단점까지 지나쳐 버린다는 것

정지 정책만 먼저 검사하면, `NEXT`나 `FINISH`로 실행하는 동안 하위 함수에 걸어 둔 중단점과 감시점을 그냥 지나칠 수 있다. 그래서 추적 이벤트 하나를 처리할 때 아래 순서로 검사했다. 이 글에서는 이 검사 순서를 “이벤트 우선순위”라고 부르겠다.

```text
1. 중단점이 일치하는가?
2. 감시값이 변했는가?
3. 현재 정지 정책의 조건이 만족됐는가?
4. 모두 아니면 RUNNING을 유지한다.
```

이렇게 하면 `next`로 호출을 건너뛰는 중에도, 하위 함수에 직접 설정한 중단점에서는 `PAUSED`로 전이한다.

## 6. 줄 중단점과 함수 중단점

### 문제 3 : 줄 번호만으로는 중단점을 구별할 수 없다는 것

여러 파일에 같은 줄 번호가 있으니 `18`만 저장하면 다른 모듈의 18번 줄에서도 멈춘다. Windows에서는 경로의 대소문자와 상대 경로까지 비교를 까다롭게 만든다. 그래서 줄 중단점을 정규화한 절대 파일 경로와 줄 번호의 쌍으로 저장했다.

```python
event == "line" and filename == bp.filename and frame.f_lineno == bp.line
```

### 문제 4 : 모듈 첫 줄에서는 아래쪽 함수가 아직 없다는 것

디버거가 모듈 첫 줄에서 멈춘 상태에서 `break average`를 실행하면, 아직 `average`의 `def`가 실행되지 않았기 때문에 `eval("average")`가 `NameError`를 낸다.

이미 정의된 함수라면 `__code__` 객체를 저장해 두고 `call` 이벤트의 `frame.f_code`와 동일성을 비교한다. 아직 정의되지 않은 단순 함수 이름이라면 현재 파일과 함수 이름을 예약해 두었다가, 이후 같은 파일의 `call` 이벤트에서 `co_name`을 비교한다.

덕분에 정의된 함수는 코드 객체로 정확히 구별하고, 모듈 첫 줄에서도 앞으로 정의될 함수에 중단점을 걸어 둘 수 있게 됐다. 파일까지 함께 비교하니 다른 모듈의 같은 이름 함수에서 잘못 멈추는 경우도 줄었다.

## 7. 감시점

Exercise 2는 `watch CONDITION`의 값이 바뀌면 멈추도록 요구한다.[^debugger-ex2] 여기에는 설계 문제가 세 가지 숨어 있다.

### 문제 5. 하위 함수에서는 같은 이름이 다른 값을 가진다는 것

`watch counter`를 모든 프레임에서 평가하면, 하위 함수에 들어갈 때 `counter`가 없어지거나 우연히 같은 이름의 다른 지역 변수를 만나 값이 바뀐 것처럼 보일 수 있다.

그래서 감시점을 등록할 때 표현식과 함께 현재 함수의 코드 객체를 저장하고, 같은 코드 객체의 프레임에서만 표현식을 다시 평가했다. 이름이 아직 만들어지지 않은 이벤트는 멈추지 않고 건너뛴다.

### 문제 6. 변경 가능한 객체는 참조만 저장해서는 비교할 수 없다는 것

이전 목록 객체를 그대로 저장해 두고 나중에 같은 목록과 비교하면, `append()`를 해도 저장해 둔 참조가 같은 객체를 가리키기 때문에 “이전 값”이 남아 있지 않다.

구현이 복잡해지는 걸 막으려고 `(타입 이름, repr 값)`을 문자열 스냅샷으로 저장했다. 복사하는 것 보다 실패할 가능성이 낮고, 기본 컨테이너의 변경은 대부분 잡아낸다.

하지만 `repr()`에 내부 상태가 드러나지 않는 사용자 객체의 변경은 놓칠 수 있다는 한계도 있다. 
이것은 완벽한 객체 변경 감지가 아니라, 작은 디버거에 맞춰 선택한 것이라 어쩔 수 없는 결과임을 알 수 있었다.

### 문제 7 : 살펴보는 프레임과 재개할 프레임은 달라야 함

`up`으로 호출자 프레임을 고른 뒤에도 `print`와 `list`는 그 프레임을 기준으로 동작해야 한다. 그런데 그 상태에서 `next`까지 선택된 호출자 프레임을 기준으로 실행하면, 실제로 멈춘 위치와 실행 제어가 뒤섞인다.

그래서 실제 실행이 멈춘 `_active_frame`과 사용자가 스택 탐색으로 고른 `_selected_frame`을 따로 저장했다. `print`, `locals`, `list`는 선택 프레임을 쓰고, `step`, `next`, `until`, `finish`는 실제 정지 프레임을 기준으로 재개한다.

결과적으로 `up/down`은 관찰 대상만 바꾸고 프로그램 카운터나 재개 위치는 건드리지 않는다. 프레임 객체의 `f_back`을 따라 호출자 방향 스택을 만드는 구조와도 역할이 깔끔하게 나뉜다.[^python-frame]

## 8. 추가 기능: 조건부 중단점

구현하기 전에 인터페이스부터 정했다.

```text
break LINE if CONDITION
break FILE:LINE if CONDITION
```

일반 줄 중단점은 반복문의 모든 반복에서 멈춘다. 그래서 특정 상태만 확인하고 싶을 때는 번거로웠다.

조건부 중단점은 먼저 파일과 줄이 일치하는지 확인하고, 해당 프레임의 `f_globals`와 `f_locals`로 조건식을 평가한다. 예를 들어 `i == 1000`인 반복에서만 멈출 수 있다. 조건식의 변수 이름이 틀렸다고 대상 프로그램까지 종료시키는 건 과하다고 판단해서, 평가 오류는 중단점마다 한 번만 출력하고 실행을 이어 가게 했다.

이 기능은 단순한 편의 기능으로 끝나지 않았다. `f_globals`, `f_locals`, `eval()`이 실제 디버거 안에서 어떻게 맞물리는지 보여 주는 학습 기능이 됐다.

## 9. Python 문법과 표준 라이브러리에서 배운 것

### 데이터 클래스

`@dataclass`로 `Breakpoint`, `Watchpoint` 같은 데이터 중심 객체를 만들었다. 생성자와 출력 표현을 직접 쓰지 않아도 되고, 실행 제어 로직과 저장하는 데이터가 나뉘어서 명령 목록 출력과 삭제도 쉬워졌다.

### 타입 힌트와 유니온

`FrameType | None`, `list[Breakpoint]` 같은 표기를 썼다. 타입 힌트는 런타임에 뭔가를 강제하지 않는다. 대신 “정지 전에는 프레임이 없을 수도 있다” 같은 사실을 코드에 드러내는 문서 역할을 한다.

### 예외 계층

`quit`은 `DebuggerQuit(BaseException)`을 발생시켜 대상 실행에서 곧바로 빠져나온다. `Exception`이 아니라 `BaseException`을 상속한 이유는, 대상 코드에 흔히 있는 `except Exception:`에 실수로 잡히지 않게 하려는 것이다. 컨텍스트 매니저의 `__exit__()`은 이 예외만 억제하고 추적 함수를 복구한다.

### `linecache`

현재 줄과 주변 소스는 `linecache.getline()`으로 읽는다. Python이 이미 읽은 소스를 캐시해 두기 때문에, 멈출 때마다 파일 전체를 직접 열 필요가 없다.

### 지역 변수 쓰기

`frame.f_locals[name] = value`가 실행 중인 빠른 지역 변수에 항상 바로 반영되는 것은 아니다. 이 프로젝트의 `assign`은 CPython 내부 함수 `PyFrame_LocalsToFast`를 `ctypes`로 호출해 동기화를 시도한다. 그래서 이 명령은 Python 언어 전체가 보장하는 기능이 아니라 CPython 구현에 기대고 있다.

## 10. 남은 한계와 다음 단계

- `sys.settrace()`는 스레드별로 동작하므로, 멀티스레드를 지원하려면 각 스레드에 따로 등록해야 한다.[^python-settrace]
- 감시점 스냅샷은 완전한 객체 변경 탐지가 아니다.
- 비동기 태스크 전환을 별도로 시각화하지 않는다.
- 예외가 발생했을 때 자동으로 멈추는 명령은 아직 없다.
- 시간 여행 디버깅은 Exercise 3의 별도 주제다.[^debugger]

다음에는 `catch EXCEPTION`, 중단점 활성화/비활성화, 명령 파일 저장, 추적 결과의 JSON 내보내기를 붙여 보면 좋겠다. 다만 기능을 더하기 전에 이벤트 우선순위, 프레임 수명, 스레드 정책부터 명세해 두어야 할 것 같다.

## 참고 자료

[^intro]: [The Debugging Book — Introduction to Debugging](https://www.debuggingbook.org/html/Intro_Debugging.html)
[^tracer]: [The Debugging Book — Tracing Executions](https://www.debuggingbook.org/html/Tracer.html)
[^debugger]: [The Debugging Book — How Debuggers Work](https://www.debuggingbook.org/html/Debugger.html)
[^debugger-ex2]: [The Debugging Book — How Debuggers Work, Exercise 2](https://www.debuggingbook.org/html/Debugger.html#Exercise-2:-More-Commands)
[^python-settrace]: [Python 표준 문서 — `sys.settrace()`](https://docs.python.org/3/library/sys.html#sys.settrace)
[^python-frame]: [Python 표준 문서 — Frame objects](https://docs.python.org/3/reference/datamodel.html#frame-objects)
[^python-with]: [Python 언어 참조 — `with` 문](https://docs.python.org/3/reference/compound_stmts.html#the-with-statement)

