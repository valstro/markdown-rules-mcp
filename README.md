# Markdown Rules MCP Server

TODO: Allow lines to also jusst include the lines (even if not inline)

@config.ts @doc-context.service.ts @doc-index.service.test.ts @doc-index.service.ts @doc-formatter.service.ts @doc-parser.service.test.ts @doc-parser.service.ts @file-system.service.ts @link-extractor.service.test.ts @link-extractor.service.ts @index.ts @logger.ts @types.ts @util.ts 

Continue and finish the implementation for `doc-context.service.ts`. 

Consider the following things:

- alwaysApply is always added to alwaysAttachedDocs
- autoAttachedDocs are docs that should be attached because their glob patterns match an included file (`attachedFiles` arg in buildContext) - use minmatch here
- agentAttachedDocs are docs that come from `relevantDocsByDescription`. Just look them up by the filePath and add them to this array. 
- relatedAttachedFiles & relatedAttachedDocs are things that are NOT included inline and are things that have been linked to in any of the other doc types.
- If a linked doc has an inline, then we should not include anywhere, but we should include the inline in the context, but wrapped in an <inline_doc description="Anchor Text" file="doc.md"> tag.
- If a linked doc has a range, then we should only include the content of the range in the context. Make sure to specify the range in the attributes like <inline_doc description="Anchor Text" file="doc.md" lines="1-10">
- If a doc path from `attachedFiles` that exists in our index, then we should include it in `autoAttachedDocs`
- no duplicates (unless we are inlining) - so de-dupe everything across all arrays. Follow the priority of the arrays. Remove duplicates from the lower priority arrays. The order of priority top to bottom is:
  - alwaysAttachedDocs
  - relatedFiles
  - relatedDocs
  - autoAttachedDocs
  - agentAttachedDocs
- We want an option on how to hoist the docs in their respective arrays. We can either hoist them to the top of the array or the bottom. If to the top, it's a Topological Sort - Post-Order Traversal. Otherwise, it's a Topological Sort - Pre-Order Traversal.
