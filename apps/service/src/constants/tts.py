from enum import StrEnum
import os

from service.config_service import config_service


class QwenTTSVoice(StrEnum):
    """Voices supported by the 'qwen-tts-latest' model."""

    CHERRY = "Cherry"
    """芊悦 - 阳光积极、亲切自然小姐姐 - 女性"""

    ETHAN = "Ethan"
    """晨煦 - 标准普通话，带部分北方口音。阳光、温暖、活力、朝气 - 男性"""

    SERENA = "Serena"
    """苏瑶 - 温柔小姐姐 - 女性"""

    CHELSIE = "Chelsie"
    """千雪 - 二次元虚拟女友 - 女性"""

    JADA = "Jada"
    """上海-阿珍 - 风风火火的沪上阿姐 - 女性"""

    DYLAN = "Dylan"
    """北京-晓东 - 北京胡同里长大的少年 - 男性"""

    SUNNY = "Sunny"
    """四川-晴儿 - 甜到你心里的川妹子 - 女性"""


AUTO_VOICE = "auto"
QWEN_TTS_LATEST_MODEL = "qwen-tts-latest"

_QWEN_TTS_LATEST_VOICES = [
    QwenTTSVoice.CHERRY.value,
    QwenTTSVoice.ETHAN.value,
    QwenTTSVoice.SERENA.value,
    QwenTTSVoice.CHELSIE.value,
    QwenTTSVoice.JADA.value,
    QwenTTSVoice.DYLAN.value,
    QwenTTSVoice.SUNNY.value,
]


def get_qwen_tts_model() -> str:
    configured_model = config_service.get("qwen_tts_model", QWEN_TTS_LATEST_MODEL)
    if isinstance(configured_model, str) and configured_model.strip() == QWEN_TTS_LATEST_MODEL:
        return QWEN_TTS_LATEST_MODEL
    if os.getenv("QWEN_TTS_MODEL", "").strip() == QWEN_TTS_LATEST_MODEL:
        return QWEN_TTS_LATEST_MODEL
    return QWEN_TTS_LATEST_MODEL


def get_supported_voices(model: str | None = None) -> list[str]:
    return list(_QWEN_TTS_LATEST_VOICES)


def get_all_voices() -> list[str]:
    return get_supported_voices()


def coerce_voice_selection(voice: str | None) -> str:
    if voice == AUTO_VOICE or voice in get_all_voices():
        return voice or AUTO_VOICE
    return AUTO_VOICE


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
    if voice in get_all_voices():
        return get_qwen_tts_model()
    raise ValueError(f"Unsupported voice: {voice}")


def get_voice_options() -> list[dict[str, str]]:
    model_name = get_qwen_tts_model()
    options = [{"label": "Auto", "value": AUTO_VOICE, "model": "random"}]
    options.extend(
        {"label": voice, "value": voice, "model": model_name}
        for voice in get_supported_voices(model_name)
    )
    return options
