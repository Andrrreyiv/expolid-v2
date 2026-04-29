"""Lightweight extractive summarization (no model) for voice-memo transcripts
and free-text notes about an exhibition lead.

The output is intentionally short and structured: 1–3 high-signal sentences
plus up to ~6 key phrases. Russian-aware: stopword list and basic tokenizer
that keeps Cyrillic letters.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Iterable

# A small Russian/English stopword list — covers function words that drown out
# real signal in TF/IDF-style scoring.
STOPWORDS = set(
    """
а без более больше будет будем буду будут бы был была были было быть в вам вас весь во вот все всего всех всю всё вы где говорил говорить да давай давайте даже для до его ее ей ему если есть еще ещё же зачем здесь и из или им их к как кажется какая какие какое каком какому какую как-то когда кого кому который котором которую которые который которым которыми которых ком кому когда кто куда ли либо лишь меня мне между мной мое моей моем моему моя мы на над надо нам не него нее ней нем нет неё нам ни ничего но ну о об обычно один она они оно от перед по под после потом потому почти при про с свое своему со совсем стало так также такие такой там те тебе тем теперь то тогда тоже только том тот тут ты у уже уж хоть хотя чего чем что чтобы это эти этим этих эту этой этого этом этому я
a about an and any are as at be because been before being but by could do does did for from had has have here how i if in into is it its itself just may might must my no not now of on once one only or other our out should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who why will with would yet you your
""".split()
)

# Keep cyrillic + latin letters + digits + dashes
TOKEN_RE = re.compile(r"[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\-]+|\d+[A-Za-zА-Яа-яЁё]*")
SENT_END_RE = re.compile(r"(?<=[\.\!\?…])\s+(?=[A-ZА-ЯЁ0-9])")


def _split_sentences(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    parts: list[str] = []
    for chunk in text.splitlines():
        chunk = chunk.strip()
        if not chunk:
            continue
        # Try splitting on sentence boundaries; if the chunk doesn't have
        # punctuation, keep it whole — short utterances should still survive.
        sub = SENT_END_RE.split(chunk)
        for s in sub:
            s = s.strip()
            if len(s) >= 2:
                parts.append(s)
    return parts


def _tokens(text: str) -> list[str]:
    return [t.lower() for t in TOKEN_RE.findall(text)]


def _content_tokens(tokens: Iterable[str]) -> list[str]:
    return [t for t in tokens if t not in STOPWORDS and len(t) > 2]


def summarize(text: str, *, max_sentences: int = 3, max_phrases: int = 6) -> dict:
    """Return a dict with keys 'summary' (str) and 'phrases' (list[str]).

    'summary' joins the top-ranked sentences in original order; 'phrases'
    is a list of the most frequent content words.
    """
    text = (text or "").strip()
    if not text:
        return {"summary": "", "phrases": []}

    sentences = _split_sentences(text)
    if not sentences:
        return {"summary": "", "phrases": []}

    all_tokens = _content_tokens(_tokens(text))
    freq = Counter(all_tokens)
    most_common = [w for w, _ in freq.most_common(max_phrases)]

    if len(sentences) <= max_sentences:
        return {"summary": " ".join(sentences), "phrases": most_common}

    scored: list[tuple[int, float, str]] = []
    for idx, s in enumerate(sentences):
        toks = _content_tokens(_tokens(s))
        if not toks:
            continue
        score = sum(freq[t] for t in toks) / max(1, len(toks))
        # mild positional boost for the first sentence
        if idx == 0:
            score *= 1.1
        scored.append((idx, score, s))

    scored.sort(key=lambda x: -x[1])
    chosen_idx = sorted(idx for idx, _, _ in scored[:max_sentences])
    summary = " ".join(sentences[i] for i in chosen_idx)

    return {"summary": summary, "phrases": most_common}
