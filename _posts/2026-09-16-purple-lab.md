---
layout: post
title: PurpleLab 구축 및 탐지 규칙 실습
page_description: Windows server 2019과 PurpleLab 구축 및 탐지 규칙 실습해보기
category_key: blog-docs
summary: Windows server 2019과 PurpleLab 구축 및 탐지 규칙 실습해보기
lead: Windows server 2019과 PurpleLab 구축 및 탐지 규칙 실습해보기
featured: false
feature_order: 0
---

# PurpleLab 구축·탐지 규칙 실습 결과

## 구성

```text
Windows Server 2019 (192.168.56.101)
  Sysmon → Winlogbeat OSS 7.12.1
              ↓ HTTPS/9200
Ubuntu PurpleLab (192.168.56.10)
  OpenSearch → OpenSearch Dashboards
```

- Ubuntu PurpleLab 코어 서비스: OpenSearch, Dashboards, Apache, PostgreSQL이 실행 상태임을 확인.
- Windows → Ubuntu OpenSearch 포트 9200 연결은 `Test-NetConnection`으로 성공.
- Sysmon 서비스 `Sysmon64`와 Winlogbeat 서비스 `winlogbeat`가 모두 실행 상태임을 확인.
- Winlogbeat 인덱스는 `winlogbeat-2026.09.14`, `winlogbeat-2026.09.15`로 생성됐고, 초기 수집 확인 시 총 2,871건의 event가 있었다.

## 공격 시뮬레이션과 관측 결과

| MITRE ATT&CK | Atomic 테스트 | 실제 실행 결과 | Sysmon 증거 | OpenSearch 검증 |
|---|---|---|---|---|
| T1059.001 Command and Scripting Interpreter: PowerShell | `T1059.001-17` PowerShell Command Execution | 성공, `Hello, from PowerShell!`, Exit code 0 | Event ID 1, `powershell.exe -e <Base64>` | 1건 |
| T1105 Ingress Tool Transfer | `T1105-9` Windows - BITSAdmin BITS Download | BITSAdmin 래퍼는 120초 타임아웃을 반환했으나 `Transfer complete` 출력 및 `Atomic-license.txt`(1,078 bytes) 생성으로 전송 성공을 독립 확인 | Event ID 1, `bitsadmin.exe /transfer ... LICENSE.txt ... Atomic-license.txt`; Event ID 5 종료 | 1건 |
| T1070.006 Indicator Removal on Host: Timestomp | `T1070.006-5` Modify file creation timestamp with PowerShell | 성공, Exit code 0 | Event ID 2, 대상 파일 생성 시간이 1970-01-01로 변경되고 이전 시간 기록 | 1건 |

### 핵심 원본 이벤트

1. **T1059.001** — `2026-09-15T10:49:47.281Z`, Event ID 1
   - Image: `C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
   - CommandLine: `powershell.exe -e JgAgAC...`

2. **T1105** — `2026-09-15T11:38:01.544Z`, Event ID 1
   - Image: `C:\\Windows\\System32\\bitsadmin.exe`
   - CommandLine에 `/transfer`, Atomic Red Team `LICENSE.txt`, `%TEMP%\\Atomic-license.txt`가 함께 기록됨

3. **T1070.006** — `2026-09-15T10:50:30.912Z`, Event ID 2
   - TargetFilename: `C:\\AtomicRedTeam\\ExternalPayloads\\T1551.006_timestomp.txt`
   - PreviousCreationUtcTime: `2026-09-15 10:50:18.426`
   - CreationUtcTime: `1970-01-01 08:00:00.000`

## OpenSearch 검증 쿼리

아래 Query DSL은 `winlogbeat-*` 인덱스에 실행해 각 1건을 반환했다. 전체 쿼리는 밑의 부록 절 참고.

```json
{
  "query": {
    "bool": {
      "filter": [
        { "term": { "event.code": 1 } },
        { "wildcard": { "winlog.event_data.Image.keyword": "*bitsadmin.exe" } },
        { "match_phrase": { "winlog.event_data.CommandLine": "transfer" } }
      ]
    }
  }
}
```

## Sigma 규칙

세 번째 규칙은 이번 Atomic 테스트 마커를 기준으로 한 **검증용** 규칙이다. 운영에서는 특정 파일명 대신 Event ID 2와 비정상적으로 과거인 `CreationUtcTime`, 실행 프로세스, 중요 경로를 조합해 환경별 기준선을 적용해야 한다.

## 결론

Windows Server 2019와 Ubuntu PurpleLab을 분리된 VirtualBox VM으로 구성하고, Windows Sysmon 이벤트를 Winlogbeat로 Ubuntu OpenSearch에 전송했다. Atomic Red Team 기법 **3개**를 실행했으며, 각각에 대한 OpenSearch 검색 쿼리가 **1건씩** 실제 Sysmon 이벤트를 반환하는 것을 검증했다.

## 한계 및 개선점

- 단일 OpenSearch 노드의 인덱스 상태는 `yellow`일 수 있다. 이는 복제본 샤드를 배정할 다른 노드가 없어서 발생할 수 있으며, 본 실습에서는 문서 수가 0보다 크고 인덱스가 `open`인 것으로 수집을 성공했다.
- T1105-29 Invoke-WebRequest 테스트는 `Access is denied`로 실패하여 성공 결과에 포함하지 않았다. 같은 기법의 T1105-9 BITSAdmin 테스트를 대체 실행했고, 파일 생성·프로세스 이벤트·전송 완료 메시지로 성공을 검증했다.

## 참고 자료

- PurpleLab: https://github.com/Krook9d/PurpleLab
- Sysmon: https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon
- Atomic Red Team: https://github.com/redcanaryco/atomic-red-team
- T1059.001 정의: https://github.com/redcanaryco/atomic-red-team/blob/master/atomics/T1059.001/T1059.001.yaml
- T1105 정의: https://github.com/redcanaryco/atomic-red-team/blob/master/atomics/T1105/T1105.yaml
- T1070.006 정의: https://github.com/redcanaryco/atomic-red-team/blob/master/atomics/T1070.006/T1070.006.yaml
- OpenSearch 검색 API: https://docs.opensearch.org/latest/api-reference/search-apis/search/

## 부록 A. 실제 구축과 실행 과정

이 절은 실습 흐름을 확인할 수 있도록 실제 수행 내역을 통합한 것이며, 비밀번호는 기록에서 제외함.

### 로그 수집 구성

- Ubuntu PurpleLab Host-only IP: `192.168.56.10`
- Windows Server 2019 Host-only IP: `192.168.56.101`
- Windows에서 `Test-NetConnection 192.168.56.10 -Port 9200`을 실행해 `TcpTestSucceeded : True`를 확인했다.
- Sysmon `Sysmon64`, Winlogbeat `winlogbeat` 서비스는 모두 `Running`이었다.
- Winlogbeat는 Sysmon Operational, PowerShell Operational, Security, System, Application 채널을 OpenSearch HTTPS 9200으로 전송했고 `winlogbeat.exe test config`는 `Config OK`를 반환했다.

```xml
<EventFiltering>
  <NetworkConnect onmatch="include"><Image condition="end with">powershell.exe</Image></NetworkConnect>
  <FileCreate onmatch="include"><Image condition="end with">powershell.exe</Image></FileCreate>
  <FileCreateTime onmatch="include"><Image condition="end with">powershell.exe</Image></FileCreateTime>
</EventFiltering>
```

분석한 핵심 Sysmon 이벤트는 Process Create(1), File creation time changed(2), Network connection(3), Process terminated(5), File created(11)이다.

### Atomic Red Team 설치와 실행 명령

```powershell
Install-AtomicRedTeam -InstallPath C:\AtomicRedTeam -getAtomics -noPayloads
Invoke-AtomicTest T1059.001 -TestNumbers 17 -PathToAtomicsFolder C:\AtomicRedTeam\atomics
Invoke-AtomicTest T1105 -TestNumbers 9 -PathToAtomicsFolder C:\AtomicRedTeam\atomics
Invoke-AtomicTest T1070.006 -TestNumbers 5 -GetPrereqs -PathToAtomicsFolder C:\AtomicRedTeam\atomics
Invoke-AtomicTest T1070.006 -TestNumbers 5 -PathToAtomicsFolder C:\AtomicRedTeam\atomics
```

| 기법 | 실제 결과 | 독립 검증 |
|---|---|---|
| T1059.001-17 | `Hello, from PowerShell!`, Exit code 0 | Event ID 1의 `powershell.exe -e JgAgAC...` |
| T1105-9 | `Transfer complete` | `%TEMP%\Atomic-license.txt` 1,078 bytes와 Event ID 1·5 확인 |
| T1070.006-5 | Exit code 0 | Event ID 2에 생성 시간이 1970년으로 변경됨 |

T1105-29 Invoke-WebRequest 테스트는 `Access is denied`로 실패해 성공 결과에 포함하지 않았고, T1105-9만 대체 성공으로 기록했다.

## 부록 B. OpenSearch Query DSL 전체와 재검증

대상 인덱스는 `winlogbeat-*`다. 아래 쿼리는 실습 로그에서 각각 정확히 1건을 반환했다.

### T1059.001 — 1건

```json
{
  "size": 3,
  "_source": ["@timestamp", "event.code", "winlog.event_data.Image", "winlog.event_data.CommandLine"],
  "query": {
    "query_string": {
      "query": "event.code:1 AND winlog.event_data.Image:*powershell.exe AND winlog.event_data.CommandLine:*JgAgAC*"
    }
  }
}
```

반환 증거: `2026-09-15T10:49:47.281Z`, Sysmon Event ID 1, `powershell.exe -e JgAgAC...`.

### T1105 — 1건

```json
{
  "size": 3,
  "_source": ["@timestamp", "event.code", "winlog.event_data.Image", "winlog.event_data.CommandLine"],
  "query": {
    "bool": {
      "filter": [
        { "term": { "event.code": 1 } },
        { "wildcard": { "winlog.event_data.Image.keyword": "*bitsadmin.exe" } },
        { "match_phrase": { "winlog.event_data.CommandLine": "transfer" } }
      ]
    }
  }
}
```

반환 증거: `2026-09-15T11:38:01.544Z`, Sysmon Event ID 1, `bitsadmin.exe /transfer ... LICENSE.txt ... Atomic-license.txt`.

### T1070.006 — 1건

```json
{
  "size": 3,
  "_source": ["@timestamp", "event.code", "winlog.event_data.Image", "winlog.event_data.TargetFilename", "winlog.event_data.CreationUtcTime", "winlog.event_data.PreviousCreationUtcTime"],
  "query": {
    "bool": {
      "filter": [
        { "term": { "event.code": 2 } },
        { "wildcard": { "winlog.event_data.TargetFilename.keyword": "*T1551.006_timestomp.txt" } },
        { "match_phrase": { "winlog.event_data.CreationUtcTime": "1970" } }
      ]
    }
  }
}
```

반환 증거: `2026-09-15T10:50:30.912Z`, Sysmon Event ID 2, 대상 `T1551.006_timestomp.txt`, 이전 시간 `2026-09-15 10:50:18.426`, 변경 시간 `1970-01-01 08:00:00.000`.

## 부록 C. Sigma 규칙 전문

### T1059.001 — Encoded PowerShell

```yaml
title: Encoded PowerShell Command Execution
status: experimental
description: Detects PowerShell started with common encoded-command switches. Validated with Atomic Red Team T1059.001-17.
references:
  - https://attack.mitre.org/techniques/T1059/001/
logsource:
  product: windows
  service: sysmon
  category: process_creation
detection:
  image:
    Image|endswith: '\\powershell.exe'
  encoded:
    CommandLine|contains:
      - ' -e '
      - ' -enc '
      - ' -encodedcommand '
  condition: image and encoded
tags:
  - attack.execution
  - attack.t1059.001
falsepositives:
  - Authorized automation that uses encoded PowerShell
level: medium
```

### T1105 — BITSAdmin Ingress Tool Transfer

```yaml
title: BITSAdmin Ingress Tool Transfer
status: experimental
description: Detects BITSAdmin transfers that can download or upload files. Validated with Atomic Red Team T1105-9.
references:
  - https://attack.mitre.org/techniques/T1105/
logsource:
  product: windows
  service: sysmon
  category: process_creation
detection:
  image:
    Image|endswith: '\\bitsadmin.exe'
  transfer:
    CommandLine|contains:
      - '/transfer'
      - '/priority'
  condition: image and transfer
tags:
  - attack.command_and_control
  - attack.t1105
falsepositives:
  - Legacy authorized software distribution using BITSAdmin
level: medium
```

### T1070.006 — Atomic Timestomp 검증 규칙

```yaml
title: Atomic Red Team Timestomp Marker Creation Time Change
status: test
description: Test-specific validation rule for Sysmon FileCreateTime generated by Atomic Red Team T1070.006-5.
references:
  - https://attack.mitre.org/techniques/T1070/006/
logsource:
  product: windows
  service: sysmon
  category: file_change
detection:
  event:
    EventID: 2
  marker:
    TargetFilename|endswith: '\\T1551.006_timestomp.txt'
  timestamp:
    CreationUtcTime|startswith: '1970-01-01'
  condition: event and marker and timestamp
tags:
  - attack.defense_evasion
  - attack.t1070.006
falsepositives:
  - Expected only during this Atomic Red Team validation
level: high
```
