# Markdown Rules MCP Server

## TODOs

- [ ] Limit the number of docs & context that can be attached.
- [ ] Add a max depth to the attachment search.
- [ ] Restrict certain file types from being attached.


Continue and finish the implementation for `doc-context.service.ts`. You may need to refactor other services to support the new functionality & change the doc-context.service.ts itself to support the new functionality.

Keep the implementation simple & clean but implement ALL of the following requirements:

- docs need to be converted into AttachedItem objects first.
- the type ("auto" | "agent" | "always" | "related") are assigned as follows:
  - "auto" - if the doc's glob pattern matches any of the file paths in the `attachedFiles` array (use existing micromatch library)
  - "agent" - if the doc's filePath is in the `relevantDocsByDescription` array
  - "always" - if the doc has the property `alwaysApply` set to true
  - "related" - if the doc or file is linked to from another doc.
- if a linked doc has an inline, then we should not include it as an attached item. instead, we should include the inline doc/file in the content of the parent doc in the position of the link (replacing the link). linked docs should be wrapped in an <inline_doc description="Anchor Text" file="doc.md"> tag.
- if a linked doc has a range, then we should only include the content of the range in the context. Make sure to specify the range in the attributes like <inline_doc description="Anchor Text" file="doc.md" lines="1-10">
- avoid duplicates across the attached items but allow duplicates with inline docs.
- Add a new config option & sort behavior to specify the order of how the attached items are displayed in the context. Make it easy to add new sort options in the future.
  - the order should be either:
    - `topologically sorted (post-order traversal)` - where the docs are sorted by their dependencies and by their type (always, related, auto, agent). dependents should be listed before their parents.
    - `topologically sorted (pre-order traversal)` - where the docs are sorted by their dependencies and by their type (always, related, auto, agent). parents should be listed before their dependents.
