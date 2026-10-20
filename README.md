# Hercent Archive

GitHub Pages + Jekyll 기반의 카테고리형 개인 블로그입니다.  
글은 HTML을 직접 복붙하지 않고 Markdown으로 작성하면 됩니다.

## 주소

- 현재 저장소 이름을 유지하면 사이트 주소는 `https://katarinabluu-gosegulover.github.io/Hercent.github.io/` 입니다.

## 배포 방식

- 이 저장소는 `GitHub Actions`로 Pages를 배포합니다.
- 워크플로는 Jekyll 빌드를 실행한 뒤 `_site`를 배포합니다.
- `Settings > Pages` 에서 Source는 `GitHub Actions` 로 두어야 합니다.

## 디자인과 검증

공통 화면은 `assets/research.css`와 `assets/research.js`를 사용합니다.
기본 테마는 청흑색 배경과 선명한 초록·주황 포인트의 보안 연구 노트이며, 헤더에서 흰색 기반의 밝은 테마로 전환할 수 있습니다.
홈은 최근 글 6개, 전체 기록은 최신순 목록과 제목/요약/카테고리 검색을 제공합니다.
홈 대표 분석 카드는 `_data/spotlight.yml`에서 원문 URL, 설명, 이미지와 수치를 관리합니다.
수치는 연결한 글에 근거한 값만 사용하고, 원문이 없으면 카드를 표시하지 않습니다.
상단 실행 흐름 도식은 개념도이며 4초 동안 한 번 재생합니다. 동작 줄이기 설정에서는 정지합니다.
홈 도식의 포인터 기울기는 데스크톱의 정밀 포인터에서만 적용됩니다.
분야별 SVG 그래픽과 점 격자 배경을 사용하며, 스크롤 효과는 위치만 이동시켜 JavaScript 없이도 내용을 숨기지 않습니다.
GitHub 프로필 사진은 계정 이미지 URL을 그대로 사용합니다.
글과 기존 URL은 변경하지 않습니다. 별도 논문 슬라이드는 자체 레이아웃을 유지합니다.

로컬 검증 (Ruby/Jekyll 3.10, Node.js 및 Playwright 필요):

```sh
jekyll build
node tests/smoke.cjs
```

Playwright 브라우저가 없으면 `npx playwright install chromium`을 실행합니다.
이미 설치된 Edge를 사용하려면 `BROWSER_CHANNEL=msedge` 환경변수를 지정할 수 있습니다.

브라우저 테스트는 `_site`를 임시 로컬 서버로 제공하고 데스크톱/모바일 화면,
정렬, 검색, 테마 저장, 글의 탭 전환 및 JavaScript 비활성 상태를 점검합니다.
화면 캡처는 `test-results/`에 저장되며 배포와 Git에서는 제외됩니다.
기존 `assets/styles.css`와 `assets/site.js`는 보존하되 공통 화면에서는 불러오지 않습니다.

## 글 작성

새 글은 `_posts` 폴더에 Markdown 파일로 추가하면 됩니다.

파일 이름 형식:

```text
_posts/YYYY-MM-DD-slug.md
```

예시:

```text
_posts/2026-04-07-my-new-post.md
```

기본 템플릿:

```md
---
layout: post
title: 글 제목
page_description: 브라우저 설명 문구
category_key: blog-docs
summary: 목록 카드에 보일 짧은 설명
lead: 글 상단 리드 문장
featured: false
feature_order: 0
---

## 첫 섹션

여기에 Markdown으로 본문을 작성하면 됩니다.
```

## 사용 가능한 카테고리 키

- `projects`
- `development`
- `ctf-wargame`
- `bugbounty`
- `blog-docs`
- `papers-conferences`
- `contests-certifications`
- `achievements`

## 문서/PDF 올리기

- PDF 같은 파일은 `assets/docs/` 에 넣으면 됩니다.
- Markdown 본문 안에서 링크나 `iframe`으로 바로 연결할 수 있습니다.

## 참고

- GitHub Pages custom workflow docs:
  [Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
