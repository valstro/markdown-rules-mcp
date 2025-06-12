# Usage Instructions

## When to use "get_relevant_docs" tool

*   You **must** call the "get_relevant_docs" MCP tool before providing your first response in any new chat session.
*   After the initial call in a chat, you should **only** call "get_relevant_docs" again if one of these specific situations occurs:
    *   The user explicitly requests it.
    *   The user attaches new files.
    *   The user's query introduces a completely new topic unrelated to the previous discussion.

## How to use "get_relevant_docs" tool

*   "attachedFiles": ALWAYS include file paths the user has attached in their query.
*   "projectDocs"
    *   ONLY include project docs that are VERY RELEVANT to user's query.
    *   You must have a high confidence when picking docs that may be relevant.
    *   If the user's query is a generic question unrelated to this specific project, leave this empty.
    *   Always heavily bias towards leaving this empty.