---
layout: post
title: KOI 맛집 추천
page_description: JUNGOL 4808 — 맛집 추천 문제 해결하기
category_key: development
summary: JUNGOL 4808 — 맛집 추천 문제 해결하기
lead: JUNGOL 4808 — 맛집 추천 문제 해결하기
featured: false
feature_order: 0
---

# JUNGOL 4808 — 맛집 추천

문제: [JUNGOL 4808](https://jungol.co.kr/problem/4808)  
출처: KOI 2021 2차 고등부 4번  
제출: C++20, **419ms**  
시간복잡도: `O((N+M) log N)` · 공간복잡도: `O(N log N)`

## 1. 문제를 다시 표현하기

맛집 `i`의 배달 범위는 중심 `c_i`, 반지름 `d_i`인 트리 위의 공이다.

```text
R_i = { v | dist(c_i, v) <= d_i }
```

두 공이 겹치는 조건은 `dist(c_i,c_j) <= d_i+d_j`이다. 따라서 맛집 쌍으로 충돌 그래프를 만들면 가중치 최대 독립 집합 문제가 되지만, 맛집이 `100,000`개라 모든 쌍을 검사하는 `O(M²)`은 불가능하다. 충돌 그래프를 만들지 않고 원래 트리에서 DP를 한다.

## 2. 루트 DP

트리를 1번 도시에서 루트로 잡고 다음을 정의한다.

> `DP[v]`: `v`의 서브트리에 완전히 포함되는 맛집만 선택하고, 선택 범위들이 서로소이며 `v`의 부모를 덮지 않을 때의 최대 선호도 합.

루트에는 부모가 없으므로 답은 `DP[1]`이다.

`DP[v]`는 `v`가 선택된 공에 덮이는지로 나눈다.

### A. `v`가 덮이지 않는 경우

서로 다른 자식 서브트리를 가로지르는 공은 경로상 `v`를 반드시 덮는다. 따라서 이 경우 자식 서브트리는 독립이며 값은

```text
Σ DP[child]
```

이다.

### B. `v`가 맛집 하나의 공에 덮이는 경우

서로소 조건 때문에 `v`를 덮는 맛집은 최대 하나다. 중심·반지름·선호도가 `(c,r,g)`인 그 맛집을 골랐다고 하자.

`v`의 서브트리에서 공 `R(c,r)`를 지우고 남는 연결 요소의 루트는 정확히 공의 바로 바깥 경계, 즉

```text
dist(c,x) = r + 1
```

을 만족하는 정점 `x`다. 남은 요소들은 공 때문에 서로 분리되므로 독립적으로 최적화할 수 있다. 후보값은

```text
g + Σ DP[x]  (dist(c,x)=r+1)
```

이다. 이 DP 상태와 경계 전이는 공식 해설의 부분문제 3과 같다.[^official-dp]

## 3. 맛집을 단 한 번만 후보로 검사하기

매 정점에서 모든 맛집을 보면 `O(NM)`이다. 맛집 `(c,r,g)`가 경우 B에 들어갈 수 있는 정점은 하나뿐이다.

그 정점은 공 안에 있지만 부모는 공 밖이어야 한다. 따라서 `c`에서 루트 쪽으로 `r`칸 올라간 정점이고, 루트를 지나면 1번 정점이다.

```cpp
top = kthAncestor(c, min(depth[c], r));
startsAt[top].push_back({c, r, g});
```

각 맛집을 `startsAt[top]`에 한 번만 넣으면, 전체 후보 수는 정확히 `M`이다. 공식 해설도 이 조상 시점이 유일함을 사용한다.[^official-dp]

## 4. 남은 핵심 질의

이제 필요한 것은 거리별 DP 합이다.

```text
Q(c,k) = Σ DP[x]  (dist(c,x)=k)
```

맛집 `(c,r,g)`의 후보는 `g + Q(c,r+1)`이다. 거리 `k`인 정점을 직접 순회하면 최악 `O(NM)`이므로 센트로이드 분해로 `Q`를 `O(log N)`에 계산한다.

## 5. 센트로이드 분해 자료구조

센트로이드 `z`를 제거하면 모든 새 컴포넌트 크기는 절반 이하가 된다. 따라서 어떤 원래 정점도 센트로이드 조상을 `O(log N)`개만 가진다.

각 센트로이드 `z`에 대해 다음을 유지한다.

| 자료 | 의미 |
|---|---|
| `all[z][d]` | 이미 처리된 정점 중 `dist(z,x)=d`인 `DP[x]`의 합 |
| `part[e][d]` | `z`에서 간선 방향 `e` 쪽 컴포넌트에 있고 `dist(z,x)=d`인 `DP[x]`의 합 |

또한 원래 정점 `x`마다 각 센트로이드 조상에 대한 `dist(x,z)`와, `z`에서 `x` 쪽으로 가는 첫 간선 `side(x,z)`를 저장한다.

### `Q(c,k)`의 포함-배제

`c`에서 센트로이드 트리의 루트까지 올라간다. 조상 `z`에서 `t=k-dist(c,z)`라 하자.

- `all[z][t]`에는 조건을 만족할 가능성이 있는 정점이 전부 들어 있다.
- 하지만 `c`와 같은 분해-자식 방향에 있는 정점은 더 낮은 단계에서 이미 세었다. `part[side(c,z)][t]`를 빼서 중복을 제거한다.

```text
Q(c,k) = Σ_z ( all[z][k-dist(c,z)]
               - part[side(c,z)][k-dist(c,z)] )
```

배열 범위를 벗어나거나 `k-dist(c,z)<0`인 항은 0으로 처리한다.

고정된 `c,x`에 대해 둘이 처음으로 서로 다른 분해 방향으로 갈라지는 가장 낮은 센트로이드가 하나 있다. 그 지점에서 `x`는 `all`에는 포함되고 빼는 `part`에는 포함되지 않아 한 번 세어진다. 그보다 아래 단계에서 생기는 값은 같은 `part`를 빼서 사라진다. 그러므로 거리 조건을 만족하는 각 `x`는 정확히 한 번만 더해진다.

공식 해설의 `F*`(전체)와 `G*`(직전 방향)도 같은 포함-배제 역할을 한다.[^official-centroid]

## 6. 처리 순서

원래 트리를 후위 순회한다.

```text
모든 맛집 (c,r,g)에 대해 startsAt[top(c,r)]에 넣는다.
센트로이드 분해와 빈 거리합 배열을 만든다.

for v in 후위 순서:
    best = Σ DP[child]
    for (c,r,g) in startsAt[v]:
        best = max(best, g + Q(c,r+1))
    DP[v] = best
    DP[v]를 v의 모든 센트로이드 조상 all/part에 추가한다.
```

후위 순서이므로 자료구조에는 이미 계산한 정점의 값만 들어 있다. 현재 정점보다 원래 트리에서 위에 있는 정점은 아직 0이므로 질의에 포함돼도 결과에 영향을 주지 않는다. 별도의 원래 트리 서브트리 필터가 필요 없는 이유다.

## 7. 정당성

`DP[v]`를 계산할 때 가능한 해는 `v`가 덮이지 않는 경우 A, 또는 정확히 하나의 맛집이 `v`를 덮는 경우 B로 완전히 분류된다.

- A에서는 자식 서브트리를 가로지르는 선택이 없으므로 자식 `DP` 합이 최적이다.
- B에서는 선택 공을 제거한 뒤의 연결 요소가 거리 `r+1` 경계 정점에서 정확히 하나씩 시작하고, 각 요소의 최적값은 해당 정점의 `DP`다.
- 각 맛집은 유일한 `top`에서만 검사하므로 후보가 빠지거나 중복되지 않는다.
- 센트로이드 포함-배제는 필요한 거리의 이미 계산된 `DP`를 정확히 한 번씩 더한다.

따라서 자식의 `DP`가 정확하다는 가정하에 `DP[v]`도 정확하다. 후위 순서 귀납으로 `DP[1]`은 전체 최적값이다.

## 8. 복잡도와 419ms 구현 포인트

- 센트로이드 분해: `O(N log N)`
- 정점별 `DP` 추가: 총 `O(N log N)`
- 맛집별 거리합 질의: 총 `O(M log N)`
- 전체: **`O((N+M) log N)`**
- 거리별 배열 총 길이: `O(N log N)`

선호도 합은 최대 `10^14`이므로 `long long`을 사용한다. 체인 트리의 깊이는 `100,000`일 수 있으므로 최종 코드는 재귀 DFS 대신 반복 스택을 사용했다. 또한 500ms 목표를 위해 인접 리스트, 방향 블록, 거리별 합을 연속 배열에 저장해 작은 동적 할당을 없앴다.

## 9. 검증

- 공식 예제: `53`.
- 무작위 작은 입력 1,000개를 모든 맛집 부분집합 완전탐색과 대조: 모두 일치.
- 최대 크기 로컬 측정 (`N=M=100,000`): 체인 0.201초, 별 0.068초.
- JUNGOL 실제 제출: **419ms**.

### 제출 결과 캡처

![JUNGOL 4808 제출 결과 — 정답 100점, 419ms, 52.0MB, C++20](jungol_4808_accepted_419ms.png)

캡처 기준으로 제출 번호는 `13651924`이며, 결과는 **정답 100점**, 실행 시간은 **419ms**, 메모리는 **52.0MB**, 소스 길이는 **8,342B**다.

## 10. 최종 제출 코드와 구현 대응표

아래 코드는 JUNGOL에서 419ms를 기록한 최종 C++20 소스와 동일하다.

| 코드 요소 | 역할 | 풀이의 대응 절 |
|---|---|---|
| `jumpUp`, `up`, `depth_` | 맛집의 유일한 `top(c,r)` 계산 | 3절 |
| `buildCentroidDecomposition` | 센트로이드 조상·거리·방향과 거리합 블록 생성 | 5절 |
| `exactDistanceSum` | `Q(c,k)` 포함-배제 질의 | 5절 |
| `addDPValue` | 확정한 `DP[v]`를 조상 자료구조에 반영 | 6절 |
| 마지막 역순 `order` 순회 | 원래 트리의 후위 DP 및 A/B 전이 | 2절, 6절 |

```cpp
#pragma GCC optimize("O3,unroll-loops")
#include <bits/stdc++.h>
using namespace std;

using ll = long long;
constexpr int MAXN = 100000 + 5;
constexpr int LOG = 17;
constexpr int MAX_SUM = 3 * MAXN * LOG;

struct Restaurant {
    int center, radius;
    ll score;
};

int n, m;
int head[MAXN], edgeTo[2 * MAXN], edgeNext[2 * MAXN], edgeCount;
vector<Restaurant> startsAt[MAXN];

int up[MAXN][LOG], depth_[MAXN];
ll dp[MAXN];

bool removed_[MAXN];
int centroidParent[MAXN], centroidDepth[MAXN];
int centroidDist[MAXN][LOG], centroidSide[MAXN][LOG];
struct SideBlock { int offset, length; };
int allOffset[MAXN], allLength[MAXN];
SideBlock sideBlock[2 * MAXN];
ll distanceSums[MAX_SUM];
int distanceSumEnd;

int parentInComponent[MAXN], subtreeSize[MAXN];
vector<int> componentNodes, componentStack;
struct WalkState { int v, parent, dist; };
vector<WalkState> sideWalk;

inline void addEdge(int a, int b) {
    edgeTo[edgeCount] = b;
    edgeNext[edgeCount] = head[a];
    head[a] = edgeCount++;
}

[[gnu::always_inline]] inline int jumpUp(int v, int distance) {
    for (int bit = 0; bit < LOG; ++bit) {
        if (distance & (1 << bit)) v = up[v][bit];
    }
    return v;
}

void buildCentroidDecomposition() {
    struct Job { int start, level, parent; };
    vector<Job> jobs;
    jobs.reserve(n);
    jobs.push_back({1, 0, 0});
    componentNodes.reserve(n);
    componentStack.reserve(n);
    sideWalk.reserve(n);

    while (!jobs.empty()) {
        Job job = jobs.back();
        jobs.pop_back();

        componentNodes.clear();
        componentStack.clear();
        componentStack.push_back(job.start);
        parentInComponent[job.start] = 0;
        while (!componentStack.empty()) {
            int v = componentStack.back();
            componentStack.pop_back();
            componentNodes.push_back(v);
            for (int e = head[v]; e != -1; e = edgeNext[e]) {
                int y = edgeTo[e];
                if (removed_[y] || y == parentInComponent[v]) continue;
                parentInComponent[y] = v;
                componentStack.push_back(y);
            }
        }

        for (int i = (int)componentNodes.size() - 1; i >= 0; --i) {
            int v = componentNodes[i];
            subtreeSize[v] = 1;
            for (int e = head[v]; e != -1; e = edgeNext[e]) {
                int y = edgeTo[e];
                if (!removed_[y] && parentInComponent[y] == v) {
                    subtreeSize[v] += subtreeSize[y];
                }
            }
        }

        const int componentSize = (int)componentNodes.size();
        int centroid = componentNodes[0], bestPart = componentSize + 1;
        for (int v : componentNodes) {
            int largest = componentSize - subtreeSize[v];
            for (int e = head[v]; e != -1; e = edgeNext[e]) {
                int y = edgeTo[e];
                if (!removed_[y] && parentInComponent[y] == v) {
                    largest = max(largest, subtreeSize[y]);
                }
            }
            if (largest < bestPart) bestPart = largest, centroid = v;
        }

        removed_[centroid] = true;
        centroidParent[centroid] = job.parent;
        centroidDepth[centroid] = job.level;
        centroidDist[centroid][job.level] = 0;
        centroidSide[centroid][job.level] = -1;

        int maxDistance = 0;
        for (int side = head[centroid]; side != -1; side = edgeNext[side]) {
            int first = edgeTo[side];
            if (removed_[first]) continue;

            int sideMax = 0;
            sideWalk.clear();
            sideWalk.push_back({first, centroid, 1});
            while (!sideWalk.empty()) {
                WalkState cur = sideWalk.back();
                sideWalk.pop_back();
                centroidDist[cur.v][job.level] = cur.dist;
                centroidSide[cur.v][job.level] = side;
                sideMax = max(sideMax, cur.dist);
                for (int e = head[cur.v]; e != -1; e = edgeNext[e]) {
                    int y = edgeTo[e];
                    if (removed_[y] || y == cur.parent) continue;
                    sideWalk.push_back({y, cur.v, cur.dist + 1});
                }
            }
            sideBlock[side] = {distanceSumEnd, sideMax + 1};
            distanceSumEnd += sideMax + 1;
            maxDistance = max(maxDistance, sideMax);
        }
        allOffset[centroid] = distanceSumEnd;
        allLength[centroid] = maxDistance + 1;
        distanceSumEnd += maxDistance + 1;

        for (int e = head[centroid]; e != -1; e = edgeNext[e]) {
            int y = edgeTo[e];
            if (!removed_[y]) jobs.push_back({y, job.level + 1, centroid});
        }
    }
}

[[gnu::always_inline]] inline ll exactDistanceSum(int x, int r) {
    ll answer = 0;
    int c = x;
    for (int level = centroidDepth[x]; c != 0; --level, c = centroidParent[c]) {
        int target = r - centroidDist[x][level];
        if (target < 0) continue;
        if (target < allLength[c]) answer += distanceSums[allOffset[c] + target];
        int side = centroidSide[x][level];
        if (side != -1 && target < sideBlock[side].length) {
            answer -= distanceSums[sideBlock[side].offset + target];
        }
    }
    return answer;
}

[[gnu::always_inline]] inline void addDPValue(int x, ll value) {
    int c = x;
    for (int level = centroidDepth[x]; c != 0; --level, c = centroidParent[c]) {
        int distance = centroidDist[x][level];
        distanceSums[allOffset[c] + distance] += value;
        int side = centroidSide[x][level];
        if (side != -1) distanceSums[sideBlock[side].offset + distance] += value;
    }
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    cin >> n >> m;
    fill(head, head + n + 1, -1);
    for (int i = 1; i < n; ++i) {
        int a, b;
        cin >> a >> b;
        addEdge(a, b);
        addEdge(b, a);
    }

    vector<int> order;
    order.reserve(n);
    vector<int> stack = {1};
    while (!stack.empty()) {
        int v = stack.back();
        stack.pop_back();
        order.push_back(v);
        for (int e = head[v]; e != -1; e = edgeNext[e]) {
            int y = edgeTo[e];
            if (y == up[v][0]) continue;
            up[y][0] = v;
            depth_[y] = depth_[v] + 1;
            stack.push_back(y);
        }
    }
    for (int bit = 1; bit < LOG; ++bit) {
        for (int v = 1; v <= n; ++v) up[v][bit] = up[up[v][bit - 1]][bit - 1];
    }

    for (int i = 0; i < m; ++i) {
        int center, radius;
        ll score;
        cin >> center >> radius >> score;
        int top = jumpUp(center, min(depth_[center], radius));
        startsAt[top].push_back({center, radius, score});
    }

    buildCentroidDecomposition();

    for (int idx = n - 1; idx >= 0; --idx) {
        int x = order[idx];
        ll best = 0;
        for (int e = head[x]; e != -1; e = edgeNext[e]) {
            int y = edgeTo[e];
            if (up[y][0] == x) best += dp[y];
        }
        for (const Restaurant &restaurant : startsAt[x]) {
            best = max(best, restaurant.score +
                       exactDistanceSum(restaurant.center, restaurant.radius + 1));
        }
        dp[x] = best;
        addDPValue(x, best);
    }

    cout << dp[1] << '\n';
}
```

## 11. 최종 코드 핵심부 해설

이 절은 10절의 실제 제출 코드를 위에서 아래로 읽을 때 필요한 해설이다. 알고리즘 아이디어가 아니라, **왜 이 코드가 그 아이디어를 빠르게 구현하는지**에 초점을 둔다.

### 11.1 정적 인접 리스트 — `head`, `edgeTo`, `edgeNext`

```cpp
int head[MAXN], edgeTo[2 * MAXN], edgeNext[2 * MAXN], edgeCount;

inline void addEdge(int a, int b) {
    edgeTo[edgeCount] = b;
    edgeNext[edgeCount] = head[a];
    head[a] = edgeCount++;
}
```

트리는 간선이 `N-1`개이고 양방향으로 저장하므로 방향 간선은 최대 `2(N-1)`개다. `vector<vector<int>>` 대신 전방 연결 리스트를 썼다. `v`의 모든 이웃은 다음처럼 순회한다.

```cpp
for (int e = head[v]; e != -1; e = edgeNext[e]) {
    int y = edgeTo[e];
    // v -- y 간선 처리
}
```

이 표현은 메모리를 연속적으로 사용하고 작은 벡터의 동적 할당을 없앤다. 500ms 목표에서 중요한 상수 최적화다. `fill(head, head+n+1, -1)`이 반드시 입력 전에 실행되어야 빈 간선 목록의 끝 표식이 정확하다.

### 11.2 루팅과 이진 점프 — `order`, `up`, `jumpUp`

```cpp
vector<int> order;
vector<int> stack = {1};
while (!stack.empty()) {
    int v = stack.back(); stack.pop_back();
    order.push_back(v);
    // 자식 y에 up[y][0]=v, depth_[y]=depth_[v]+1 설정
}
```

`order`는 부모가 자식보다 먼저 들어가는 전위 순서다. 이후

```cpp
for (int idx = n - 1; idx >= 0; --idx)
```

로 역순회하면 자식이 먼저 처리되는 후위 DP가 된다. 재귀 DFS가 아니라 명시적 `stack`을 쓴 이유는 체인 트리에서 재귀 깊이가 `100,000`이 되어 스택 초과가 날 수 있기 때문이다.

`up[v][bit]`는 `v`의 `2^bit`번째 조상이다. `jumpUp(v,distance)`는 distance의 켜진 비트만 이동해 `O(log N)`에 조상을 구한다. 이 함수로 각 맛집이 등록될 유일한 `top`을 계산한다.

```cpp
int top = jumpUp(center, min(depth_[center], radius));
startsAt[top].push_back({center, radius, score});
```

`LOG=17`인 이유는 `2^17=131072 > 100000`이기 때문이다. 인덱스 `0..16`으로 모든 필요한 조상 이동과 센트로이드 깊이를 표현할 수 있다.

### 11.3 센트로이드 컴포넌트 수집 — `componentNodes`

```cpp
componentNodes.clear();
componentStack.clear();
componentStack.push_back(job.start);
parentInComponent[job.start] = 0;
while (!componentStack.empty()) {
    int v = componentStack.back(); componentStack.pop_back();
    componentNodes.push_back(v);
    for (...) {
        int y = edgeTo[e];
        if (removed_[y] || y == parentInComponent[v]) continue;
        parentInComponent[y] = v;
        componentStack.push_back(y);
    }
}
```

센트로이드 분해 작업 하나 `Job{start, level, parent}`는 아직 제거되지 않은 연결 컴포넌트 하나를 뜻한다. `removed_`인 정점은 이미 상위 단계 센트로이드이므로 건너지 않는다.

여기서 `parentInComponent`는 **원래 루트 트리의 부모가 아니다**. 현재 센트로이드 컴포넌트에서만 사용하는 임시 DFS 부모다. 이 부모를 이용해 `componentNodes`의 역순으로 서브트리 크기를 계산한다.

```cpp
for (int i = (int)componentNodes.size() - 1; i >= 0; --i) {
    int v = componentNodes[i];
    subtreeSize[v] = 1;
    for (...) if (parentInComponent[y] == v) subtreeSize[v] += subtreeSize[y];
}
```

### 11.4 센트로이드 선택 — `largest`의 의미

```cpp
int largest = componentSize - subtreeSize[v];
for (...) if (parentInComponent[y] == v) {
    largest = max(largest, subtreeSize[y]);
}
if (largest < bestPart) bestPart = largest, centroid = v;
```

현재 컴포넌트에서 `v`를 삭제하면 컴포넌트는 다음 조각으로 나뉜다.

- 임시 DFS에서 `v`의 각 자식 방향: 크기 `subtreeSize[y]`
- 임시 DFS 부모 방향: 나머지 `componentSize-subtreeSize[v]`

`largest`는 이 조각들 중 최댓값이다. 이를 최소화하는 `v`가 센트로이드다. 센트로이드의 정의에 의해 최대 조각은 전체의 절반 이하이며, 그래서 이후 `centroidParent`를 따라 올라가는 횟수가 `O(log N)`이다.

### 11.5 거리와 방향 라벨링 — `centroidDist`, `centroidSide`

센트로이드 `centroid`를 정한 뒤, 각 아직 살아 있는 이웃 방향을 따로 순회한다.

```cpp
for (int side = head[centroid]; side != -1; side = edgeNext[side]) {
    int first = edgeTo[side];
    if (removed_[first]) continue;
    sideWalk.push_back({first, centroid, 1});
    while (!sideWalk.empty()) {
        WalkState cur = sideWalk.back(); sideWalk.pop_back();
        centroidDist[cur.v][job.level] = cur.dist;
        centroidSide[cur.v][job.level] = side;
        ...
    }
}
```

정점 `x`에 대해 `centroidDist[x][level]`은 이 단계 센트로이드까지의 거리, `centroidSide[x][level]`은 센트로이드에서 `x`로 갈 때 처음 타는 **방향 간선 번호**다. 나중에 `all`에서 같은 방향만 빼기 위해 필요하다.

센트로이드 자신은 거리 0이고 특정 방향에 속하지 않으므로 `centroidSide[centroid][level] = -1`로 둔다.

### 11.6 거리합 메모리 풀 — `distanceSums`, `SideBlock`

```cpp
struct SideBlock { int offset, length; };
int allOffset[MAXN], allLength[MAXN];
SideBlock sideBlock[2 * MAXN];
ll distanceSums[MAX_SUM];
int distanceSumEnd;
```

논리적으로는 `all[z][d]`, `part[side][d]`라는 많은 배열이 필요하다. 각각을 `vector<ll>`로 할당하면 센트로이드 분해 중 작은 할당이 매우 많이 생긴다. 이 코드는 큰 전역 배열 하나에 필요한 구간을 차례로 예약한다.

```cpp
sideBlock[side] = {distanceSumEnd, sideMax + 1};
distanceSumEnd += sideMax + 1;

allOffset[centroid] = distanceSumEnd;
allLength[centroid] = maxDistance + 1;
distanceSumEnd += maxDistance + 1;
```

즉 `part[side][d]`는 실제로 `distanceSums[sideBlock[side].offset+d]`이고, `all[centroid][d]`는 `distanceSums[allOffset[centroid]+d]`이다.

`MAX_SUM = 3 * MAXN * LOG`의 근거는 한 센트로이드 컴포넌트 크기를 `S`라 할 때 다음과 같다.

- `all`의 길이는 최대 `S`.
- 모든 방향 `part` 길이의 합은 각 방향의 최대 깊이와 방향 수의 합으로, `2S` 미만.
- 따라서 한 컴포넌트가 쓰는 길이는 `3S` 미만이다.
- 같은 센트로이드 깊이의 컴포넌트 크기 합은 최대 `N`, 깊이는 최대 `LOG`.

그래서 전체 길이는 `3NlogN` 이하이고 전역 배열 크기가 충분하다.

### 11.7 거리 정확합 질의 — `exactDistanceSum`

```cpp
int target = r - centroidDist[x][level];
if (target < allLength[c]) answer += distanceSums[allOffset[c] + target];
int side = centroidSide[x][level];
if (side != -1 && target < sideBlock[side].length) {
    answer -= distanceSums[sideBlock[side].offset + target];
}
```

이 함수의 인자 `r`은 실제로 거리 `k`다. 코드에서는 맛집 후보 평가 시 `radius+1`을 전달한다.

현재 센트로이드 조상 `c`에서 질의 중심 `x`까지 거리가 `centroidDist[x][level]`이므로, 거리 `k`인 점은 `c` 기준으로 `target=k-dist(c,x)` 거리에 있어야 한다. `all[c][target]`을 더한 뒤, `x`와 같은 방향에서 들어온 중복 `part[side][target]`을 뺀다. 이것이 5절의 포함-배제를 코드로 옮긴 정확한 부분이다.

### 11.8 DP 값 반영 — `addDPValue`

```cpp
distanceSums[allOffset[c] + distance] += value;
if (side != -1) {
    distanceSums[sideBlock[side].offset + distance] += value;
}
```

`DP[x]`가 확정되면 `x`의 모든 센트로이드 조상 `c`에서 거리 `distance=dist(c,x)` 칸에 이 값을 더한다. `x`가 `c` 자신이 아니라면 `x`가 속한 방향 `part`에도 같이 더한다.

따라서 이후 `exactDistanceSum`은 이미 처리된 모든 `DP` 값에 대해 정확한 거리합을 즉시 얻는다. 두 함수 모두 센트로이드 조상을 한 번씩만 지나므로 `O(log N)`이다.

### 11.9 마지막 후위 DP 루프

```cpp
ll best = 0;
for (...) if (up[y][0] == x) best += dp[y];

for (const Restaurant &restaurant : startsAt[x]) {
    best = max(best, restaurant.score +
               exactDistanceSum(restaurant.center, restaurant.radius + 1));
}
dp[x] = best;
addDPValue(x, best);
```

첫 번째 루프가 2절의 경우 A다. `up[y][0]==x`인 방향만 더하는 이유는 인접 정점 중 부모 방향은 포함하면 안 되기 때문이다.

두 번째 루프가 경우 B다. `startsAt[x]`에는 3절에서 설명한 대로 `x`가 공의 가장 위 경계가 되는 맛집만 있다. `radius+1` 거리의 경계 조각 DP 합에 맛집 점수를 더해 최대를 갱신한다.

마지막 `addDPValue`는 반드시 `dp[x]`가 완전히 결정된 **뒤** 호출해야 한다. 그래야 자기 자신이나 아직 처리되지 않은 부모의 값이 현재 후보 계산에 잘못 섞이지 않는다.

## References

[^official-dp]: [2021 KOI 2차 “맛집 추천” 공식 해설, pp. 1–2](https://assets.koi.or.kr/koi/2021/2/solutions/recommendation.pdf) — 루트 DP, 거리 `d_i+1` 경계 전이, 유일한 조상 시점.
[^official-centroid]: [2021 KOI 2차 “맛집 추천” 공식 해설, pp. 3–4](https://assets.koi.or.kr/koi/2021/2/solutions/recommendation.pdf) — 센트로이드 분해와 거리별 합의 포함-배제, `O((N+M)log N)` 최적화.
