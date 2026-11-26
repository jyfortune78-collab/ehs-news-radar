# EHS 뉴스 레이더

산업안전·보건 뉴스를 Google News RSS에서 모아 보여주는 정적 웹사이트입니다.

## 사용법
1. `update.bat` 더블클릭 (또는 `py scripts/fetch_news.py`) → 최신 뉴스 수집
2. `index.html` 을 브라우저로 열기 (서버 불필요)

## 구성
| 파일 | 역할 |
|---|---|
| `index.html`, `style.css`, `app.js` | 화면 (검색·카테고리·기간·매체 필터, 저장, 다크모드, 키워드/매체 순위) |
| `scripts/fetch_news.py` | 뉴스 수집·분류·중복 제거 (60일치 보관) |
| `data/news.json`, `data/news.js` | 수집 결과 (`news.js` 는 파일로 직접 열 때 사용) |
| `.github/workflows/update.yml` | GitHub에 올렸을 때 하루 3회 자동 갱신 (선택) |

## 커스터마이징 (`scripts/fetch_news.py` 상단)
- `QUERIES` : 수집 키워드 추가/삭제 (예: 자사명, 협력사명, "고압가스")
- `CATEGORIES` : 카테고리별 분류 키워드
- `EXCLUDE` / `MUST_ANY` : 노이즈 제거 규칙
- `RETAIN_DAYS` : 보관 기간

## 배포 (다른 사람과 공유)
GitHub Pages, Netlify, 사내 웹서버 등 어디든 폴더 전체를 올리면 됩니다.
GitHub Pages 사용 시 `update.yml` 이 데이터를 자동으로 갱신합니다.
