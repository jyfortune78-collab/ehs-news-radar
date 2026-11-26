#!/usr/bin/env python3
"""안전보건 뉴스 수집기.

Google News RSS(키워드 검색)에서 안전보건 관련 기사를 모아
data/news.json 과 data/news.js 로 저장한다.
- news.js 는 index.html 을 파일로 직접 열어도(file://) 동작하게 하기 위한 것.
- 이전 수집분과 병합하여 최근 RETAIN_DAYS 일치를 보관한다.

사용법:  python scripts/fetch_news.py
"""
import html
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
KST = timezone(timedelta(hours=9))

RETAIN_DAYS = 60      # 보관 기간
MAX_ITEMS = 600       # 최대 보관 건수
FRESH_WINDOW = "14d"  # 각 검색에서 가져올 기간

# 수집 키워드 (Google News 검색어). 필요한 만큼 추가/삭제하세요.
QUERIES = [
    "중대재해", "산업재해", "산업안전보건법", "중대재해처벌법",
    "산재 사망사고", "추락 사고 건설현장", "끼임 사고 공장",
    "화학물질 누출", "폭발 화재 공장", "질식 사고 밀폐공간",
    "직업병 산업보건", "고용노동부 안전보건", "안전보건공단",
    "위험성평가", "근로감독 산업안전", "폭염 근로자 온열질환",
]

# 카테고리 분류 규칙 (위에서부터 먼저 맞는 것 하나 + 태그로 모두 표시)
CATEGORIES = [
    ("사고·재해", ["사망", "숨져", "숨진", "추락사", "끼임", "깔려", "질식", "감전", "붕괴",
                   "중대재해 발생", "부상", "중상", "다쳐", "참변", "사고 발생", "작업 중"]),
    ("화재·폭발·화학", ["폭발", "화재", "누출", "유출", "화학물질", "가스", "유해물질", "불산", "암모니아"]),
    ("예방·교육", ["예방", "교육", "캠페인", "협약", "협의체", "수상", "우수", "컨설팅", "훈련",
                   "지원", "점검 실시", "선포", "출범", "공모", "세미나", "포럼"]),
    ("법령·정책", ["법", "시행령", "개정", "고시", "지침", "입법", "정책", "제도", "처벌",
                   "기소", "판결", "재판", "송치", "과태료", "과징금", "감독", "점검", "단속"]),
    ("산업보건", ["직업병", "직업성", "보건", "온열", "폭염", "근골격", "석면", "분진", "소음",
                  "과로", "스트레스", "건강", "감염", "미세먼지"]),
    ("건설안전", ["건설", "공사", "비계", "굴착", "타워크레인", "시공"]),
]
DEFAULT_CATEGORY = "일반"

# 안전보건과 무관한 노이즈 제거용 제외어
EXCLUDE = ["주가", "목표가", "분양", "부동산 시세", "연예", "게임", "프로야구", "K리그"]
# 최소한 하나는 포함해야 하는 안전보건 관련어
MUST_ANY = ["안전", "재해", "산재", "사고", "사망", "중대재해", "위험", "보건", "화재", "폭발",
            "누출", "직업", "근로", "노동", "작업", "추락", "질식", "감독", "점검"]

UA = "Mozilla/5.0 (compatible; EHS-News-Radar/1.0)"


def build_url(query: str) -> str:
    q = f"{query} when:{FRESH_WINDOW}"
    params = urllib.parse.urlencode(
        {"q": q, "hl": "ko", "gl": "KR", "ceid": "KR:ko"})
    return f"https://news.google.com/rss/search?{params}"


def fetch(query: str):
    url = build_url(query)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=20) as r:
            root = ET.fromstring(r.read())
    except Exception as e:  # 네트워크/파싱 오류는 해당 검색어만 건너뜀
        print(f"  ! '{query}' 실패: {e}", file=sys.stderr)
        return []
    items = []
    for it in root.iter("item"):
        title = html.unescape((it.findtext("title") or "").strip())
        link = (it.findtext("link") or "").strip()
        pub = it.findtext("pubDate")
        src_el = it.find("source")
        source = (src_el.text or "").strip() if src_el is not None else ""
        # Google News 제목은 "제목 - 매체" 형식
        if source and title.endswith(f" - {source}"):
            title = title[: -len(source) - 3].strip()
        elif " - " in title and not source:
            title, source = title.rsplit(" - ", 1)
        try:
            dt = parsedate_to_datetime(pub).astimezone(KST)
        except Exception:
            continue
        items.append({"title": title, "link": link, "source": source or "출처 미상",
                      "published": dt.isoformat(), "query": query})
    print(f"  - {query}: {len(items)}건")
    return items


def classify(title: str):
    tags = [name for name, kws in CATEGORIES if any(k in title for k in kws)]
    return (tags[0] if tags else DEFAULT_CATEGORY), tags


def norm(title: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", title)[:40]


def relevant(title: str) -> bool:
    if any(x in title for x in EXCLUDE):
        return False
    return any(k in title for k in MUST_ANY)


def main():
    DATA_DIR.mkdir(exist_ok=True)
    print("뉴스 수집 중...")
    with ThreadPoolExecutor(max_workers=6) as ex:
        results = list(ex.map(fetch, QUERIES))

    merged = {}
    # 기존 데이터 불러오기
    old_path = DATA_DIR / "news.json"
    if old_path.exists():
        try:
            for a in json.loads(old_path.read_text(encoding="utf-8")).get("items", []):
                merged[norm(a["title"])] = a
        except Exception:
            pass

    for items in results:
        for a in items:
            if not relevant(a["title"]):
                continue
            key = norm(a["title"])
            cat, tags = classify(a["title"])
            a["category"], a["tags"] = cat, tags
            if key in merged:
                # 이미 있으면 검색어만 보강
                qs = set(merged[key].get("queries", [merged[key].get("query", "")]))
                qs.add(a["query"])
                merged[key]["queries"] = sorted(q for q in qs if q)
                continue
            a["queries"] = [a.pop("query")]
            merged[key] = a

    cutoff = datetime.now(KST) - timedelta(days=RETAIN_DAYS)
    items = [a for a in merged.values()
             if datetime.fromisoformat(a["published"]) >= cutoff]
    for a in items:
        a.pop("query", None)
        # 분류 규칙이 바뀌어도 기존 기사에 반영되도록 매번 재분류
        a["category"], a["tags"] = classify(a["title"])
    items.sort(key=lambda a: a["published"], reverse=True)
    items = items[:MAX_ITEMS]

    payload = {"updated": datetime.now(KST).isoformat(timespec="seconds"),
               "count": len(items), "items": items}
    (DATA_DIR / "news.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    (DATA_DIR / "news.js").write_text(
        "window.NEWS_DATA = " + json.dumps(payload, ensure_ascii=False) + ";\n",
        encoding="utf-8")
    print(f"완료: {len(items)}건 저장 (data/news.json, data/news.js)")


if __name__ == "__main__":
    main()
