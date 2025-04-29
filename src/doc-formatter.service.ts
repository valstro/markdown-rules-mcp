import { AttachedItem, DocContextSections, IDocFormatterService, DocLink } from "./types.js";

export class DocFormatterService implements IDocFormatterService {
  /**
   * Formats a prepared AttachedItem (doc or file) for inclusion in the context.
   * Assumes content has already been processed for inlines if applicable.
   */
  formatDoc(item: AttachedItem): string {
    // Trim empty lines at start and end of content while preserving internal empty lines
    const trimmedContent = item.content?.replace(/^\s*\n+|\n+\s*$/g, "");

    if (item.isMarkdown) {
      // Format as <doc> for markdown
      const escapedDescription = item.description?.replace(/"/g, "&quot;");
      const descAttr = escapedDescription ? ` description="${escapedDescription}"` : "";
      return `<doc${descAttr} file="${item.filePath}">\n${trimmedContent}\n</doc>`;
    } else {
      // Format as <file> for non-markdown
      return `<file file="${item.filePath}">\n${trimmedContent}\n</file>`;
    }
  }

  /**
   * Formats the content for an inline inclusion.
   */
  formatInlineDoc(link: DocLink, content: string): string {
    const trimmedContent = content.replace(/^\s*\n+|\n+\s*$/g, "");
    const escapedDescription = link.anchorText.replace(/"/g, "&quot;");
    const descAttr = ` description="${escapedDescription}"`;
    const fileAttr = ` file="${link.filePath}"`;
    let linesAttr = "";
    if (link.inlineLinesRange) {
      linesAttr = ` lines="${link.inlineLinesRange.from}-${link.inlineLinesRange.to}"`;
    }

    // Return the content wrapped in the inline tag
    return `<inline_doc${descAttr}${fileAttr}${linesAttr}>\n${trimmedContent}\n</inline_doc>`;
  }

  /**
   * Formats the final context to be passed back to the agent.
   */
  formatContext(sections: DocContextSections): string {
    const formattedSections = [];

    if (sections.alwaysAttachedDocs.length > 0) {
      formattedSections.push(
        "<global_rules>\n" +
          sections.alwaysAttachedDocs.map((item) => this.formatDoc(item)).join("\n\n") +
          "\n</global_rules>"
      );
    }

    if (sections.relatedAttachedFiles.length > 0) {
      formattedSections.push(
        "<related_files>\n" +
          sections.relatedAttachedFiles.map((item) => this.formatDoc(item)).join("\n\n") +
          "\n</related_files>"
      );
    }

    if (sections.relatedAttachedDocs.length > 0) {
      formattedSections.push(
        "<related_docs>\n" +
          sections.relatedAttachedDocs.map((item) => this.formatDoc(item)).join("\n\n") +
          "\n</related_docs>"
      );
    }

    if (sections.autoAttachedDocs.length > 0) {
      formattedSections.push(
        "<auto_attached_docs>\n" +
          sections.autoAttachedDocs.map((item) => this.formatDoc(item)).join("\n\n") +
          "\n</auto_attached_docs>"
      );
    }

    if (sections.agentAttachedDocs.length > 0) {
      formattedSections.push(
        "<agent_attached_docs>\n" +
          sections.agentAttachedDocs.map((item) => this.formatDoc(item)).join("\n\n") +
          "\n</agent_attached_docs>"
      );
    }

    return formattedSections.join("\n\n");
  }
}
