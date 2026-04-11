from agents import Agent, ModelSettings, OpenAIChatCompletionsModel, RunConfig, Runner
from agents.result import RunResultStreaming
from agents.run import TResponseInputItem
from agents.tracing import set_tracing_disabled
from openai import AsyncOpenAI

from service.agent_tools import get_agent_tools
from service.config_service import config_service

set_tracing_disabled(True)


class AgentService:
    """Creates configured agent runs for the desktop task pipeline."""

    def __init__(self) -> None:
        self.reload_config()

    def reload_config(self) -> None:
        self.api_key = str(config_service.get("openai_api_key") or "").strip()
        self.base_url = str(config_service.get("openai_base_url") or "").strip()
        self.model_name = str(config_service.get("openai_model") or "").strip()
        self.enable_thinking = config_service.get_bool("openai_enable_thinking")

    def run_streamed(
        self,
        input_items: list[TResponseInputItem],
        system_prompt: str | None = None,
    ) -> RunResultStreaming:
        self._validate_config()
        agent = Agent(
            name="CyberCat",
            instructions=self._build_instructions(system_prompt),
            tools=get_agent_tools(),
            model=self._build_model(),
            model_settings=self._build_model_settings(),
        )
        return Runner.run_streamed(
            agent,
            input=input_items,
            max_turns=10,
            run_config=RunConfig(
                tracing_disabled=True,
                workflow_name="CyberCat Chat Task",
            ),
        )

    def _build_model(self) -> OpenAIChatCompletionsModel:
        client = AsyncOpenAI(base_url=self.base_url, api_key=self.api_key)
        return OpenAIChatCompletionsModel(model=self.model_name, openai_client=client)

    def _build_model_settings(self) -> ModelSettings:
        return ModelSettings(
            include_usage=True,
            extra_body={"enable_thinking": self._supports_thinking()},
        )

    def _build_instructions(self, system_prompt: str | None) -> str | None:
        prompt = (system_prompt or "").strip()
        return prompt or None

    def _supports_thinking(self) -> bool:
        return self.enable_thinking and "qwen" in self.model_name.lower()

    def _validate_config(self) -> None:
        missing = []
        if not self.api_key:
            missing.append("openai_api_key")
        if not self.base_url:
            missing.append("openai_base_url")
        if not self.model_name:
            missing.append("openai_model")
        if missing:
            joined = ", ".join(missing)
            raise ValueError(f"Agent configuration is incomplete: {joined}")


agent_service = AgentService()
