import importlib

from agents.tool import Tool

_REGISTERED_TOOLS: list[Tool] = []
_DEFAULT_TOOLS_LOADED = False


def register_tool(tool: Tool) -> Tool:
    """Register a tool so future agent runs include it automatically."""
    if any(existing_tool.name == tool.name for existing_tool in _REGISTERED_TOOLS):
        return tool

    _REGISTERED_TOOLS.append(tool)
    return tool


def _ensure_default_tools_loaded() -> None:
    global _DEFAULT_TOOLS_LOADED
    if _DEFAULT_TOOLS_LOADED:
        return

    importlib.import_module("service.bilibili_agent_tool")
    _DEFAULT_TOOLS_LOADED = True


def get_agent_tools() -> list[Tool]:
    """Return a copy of the registered agent tools."""
    _ensure_default_tools_loaded()
    return list(_REGISTERED_TOOLS)
