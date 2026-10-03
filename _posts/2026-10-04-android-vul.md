---
layout: post
title: 안드로이드 취약점 분석
page_description: 안드로이드 취약점에 대해 분석해보고 challenge에 도전한다.
category_key: ctf-wargame
summary: 안드로이드 취약점에 대해 분석해보고 challenge에 도전한다.
lead: 안드로이드 취약점에 대해 분석해보고 challenge에 도전한다.
featured: false
feature_order: 0
---

# Allsafe Android 취약점 분석: README 12개 챌린지와 최신 소스의 7개 추가 과제

> 작성일: 2026-10-01 / 동적 검증 갱신: 2026-10-03 (KST)  
> 범주: CTF / Wargame / Android Security  
> 대상: `t0thkr1s/allsafe-android` commit `c7329155cbbd0a2079a48bbfcaa23a6666899ee9`  
> 분석 범위: 공개 교육용 소스, 로컬 빌드 APK, 정적 분석, 로컬 재패키징, Android 37.1 에뮬레이터 동적 재현  
> 제외 범위: 운영 시스템·제3자 앱 공격, 공개 Firebase 백엔드 직접 조회, Frida·Burp가 필요한 우회 실습

Allsafe는 의도적으로 취약하게 만든 Android 학습 앱이다. 공식 README에는 12개 챌린지가 소개되어 있지만, 현재 `master`의 내비게이션에는 19개가 있다. 이 글은 요청대로 README의 1번부터 12번까지 먼저 풀고, README에 아직 반영되지 않은 7개 과제를 이어서 분석한다. 마지막에는 메뉴 밖에서 발견한 `ProxyActivity` 인텐트 리다이렉션도 별도 이슈로 다룬다.

원본 레포와 교육 목적은 [공식 README](https://github.com/t0thkr1s/allsafe-android)에서 확인할 수 있다. Android 공식 문서도 동적 로딩 코드가 앱과 같은 권한으로 실행되므로 외부 저장소 같은 신뢰할 수 없는 위치에서 코드를 로드하지 말라고 권고한다. 이 분석은 해당 교육용 앱과 로컬 산출물에만 한정했다. [Android Security Tips](https://developer.android.com/privacy-and-security/security-tips)

## 1. 분석 환경과 검증 수준

| 항목 | 결과 |
|---|---|
| OS / 분석일 | Windows, 2026-10-01~03 KST |
| 대상 commit | `c7329155cbbd0a2079a48bbfcaa23a6666899ee9` |
| 앱 ID / 버전 | `infosecadventures.allsafe` / `1.6` (`versionCode=6`) |
| SDK | min 23, target/compile 35 |
| 빌드 | Gradle 8.11.1 + AGP 8.9.0 + Temurin JDK 18 |
| 원본 APK | 10,897,952 bytes, SHA-256 `7C08B9549FFE02C0AEBE03A2B83780D3F87211185CC4045C8F7FABF67421BC4B` |
| 패치 APK | 10,132,204 bytes, SHA-256 `0D35555763DCB10A470FE6DED3CE30F36C141EE31EFC8D50C5E50A9338AE7825` |
| APK 서명 | 원본 v1/v2, 패치 v1/v2/v3 검증 성공; 둘 다 Android Debug 인증서 |
| ABI | arm64-v8a, armeabi-v7a, x86, x86_64 |
| 동적 실행 | Pixel 10 AVD, Android 37.1 x86_64, ADB 재현 성공 |

첫 빌드는 Android Studio에 포함된 Java 25와 Gradle 8.11.1의 비호환으로 실패했다. Gradle 호환표상 Java 25로 Gradle을 실행하려면 Gradle 9.1 이상이 필요하고, 이 레포의 AGP 8.9는 Gradle 8.11.1/JDK 17 조합을 기준으로 한다. 레포의 `jvmToolchain(18)`을 존중해 공식 Temurin 18 아카이브를 사용했고, 다운로드 SHA-256도 Adoptium 메타데이터와 대조했다. [Gradle Java 호환표](https://docs.gradle.org/current/userguide/compatibility.html), [AGP 8.9 호환성](https://developer.android.com/build/releases/agp-8-9-0-release-notes)

이 글의 상태 표기는 다음과 같다.

- **빌드 검증**: 소스가 실제 APK로 컴파일됨.
- **정적 검증**: 소스와 APK/Smali/네이티브 바이너리에서 확인됨.
- **재패키징 검증**: 수정 APK 재빌드·정렬·서명·재디코드까지 확인됨.
- **동적 검증**: Android 에뮬레이터에서 입력·Intent·결과 UI를 직접 확인하고 화면과 UI 계층을 보존함.
- **동적 미검증**: 명령과 예상 결과는 코드에서 도출했지만 기기에서 실행하지 않음.
- **추정**: 서버 설정이나 Android 버전에 따라 달라질 수 있으며 근거를 함께 제시함.

### 1.1 동적 재현과 스크린샷 조건

원본 앱은 `MainActivity`에서 `FLAG_SECURE`를 설정하므로 ADB 화면 캡처에서 앱 영역이 검게 나온다. 이는 [MainActivity.kt 21~22행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/MainActivity.kt#L21-L22)과 실제 원본 실행에서 모두 확인했다. 따라서 아래 화면은 이미 검증한 Smali 패치 APK에서 `setFlags(FLAG_SECURE, FLAG_SECURE)`의 인수만 `0`으로 바꾼 **캡처 전용 랩 빌드**로 촬영했다. 챌린지 로직은 바꾸지 않았으며, Smali 과제의 `INACTIVE → ACTIVE` 패치는 별도로 유지했다.

캡처 빌드는 Apktool 3.0.3으로 재빌드하고 Android Debug 키로 서명했으며, `apksigner verify --verbose`에서 v1/v2/v3 검증을 통과했다. SHA-256은 `809D8A7B6A35B43B1D4C5C4978CC8932B82F4900D2D557C6F0D4FDE5E9AD5513`이다. `FLAG_SECURE`가 스크린샷을 차단하는 동작과 한계는 [Android 공식 가이드](https://developer.android.com/security/fraud-prevention/activities#flag-secure)에 설명되어 있다.

![Allsafe 메인 화면]({{ '/assets/images/android-vul/01-main.png' | relative_url }})

![여러 취약점 모듈이 보이는 내비게이션 메뉴]({{ '/assets/images/android-vul/02-menu.png' | relative_url }})

## 2. 한눈에 보는 결과

| 순서 | 과제 | 핵심 원인 | 평가 | 검증 |
|---:|---|---|---|---|
| 1 | Insecure Logging | 사용자의 비밀을 `Log.d`로 출력 | 중간 | 정적 |
| 2 | Hardcoded Credentials | SOAP·URL 자격증명을 APK에 포함 | 높음 | 정적 |
| 3 | Root Detection | 단일 클라이언트 측 RootBeer 결과 신뢰 | 학습용 | 정적, Frida 미실행 |
| 4 | Arbitrary Code Execution | 타 앱 코드와 외부 APK를 검증 없이 로드 | 치명적 | 정적 |
| 5 | Secure Flag Bypass | 클라이언트 런타임에서 플래그 설정 | 학습용 | 정적, Frida 미실행 |
| 6 | Certificate Pinning | OkHttp 메서드 후킹 가능, 런타임 체인으로 핀 생성 | 방어 우회 학습 | 정적 |
| 7 | Insecure Broadcast Receiver | 무권한 exported receiver + 공격자 제어 host | 높음 | 정적 |
| 8 | Deep Link Exploitation | APK에 포함된 키만 비교, 과도하게 넓은 HTTPS 필터 | 중간 | 정적·동적 |
| 9 | SQL Injection | 문자열 연결로 `rawQuery` 생성 | 높음 | 정적·동적 |
| 10 | Vulnerable WebView | 임의 HTML/URL + JavaScript + 파일 접근 | 높음 | 정적 |
| 11 | Smali Patching | 성공 여부를 로컬 enum 하나로 결정 | 정보성 | 재패키징·동적 |
| 12 | Native Library | 네이티브 바이너리에 평문 비밀번호 포함 | 높음 | 소스·ELF 정적 |
| A | Firebase Database | 인증 없이 `secret` 읽기 시도 | 조건부 높음 | 서버 규칙 미검증 |
| B | Insecure SharedPreferences | 아이디/비밀번호 평문 XML 저장 | 중간 | 정적 |
| C | PIN Bypass | Base64를 보안 통제로 사용 | 높음 | 정적·동적 |
| D | Weak Cryptography | 고정 키, ECB, MD5, `Random` | 높음 | 정적 |
| E | Insecure Service | 무권한 exported 녹음 서비스 | 높음 | 정적, 버전 의존 |
| F | Object Serialization | 변조 가능한 직렬화 데이터의 role 신뢰 | 중간 | 정적 |
| G | Insecure Providers | 무권한 exported CRUD provider | 높음 | 정적 |
| X | ProxyActivity | 공격자 제공 중첩 Intent를 즉시 실행 | 높음 | 정적 |

## 3. README 챌린지 1~12

### 3.1 Insecure Logging

`InsecureLogging`은 사용자가 입력한 값을 그대로 `Log.d("ALLSAFE", "User entered secret: ...")`에 넣는다. 근거는 [InsecureLogging.java 31~34행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/InsecureLogging.java#L31-L34)이다.

```bash
adb shell pidof infosecadventures.allsafe
adb shell logcat --pid <PID> | grep "User entered secret"
```

예상 결과는 입력한 비밀이 로그에 평문으로 노출되는 것이다. 최신 Android에서는 일반 앱의 전체 logcat 접근이 제한되지만, ADB·루팅·권한 있는 시스템 앱·수집된 진단 로그 같은 경로는 여전히 남는다. 따라서 “최신 Android니까 안전하다”가 아니라 “비밀을 애초에 로그에 기록하지 않는다”가 올바른 결론이다. [Android Log Info Disclosure](https://developer.android.com/privacy-and-security/risks/log-info-disclosure)

개선책은 민감값 로깅 제거, 릴리스 빌드에서 디버그 로그 제거, 구조화 로그의 필드 단위 마스킹이다.

### 3.2 Hardcoded Credentials

한 곳이 아니라 두 곳에서 자격증명이 발견된다.

1. SOAP 본문: `superadmin / supersecurepassword` — [HardcodedCredentials.kt 43~52행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/HardcodedCredentials.kt#L43-L52)
2. 개발 URL userinfo: `admin / password123` — [strings.xml 3행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/res/values/strings.xml#L3)

APK의 문자열·리소스는 사용자 기기에 배포되므로 비밀 저장소가 아니다. 난독화나 Base64는 추출 비용만 조금 늘릴 뿐 자격증명을 보호하지 못한다. 인증 비밀은 서버에 두고, 앱에는 만료가 짧고 최소 권한인 사용자별 토큰만 전달해야 한다. 암호 키가 필요하면 Android Keystore를 사용한다. [OWASP MASTG Cryptographic Key Storage](https://mas.owasp.org/MASTG/knowledge/android/MASVS-STORAGE/MASTG-KNOW-0047/)

### 3.3 Root Detection

앱은 [RootDetection.kt 18~23행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/RootDetection.kt#L18-L23)에서 `RootBeer(context).isRooted` 한 번의 반환값을 신뢰한다.

```javascript
Java.perform(function () {
  const RootBeer = Java.use('com.scottyab.rootbeer.RootBeer');
  RootBeer.isRooted.implementation = function () {
    console.log('[+] isRooted() -> false');
    return false;
  };
});
```

```bash
frida -U -f infosecadventures.allsafe -l root-bypass.js
```

이 스크립트는 기기 미연결로 실행하지 않았다. 그러나 판단이 전적으로 앱 프로세스의 Boolean 반환값에 있으므로 런타임 계측이 가능한 공격자에게 우회 가능하다는 결론은 코드에서 직접 나온다. 개선 시에도 루트 탐지는 위험 신호 중 하나로만 사용하고, 서버 측 무결성 신호·재인증·거래별 정책과 결합해야 한다.

### 3.4 Arbitrary Code Execution

가장 심각한 과제다. Application 클래스는 설치된 패키지 이름이 `infosecadventures.allsafe`로 시작하기만 하면 `CONTEXT_INCLUDE_CODE | CONTEXT_IGNORE_SECURITY`로 그 패키지의 코드를 불러와 고정 클래스의 정적 메서드를 호출한다. [ArbitraryCodeExecution.kt 19~33행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/ArbitraryCodeExecution.kt#L19-L33)

교육용 무해 PoC의 핵심 클래스는 다음과 같다.

```java
package infosecadventures.allsafe.plugin;

import android.util.Log;

public final class Loader {
    public static void loadPlugin() {
        Log.w("ALLSAFE-POC", "Plugin code executed inside Allsafe process");
    }
}
```

PoC 앱의 applicationId를 `infosecadventures.allsafe.poc`처럼 접두사에 맞춰 설치하면 Allsafe가 이 클래스를 찾으려 한다. 이 코드는 로그만 남기며 파괴적 동작을 하지 않는다.

두 번째 경로는 `/sdcard/Download/allsafe_updater.apk`를 `DexClassLoader`로 열어 `VersionCheck.getLatestVersion()`을 호출한다. [ArbitraryCodeExecution.kt 37~49행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/ArbitraryCodeExecution.kt#L37-L49) Android 문서는 외부 저장소가 코드 주입을 막는 접근통제를 제공하지 않으므로 그곳에서 코드를 로드하지 말라고 명시한다. [DexClassLoader](https://developer.android.com/reference/dalvik/system/DexClassLoader), [Android Security Tips](https://developer.android.com/privacy-and-security/security-tips)

개선책은 동적 로딩 제거가 최선이다. 불가피하면 앱 내부 저장소만 사용하고, 허용한 서명자의 인증서와 아티팩트 해시를 실행 전에 검증하며, 패키지 이름 접두사가 아니라 서명 신뢰를 확인해야 한다.

### 3.5 Secure Flag Bypass

`MainActivity`는 모든 화면에 `FLAG_SECURE`를 설정한다. [MainActivity.kt 18~22행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/MainActivity.kt#L18-L22)

```javascript
Java.perform(function () {
  const Activity = Java.use('android.app.Activity');
  Activity.onResume.implementation = function () {
    this.onResume();
    this.getWindow().clearFlags(0x00002000); // FLAG_SECURE
  };
});
```

README가 설명하듯 이것은 취약점 판정보다 Frida 연습에 가깝다. `FLAG_SECURE`는 일반적인 스크린샷과 비보안 디스플레이 노출을 줄이는 유효한 방어지만, 이미 앱 프로세스를 계측할 수 있는 공격자에 대한 완전한 경계는 아니다. [Android FLAG_SECURE 가이드](https://developer.android.com/security/fraud-prevention/activities)

### 3.6 Certificate Pinning Bypass

`CertificatePinning`은 OkHttp `CertificatePinner`를 사용하지만 핀을 빌드 타임에 고정하지 않는다. 먼저 고의로 잘못된 핀으로 접속하고 예외 메시지에서 현재 peer chain의 SHA-256 핀을 추출한 뒤, 다음 요청의 핀으로 다시 사용한다. [CertificatePinning.java 40~58행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/CertificatePinning.java#L40-L58), [87~113행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/CertificatePinning.java#L87-L113)

```javascript
Java.perform(function () {
  const Pinner = Java.use('okhttp3.CertificatePinner');
  Pinner['check$okhttp'].implementation = function (host, peerCertsFn) {
    console.log('[+] bypass pinning for ' + host);
    return;
  };
});
```

메서드 이름·오버로드는 OkHttp 버전과 난독화에 따라 달라질 수 있으므로 실제 APK에서 `frida-trace` 또는 `Java.enumerateMethods`로 확인해야 한다. 위 스크립트는 코드에 선언된 OkHttp 4.9.0을 기준으로 한 재현 예시이며 동적 미검증이다.

런타임에서 관측한 체인을 곧바로 신뢰하는 구현은 정적인 핀과 다르고, 시작 시점의 연결 상태에 신뢰가 좌우된다. Android 공식 문서는 운영 장애 위험 때문에 인증서 피닝 자체를 일반적으로 권장하지 않으며, 꼭 쓸 경우 백업 핀과 만료 전략을 요구한다. [Network Security Configuration](https://developer.android.com/privacy-and-security/security-config), [TLS 보안 가이드](https://developer.android.com/privacy-and-security/security-ssl)

### 3.7 Insecure Broadcast Receiver

Manifest의 `NoteReceiver`는 `android:exported="true"`이고 보호 permission이 없다. [AndroidManifest.xml 43~48행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/AndroidManifest.xml#L43-L48) 수신자는 외부 Intent의 `server`, `note`, `notification_message`를 신뢰하고, 공격자가 지정한 host로 평문 HTTP 요청을 보낸다. 쿼리에는 Base64로 표현된 고정 토큰 `allsafe_dev_admin_token`도 포함된다. [NoteReceiver.java 32~54행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/NoteReceiver.java#L32-L54)

```bash
adb shell am broadcast \
  -a infosecadventures.allsafe.action.PROCESS_NOTE \
  --es server 127.0.0.1 \
  --es note poc \
  --es notification_message "forged notification" \
  -p infosecadventures.allsafe
```

예상 영향은 앱 권한을 이용한 임의 host 요청, 인증 토큰 노출, 알림 스푸핑이다. 네트워크 보안 설정도 `infosecadventures.io`의 cleartext를 허용한다. [network_security_config.xml](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/res/xml/network_security_config.xml) Android는 내부용 receiver를 `exported=false`로 두거나 signature permission으로 보호하라고 권고한다. [Insecure Broadcast Receivers](https://developer.android.com/privacy-and-security/risks/insecure-broadcast-receiver), [Cleartext Communications](https://developer.android.com/privacy-and-security/risks/cleartext-communications)

### 3.8 Deep Link Exploitation

Manifest는 `allsafe://infosecadventures/congrats`와 host 제한이 없는 모든 `https:` URI를 exported `DeepLinkTask`로 연결한다. [AndroidManifest.xml 21~37행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/AndroidManifest.xml#L21-L37) Activity는 쿼리의 `key`가 리소스 문자열과 같은지만 확인한다. [DeepLinkTask.java 24~39행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/DeepLinkTask.java#L24-L39) 그 키는 APK의 `strings.xml`에 들어 있다.

```bash
adb shell am start -W \
  -a android.intent.action.VIEW \
  -d "allsafe://infosecadventures/congrats?key=ebfb7ff0-b2f6-41c8-bef3-4fba17be410c" \
  infosecadventures.allsafe
```

이 명령을 에뮬레이터에서 실행하자 `DeepLinkTask`가 열렸고, 화면의 `Congratulations!`와 Snackbar의 `Good job, you did it!`를 확인했다. Logcat에도 동일한 VIEW action과 URI가 기록됐다.

![정적 키를 포함한 딥링크로 과제를 통과한 화면]({{ '/assets/images/android-vul/05-deeplink-success.png' | relative_url }})

클라이언트에 포함된 정적 키는 권한 검증이 될 수 없다. 서버가 소유한 상태·사용자 세션·단발성 nonce로 조건을 검증해야 한다. HTTPS App Link는 정확한 host와 path를 지정하고 `android:autoVerify="true"` 및 Digital Asset Links를 사용해야 한다. [Unsafe Use of Deep Links](https://developer.android.com/privacy-and-security/risks/unsafe-use-of-deeplinks)

### 3.9 SQL Injection

로그인 쿼리는 사용자명을 직접 연결하고 비밀번호만 MD5로 바꿔 연결한다. [SQLInjection.kt 26~28행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/SQLInjection.kt#L26-L28)

```text
username: ' OR 1=1 -- 
password: anything
```

생성되는 쿼리는 뒤의 비밀번호 조건이 주석 처리되어 전체 사용자를 반환한다. 특정 사용자만 원하면 `admin' -- `도 가능하다. 개선은 문자열 연결을 없애고 selection args를 사용한다.

실제 에뮬레이터에서는 username에 `admin' -- `를 입력하고 password를 비워 둔 채 로그인했다. Toast에 `User: admin`과 저장된 MD5 값 `21232f297a57a5a743894a0e4a801fc3`가 표시되어 비밀번호 조건 우회를 동적으로 확인했다.

![admin 뒤의 SQL 주석 payload로 비밀번호 검증을 우회한 화면]({{ '/assets/images/android-vul/07-sqli-success.png' | relative_url }})

```kotlin
db.rawQuery(
    "SELECT * FROM user WHERE username = ? AND password = ?",
    arrayOf(username.text.toString(), passwordHash)
)
```

비밀번호 저장에는 빠른 MD5가 아니라 서버 측 Argon2id·scrypt·bcrypt·PBKDF2 같은 전용 password hashing을 사용해야 한다. SQL 문자열 연결이 핵심 원인이고 parameterized query가 1차 방어라는 점은 OWASP 지침과 일치한다. [OWASP SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)

### 3.10 Vulnerable WebView

WebView는 JavaScript와 파일 접근을 켜고, 사용자가 입력한 URL을 그대로 `loadUrl`하거나 임의 HTML을 `loadData`로 실행한다. [VulnerableWebView.java 31~45행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/VulnerableWebView.java#L31-L45)

```html
<script>alert('Allsafe XSS')</script>
```

SharedPreferences 과제를 먼저 수행한 뒤 다음 URL을 직접 입력하면 앱 자신의 평문 XML을 읽는 경로도 시험할 수 있다.

```text
file:///data/user/0/infosecadventures.allsafe/shared_prefs/user.xml
```

기기별 WebView 정책에 따라 렌더링 방식은 달라질 수 있어 파일 읽기는 동적 미검증이다. 하지만 임의 HTML에서 JavaScript 실행과 명시적 `setAllowFileAccess(true)`는 소스에서 확정된다. 개선은 JavaScript·파일·content 접근을 기본 거부하고, 필요한 URL은 파싱 후 scheme과 정확한 host를 모두 allowlist로 검증하며, 로컬 자산은 `WebViewAssetLoader`를 쓰는 것이다. [WebView Unsafe File Inclusion](https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion), [Cross-App Scripting](https://developer.android.com/privacy-and-security/risks/cross-app-scripting)

### 3.11 Smali Patching

원본 Java는 `Firewall.INACTIVE`를 지역 변수에 넣고 `ACTIVE`일 때만 성공을 표시한다. [SmaliPatch.java 19~29행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/SmaliPatch.java#L19-L29)

Apktool 3.0.3으로 빌드 APK를 디코드하니 다음 Smali가 생성됐다.

```smali
# before
sget-object v1, Linfosecadventures/allsafe/challenges/SmaliPatch$Firewall;->INACTIVE:Linfosecadventures/allsafe/challenges/SmaliPatch$Firewall;

# after
sget-object v1, Linfosecadventures/allsafe/challenges/SmaliPatch$Firewall;->ACTIVE:Linfosecadventures/allsafe/challenges/SmaliPatch$Firewall;
```

실제 수행 절차는 다음과 같다.

```bash
java -jar apktool_3.0.3.jar d -f app-debug.apk -o apktool-decoded
# 위 한 줄 수정
java -jar apktool_3.0.3.jar b apktool-decoded -o patched-unsigned.apk
zipalign -f -p 4 patched-unsigned.apk patched-aligned.apk
apksigner sign --ks debug.keystore --out allsafe-smali-patched.apk patched-aligned.apk
apksigner verify --verbose --print-certs allsafe-smali-patched.apk
```

재디코드한 최종 APK에서 `Firewall.ACTIVE`를 확인했고, zipalign 및 v1/v2/v3 서명 검증도 통과했다. 이 과제의 교훈은 중요한 권한 판단을 클라이언트의 한 분기나 문자열에만 두면 안 된다는 것이다. [Apktool 공식 문서](https://apktool.org/docs/install/)

패치 APK를 에뮬레이터에 설치하고 `[CHECK FIREWALL]`을 누르자 `Firewall is now activated, good job!`이 표시됐다. 즉, 파일 수준 변경이 실제 실행 분기까지 바꾼 것을 확인했다.

![Smali 패치 후 방화벽 활성화 성공 화면]({{ '/assets/images/android-vul/06-smali-patch-success.png' | relative_url }})

### 3.12 Native Library

JNI 함수는 비밀번호를 XOR한 결과와 고정 문자열을 비교하지만, C++ 소스에 평문 `supersecret`이 그대로 있고 주석까지 이를 알려 준다. [native_library.cpp 28~47행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/cpp/native_library.cpp#L28-L47)

더 중요한 점은 소스만 본 것이 아니라 빌드된 arm64 ELF에서도 다음 세 문자열을 추출했다.

```text
supersecret
8>;.98.(9.?
Java_infosecadventures_allsafe_challenges_NativeLibrary_checkPassword
```

Frida로 반환값을 강제하는 예시는 다음과 같다.

```javascript
const name = 'Java_infosecadventures_allsafe_challenges_NativeLibrary_checkPassword';
const addr = Module.findGlobalExportByName(name);
Interceptor.attach(addr, {
  onLeave(retval) {
    retval.replace(1);
    console.log('[+] native password check forced true');
  }
});
```

네이티브 코드는 비밀 저장소가 아니다. 역공학 비용만 달라질 뿐, 최종 승인 판단과 장기 비밀은 서버에 둬야 한다.

## 4. README에 없는 현재 소스의 7개 추가 챌린지

### 4.1 Firebase Database

앱은 로그인이나 App Check 확인 없이 Realtime Database의 `/secret`을 읽으려 한다. [FirebaseDatabase.kt 21~35행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/FirebaseDatabase.kt#L21-L35) `google-services.json`에는 프로젝트 ID, database URL, storage bucket과 Android 클라이언트 설정이 포함된다.

다만 실제 공개 읽기 가능 여부는 서버 측 Firebase Security Rules가 결정한다. 이 분석은 제3자 운영 백엔드를 직접 조회하지 않았으므로 “코드상 인증 없는 읽기를 시도하며, 서버 규칙이 허용할 때 노출된다”까지가 확인된 사실이다. Firebase도 기본적으로 서버 규칙이 모든 읽기·쓰기를 거부하며, 허용 여부는 `.read`/`.write` 규칙에 달렸다고 설명한다. [Firebase Realtime Database Rules](https://firebase.google.com/docs/database/security)

### 4.2 Insecure SharedPreferences

회원가입 폼은 사용자명과 비밀번호를 `user.xml`에 평문으로 저장한다. [InsecureSharedPreferences.java 37~44행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/InsecureSharedPreferences.java#L37-L44) 빌드 APK는 `android:debuggable=true`, `allowBackup=true`이므로 교육용 디버그 환경에서는 추출 난도가 더 낮다.

```bash
adb shell run-as infosecadventures.allsafe cat shared_prefs/user.xml
```

`MODE_PRIVATE`는 정상 샌드박스에서 다른 앱의 직접 접근을 막지만, 루팅·백업 노출·디버그 접근까지 평문 자체를 보호하지는 않는다. [OWASP SharedPreferences Demo](https://mas.owasp.org/MASTG/demos/android/MASVS-STORAGE/MASTG-DEMO-0059/MASTG-DEMO-0059/), [Android debuggable 위험](https://developer.android.com/privacy-and-security/risks/android-debuggable)

### 4.3 PIN Bypass

`NDg2Mw==`를 Base64 decode한 문자열과 입력값을 비교한다. 결과는 `4863`이다. [PinBypass.kt 27~29행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/PinBypass.kt#L27-L29)

에뮬레이터에서 `4863`을 입력하고 검증하자 `Access granted, good job!` Snackbar가 표시됐다. 이 결과는 Base64 디코딩으로 얻은 값이 실제 런타임 검증값임을 보여 준다.

![Base64에서 복원한 PIN 4863으로 검증을 통과한 화면]({{ '/assets/images/android-vul/04-pin-success.png' | relative_url }})

Base64는 인코딩이며 암호화가 아니다. 더 근본적으로 APK 안의 값만으로 권한을 승인하면 공격자는 정적 분석, 후킹, Smali 패치 중 하나로 우회할 수 있다. PIN 검증은 서버와 rate limit, 시도 횟수 정책, 강한 사용자 인증에 연결해야 한다.

### 4.4 Weak Cryptography

한 클래스에 세 문제가 모여 있다. [WeakCryptography.java](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/WeakCryptography.java)

- 고정 키 `1nf053c4dv3n7ur3`
- 패턴을 숨기지 못하는 `AES/ECB/PKCS5PADDING`
- 충돌 내성이 깨진 MD5
- 보안 토큰에 부적합한 `java.util.Random`
- ciphertext byte를 무손실 인코딩 없이 `new String()`으로 변환

Android는 AES-GCM, SHA-256 계열, `SecureRandom`, Android Keystore를 권장한다. [Android Cryptography](https://developer.android.com/privacy-and-security/cryptography), [Weak PRNG](https://developer.android.com/privacy-and-security/risks/weak-prng)

### 4.5 Insecure Service

`RecorderService`는 exported이며 permission으로 보호되지 않는다. [AndroidManifest.xml 50~54행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/AndroidManifest.xml#L50-L54) 서비스는 시작되면 앱이 이미 가진 마이크 권한으로 10초 녹음을 시도하고 Downloads에 파일을 쓴다. [RecorderService.java 29~72행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/RecorderService.java#L29-L72)

```bash
adb shell am startservice \
  -n infosecadventures.allsafe/.challenges.RecorderService
```

Android 버전의 백그라운드 실행·마이크 제한에 따라 실제 시작이 차단될 수 있어 동적 미검증이다. 하지만 exported 컴포넌트가 민감 작업을 하고 호출자 권한을 확인하지 않는 구조는 확정된다. 또한 UI의 permission 검사도 세 조건을 `&&`로 묶어 “모든 권한이 없을 때”만 요청하므로, 일부 권한만 없으면 그대로 서비스를 시작하는 논리 오류가 있다. [Permission-based Access Control](https://developer.android.com/privacy-and-security/risks/access-control-to-exported-components)

### 4.6 Object Serialization

앱은 외부 app-specific 디렉터리의 `user.dat`을 `ObjectInputStream`으로 읽고 `role == ROLE_EDITOR`만 확인한다. [ObjectSerialization.java 58~81행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/ObjectSerialization.java#L58-L81) 기본값 `ROLE_AUTHOR`와 목표값 `ROLE_EDITOR`는 둘 다 11바이트라 직렬화 blob에서 동일 길이 치환이 가능하다.

```python
from pathlib import Path

src = Path('user.dat').read_bytes()
old, new = b'ROLE_AUTHOR', b'ROLE_EDITOR'
if src.count(old) != 1:
    raise SystemExit('expected exactly one ROLE_AUTHOR')
Path('user-patched.dat').write_bytes(src.replace(old, new))
```

여기서는 중요한 정정이 있다. 레이아웃 문구는 “임의 코드 실행”을 암시하지만, 현재 `User` 클래스에는 `readObject` gadget이나 부작용 코드가 없다. 따라서 이 소스만으로 확정되는 PoC는 **권한 필드 변조**이며, RCE는 별도 gadget이 존재할 때의 일반적 위험이다. 이런 구분이 소스 기반 분석에서 중요하다. Android는 모든 직렬화 입력을 불신하고 클래스·형식·무결성을 검증하라고 권고한다. [Unsafe Deserialization](https://developer.android.com/privacy-and-security/risks/unsafe-deserialization)

### 4.7 Insecure Providers

`DataProvider`는 exported이며 read/write permission이 없다. [AndroidManifest.xml 56~61행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/AndroidManifest.xml#L56-L61) provider는 query/insert/update/delete를 모두 호출자에게 노출한다. [DataProvider.java 27~59행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/DataProvider.java#L27-L59)

```bash
adb shell content query \
  --uri content://infosecadventures.allsafe.dataprovider/note
```

초기 데이터에는 다른 사용자의 메모와 비밀번호 힌트가 들어 있다. [NoteDatabaseHelper.java 16~22행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/NoteDatabaseHelper.java#L16-L22) 외부 공유가 목적이 아니면 `exported=false`, 필요하면 signature permission과 호출자 검증, 허용 projection/selection 정책을 사용해야 한다. [Android Security Tips - Content Providers](https://developer.android.com/privacy-and-security/security-tips)

## 5. 메뉴 밖에서 발견한 추가 이슈: ProxyActivity Intent Redirection

진행 방향을 점검하면서 “챌린지 화면만 보면 놓치는 공격면이 없는가”를 확인했고, exported `ProxyActivity`를 발견했다. 이 Activity는 caller가 `extra_intent`로 넣은 중첩 Intent를 아무 검증 없이 `startActivity()`에 전달한다. [ProxyActivity.java 7~13행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/ProxyActivity.java#L7-L13), [AndroidManifest.xml 17~19행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/AndroidManifest.xml#L17-L19)

이는 Android가 설명하는 전형적인 Intent redirection 패턴이다. 공격자가 중첩 Intent의 component, data, flags를 통제하면 앱 컨텍스트에서 예상하지 않은 컴포넌트나 URI를 열 수 있다. 정확한 영향은 기기 버전, 대상 컴포넌트, Android 16의 launch hardening 적용 여부에 따라 달라지므로 “임의 내부 Activity 접근 가능성”으로 평가했다. [Android Intent Redirection](https://developer.android.com/privacy-and-security/risks/intent-redirection)

개선은 Activity를 export하지 않거나, 중첩 Intent를 제거하고 명시적 allowlist로 목적지를 재구성하며, 불가피하면 `IntentSanitizer`로 component/data/type/flags를 제한하는 것이다.

## 6. 공통 설정 이슈

빌드 APK 매니페스트에서 다음을 확인했다.

- `android:debuggable=true`
- `android:allowBackup=true`
- `android:requestLegacyExternalStorage=true`
- 무권한 exported Activity/Receiver/Service/Provider
- `QUERY_ALL_PACKAGES`
- 특정 도메인의 cleartext 허용

교육용 앱이라 의도된 설정이지만 실제 제품에서는 릴리스 변형에서 `debuggable=false`, 민감 데이터 backup 제외 규칙, 최소 컴포넌트 노출, 최소 권한, HTTPS-only 정책을 적용해야 한다. `allowBackup=false`의 기기 간 이전 동작은 Android 12+와 제조사에 따라 차이가 있으므로, 민감 파일을 명시적으로 제외하는 `dataExtractionRules`까지 함께 검토해야 한다. [Android application manifest](https://developer.android.com/guide/topics/manifest/application-element), [Auto Backup](https://developer.android.com/identity/data/autobackup)

## 7. 14일 학습 일정

14일은 “하루 한 챌린지”만으로는 12개 분석, 환경 구성, 최종 글 작성을 모두 담기 어렵다. 따라서 연관된 항목을 묶고 마지막 이틀을 검증과 글쓰기에 확보하는 편이 낫다.

| 날짜 | 목표 | 결과물 |
|---|---|---|
| 10/01 | 범위·윤리·도구체인, 소스 빌드 | APK 해시, 환경 메모 |
| 10/02 | Logging, Hardcoded Credentials | 로그/문자열 증거 |
| 10/03 | Root Detection, PIN Bypass | Frida 스크립트, PIN 분석 |
| 10/04 | Arbitrary Code Execution | 안전한 Log-only plugin PoC |
| 10/05 | Secure Flag, Certificate Pinning | Frida 스크립트, 네트워크 모델 |
| 10/06 | Broadcast Receiver, Insecure Service | ADB 명령과 IPC 위협 모델 |
| 10/07 | Deep Link, ProxyActivity | URI/Intent 검증표 |
| 10/08 | SQL Injection, Content Provider | payload와 parameterized query |
| 10/09 | WebView | XSS·file access 분석 |
| 10/10 | SharedPreferences, Firebase | 저장·백엔드 경계 분석 |
| 10/11 | Weak Cryptography | 알고리즘·키 관리 개선안 |
| 10/12 | Object Serialization | role 변조 스크립트, 한계 검증 |
| 10/13 | Smali, Native Library | 패치 APK, ELF 문자열 증거 |
| 10/14 | 전체 재검증·블로그 발행 | 최종 글, 증거 인덱스 |

현재 완료된 것은 소스 빌드, 전체 정적 분석, Smali 재패키징, 네이티브 바이너리 문자열 검증과 AVD 기반 동적 재현이다. 이번 동적 검증에서는 메인·메뉴 화면, PIN 성공, 딥링크 성공, SQL injection 성공, Smali 패치 성공을 화면과 UI 계층으로 확인했다. Root Detection·Secure Flag·Certificate Pinning의 Frida 후킹과 Burp 네트워크 검증은 별도 실습 범위로 남아 있다.

## 8. 결론

Allsafe에서 반복되는 핵심은 “클라이언트는 공격자가 통제할 수 있다”는 사실이다. Base64 PIN, 네이티브 비밀번호, Smali 분기, RootBeer 결과, `FLAG_SECURE`, certificate pinning은 모두 클라이언트 단독의 결정이라 정적 분석이나 런타임 계측으로 바뀔 수 있다. 반대로 exported 컴포넌트, WebView, 동적 코드 로딩은 앱의 권한과 신뢰 경계를 외부 입력에 넘긴다는 점에서 실제 제품에서도 높은 위험으로 이어진다.

분석 중 가장 중요한 교정은 두 가지였다.

1. README는 현재 소스의 전체 19개 과제를 반영하지 않는다. 따라서 README 12개를 완료한 뒤 메뉴 순서의 7개를 추가해야 한다.
2. Object Serialization 화면의 “RCE” 설명과 달리 현재 소스에서 직접 재현 가능한 것은 `role` 변조다. gadget이나 부작용 메서드가 없는 상태에서 RCE로 단정하면 안 된다.

이 두 점은 도구를 실행하는 것보다 “무엇이 실제로 증명됐는가”를 구분하는 습관이 취약점 분석에서 더 중요하다는 좋은 예다.

## 9. 주요 참고자료

- [Allsafe Android 공식 레포](https://github.com/t0thkr1s/allsafe-android)
- [OWASP Mobile Application Security Testing Guide](https://mas.owasp.org/MASTG/)
- [Android Security Risks Index](https://developer.android.com/privacy-and-security/risks)
- [Android Log Info Disclosure](https://developer.android.com/privacy-and-security/risks/log-info-disclosure)
- [Android Permission-based Access Control](https://developer.android.com/privacy-and-security/risks/access-control-to-exported-components)
- [Android Unsafe Use of Deep Links](https://developer.android.com/privacy-and-security/risks/unsafe-use-of-deeplinks)
- [Android Intent Redirection](https://developer.android.com/privacy-and-security/risks/intent-redirection)
- [Android WebView Unsafe File Inclusion](https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion)
- [Android Unsafe Deserialization](https://developer.android.com/privacy-and-security/risks/unsafe-deserialization)
- [Android Cryptography](https://developer.android.com/privacy-and-security/cryptography)
- [Firebase Realtime Database Security Rules](https://firebase.google.com/docs/database/security)
- [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [Gradle Java Compatibility Matrix](https://docs.gradle.org/current/userguide/compatibility.html)
- [Apktool 공식 문서](https://apktool.org/docs/install/)

---
