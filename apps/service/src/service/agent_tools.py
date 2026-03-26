from agents.tool import Tool

_REGISTERED_TOOLS: list[Tool] = []


def register_tool(tool: Tool) -> Tool:
    """Register a tool so future agent runs include it automatically."""
    _REGISTERED_TOOLS.append(tool)
    return tool


def get_agent_tools() -> list[Tool]:
    """Return a copy of the registered agent tools."""
    return list(_REGISTERED_TOOLS)
