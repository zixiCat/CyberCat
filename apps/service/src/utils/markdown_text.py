import re

_CODE_BLOCK_RE = re.compile(r"```(?:[\w+-]+)?\s*(.*?)```", re.DOTALL)
_IMAGE_RE = re.compile(r"!\[([^\]]*)\]\([^\)]+\)")
_LINK_RE = re.compile(r"\[([^\]]+)\]\([^\)]+\)")
_BOLD_RE = re.compile(r"(?<!\*)\*\*(.+?)\*\*(?!\*)|(?<!_)__(.+?)__(?!_)")
_ITALIC_RE = re.compile(r"(?<!\w)\*(?!\*)(.+?)(?<!\*)\*(?!\w)|(?<!\w)_(?!_)(.+?)(?<!_)_(?!\w)")
_STRIKETHROUGH_RE = re.compile(r"~~(.+?)~~")
_INLINE_CODE_RE = re.compile(r"`([^`]+)`")
_LINE_PREFIX_RE = re.compile(r"^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s+|\[(?: |x|X)\]\s+)")
_RULE_RE = re.compile(r"^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$")


def _unwrap_match_groups(match: re.Match[str]) -> str:
    return next((group for group in match.groups() if group is not None), "")


def _strip_inline_markdown(text: str) -> str:
    for pattern in (_BOLD_RE, _ITALIC_RE, _STRIKETHROUGH_RE, _INLINE_CODE_RE):
        text = pattern.sub(_unwrap_match_groups, text)
    return text


def markdown_to_plain_text_single_line(text: str) -> str:
    sanitized = _CODE_BLOCK_RE.sub(lambda match: match.group(1).strip(), text or "")
    sanitized = _IMAGE_RE.sub(r"\1", sanitized)
    sanitized = _LINK_RE.sub(r"\1", sanitized)

    cleaned_lines: list[str] = []
    normalized_newlines = sanitized.replace("\r\n", "\n").replace("\r", "\n")
    for line in normalized_newlines.split("\n"):
        line = line.strip()
        if not line or _RULE_RE.match(line):
            continue

        line = _LINE_PREFIX_RE.sub("", line)
        line = _strip_inline_markdown(line).strip()
        if line:
            cleaned_lines.append(line)

    return re.sub(r"\s+", " ", " ".join(cleaned_lines)).strip()
