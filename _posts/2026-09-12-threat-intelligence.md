---
layout: post
title: Threat Intelligence
page_description: Threat Intelligence - 공개된 자료를 통해 잠재적인 위협을 찾아내기
category_key: blog-docs
summary: Threat Intelligence - 공개된 자료를 통해 잠재적인 위협을 찾아내기
lead: Threat Intelligence - 공개된 자료를 통해 잠재적인 위협을 찾아내기
featured: false
feature_order: 0
---

# Threat Intelligence : BabyShark와 Konni

## 1. 출발 자료에서 P·Q 식별하기

| 자료 | 관찰된 명칭 | 이 보고서에서의 P·Q | 판단 근거 |
| --- | --- | --- | --- |
| A: Huntress, [Targeted APT Activity: BABYSHARK Is Out for Blood](https://www.huntress.com/blog/targeted-apt-activity-babyshark-is-out-for-blood) | BabyShark | **P: 정확한 명칭이 공개되지 않은 BabyShark 사용 DPRK 행위자** | Huntress는 BabyShark를 DPRK 국가 후원 행위자가 쓰는 악성코드라고 설명하지만 Kimsuky나 TA427을 명시하지 않고 있다. MITRE는 BabyShark를 Kimsuky가 쓰는 소프트웨어로, Proofpoint는 TA427의 BabyShark 사용을 별도로 기술한다. 이는 P의 가능한 맥락이지만 A 사례의 확정적인 귀속은 아니다. |
| B: ASEC, [개인정보 유출 관련 내용으로 위장한 피싱 메일 유포 (Konni)](https://asec.ahnlab.com/ko/59625/) | Konni | **Q: Konni Group** | ASEC는 해당 사례를 Konni 공격 그룹의 유포로 분류했다. Cisco Talos는 Konni를 처음에는 RAT 명칭으로 붙였고, 뒤이어 이 도구를 쓰는 활동 묶음의 행위자 별칭으로 Konni Group이 정착한 경위를 설명한다. Proofpoint는 TA406과 Konni가 겹친다고 보지만, MITRE는 APT37과의 잠재적 연결 또한 보고있다. |

## 2. 이름을 처음 붙여 공개한 자료

### P와 관련해 참고한 행위자명: Kimsuky (P의 확정 귀속 아님)

Proofpoint는 Kimsuky가 2013년 Kaspersky에 의해 처음 공개 명명됐다고 명시한다. Kaspersky Lab의 2013년 9월 12일 발표 [“Kaspersky Lab Analyses Active Cyber-Espionage Campaign Primarily Targeting South Korean Entities”](https://www.prnewswire.com/news-releases/kaspersky-lab-analyses-active-cyber-espionage-campaign-primarily-targeting-south-korean-entities-223484781.html)는 이 표적형 사이버첩보 캠페인을 “Kimsuky”라고 명명했고, 활동 징후를 2013년 4월 3일, 최초 트로이 목마 표본을 5월 5일로 제시했다. 대상은 한국의 싱크탱크·통일부·국방 관련 기관과 중국의 일부 기관이었고, 스피어피싱, 키로깅, 디렉터리 수집, 원격 제어, HWP 문서 탈취를 설명했다. 이름은 당시 탈취 자료 수신에 쓰인 `kimsukyang` 계정에서 유래했다는 후속 [AhnLab 보고서](https://www.ahnlab.com/cn/contents/content-center/pdf/34922)의 설명과도 일치한다. 단, 이 명명 계보가 Huntress의 특정 침해를 Kimsuky라고 직접 확정하지는 않는다.

### P를 연결하는 악성코드명: BabyShark

이번 조사에서 확인한 이른 공개 BabyShark 분석은 Palo Alto Networks Unit 42의 2019년 2월 22일 [“New BabyShark Malware Targets U.S. National Security Think Tanks”](https://unit42.paloaltonetworks.com/new-babyshark-malware-targets-u-s-national-security-think-tanks/)다. 이 자료는 2018년 11월 스피어피싱 첨부 문서에서 관찰된 BabyShark VBScript 계열을 분석했다. 최초 표본은 2018년 11월로 보고했고, 매크로가 원격 HTA를 불러오며, 시스템 정보를 수집·C2에 전송하고 지속성을 만든다고 설명했다. 보고서는 당시 KimJongRAT 및 STOLEN PENCIL과의 연결을 “결정적이지 않다”고 제한했다. 따라서 이 공개 분석만으로 BabyShark의 운영자를 Kimsuky라고 확정할 수는 없으며, 뒤의 교차 귀속 자료도 해석에 한계가 있다.

### Q: Konni

Cisco Talos는 2017년 5월 3일 [“KONNI: A Malware Under The Radar For Years”](https://blog.talosintelligence.com/konni-malware-under-radar-for-years/)에서 약 3년간 탐지를 피한 원격관리 도구(RAT)를 발견하고 “KONNI”라고 명명했다고 밝혔다. 이 자료는 2014·2016·2017년 네 캠페인을 되짚었고, 이메일 첨부와 사회공학으로 `.scr` 실행을 유도한 뒤 미끼 문서를 보여주고 악성코드를 실행하는 감염 체인을 설명했다. 초기형은 키로깅·클립보드·브라우저 프로필/쿠키 절취 위주였으며, 이후 파일 전송·명령 실행·스크린샷까지 확장됐다.

중요하게도 [Palo Alto Unit 42의 2019년 설명](https://unit42.paloaltonetworks.com/the-fractured-statue-campaign-u-s-government-targeted-in-spear-phishing-attacks/)은 “Konni”가 원래 RAT를 가리켰지만, Konni RAT 없이도 TTP가 겹치는 후속 활동이 발견되면서 연구자들이 행위자를 Konni Group이라 부르게 됐다고 명시한다. Q는 그래서 악성코드에서 파생된 행위자 별칭이다.

## 3. P와 Q를 잇는 근거와 반증

| 범주 | 연결 근거 | 증거 강도(주관적 의견)와 해석 |
| --- | --- | --- |
| 분석가의 클러스터링 | Proofpoint는 Kimsuky를 TA406·TA408·TA427의 세 행위자로 나누어 추적하며, TA406을 Kimsuky·Thallium·Konni Group으로 공개 추적되는 활동의 한 부분으로 평가했다. 반면 MITRE ATT&CK은 KONNI와 APT37의 잠재적 연결 증거도 명시한다. | **중간.** Proofpoint의 명시적 분류는 강한 벤더 내 근거지만, 보편적 단일 명명 체계는 아니다. 이 상반된 분류 때문에 P·Q의 동일 상위 클러스터 관계를 확정할 수 없다. |
| 악성코드/개발 자원 | Proofpoint는 TA406이 Konni·SANNY·CARROTBAT/CARROTBALL·BabyShark·Amadey 등을 사용했다고 적었다. TA406은 2019년 초부터 BabyShark에 접근했지만 최초 사용자는 아니며, 2019년에 TA406 추정 운영자가 BabyShark 다운로더를 VirusTotal에 올린 사례를 제시했다. 같은 자료에서 TA427은 2021년 10월까지 BabyShark를 사용했다. | **강함(Proofpoint가 추적한 TA406–TA427 관계), 낮음~중간(A의 P와 Q의 직접 관계).** A 사례의 P가 TA427이라는 전제가 확인되지 않았으므로, 이를 A–B 관계의 직접 근거로는 사용할 수 없다. |
| 공격 방식과 표적 | A의 BabyShark 사례는 VOA 기자를 사칭해 신뢰를 쌓은 뒤 암호 걸린 Word 문서로 침투했고, VBS·예약 작업·레지스트리 지속성·정상 OneDrive/Google Drive를 활용했다. B의 Konni 사례는 개인정보 유출 자료로 위장한 EXE를 이메일로 유포했으며, 데이터 섹션에서 JSE·PowerShell·정상 문서를 꺼내고 예약 작업과 C2 통신을 사용했다. | **약함~중간.** 표적형 스피어피싱, 스크립트 다단계 실행, 예약 작업, C2는 실질적 유사점이나 DPRK 계열 APT 전반에서 흔한 기법이어서 단독 귀속 근거로는 약하다. |
| 활동 시기 | Konni RAT 활동은 적어도 2014년부터, BabyShark는 2018년 11월부터 관찰됐다. TA406의 BabyShark 접근은 2019년 초, Huntress의 침해 흔적은 2021년 3월부터, B의 Konni 유포 공개는 2023년 12월이다. | **보조 근거.** 시간적으로 겹치고 이어지지만, 동시성 자체는 같은 집단의 증명은 아니다. |
| 인프라 | 두 출발 보고서의 개별 C2는 다르다. A는 `hodbeast[.]com`, `worldinfocontact[.]club` 등을, B는 당시 C2가 닫혀 최종 명령을 확인하지 못했다고 보고했다. | **직접 연결 없음.** 이 조사 범위에서 A와 B 캠페인 사이에 동일 도메인·IP·인증서라는 공개된 직접 인프라 재사용은 확인하지 못했다. 이것은 “같은 팀” 단정에 제동을 거는 중요한 음성 결과다. |

위 표의 Proofpoint 근거는 [“Triple Threat: North Korea-Aligned TA406 Scams, Spies, and Steals”](https://www.proofpoint.com/au/blog/threat-insight/triple-threat-north-korea-aligned-ta406-scams-spies-and-steals)와 [공식 원문 PDF](https://www.proofpoint.com/us/resources/threat-reports/triple-threat-north-korea-aligned-ta406-scams-spies-and-steals)를 확인했다. A의 기술 흐름은 [Huntress 원문](https://www.huntress.com/blog/targeted-apt-activity-babyshark-is-out-for-blood), B의 흐름은 [ASEC 원문](https://asec.ahnlab.com/ko/59625/) 및 [ASEC 목록 페이지](https://asec.ahnlab.com/ko/category/phishing-scam-ko/page/13/)에서 확인했다.

## 4. 비교와 최종 판단

**수정된 판단:** P와 Q가 같은 조직 또는 같은 상위 Kimsuky 클러스터라고 확정할 근거는 부족하다. 다만 Proofpoint의 분류를 채택할 경우에는 TA406(Konni로도 추적되는 활동)과 TA427(BabyShark 사용 활동)이 Kimsuky 우산 아래의 별도 행위자가 되므로, **상위 생태계 공유 및 도구/개발 자원 공유 가능성**이 하나의 타당한 가설이 된다. 이 가설의 근거는 Proofpoint가 TA406의 BabyShark 접근과 TA427의 지속 사용을 함께 문서화한 점이다.

반대 가설도 남는다. MITRE ATT&CK은 KONNI와 APT37의 잠재적 연결 증거를 적시한다. 또한 최초 BabyShark 명명 보고서는 당시 연결을 KimJongRAT/STOLEN PENCIL 수준의 추정으로 제한했고, Proofpoint도 TA406이 BabyShark의 원래 사용자는 아니었다고 했다. 게다가 출발 보고서 A와 B 사이에는 동일 C2 같은 직접 인프라 고리가 공개되지 않았다. 따라서 가장 적절한 신뢰도 표기는 **두 출발 사례의 동일 세부 운영팀: 낮음 / Proofpoint 분류를 전제로 한 상위 생태계 관계: 중간 / P의 정확한 행위자 귀속: 미확정**이다.

## 결론 요약

자료 A만으로 P의 정확한 행위자명은 확인되지 않는다. Huntress는 BabyShark를 쓰는 DPRK 국가 후원 행위자라고만 기술한다. 자료 B의 Q는 ASEC가 명시한 Konni 공격 그룹이다. BabyShark는 *악성코드 가족*이고 Konni는 처음에는 *RAT 이름*이었다가 나중에 행위자 별칭으로 확장됐다는 점이 핵심이다.

Proofpoint의 분류에서는 TA406(Konni로도 공개 추적되는 활동)과 TA427(BabyShark 사용 활동)이 넓은 Kimsuky 우산 아래의 별도 행위자다. 그러나 이는 **Proofpoint의 분류 체계**이며, MITRE ATT&CK은 KONNI에 APT37과의 잠재적 연결 증거도 있다고 본다. 그러므로 A의 P와 B의 Q가 같은 상위 클러스터라는 결론은 가능한 가설일 뿐, 두 출발 보고서만으로 확정할 수 없다. 현재 가장 보수적인 평가는 **둘 다 DPRK 연계 활동이라는 점은 강하게 뒷받침되지만, 정확한 P의 세부 귀속 및 P–Q의 조직 관계는 미확정**이라는 것이다.

## 5. 조사에서 새로 알게 된 점과 미해결 질문

### 새로 알게 된 점

- APT 이름은 고유한 ‘조직명’처럼 보이지만, 실제로는 악성코드명·캠페인명·벤더의 활동 클러스터명이 서로 옮겨 붙는다. Konni는 그 전형적인 사례다.
- 귀속은 한 가지 IoC보다 명명 계보, 도구 접근, 공격 흐름, 표적, 인프라, 시간대를 함께 대조해 신뢰도를 매긴다. 이 조사에서 가장 판별력이 컸던 자료는 Proofpoint의 세부 클러스터링과 도구 접근 기록이었다.
- ‘근거가 없음’도 결과다. A와 B의 정확한 사례 사이에서 공통 C2를 찾지 못한 사실은 과도한 동일행위자 단정을 막는다.

### 아직 답을 찾지 못한 점

- 2021년 Huntress 침해의 세부 운영자가 Proofpoint 체계에서 정확히 TA427인지, 또는 BabyShark 도구에 접근한 다른 하위 행위자인지는 공개 자료만으로 확정하지 못했다.
- 2023년 ASEC Konni 표본의 C2가 닫혀 있어, A의 도메인·IP·TLS 인증서와의 직접 재사용을 검증할 수 없었다.
- 공유 코드가 공동 개발, 도구 양도, 또는 더 넓은 DPRK 생태계의 재사용 중 무엇을 뜻하는지는 공개 보고서만으로 구별하기 어려웠다. 이를 좁히려면 수동 DNS, 등록자/호스팅 이력, 인증서 투명성, 표본 코드 유사도, 업로드 시각을 추가로 상관분석해야 한다.

## 참고문헌

1. Huntress. [Targeted APT Activity: BABYSHARK Is Out for Blood](https://www.huntress.com/blog/targeted-apt-activity-babyshark-is-out-for-blood). A의 침해 흐름, C2, 2021년 타임라인, 사회공학 기법.
2. AhnLab ASEC. [개인정보 유출 관련 내용으로 위장한 피싱 메일 유포 (Konni)](https://asec.ahnlab.com/ko/59625/). B의 Konni 사례. 페이지 본문이 검색 엔진에 노출한 요약은 [ASEC 피싱/스캠 목록](https://asec.ahnlab.com/ko/category/phishing-scam-ko/page/13/)에서도 교차 확인했다.
3. Kaspersky Lab. [Kaspersky Lab Analyses Active Cyber-Espionage Campaign Primarily Targeting South Korean Entities](https://www.prnewswire.com/news-releases/kaspersky-lab-analyses-active-cyber-espionage-campaign-primarily-targeting-south-korean-entities-223484781.html), 2013-09-12. Kimsuky 명명과 2013년 활동 설명.
4. Palo Alto Networks Unit 42. [New BabyShark Malware Targets U.S. National Security Think Tanks](https://unit42.paloaltonetworks.com/new-babyshark-malware-targets-u-s-national-security-think-tanks/), 2019-02-22. 이번 조사에서 확인한 이른 공개 BabyShark 분석과 기술 분석.
5. Cisco Talos. [KONNI: A Malware Under The Radar For Years](https://blog.talosintelligence.com/konni-malware-under-radar-for-years/), 2017-05-03. Talos의 KONNI 명명과 2014~2017 캠페인 분석.
6. Palo Alto Networks Unit 42. [The Fractured Statue Campaign](https://unit42.paloaltonetworks.com/the-fractured-statue-campaign-u-s-government-targeted-in-spear-phishing-attacks/), 2019. Konni가 RAT 명칭에서 행위자 별칭으로 확장된 경위.
7. Proofpoint. [Triple Threat: North Korea-Aligned TA406 Scams, Spies, and Steals](https://www.proofpoint.com/au/blog/threat-insight/triple-threat-north-korea-aligned-ta406-scams-spies-and-steals), 2021-11-18 및 [동 보고서 공식 PDF](https://www.proofpoint.com/us/resources/threat-reports/triple-threat-north-korea-aligned-ta406-scams-spies-and-steals). TA406·TA427·Kimsuky·Konni 관계와 BabyShark 접근 근거.
8. MITRE ATT&amp;CK. [BabyShark (S0414)](https://attack.mitre.org/software/S0414/) 및 [KONNI (S0356)](https://attack.mitre.org/software/S0356/). 원문 보고서의 교차 참조와 악성코드/행위자 구분 확인.
