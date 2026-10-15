---
layout: post
title: 나만의 Python 디버거 만들기
page_description: sys.settrace()로 추적 이벤트를 받아 작은 Python 디버거를 만든 과정을 남긴 글
category_key: development
summary: step과 next의 차이부터 함수 breakpoint와 watchpoint까지 직접 구현하며 막힌 부분에 대해 정리
lead: sys.settrace()에서 시작해 멈춤 조건을 하나씩 구현
featured: false
feature_order: 0
---

# `sys.settrace()`로 작은 Python 디버거 만들기

평소에는 `pdb`에서 breakpoint를 찍고 변수만 확인했지, Python 프로그램이 어떻게 실제로
멈추는지는 생각해 본 적이 없었다. 이번 미션을 시작하면서 가장 먼저 궁금했던 것도 그
부분이었다. 실행 중인 다른 프로그램을 멈추는 특별한 기능이 따로 있는 줄 알았는데,
Python에서는 `sys.settrace()`로 실행 이벤트를 받아 오는 것이 시작점이었다.

The Debugging Book의 「Introduction to Debugging」, 「Tracing Executions」,
「How Debuggers Work」를 먼저 읽고 작은 tracer부터 만들었다.[^intro][^tracer][^debugger]
이후 책의 Exercise 2에 나오는 명령을 하나씩 추가했다.[^debugger-ex2] 완성된 코드는
600줄이 조금 넘지만, 가장 오래 걸린 부분은
명령어를 많이 만드는 일이 아니었다. 같은 `line` 이벤트를 받아도 지금이 `step` 중인지
`next` 중인지에 따라 멈출지 말지를 정하는 일이 훨씬 까다로웠다.

## 이벤트 출력

`sys.settrace()`에는 호출 가능한 객체 하나를 넘긴다. Python은 실행 중 `call`, `line`,
`return`, `exception` 같은 일이 생길 때마다 이 함수를 부른다.[^python-settrace]

~~~python
import sys

def trace(frame, event, arg):
    print(event, frame.f_code.co_name, frame.f_lineno)
    return trace

sys.settrace(trace)
target_function()
sys.settrace(None)
~~~

이 코드를 실행하면 함수 이름과 줄 번호가 계속 출력된다. 처음에는 이것만으로 디버거의
절반은 만든 것처럼 느껴졌다. 하지만 반복문에서는 같은 줄이 여러 번 나오고, 함수를
호출하면 호출한 쪽과 호출된 쪽의 이벤트가 섞였다. 이벤트를 받는 것과 사용자가 원하는
위치에서 멈추는 것은 전혀 다른 문제였다.

추적 함수가 받는 `frame`에는 그 순간의 실행 정보가 들어 있다. 이 프로젝트에서는
`f_code.co_filename`과 `f_lineno`로 위치를 확인하고, `f_locals`와 `f_globals`로 변수와
표현식을 읽었다. `f_back`을 따라가면 호출자 쪽 프레임을 찾을 수 있다.[^python-frame]
`print values`나 `where` 같은 명령은 결국 이 정보들을 사람이 읽을 수 있게 보여 주는
기능이다.

## 추적 함수 안에서 명령 대기

프로그램을 멈춘 것처럼 보이게 하는 코드는 의외로 단순했다. 추적 이벤트가 정지 조건에
맞으면 `_interaction()`으로 들어가고, 그 안에서 명령 입력을 기다리는 반복문을 돈다.
핵심 흐름만 의사 코드로 줄이면 다음과 같다.

~~~python
def _trace(self, frame, event, arg):
    reason = self._stop_reason(frame, event)
    if reason is not None:
        self._interaction(frame, event, arg, reason)
    return self._trace

def _interaction(self, frame, event, arg, reason):
    self._mode = "stopped"

    while self._mode == "stopped":
        command = self._read_command()
        self._dispatch(command)
~~~

`step`이나 `continue` 명령이 `_mode`를 바꾸면 반복문이 끝나고, 추적 함수가 반환되면서
대상 코드가 다시 실행된다. 별도의 프로세스를 얼리는 방식이 아니라 대상 프로그램과 같은
스레드에서 추적 함수가 입력을 기다리고 있는 것이다.

추적 함수가 예외 때문에 남아 있지 않도록 디버거의 시작과 종료는 컨텍스트 매니저로
감쌌다. `__enter__()`에서 기존 추적 함수를 저장한 뒤 새 추적 함수를 설치하고,
`__exit__()`에서 원래 값으로 되돌렸다. `with` 블록이 예외로 끝나도 `__exit__()`이
호출된다는 언어 규칙을 이용한 것이다.[^python-with] CLI에서는 대상 파일을 `compile()`한
뒤 별도의 `__main__` 이름 공간에서 `exec()`한다.

## `step`과 `next`를 만들며 상태를 다시 나누기

첫 구현에서는 `stopped`, `step`, `next`, `continue`를 전부 비슷한 “상태”라고 생각했다.
코드에도 `_mode` 문자열 하나로 저장했기 때문에 처음에는 별문제가 없어 보였다. 그런데
정지 조건을 설명하려고 하니 `PAUSED`와 `STEP`이 같은 종류인지부터 애매해졌다.

지금은 두 층으로 나눠서 이해하고 있다.

- `PAUSED`, `RUNNING`, `TERMINATED`는 프로그램의 실행 상태다.
- `STEP`, `CONTINUE`, `NEXT`, `UNTIL`, `FINISH`는 `RUNNING`일 때 적용하는 정지
  정책이다.

따라서 `step` 명령 자체가 상태는 아니다. `PAUSED`에서 `step`을 입력하면 정책을
`STEP`으로 정하고 `RUNNING`으로 이동한다. 그다음 `line` 이벤트가 오면 다시 `PAUSED`로
돌아온다. 아래 그림도 상태는 상자로, 명령과 이벤트는 화살표로 구분해서 그렸다.

![Python 미니 디버거의 실행 상태 전이. PAUSED에서 명령을 입력하면 정지 정책을 가진 RUNNING으로 전이하고, 정책별 추적 이벤트와 조건이 충족되면 PAUSED로 돌아간다.]({{ '/assets/images/python-debugger-state-machine.svg' | relative_url }})

실제 코드에는 `PAUSED`나 `RUNNING` 열거형이 따로 없다. `stopped`이면 명령을 기다리고,
그 밖의 `_mode` 값이면 실행 중이라고 해석한다. `TERMINATED`도 저장되는 값이 아니라
`quit`을 입력했거나 대상 프로그램이 끝나 추적이 해제된 상태를 가리킨다. 그림은 코드의
변수 이름을 그대로 옮긴 것이 아니라 실행 흐름을 설명하기 위한 모델이다.

### `next`가 자꾸 함수 안으로 들어가는 문제

`next`를 처음 만들 때는 “다음 `line` 이벤트에서 멈춘다”라고 구현했다. 테스트해 보니
`average()`에서 `total()`을 호출하는 줄을 지날 때 `total()` 안으로 들어갔다. 결과만 보면
`step`과 차이가 없었다.

호출된 함수에서는 새 프레임이 생기므로 “다음 줄”만 확인해서는 호출자와 피호출자를
구분할 수 없었다. 그래서 `next`를 입력한 순간의 프레임을 `_resume_frame`에 저장하고
이후 이벤트의 프레임과 객체 동일성까지 확인했다.

~~~python
elif self._mode == "next" and self._resume_frame is frame:
    if event == "return":
        reason = "function returned"
    elif event == "line" and frame.f_lineno != self._resume_line:
        reason = "next"
~~~

하위 함수의 이벤트는 계속 들어오지만 `frame is self._resume_frame`이 거짓이므로
`next`의 정지 조건으로 쓰지 않는다. 하위 함수가 끝나고 원래 프레임의 다른 줄로 돌아왔을
때 멈춘다.

다만 하위 함수에 사용자가 직접 breakpoint을 걸었다면 `next` 중이어도 멈추는 편이 자연스럽다.
그래서 한 이벤트를 받을 때 breakpoint, watchpoint, 현재 정책 순서로 확인했다. 이 순서를 반대로
두면 `finish`나 `next`가 사용자가 지정한 관찰 지점을 지나칠 수 있다. 현재 구현의
`_trace()`도 이 순서대로 작성되어 있다.[^debugger-source]

## breakpoint의 줄 번호 문제

줄 breakpoint를 처음에는 정수로만 저장하려고 했다. 곧 다른 파일에도 같은 줄 번호가 있다는
문제가 생겼다. 최종적으로는 정규화한 절대 파일 경로와 줄 번호를 함께 저장한다. Windows의
상대 경로와 대소문자 차이도 이 과정에서 정리했다.

함수 breakpoint에서는 다른 문제가 나왔다. 실행을 시작하면 모듈의 첫 실행 줄에서 바로
멈추는데, 이때 `break average`를 입력하면 아래쪽의 `def average`가 아직 실행되지 않았다.
당연히 `eval("average")`는 `NameError`를 냈다. 처음에는 명령 파싱 문제라고 생각해서
파서를 여러 번 확인했지만, 이름이 아직 만들어지지 않은 것이 원인이었다.

이미 정의된 함수는 `__code__` 객체를 저장하고 `call` 이벤트의 `frame.f_code`와 비교한다.
아직 정의되지 않은 단순 함수 이름은 현재 파일과 이름만 예약해 둔다. 나중에 같은 파일에서
`call` 이벤트가 오면 `co_name`을 비교한다. 이 방식 덕분에 프로그램 시작 직후에도
앞으로 정의될 함수에 breakpoint을 걸 수 있었다.

추가 기능으로는 조건부 breakpoint을 넣었다.

~~~text
break 18 if i == 2
break example.py:18 if len(values) == 0
~~~

위치가 일치한 경우에만 그 프레임의 `f_globals`와 `f_locals`로 조건식을 평가한다. 조건식의
변수 이름을 틀렸다고 대상 프로그램까지 끝나는 것은 불편해서, 평가 오류는 해당 breakpoint에서
한 번만 출력하고 실행은 계속하도록 했다.

## `watch`에서의 “이전 값”을 저장 문제

숫자 변수만 감시할 때는 이전 값과 현재 값을 비교하면 됐다. 목록으로 테스트하자 바로
실패했다. 목록 객체 자체를 이전 값으로 저장하면 `append()` 뒤에도 두 값이 같은 객체를
가리킨다. 저장해 둔 “이전 목록”도 이미 바뀌어 있었다.

완전한 객체 변경 감지까지 구현하기에는 범위가 너무 커서, 현재 버전은 값 대신
`(타입 이름, repr(value))`를 스냅샷으로 저장했다. 기본 목록과 딕셔너리의 내용 변화는
잡을 수 있지만, 내부 상태를 `repr()`에 표시하지 않는 객체는 놓칠 수 있다.

감시 표현식을 모든 프레임에서 평가해서도 안 됐다. 서로 다른 함수에 같은 이름의 지역
변수가 있을 수 있기 때문이다. `watch counter`를 등록할 때 현재 `frame.f_code`도 같이
저장하고, 이후 같은 코드 객체의 프레임에서만 다시 평가했다.

## 스택에서 보는 위치와 실행을 재개할 위치

`where`, `up`, `down`을 붙이면서 프레임 변수가 하나 더 필요해졌다. `up`으로 호출자
프레임을 고르면 `print`와 `list`는 그 프레임을 봐야 한다. 그렇다고 `next`까지 호출자
프레임을 기준으로 실행한다면 실제로 멈춘 위치와 재개 위치가 달라진다.

그래서 두 값을 분리했다.

- `_active_frame`: 프로그램이 실제로 멈춘 프레임
- `_selected_frame`: 사용자가 지금 살펴보는 프레임

`print`, `locals`, `list`는 `_selected_frame`을 사용한다. `step`, `next`, `until`,
`finish`는 `_active_frame`을 기준으로 재개한다. `up/down`은 관찰 위치만 바꾸고 실행
위치는 건드리지 않는다.

`assign NAME=EXPR`도 선택한 프레임을 사용한다. 여기서는 `f_locals`가 평범한 딕셔너리와
완전히 같지 않다는 점에 막혔다. 값을 넣어도 CPython의 빠른 지역 변수에 즉시 반영되지
않는 경우가 있었다. 현재 구현은 `ctypes`로 CPython의 `PyFrame_LocalsToFast`를 호출해
동기화를 시도한다.[^debugger-source] 따라서 `assign`은 다른 Python 구현에서도 동작한다고
보장할 수 없었다.

## 테스트 단계에서 명령 메서드가 아니라 한 세션을 실행한 문제

처음에는 `_cmd_next()` 같은 메서드를 하나씩 호출해 확인했다. 이 방법으로는
“모듈 첫 줄에서는 함수 이름이 아직 없다”거나 “하위 함수에서도 추적 이벤트가 들어온다”는
상황이 잘 드러나지 않았다.

테스트에서는 임시 Python 파일을 만들고, 문자열 입력 스트림으로 여러 명령을 차례로
넣었다. 대상 파일을 실제로 `compile()`하고 `exec()`한 뒤 출력 스트림을 확인한다.
현재 테스트는 다음 여덟 가지 흐름을 다룬다.[^debugger-tests]

1. `step`, `print`, `locals`
2. 줄 breakpoint
3. breakpoint 삭제
4. 조건부 breakpoint
5. 함수 breakpoint과 `next/where/up/down/finish`
6. watchpoint
7. `until`
8. `assign`

예제 프로그램은 빈 목록의 평균을 계산하다 `ZeroDivisionError`가 나는 코드다. 다음처럼
함수 breakpoint에서 입력값을 확인하면 실패가 나기 전의 상태를 볼 수 있다.

~~~text
break average
continue
print values
print len(values)
~~~

명령 전체의 사용법은 이 글에 다시 옮기지 않고 [사용 매뉴얼](https://github.com/katarinabluu-gosegulover/python-mini-debugger/blob/main/MANUAL.md)에 따로 정리해놓았다.

## 만들고 나서 달라진 점

직접 만들기 전에는 breakpoint이 디버거의 중심이라고 생각했다. 구현하고 나서는 **어떤 이벤트를
무시하고 어떤 이벤트에서 사용자에게 제어권을 돌려줄지 정하는 로직**이 더 중요하다고
느꼈다. breakpoint도 결국 여러 정지 조건 중 하나였다.

책에서 추적 함수 예제를 읽을 때는 `frame`, `event`, `arg`를 출력하면 구조를 이해한 것
같았다. 하지만 `next` 하나를 구현하는 데도 프레임 동일성, 줄 이벤트의 시점, 명시적
breakpoint의 우선순위를 함께 결정해야 했다. 읽을 때보다 직접 구현한 뒤에 프레임이 “현재
함수에 대한 정보들”이 아니라 실행 제어의 기준이라는 점이 더 분명해졌다.

아직 예외가 발생하면 자동으로 멈추는 명령은 없고, 새 스레드도 자동 추적하지 않는다.
`sys.settrace()`는 스레드별 설정이기 때문이다.[^python-settrace] watchpoint의 `repr()`
스냅샷도 완전한 변경 감지를 할 수 있는 것은 아니다. 다음에 기능을 추가해본다면 `catch EXCEPTION`부터 만들어
보고 싶다.

## 참고 자료

[^intro]: [The Debugging Book — Introduction to Debugging](https://www.debuggingbook.org/html/Intro_Debugging.html)
[^tracer]: [The Debugging Book — Tracing Executions](https://www.debuggingbook.org/html/Tracer.html)
[^debugger]: [The Debugging Book — How Debuggers Work](https://www.debuggingbook.org/html/Debugger.html)
[^debugger-ex2]: [The Debugging Book — How Debuggers Work, Exercise 2](https://www.debuggingbook.org/html/Debugger.html#Exercise-2:-More-Commands)
[^python-settrace]: [Python 표준 문서 — `sys.settrace()`](https://docs.python.org/3/library/sys.html#sys.settrace)
[^python-frame]: [Python 표준 문서 — Frame objects](https://docs.python.org/3/reference/datamodel.html#frame-objects)
[^python-with]: [Python 언어 참조 — `with` 문](https://docs.python.org/3/reference/compound_stmts.html#the-with-statement)
[^debugger-source]: [`debugger.py` 구현](https://github.com/katarinabluu-gosegulover/python-mini-debugger/blob/main/debugger.py)
[^debugger-tests]: [통합 테스트 8개](https://github.com/katarinabluu-gosegulover/python-mini-debugger/blob/main/tests/test_debugger.py)

