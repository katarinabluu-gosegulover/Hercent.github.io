# Hercent Archive

GitHub Pages + Jekyll 기반의 카테고리형 개인 블로그입니다.  
이제 글은 HTML을 직접 복붙하지 않고 Markdown으로 작성하면 됩니다.

## 주소

- 현재 저장소 이름을 유지하면 사이트 주소는 `https://katarinabluu-gosegulover.github.io/Hercent.github.io/` 입니다.

## 배포 방식

- 이 저장소는 `GitHub Actions`로 Pages를 배포합니다.
- 워크플로는 Jekyll 빌드를 실행한 뒤 `_site`를 배포합니다.
- `Settings > Pages` 에서 Source는 `GitHub Actions` 로 두어야 합니다.

## 글 작성 방법

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

## 자동 반영되는 것

새 Markdown 글을 추가하면 아래 페이지에 자동으로 반영됩니다.

- 홈 `대표 글`
  `featured: true` 인 글만 표시
  필요하면 `feature_order` 로 순서 고정
- `posts/index.html`
  카테고리별 전체 글 목록
- `categories/index.html`
  카테고리별 글 수
- `categories/*.html`
  각 카테고리 상세 페이지

## 문서/PDF 올리기

- PDF 같은 파일은 `assets/docs/` 에 넣으면 됩니다.
- Markdown 본문 안에서 링크나 `iframe`으로 바로 연결할 수 있습니다.

## 참고

- GitHub Pages custom workflow docs:
  [Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
