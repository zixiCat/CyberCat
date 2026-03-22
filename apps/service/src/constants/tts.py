from enum import StrEnum
import os


class Voice4InstructModel(StrEnum):
    """only work with 'qwen3-tts-instruct-flash'"""

    CHERRY = "Cherry"
    """芊悦 - 阳光积极、亲切自然小姐姐 - 女性"""

    MOMO = "Momo"
    """茉兔 - 撒娇搞怪，逗你开心 - 女性"""

    # ETHAN = "Ethan"
    # """晨煦 - 标准普通话，带部分北方口音。阳光、温暖、活力、朝气 - 男性"""

    SERENA = "Serena"
    """苏瑶 - 温柔小姐姐 - 女性"""

    CHELSIE = "Chelsie"
    """千雪 - 二次元虚拟女友 - 女性"""

    # VIVIAN = "Vivian"
    # """十三 - 拽拽的、可爱的小暴躁 - 女性"""


class Voice4NormalModel(StrEnum):
    """only work with 'qwen3-tts-flash'"""

    SUNNY = "Sunny"
    """四川-晴儿 - 甜到你心里的川妹子 - 女性"""

    RYAN = "Ryan"
    """甜茶 - 节奏拉满，戏感炸裂，真实与张力共舞 - 男性"""

    KIKI = "Kiki"
    """粤语-阿清 - 甜美的港妹闺蜜 - 女性"""


AUTO_VOICE = "auto"
INSTRUCT_MODEL = os.getenv("QWEN_TTS_INSTRUCT_MODEL", "qwen3-tts-instruct-flash")
NORMAL_MODEL = os.getenv("QWEN_TTS_NORMAL_MODEL", "qwen3-tts-flash")


def get_instruct_voices() -> list[str]:
    return [voice.value for voice in Voice4InstructModel]


def get_normal_voices() -> list[str]:
    return [voice.value for voice in Voice4NormalModel]


def get_all_voices() -> list[str]:
    return [*get_instruct_voices(), *get_normal_voices()]


def normalize_voice_pool(voices: list[str] | str | None) -> list[str]:
    if voices is None:
        return []

    if isinstance(voices, str):
        raw_values = [value.strip() for value in voices.split(",")]
    else:
        raw_values = [str(value).strip() for value in voices]

    valid_voices = set(get_all_voices())
    normalized: list[str] = []

    for voice in raw_values:
        if voice and voice in valid_voices and voice not in normalized:
            normalized.append(voice)

    return normalized


def get_voice_model(voice: str) -> str:
    if voice in get_instruct_voices():
        return INSTRUCT_MODEL
    if voice in get_normal_voices():
        return NORMAL_MODEL
    raise ValueError(f"Unsupported voice: {voice}")


def get_voice_options() -> list[dict[str, str]]:
    options = [{"label": "Auto", "value": AUTO_VOICE, "model": "random"}]
    options.extend(
        {"label": voice.value, "value": voice.value, "model": INSTRUCT_MODEL}
        for voice in Voice4InstructModel
    )
    options.extend(
        {"label": voice.value, "value": voice.value, "model": NORMAL_MODEL}
        for voice in Voice4NormalModel
    )
    return options
