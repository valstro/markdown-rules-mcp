# Usage Instructions

*   You **must** call the `get_relevant_docs` MCP tool before providing your first response in any new chat session.
*   After the initial call in a chat, you should **only** call `get_relevant_docs` again if one of these specific situations occurs:
    *   The user explicitly requests it.
    *   The user attaches new files.
    *   The user's query introduces a completely new topic unrelated to the previous discussion.