---
layout: post
title: golang file upload server 구축
page_description: golang file upload sever 구축
category_key: development
summary:  golang file upload sever 구축
lead: golang file upload sever 구축
featured: false
feature_order: 0
---

## Golang 파일 업로드/공유 서버 구현 정리

서버 주소 https://golang-file-server.onrender.com

## 목표

Go로 웹 백엔드 구조를 익히기 위해 파일 업로드와 외부 공유 링크 생성 기능을 직접 구현했다. 웹 브라우저뿐 아니라 `curl` 명령어로도 업로드와 다운로드가 가능하도록 만들고, 업로드 과정에서 MIME 타입, 확장자, 경로 검증을 적용했다.

## 구현 구조

```text
go-secure-file-share/
  cmd/server/main.go
  internal/fileshare/server.go
  internal/fileshare/storage.go
  internal/fileshare/validation.go
  internal/fileshare/server_test.go
```

`cmd/server/main.go`는 환경 변수를 읽고 HTTP 서버를 실행한다. 실제 업로드 처리, 파일 저장, 검증 로직은 `internal/fileshare` 패키지로 분리했다. 이렇게 나누면 서버 실행 코드와 비즈니스 로직을 따로 테스트할 수 있다.

라우팅은 Go 표준 라이브러리의 `http.ServeMux`를 사용했다. 업로드, 다운로드, 삭제를 각각 다른 HTTP method와 path로 나눴다.

```go
s.mux.HandleFunc("POST /upload", s.handleUpload)
s.mux.HandleFunc("GET /share/{id}", s.handleDownload)
s.mux.HandleFunc("DELETE /share/{id}", s.handleDelete)
```

여기서 핵심은 `POST /upload` 하나가 웹 브라우저 업로드와 `curl` 업로드를 모두 처리한다는 점이다.

## 파일 업로드 흐름

1. 사용자가 웹 UI 또는 `curl -F "file=@sample.png"`로 `/upload`에 multipart 요청을 보낸다.
2. 서버는 요청 본문 크기를 제한하고 multipart form을 파싱한다.
3. 원본 파일명에서 경로 문자가 있는지 확인하고 허용 확장자인지 검사한다.
4. 파일 앞부분 512바이트를 읽어 `http.DetectContentType`으로 MIME 타입을 감지한다.
5. 확장자와 MIME 타입이 허용된 조합인지 확인한다.
6. `.json` 파일은 실제 JSON 문법까지 확인한다.
7. 랜덤 ID를 생성하고 `data/uploads/{id}{ext}` 형태로 저장한다.
8. 메타데이터를 `data/metadata.json`에 기록하고 `/share/{id}` 공유 링크를 반환한다.

핵심 검증 코드는 다음과 같다.

```go
contentType := detectMediaType(head[:n])
if err := validateDetectedType(ext, contentType); err != nil {
    return UploadResponse{}, err
}
```

파일명은 저장 경로로 직접 쓰지 않았다. 원본 파일명에는 `../secret.txt` 같은 경로 조작 문자열이 들어갈 수 있기 때문이다. 실제 저장 파일명은 서버가 만든 랜덤 ID만 사용한다.

## 웹 업로드와 curl 업로드를 같이 지원한 방식

웹 UI에서는 HTML form을 `multipart/form-data` 방식으로 보낸다.

```html
<form method="post" action="/upload" enctype="multipart/form-data">
  <input type="file" name="file" required>
  <button type="submit">업로드</button>
</form>
```

여기서 중요한 부분은 `name="file"`이다. 서버 코드에서는 같은 이름으로 파일을 꺼낸다.

```go
file, header, err := r.FormFile("file")
if err != nil {
    s.writeUploadError(w, r, http.StatusBadRequest, "file field is required")
    return
}
defer file.Close()
```

`curl`에서도 같은 field name을 사용한다.

```powershell
curl.exe -F "file=@sample.png" http://localhost:8080/upload
```

`-F`는 multipart form field를 보내는 옵션이고, `file=@sample.png`는 `file`이라는 필드에 로컬 파일 `sample.png`의 내용을 넣겠다는 뜻이다. 그래서 웹 form과 curl 요청이 서버 입장에서는 같은 multipart 업로드 요청으로 들어온다.

업로드 핸들러의 핵심 흐름은 다음과 같다.

```go
r.Body = http.MaxBytesReader(w, r.Body, s.maxUploadBytes+(1<<20))
if err := r.ParseMultipartForm(1 << 20); err != nil {
    s.writeUploadError(w, r, http.StatusBadRequest, "multipart form parsing failed")
    return
}

file, header, err := r.FormFile("file")
response, err := s.saveUploadedFile(file, header)
response.ShareURL = s.absoluteURL(r, "/share/"+response.ID)
```

먼저 `http.MaxBytesReader`로 요청 크기를 제한하고, `ParseMultipartForm`으로 multipart 요청을 파싱한다. 그 다음 `FormFile("file")`로 업로드 파일을 꺼내고, `saveUploadedFile`에서 검증과 저장을 처리한다.

응답은 요청 종류에 따라 나눴다.

```go
if wantsHTML(r) {
    http.Redirect(w, r, "/?uploaded="+url.QueryEscape(response.ID), http.StatusSeeOther)
    return
}

writeJSON(w, http.StatusCreated, response)
```

브라우저 form 업로드는 업로드 후 다시 메인 화면으로 보내는 것이 자연스럽기 때문에 redirect를 사용했다. 반면 `curl`이나 API 클라이언트는 결과를 프로그램이 읽기 쉬워야 하므로 JSON을 반환했다.

## 공유 링크와 다운로드

업로드 성공 시 서버는 `/share/{id}` 형식의 공유 링크를 만든다. 다운로드 요청에서는 ID가 32자리 hex 문자열인지 먼저 확인한다. 그 다음 메타데이터에서 실제 저장 파일명을 찾고, 최종 경로가 업로드 디렉터리 안에 있는지 다시 검증한다.

다운로드 응답에는 다음 보안 헤더를 적용했다.

```go
w.Header().Set("Content-Disposition", contentDispositionAttachment(meta.OriginalName))
w.Header().Set("X-Content-Type-Options", "nosniff")
```

브라우저가 파일을 페이지 안에서 실행하거나 MIME 타입을 임의로 추측하지 않도록 하기 위해서다.

## curl 테스트

업로드:

```powershell
curl.exe -F "file=@sample.png" http://localhost:8080/upload
```

다운로드:

```powershell
curl.exe -L "http://localhost:8080/share/{id}" -o downloaded.png
```

웹 UI는 같은 `/upload` 엔드포인트를 사용한다. 즉, 브라우저와 CLI가 같은 백엔드 로직을 공유한다.

## 테스트한 보안 케이스

- 정상 PNG 업로드 후 공유 링크로 다운로드
- `../pixel.png` 같은 경로 조작 파일명 거부
- `.exe` 같은 허용되지 않은 확장자 거부
- 내용은 텍스트인데 확장자만 `.png`인 MIME 불일치 파일 거부
- 확장자는 `.json`이지만 JSON 문법이 깨진 파일 거부
- `/share/../../secret` 같은 잘못된 공유 ID 거부

테스트 실행:

```powershell
go test ./...
```

## 배운 점

파일 업로드 기능은 단순히 파일을 받아 저장하는 기능처럼 보이지만, 실제로는 입력값을 신뢰하지 않는 설계가 중요하다. 원본 파일명, 확장자, MIME 타입, 저장 경로, 다운로드 방식 모두 File vulnerability 공격 표면이 될 수 있다. 특히 원본 파일명을 경로로 사용하지 않고, 서버가 생성한 ID로만 저장하는 방식이 경로 조작 즉, Path-Traversal와 같은 공격 위험을 줄이는 데 효과적이었다.


go 언어 문법을 학습할 때는 매우 어려운 난이도는 아니었으나 다른 언어와 비슷하게, 함수나 기능을 구현하려고 하니 상당히 어려웠다. AI의 도움을 피할 수
없었고, VS Code tab기능으로 조금은 수월했으나 그래도 어려운 미션이었다. 파일명 검증 같은 경우에는 기본적인 if 조건문을 활용한것이기 때문에 비교적
괜찮았다. 어찌저찌 완성은 했지만 이것만으로 끝내기에는 가끔 웹 해킹 문제를 풀면서 go 언어를 이용한 문제가 나오니도 하니 좀 더 공부를 해볼 예정이다. 또, 이번 미션을 통해 간단한 go 문법을 익혔기 때문에 간단한 함수나 조건문 등을 관찰하며 go 언어를 이용한 웹 해킹 문제에서 학습한 내용을 적용해보고싶다.
