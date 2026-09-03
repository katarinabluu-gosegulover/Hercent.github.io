---
layout: post
title: Docker와 Kubernetes 기초 및 보안 실습
page_description: Docker·Kubernetes 기초 및 Kubernetes Goat 보안 실습 보고서
category_key: blog-docs
summary: Docker·Kubernetes 기초 및 Kubernetes Goat 보안 실습 보고서
lead: Docker·Kubernetes 기초 및 Kubernetes Goat 보안 실습 보고서
featured: false
feature_order: 0
---

# Docker·Kubernetes 기초 및 Kubernetes Goat 보안 실습 보고서

실습 환경: Docker Desktop + kind `kubernetes-goat-lab` + Kubernetes Goat  
범위: Docker/Kubernetes 기초 학습 및 격리된 교육용 클러스터의 보안 구성 분석

## 1. 학습 목표와 범위

Docker Crash Course를 통해 이미지·컨테이너·볼륨·네트워크의 역할과 기본 명령을 학습했고, Kubernetes Crash Course를 통해 Pod, Deployment, Service, Namespace, ConfigMap, Secret 및 `kubectl` 사용법을 학습했다. 이후 Kubernetes Goat를 **로컬 kind 격리 클러스터**에 배포해 다음 5개 취약 유형을 실습했다.

1. 코드 저장소의 민감정보 노출
2. RBAC 최소 권한 위반
3. NodePort 노출
4. Namespace 간 네트워크 경계 우회
5. privileged Pod·HostPath에 의한 컨테이너 탈출 위험

## 2. Docker 기초 정리

### 2.1 핵심 개념

| 개념 | 설명 |
|---|---|
| Image | 애플리케이션과 실행 환경을 읽기 전용 계층으로 묶은 템플릿 |
| Container | Image를 실행한 격리 프로세스 인스턴스. 같은 Image로 여러 컨테이너를 만들 수 있다. |
| Volume | 컨테이너 삭제와 별개로 데이터를 보존하기 위한 Docker 관리 저장소 |
| Network | 컨테이너 간 통신과 외부 포트 연결을 제공하는 가상 네트워크 |
| Registry | Image를 저장·배포하는 서비스. 로컬에 Image가 없으면 Docker는 설정된 Registry(일반적으로 Docker Hub)에서 pull을 시도한다. |

Image와 컨테이너의 구분, Volume·네트워크의 사용 목적은 [Docker Get Started](https://docs.docker.com/get-started/)와 [Docker storage volumes](https://docs.docker.com/engine/storage/volumes/)를 기준으로 정리함.

### 2.2 자주 사용한 Docker 명령과 이유

| 명령 | 사용 이유 | 확인/주의 사항 |
|---|---|---|
| `docker run IMAGE` | Image를 기반으로 컨테이너를 생성·실행한다. | 로컬에 Image가 없으면 pull이 먼저 일어난다. |
| `docker ps` | 현재 실행 중인 컨테이너, Image, 상태, 포트를 확인한다. | 종료된 컨테이너까지 보려면 `docker ps -a`를 사용한다. |
| `docker stop CONTAINER` | 실행 중인 컨테이너를 정상 종료한다. | ID 또는 이름을 지정해야 한다. |
| `docker rm CONTAINER` | 종료된 컨테이너를 제거한다. | Volume은 별도 관리되므로 함께 삭제되는지 확인한다. |
| `docker images` | 로컬 Image 목록·태그·크기를 확인한다. | 빌드/정리 전 Image 식별에 사용한다. |
| `docker rmi IMAGE` | 더 이상 사용하지 않는 Image를 제거한다. | 해당 Image를 참조하는 컨테이너가 있으면 먼저 처리한다. |
| `docker pull IMAGE` | 컨테이너를 실행하지 않고 Image만 내려받는다. | 태그를 명시해 재현성을 높인다. |
| `docker exec -it CONTAINER sh` | 실행 중인 컨테이너 안에서 진단 명령을 실행한다. | 운영 환경에서는 최소 권한과 감사 로그를 고려한다. |
| `docker logs CONTAINER` | 컨테이너 표준 출력·오류 로그를 확인한다. | 로그에 비밀값이 남지 않도록 주의하기. |

## 3. Kubernetes 기초 정리

### 3.1 핵심 구성 요소

| 구성 요소 | 설명 |
|---|---|
| Cluster | 여러 Node와 Control Plane으로 이루어진 Kubernetes 관리 단위 |
| Node | Pod가 배치되어 실행되는 물리·가상 머신 또는 그에 준하는 실행 노드 |
| Control Plane | 원하는 상태를 관리하고 스케줄링·조정하는 구성 요소. 예전의 `master`라는 용어보다 현재 문서에서는 Control Plane을 사용한다고 함. |
| Pod | 하나 이상의 컨테이너를 함께 배치하는 Kubernetes의 최소 배포 단위 |
| Deployment | Pod의 선언적 배포, Replica 관리, 롤링 업데이트를 담당 |
| Service | 변하는 Pod IP 대신 안정적인 접근 지점과 서비스 발견을 제공한다. |
| Namespace | 리소스 이름을 논리적으로 구분하는 범위다. 기본적으로 네트워크 격리를 제공하지는 않는다. |
| ConfigMap | 비민감 설정 데이터를 컨테이너에 전달 |
| Secret | 비밀 데이터를 저장·전달하는 리소스다. `data` 필드는 Base64 인코딩일 뿐 암호화 자체를 뜻하지 않음. |

Pod·Deployment·Service의 역할은 [Kubernetes Concepts](https://kubernetes.io/docs/concepts/), Secret의 저장 형식은 [Kubernetes Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)를 참고했다.

### 3.2 `kubectl`과 YAML

| 명령/필드 | 의미 |
|---|---|
| `kubectl cluster-info` | 현재 연결한 클러스터의 Control Plane 주소와 핵심 서비스를 확인한다. |
| `kubectl get nodes` | Node의 상태를 확인한다. `-o wide`를 붙이면 IP·런타임 등 상세 정보가 추가된다. |
| `kubectl get pods -A` | 모든 Namespace의 Pod 상태를 확인한다. |
| `kubectl describe pod POD` | 이벤트, 이미지, 볼륨, 상태 등 Pod의 상세 진단 정보를 확인한다. |
| `kubectl apply -f FILE.yaml` | YAML 선언을 클러스터의 원하는 상태로 적용한다. |
| `apiVersion`, `kind`, `metadata` | 대부분의 Kubernetes 객체에 필요한 API 버전, 객체 유형, 이름·라벨 등의 메타데이터 |
| `spec` | Deployment·Pod·Service 등에서 원하는 상태를 기술한다. ConfigMap처럼 `spec` 대신 `data`를 사용하는 객체도 있으므로 모든 객체에 일률적으로 필수는 아니라고 함. |

YAML은 들여쓰기와 자료 구조가 의미를 가지므로 공백 오류가 곧 구성 오류로 이어질 수 있다. 객체별 필수 필드는 Kubernetes API schema를 따라야 한다. [Kubernetes API Overview](https://kubernetes.io/docs/reference/using-api/)

## 4. 실습 환경

- Docker Desktop Linux Engine 위에 kind 클러스터 `kubernetes-goat-lab`을 구성함.
- kubeconfig는 프로젝트 내부의 `work/kubernetes-goat-lab.kubeconfig`을 사용
- Goat 서비스 접근은 필요한 경우 `127.0.0.1` 포트 포워딩으로 제한
- 실습은 교육용 kind 클러스터에서만 수행했으며, 운영 자산·외부 IP·실제 계정에는 접근하지 않았다.

## 5. Kubernetes Goat 실습 결과

### 5.1 시나리오 1 — Sensitive keys in codebases

**목적:** 컨테이너에 포함된 Git 이력에서 하드코딩된 비밀정보가 남아 있는지 확인한다.

| 명령 | 이 명령을 실행한 이유 |
|---|---|
| `kubectl get pods -n default -l app=build-code ...` | `app=build-code` 라벨로 대상 Pod 이름을 동적으로 찾는다. Pod 이름은 재배포마다 달라질 수 있기 때문 |
| `kubectl exec -it -n default POD -- sh` | 교육용 build-code 컨테이너 안에서 파일시스템과 Git 이력을 분석한다. |
| `cd /app; ls -la` | 애플리케이션 경로와 숨김 `.git` 디렉터리 존재를 확인한다. |
| `git log --oneline` | 저장소 커밋 이력을 간단한 형식으로 나열해 의심스러운 변경을 찾는다. |
| `git show --name-status COMMIT` | 특정 커밋에서 어떤 파일이 추가·수정됐는지 확인한다. |
| `git show COMMIT:.env` | 과거 커밋의 `.env` 내용을 확인한다. 실습에서는 노출을 확인했으며 실제 값은 보고서 기록에서 제외함. |

**관찰 결과:** `.env` 파일을 추가한 과거 커밋과 AWS 접근 키·비밀 키·실습 flag 항목을 확인했다. 즉, 현재 소스에서 삭제하더라도 Git 이력을 정리하지 않으면 과거 비밀값이 복구될 수 있다.

**원인과 대응:** 비밀값을 코드에 커밋했고, `.git` 이력까지 컨테이너/웹 경로에 노출한 것이 원인이다. 키를 즉시 폐기·순환하고, Git 이력에서 제거하며, CI에 secret scanning을 적용한다. 런타임 비밀값은 전용 Secret/외부 비밀관리 서비스에서 최소 권한으로 주입한다.

![민감 키 노출 — 공개용 마스킹](/Hercent.github.io/assets/images/01-sensitive-keys-redacted.png)

공식 실습 절차: [Kubernetes Goat Scenario 1](https://github.com/madhuakula/kubernetes-goat/blob/master/guide/docs/scenarios/scenario-1/scenario-1.md)

### 5.2 시나리오 2 — RBAC 최소 권한 위반

**목적:** ServiceAccount에 부여된 권한이 필요한 범위보다 넓은지 확인하고 Secret 접근 영향을 검증한다.

| 명령 | 이 명령을 실행한 이유 |
|---|---|
| `kubectl get role,rolebinding -n big-monolith` | Role의 권한 정의와 RoleBinding의 연결 관계를 함께 확인한다. |
| `kubectl auth can-i get secrets --as=system:serviceaccount:... -n big-monolith` | 지정 ServiceAccount가 해당 Namespace에서 Secret을 조회할 수 있는지 API 권한 판정으로 검증한다. |
| 같은 명령에 `-n default` | 다른 Namespace에서는 동일 권한이 없는지 비교해 권한 범위를 확인한다. |
| `kubectl get secret vaultapikey --as=... -o name` | Secret의 데이터값을 노출하지 않고 리소스 접근 가능 여부만 확인한다. |
| `jsonpath` + Base64 디코딩 | Goat의 완료 조건을 위해 특정 Secret 데이터 필드를 추출·복원한다. Kubernetes Secret `data`는 Base64로 인코딩되어 있기 때문이다. |

**관찰 결과:** `big-monolith-sa`는 `big-monolith`에서는 Secret 조회가 `yes`, `default`에서는 `no`였다. 같은 Namespace의 Secret을 읽을 수 있으므로, 공격자가 이 ServiceAccount 토큰을 얻으면 민감정보 접근으로 이어질 수 있다.

**원인과 대응:** 와일드카드 리소스와 넓은 `get/watch/list` 권한이 문제다. 필요한 리소스·동사만 허용하고, 가능하면 `resourceNames`로 특정 Secret 이름만 제한한다. 배포 전 `kubectl auth can-i` 또는 정책 검사를 수행한다.

![RBAC 권한 검증 — 공개용 마스킹](/Hercent.github.io/assets/images/02-rbac-secret-access-redacted.png)

참고: [Kubernetes RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)

### 5.3 시나리오 3 — NodePort exposed services

**목적:** 내부용이어야 할 서비스가 NodePort로 노출돼 있는지 확인한다.

| 명령 | 이 명령을 실행한 이유 |
|---|---|
| `kubectl get service internal-proxy-info-app-service -n default` | Service 타입과 `PORT(S)` 매핑을 확인한다. |
| `kubectl get nodes -o wide` | Node의 상태와 접근 가능 IP 범위를 함께 확인한다. |

**관찰 결과:** Service 타입은 `NodePort`였고, Service 포트 `5000`이 NodePort `30003`으로 매핑됐다. 이 kind 환경의 External IP는 없어서 인터넷 노출까지는 검증하지 않았다. 그러나 공인 IP와 허용된 방화벽을 가진 운영 Node라면 Node IP의 `30003`으로 서비스에 도달할 가능성이 있다.

**원인과 대응:** 필요하지 않은 NodePort 공개가 원인이다. 내부 서비스는 기본적으로 `ClusterIP`를 사용하고, 외부 공개가 필요하면 Ingress/Gateway, 인증, 네트워크 ACL, 방화벽을 적용한다.

![NodePort 구성 — 공개용 마스킹](/Hercent.github.io/assets/images/03-nodeport-exposure-redacted.png)

참고: [Kubernetes Service: NodePort](https://kubernetes.io/docs/concepts/services-networking/service/#type-nodeport)

### 5.4 시나리오 4 — Kubernetes namespaces bypass

**목적:** Namespace가 네트워크 격리를 자동으로 제공하지 않는다는 점을 검증한다.

| 명령 | 이 명령을 실행한 이유 |
|---|---|
| `kubectl get networkpolicy -A` | 클러스터에 네트워크 허용·차단 정책이 정의되어 있는지 확인한다. |
| `kubectl run -it --rm hacker-container --image=... --restart=Never -- sh` | `default` Namespace에서 임시 조사 Pod를 생성한다. `--rm`은 종료 시 Pod를 제거한다. |
| `redis-cli -h cache-store-service.secure-middleware -p 6379` | `서비스이름.네임스페이스` 형식의 내부 DNS로 다른 Namespace의 Redis에 접속한다. |
| `PING` | Redis 연결이 가능한지 확인한다. `PONG`은 TCP 연결과 Redis 응답이 모두 성공했음을 뜻한다. |
| `KEYS *` | 교육용 Redis에 저장된 키 이름을 나열한다. |
| `GET SECRETSTUFF` | 실습 목표로 지정된 키의 값 존재를 확인한다. 보고서에는 flag 값을 기록하지 않는다. |

**관찰 결과:** NetworkPolicy가 없었고, `default` Namespace의 임시 Pod에서 `secure-middleware` Namespace의 Redis에 연결돼 `PONG`을 받았다. 이는 Namespace 분리만으로는 Pod 간 통신 차단이 되지 않음을 보여 준다.

**원인과 대응:** default-deny NetworkPolicy가 없고, 서비스 간 허용 규칙도 제한되지 않은 것이 원인이다. Namespace별 ingress/egress default-deny를 먼저 적용한 뒤, 필요한 Pod selector·포트·DNS 통신만 명시적으로 허용한다.

![Namespace 간 Redis 접근 — 공개용 마스킹](/Hercent.github.io/assets/images/04-namespace-network-bypass-redacted.png)

참고: [Kubernetes Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)

### 5.5 시나리오 5 — Container escape to the host system

**목적:** privileged 컨테이너와 호스트 루트 HostPath 마운트가 결합될 때 노드 접근으로 이어지는 위험을 확인한다.

| 명령어 | 각 명령어를 실행한 이유 |
|---|---|
| `kubectl get pods -n default -l app=system-monitor ...` | 라벨로 system-monitor Pod를 찾는다. |
| `kubectl exec -it -n default POD -- sh` | 교육용 Pod 안에서 보안 컨텍스트와 마운트를 검사한다. |
| `id` | 컨테이너 프로세스의 UID를 확인한다. root 실행 여부는 위험도 판단의 한 요소다. |
| `mount \| grep host-system` | 호스트 파일시스템이 `/host-system`으로 마운트됐는지 확인한다. |
| `chroot /host-system sh` | 교육용 격리 노드의 마운트된 루트 파일시스템을 기준으로 셸을 실행해 경계 우회 영향을 증명한다. |
| `pwd`, `ls /etc/kubernetes` | 루트 전환과 Kubernetes 설정 경로 존재를 확인한다. 파일 내용을 열거나 수정하지 않았다. |

**관찰 결과:** `/host-system`이 읽기·쓰기 마운트로 확인됐고, `chroot` 뒤 루트 경로(`/`) 및 `/etc/kubernetes`의 설정 파일 목록을 확인했다. 이는 노드 파일시스템을 접근할 수 있는 위험 구성의 증적이다.

**원인과 대응:** `privileged: true`, `hostPID: true`, HostPath `/`의 읽기·쓰기 마운트를 함께 준 것이 원인이다. privileged와 hostPID는 기본적으로 금지하고, HostPath는 제거하거나 필요한 단일 경로를 읽기 전용으로 제한한다. Pod Security Admission과 정책 엔진으로 이런 Pod를 배포 단계에서 차단한다.

![컨테이너 탈출 위험 구성 검증](/Hercent.github.io/assets/images/05-container-escape-hostpath-sanitized.png)

참고: [Kubernetes Security Context](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/), [hostPath Volumes](https://kubernetes.io/docs/concepts/storage/volumes/#hostpath)

## 6. 종합 대응 방안

| 취약 유형 | 우선 대응 |
|---|---|
| 코드·Git 이력의 비밀값 | 키 폐기·순환, 이력 정리, secret scanning, 외부 비밀관리 도입 |
| RBAC 과권한 | 전용 ServiceAccount, 최소 리소스·동사, `resourceNames`, 정기 권한 검토 |
| NodePort 노출 | 내부 서비스는 ClusterIP 우선, 외부 공개 시 인증·Ingress·방화벽 적용 |
| Namespace 간 통신 | default-deny NetworkPolicy 후 필요한 흐름만 허용 |
| privileged/HostPath | privileged·hostPID 금지, HostPath 최소화·읽기 전용, Pod 보안 정책 적용 |

## 7. 결론

Docker의 Image·Container 경계와 Kubernetes의 Pod·Service·RBAC·Namespace 개념을 학습한 뒤, 실제 구성 오류가 어떻게 비밀정보 노출, 과권한, 내부 서비스 노출, 네트워크 경계 우회, 노드 접근 위험으로 연결되는지 학습용 클러스터에서 확인했다. 
핵심은 단일 설정이 아니라 **비밀관리, 최소 권한, 네트워크 정책, 워크로드 보안 컨텍스트**를 함께 적용해야 한다는 점이다.
