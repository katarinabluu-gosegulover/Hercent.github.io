# Hercent Archive

GitHub Pages용 카테고리 기반 정적 블로그 템플릿입니다.

## 현재 저장소 이름 기준 주소

- 지금 이름 `Hercent.github.io`를 유지하면 프로젝트 사이트 주소는 `https://katarinabluu-gosegulover.github.io/Hercent.github.io/` 입니다.
- 대표 개인 사이트 주소 `https://katarinabluu-gosegulover.github.io/` 로 쓰려면 저장소 이름을 `katarinabluu-gosegulover.github.io` 로 바꿔야 합니다.

## 배포 설정

1. GitHub 저장소에서 `Settings` > `Pages` 로 이동합니다.
2. `Build and deployment` 에서 `Source` 를 `Deploy from a branch` 로 선택합니다.
3. Branch는 `main`, Folder는 `/(root)` 를 선택하고 저장합니다.
4. 첫 배포는 보통 몇 분 안에 완료되지만 GitHub 문서 기준 최대 10분 정도 걸릴 수 있습니다.

## 카테고리 구조

- `categories/projects.html`: 프로젝트 관련 글
- `categories/notes.html`: 공부, 디자인, 아이디어 노트
- `categories/archive.html`: 활동 기록과 회고
- `posts/index.html`: 전체 글 목록을 카테고리별로 재정리한 페이지

## 수정 포인트

- 메인 소개 문구: `index.html`
- 카테고리 허브: `categories/index.html`
- 카테고리 상세 페이지: `categories/*.html`
- 전체 글 목록: `posts/index.html`
- 샘플 글: `posts/first-steps.html`, `posts/design-note.html`, `posts/activity-note.html`
- 전체 디자인: `assets/styles.css`

GitHub Pages 공식 문서:
[GitHub Pages 사이트 만들기](https://docs.github.com/ko/pages/getting-started-with-github-pages/creating-a-github-pages-site)
