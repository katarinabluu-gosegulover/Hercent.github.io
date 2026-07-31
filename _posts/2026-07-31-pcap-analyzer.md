---
layout: post
title: pcap 파일 분석기 제작
page_description: pcap 파일을 분석하고 통계를 내보는 분석기를 제작
category_key: development
summary:  pcap 파일을 분석하고 통계를 내보는 분석기를 제작
lead:  pcap 파일을 분석하고 통계를 내보는 분석기를 제작
featured: false
feature_order: 0
---

# dpkt로 만드는 PCAP 패킷 분석기 — 네트워크 트래픽 직접 해석해보기

> 미션 목표: pcap 파일을 직접 분석하는 프로그램을 작성하여 네트워크 패킷의 구조와 동작 원리를 이해한다.

이번 미션에서는 `dpkt` 라이브러리를 이용해 pcap 파일을 열고, Ethernet / IP / TCP / UDP / ICMP 헤더를 파싱하고, 프로토콜별 통계를 내고, 마지막으로 "어떤 통신이 오갔는지"를 해석하는 분석기를 만들었다. Wireshark가 GUI로 해주는 일을 코드로 직접 재현해보는 것이 핵심이다.

---

## 1. PCAP 파일 구조 이해

pcap(libpcap 포맷) 파일은 크게 두 부분으로 되어 있다.

```
┌──────────────────────────┐
│  Global Header (24 bytes) │  파일 전체에 대한 메타정보
├──────────────────────────┤
│  Packet Header (16 bytes)                          │   ┐
│  Packet Data (가변)                                │   ├─ 패킷 1
├──────────────────────────┤   ┘
│  Packet Header (16 bytes)                          │   ┐
│  Packet Data (가변)                                │   ├─ 패킷 2
├──────────────────────────┤   ┘
│           ...            │
└──────────────────────────┘
```

### Global Header (24 bytes)

| 필드 | 크기 | 설명 |
|------|------|------|
| magic_number | 4B | `0xa1b2c3d4` (마이크로초) / `0xa1b23c4d` (나노초). 엔디안 판별에도 사용 |
| version_major/minor | 2B+2B | 보통 2.4 |
| thiszone | 4B | GMT 오프셋 (보통 0) |
| sigfigs | 4B | 타임스탬프 정확도 (보통 0) |
| snaplen | 4B | 캡처된 최대 바이트 수 (보통 65535 / 1500) |
| linktype | 4B | 링크 계층 유형. `1` = Ethernet |

### Packet Header (16 bytes)

| 필드 | 크기 | 설명 |
|------|------|------|
| ts_sec | 4B | 캡처 시각 (초) |
| ts_usec | 4B | 캡처 시각 (마이크로/나노초) |
| incl_len | 4B | 실제 저장된 길이 |
| orig_len | 4B | 원본 패킷 길이 |

`dpkt.pcap.Reader`가 이 헤더들을 대신 파싱해주지만, 정말 이해했는지 확인하려고 **struct로 직접 24바이트를 까서 dpkt 결과와 대조**해봤다.

```python
import struct, dpkt

with open('sample.pcap','rb') as f:
    raw = f.read(24)

magic, = struct.unpack('<I', raw[0:4])
ver_major, ver_minor = struct.unpack('<HH', raw[4:8])
thiszone, sigfigs, snaplen, linktype = struct.unpack('<iIII', raw[8:24])
print(hex(magic), snaplen, linktype)
```

결과:

```
magic number   : 0xa1b2c3d4
version        : 2.4
snaplen        : 1500
linktype       : 1  (1 = Ethernet)

dpkt snaplen   : 1500
dpkt linktype  : 1
```

struct로 직접 읽은 값과 dpkt가 노출하는 값이 정확히 일치한다. 즉 `dpkt.pcap.Reader`는 내부적으로 위 24바이트 구조를 그대로 언패킹하고 있다는 것을 확인할 수 있다.

---

## 2. 계층별 헤더 파싱

패킷은 양파처럼 감싸져 있다. dpkt는 이걸 객체 트리로 풀어준다.

```
Ethernet ─▶ IP(v4/v6) ─▶ TCP / UDP / ICMP ─▶ payload
  L2            L3              L4
```

핵심 파싱 로직:

```python
eth = dpkt.ethernet.Ethernet(buf)          # L2

if isinstance(eth.data, dpkt.ip.IP):        # L3
    ipp = eth.data
    src, dst = ip_to_str(ipp.src), ip_to_str(ipp.dst)
    l4 = ipp.data

    if isinstance(l4, dpkt.tcp.TCP):        # L4
        print(src, l4.sport, '->', dst, l4.dport, tcp_flag_str(l4.flags))
    elif isinstance(l4, dpkt.udp.UDP):
        ...
    elif isinstance(l4, dpkt.icmp.ICMP):
        ...
```

### `isinstance`로 분기하는 이유

dpkt는 IP 헤더의 `protocol` 필드(TCP=6, UDP=17, ICMP=1)를 보고 `ipp.data`를 알맞은 객체로 자동 변환해준다. 그래서 프로토콜 번호를 직접 `if p == 6` 식으로 비교하는 대신, 파싱된 객체의 타입으로 분기하는 게 깔끔하다. **단, 상수는 절대 임의로 넣지 않고 `dpkt.ip.IP_PROTO_TCP` 같은 라이브러리 상수를 쓰는 것이 안전하다.**

### TCP 플래그 디코딩

플래그는 비트마스크라서 하나씩 AND 연산으로 풀어야 한다. 여기서도 값을 추측하지 않고 dpkt 상수를 사용했다.

```python
TCP_FLAGS = [
    (dpkt.tcp.TH_FIN,  'FIN'), (dpkt.tcp.TH_SYN, 'SYN'),
    (dpkt.tcp.TH_RST,  'RST'), (dpkt.tcp.TH_PUSH,'PSH'),
    (dpkt.tcp.TH_ACK,  'ACK'), (dpkt.tcp.TH_URG, 'URG'),
    (dpkt.tcp.TH_ECE,  'ECE'), (dpkt.tcp.TH_CWR, 'CWR'),
]

def tcp_flag_str(flags):
    return '|'.join(name for bit, name in TCP_FLAGS if flags & bit) or '-'
```

### 헥스 덤프 직접 까보기

dpkt가 대신 해주는 파싱이 실제로 뭘 하는 건지 확인하려고, `sample.pcap`을 HxD로 열어 첫 패킷을 바이트 단위로 직접 읽어봤다.

```
AA BB CC 00 00 02   AA BB CC 00 00 01   08 00
[목적지 MAC]         [출발지 MAC]         [EtherType=0x0800 → IPv4]

45 00 00 28 00 00 00 00 40 06 84 43 C0 A8 00 0A 5D B8 D8 22
[Ver/IHL=4/20] ... [TTL=64] [Protocol=0x06→TCP] ... [출발지 IP=192.168.0.10] [목적지 IP=93.184.216.34]

BF 68 00 50 ... 50 02 ...
[Src Port] [Dst Port=80] ... [Flags=0x02→SYN]
```

몇 가지 확인 포인트:
- **엔디안 규칙이 계층마다 다르다.** pcap Global Header와 IP/TCP 헤더의 다바이트 필드는 리틀엔디안이라 뒤집어 읽어야 하지만(`D4 C3 B2 A1` → `0xa1b2c3d4`), MAC 주소와 EtherType은 뒤집지 않고 그대로 읽는다.
- **길이 필드끼리 서로 검증된다.** Packet Header의 `incl_len`(54)과, Ethernet(14)+IP(20)+TCP(20)을 더한 값이 정확히 일치했다 — 헤더 값이 서로 앞뒤가 맞는지 이렇게 교차 확인할 수 있다.
- **암호화 안 된 데이터는 페이로드가 그대로 노출된다.** ICMP 패킷 뒷부분에서 `70 69 6E 67 2D 70 61 79 6C 6F 61 64`를 아스키로 바꾸면 `ping-payload` — 코드에서 넣은 문자열이 그대로 파일에 박혀있었다. (반대로 TLS 같은 암호화 트래픽은 이 자리가 의미 없는 랜덤 바이트로 보인다.)

이 과정을 거치고 나니, `pcap_analyzer.py`의 `dpkt.ethernet.Ethernet(buf)`, `isinstance(l4, dpkt.tcp.TCP)` 같은 코드 한 줄 한 줄이 "표준 문서에 정의된 고정 위치를 기계적으로 잘라 읽는다"는 사실을 체감할 수 있었다.

---

## 3. 패킷별 상세 출력

샘플 pcap(웹 HTTP/HTTPS + DNS + ping을 섞은 15개 패킷)을 돌린 결과:

```
[1]  TCP  192.168.0.10:49000 -> 93.184.216.34:80 (HTTP)  flags=SYN ttl=64
[2]  TCP  192.168.0.10:49001 -> 93.184.216.34:80 (HTTP)  flags=ACK ttl=64
...
[7]  TCP  192.168.0.10:50000 -> 142.250.66.68:443 (HTTPS) flags=ACK ttl=64
...
[11] UDP  192.168.0.10:53000 -> 8.8.8.8:53 (DNS)  len=28 ttl=64
...
[14] ICMP 192.168.0.10 -> 1.1.1.1  type=8 code=0 ttl=64
```

포트 번호를 잘 알려진 서비스명(80→HTTP, 443→HTTPS, 53→DNS ...)으로 매핑해 사람이 읽기 쉽게 했고, ICMP는 `type=8 code=0`이 Echo Request(ping)임을 나타낸다.

---

## 4. 프로토콜별 통계

패킷을 순회하면서 `collections.Counter`로 집계했다.

```
============================================================
분석 요약 (Summary)
============================================================
총 패킷 수      : 15
총 바이트       : 834 bytes

[ L3 계층 분포 ]
  IPv4    : 15  (100.0%)

[ 프로토콜별 통계 ]
  TCP   : 10  (66.7%)
  UDP   : 3  (20.0%)
  ICMP  : 2  (13.3%)

[ TCP 플래그 분포 ]
  ACK            : 9
  SYN            : 1

[ 상위 통신 쌍 (Top Talkers) ]
  192.168.0.10 -> 93.184.216.34 : 6 pkts, 324 bytes
  192.168.0.10 -> 142.250.66.68 : 4 pkts, 216 bytes
  192.168.0.10 -> 8.8.8.8       : 3 pkts, 186 bytes
  192.168.0.10 -> 1.1.1.1       : 2 pkts, 108 bytes

[ 목적지 포트 Top 5 ]
  port 80 (HTTP): 6
  port 443 (HTTPS): 4
  port 53 (DNS): 3
```

집계한 지표:
- 총 패킷 수 / 총 바이트
- L3 분포 (IPv4 / IPv6 / 비-IP)
- 프로토콜별 개수 및 비율
- TCP 플래그 조합 분포
- Top Talkers (IP 쌍별 패킷/바이트) — 누가 누구와 가장 많이 통신했는지
- 목적지 포트 Top N — 어떤 서비스가 많이 쓰였는지

---

## 5. 트래픽 해석

통계만으로는 부족하니, 잘 알려진 포트 패턴을 기반으로 자동 해석 문장을 뽑았다.

```
[ 트래픽 해석 ]
- HTTP(80) 트래픽 6건: 웹 페이지 요청으로 보임.
- HTTPS(443) 트래픽 4건: 암호화된 웹 통신.
- DNS(53) 트래픽 3건: 도메인 이름 조회 발생.
- ICMP 2건: ping 등 도달성 확인 트래픽.
```

여기에 아주 단순한 휴리스틱도 넣었다. **SYN 패킷이 비정상적으로 많고 SYN|ACK 응답이 거의 없으면 포트 스캔을 의심**하는 규칙이다.

```python
syn_only = st.tcp_flags.get('SYN', 0)
if syn_only >= 10 and syn_only > st.tcp_flags.get('SYN|ACK', 0) * 3:
    print("- SYN 패킷이 비정상적으로 많음: 포트 스캔 가능성.")
```

실제 IDS/IPS가 하는 시그니처·행위 기반 탐지의 아주 초보적인 형태라고 볼 수 있다.

---

---

## 6. 심화 케이스 스터디: 실제 침해사고 pcap 분석

기초 파싱/통계 검증은 합성(더미) pcap으로 했지만, "어떤 통신이 발생했는지 해석"이라는 미션 요구사항을 제대로 채우려면 실제 트래픽이 필요했다. 그래서 SOC 인시던트 대응 훈련 자료로 공개되는 **malware-traffic-analysis.net**의 2026-02-28 연습 pcap(`Easy As 123`)을 받아 분석했다.

> 참고(reference): 해당 사이트의 시나리오 설명에 따르면, SOC 분석가가 SIEM에서 `45.131.214[.]85`발 TCP 443 트래픽에 대해 NetSupport Manager RAT 시그니처 탐지를 여러 건 확인했고, 그 활동은 2026-02-28 19:55 UTC에 시작됐다는 설정이다. (출처: malware-traffic-analysis.net, 2026-02-28 게시물)

### 6-1) 기본 통계

우리 분석기(`pcap_analyzer.py`)로 15,512개 패킷을 돌린 결과:

```
총 패킷 수      : 15512
총 바이트       : 6,333,775 bytes

[ L3 계층 분포 ]
  IPv4    : 14676  (94.6%)
  non-IP  : 836  (5.4%)      <- ARP

[ 프로토콜별 통계 ]
  TCP   : 12544  (80.9%)
  UDP   : 2113  (13.6%)
  ARP   : 836  (5.4%)
  ICMP  : 19  (0.1%)

[ TCP 플래그 분포 ]
  ACK            : 6467
  PSH|ACK        : 4641
  FIN|ACK        : 408
  SYN|ACK        : 351
  SYN            : 349
  RST|ACK        : 233
  RST            : 95

[ 목적지 포트 Top 5 ]
  port 443 (HTTPS): 3598
  port 445 (SMB): 825
  port 51911: 823
  port 62035: 739
  port 389: 623
```

합성 pcap과 다르게 SMB(445), LDAP(389) 같은 사내망 전형 트래픽과, ARP까지 섞인 걸 볼 수 있다 — 실제 회사/가정 네트워크를 그대로 캡처했기 때문이다.

### 6-2) IOC(침해지표) 대조 검증

사이트가 제공한 정보(C2 IP `45.131.214.85`)를 우리 분석기가 만든 이벤트 로그에서 직접 필터링해봤다.

```python
# 특정 IP와의 통신만 추출
for ts, src, dst, dport, flags in st.tcp_events:
    if '45.131.214.85' in (src, dst):
        ...
```

결과:

```
총 45.131.214.85 관련 패킷: 550개
첫 통신 시각(UTC): 2026-02-28 19:55:51
마지막 통신 시각(UTC): 2026-03-01 00:16:28
지속 시간: 260.6분
```

**우리가 pcap 타임스탬프만으로 계산한 "19:55:51"이, 사이트 시나리오 설명의 "19:55 UTC 활동 시작"과 정확히 일치했다.** 통신 상대는 오직 `10.2.28.88` 한 대뿐이었다 — 이게 감염된 내부 호스트다.

### 6-3) 통신 패턴 해석: 비콘(Beacon) 탐지

C2 통신은 초반 핸드셰이크 이후, 아래처럼 **거의 정확히 60초 간격**으로 반복되는 패킷이 계속 나타났다.

```
패킷 간 시간 간격 분포 (초 : 개수)
  59.9s : 137
  60.0s : 81
  60.1s : 31
```

사람이 웹서핑할 때 생기는 HTTPS 트래픽은 이렇게 기계적으로 정확한 주기를 만들지 않는다. 반면 RAT/봇넷 계열 악성코드는 C2 서버에 "나 살아있어요"를 알리는 **keep-alive 비콘**을 고정 주기로 보내는 경우가 많다 — 이 패턴이 그 전형적인 예시다.

### 6-4) 사실과 추측의 구분

| 구분 | 내용 | 근거 |
|---|---|---|
| **사실** | `10.2.28.88` ↔ `45.131.214.85:443` 통신, 60초 주기, 260분 지속 | pcap 타임스탬프에서 직접 계산 (재현 가능) |
| **추측** | 이 트래픽이 "NetSupport Manager RAT"라는 특정 악성코드 | pcap 자체(암호화된 TLS라 페이로드 미확인)로는 증명 불가. 사이트가 제공한 시그니처 탐지 설명에 의존 |

TLS로 암호화된 트래픽은 페이로드 내용을 볼 수 없다. 우리가 **볼 수 있는 것은 헤더와 타이밍뿐**이고, 그것만으로도 "감염 호스트 특정 → C2 특정 → 통신 패턴 해석"이라는 미션의 "트래픽 해석" 요구사항을 실제 사례로 채울 수 있었다.

---

## 7. 전체 결론

이번 미션으로:
1. pcap 파일 구조(24바이트 global header + 16바이트 packet header 반복)를 struct로 직접 까서 이해했고
2. dpkt로 Ethernet→IP→TCP/UDP/ICMP 계층을 순서대로 파싱하는 프로그램을 작성했고
3. 합성 트래픽으로 포트스캔/SYN Flood/브루트포스/스텔스 스캔 탐지 로직을 검증했고
4. 실제 침해사고 pcap으로 감염 호스트 특정, C2 서버 특정, 비콘 주기 발견까지 해봤다.

가장 크게 배운 건, **"통계"와 "해석"은 다른 층위**라는 점이다. 프로토콜 카운트는 기계적으로 나오지만, "이게 비콘인가?"를 판단하려면 도메인 지식(정상 트래픽은 이렇게 규칙적이지 않다는 것)이 있어야 한다. IDS/IPS가 하는 일이 정확히 이 두 층위를 자동화하는 것임을 몸으로 이해하게 됐다.

---
