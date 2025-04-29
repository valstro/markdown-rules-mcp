export interface DocMeta {
  description: string | undefined;
  globs: string[];
  alwaysApply: boolean;
}

export interface DocLinkRange {
  from: number;
  to: number | "end";
}

export interface DocLink {
  anchorText: string;
  filePath: string;
  isInline: boolean;
  inlineLinesRange?: DocLinkRange;
  startIndex: number;
  endIndex: number;
}

export interface Doc {
  contentLinesBeforeParsed: number;
  content: string;
  meta: DocMeta;
  filePath: string; // Absolute path to the file
  linksTo: DocLink[];
  isMarkdown: boolean;
  isError: boolean;
  errorReason?: string;
}

export type DocIndex = Map<string, Doc>;

export interface IFileSystemService {
  findFiles(): Promise<string[]>;
  readFile(path: string): Promise<string>;
  resolvePath(...paths: string[]): string;
  getDirname(relativeOrAbsolutePath: string): string;
  getProjectRoot(): string;
  pathExists(path: string): Promise<boolean>;
}

export type DocOverride = Partial<Pick<Doc, "content" | "isError" | "errorReason" | "isMarkdown">>;
export interface IDocParserService {
  parse(fileName: string, fileContent: string): Doc;
  getBlankDoc(fileName: string, docOverride?: DocOverride): Doc;
  isMarkdown(fileName: string): boolean;
}

export interface ILinkExtractorService {
  extractLinks(docFilePath: string, docContent: string): DocLink[];
}

export interface IDocIndexService {
  buildIndex(): Promise<DocIndex>;
  loadInitialDocs(): Promise<Set<string>>;
  recursivelyResolveAndLoadLinks(initialPathsToProcess: Set<string>): Promise<void>;
  getDoc(absoluteFilePath: string): Promise<Doc>;
  getDocs(absoluteFilePaths: string[]): Promise<Doc[]>;
  getAgentAttachableDocs(): Doc[];
}

export interface AttachedItem {
  filePath: string;
  description?: string;
  content?: string;
  isMarkdown: boolean;
}

export interface DocContextSections {
  autoAttachedDocs: AttachedItem[];
  agentAttachedDocs: AttachedItem[];
  alwaysAttachedDocs: AttachedItem[];
  relatedAttachedDocs: AttachedItem[];
  relatedAttachedFiles: AttachedItem[];
}

export interface IDocContextService {
  buildContext(attachedFiles: string[], relevantDocsByDescription: string[]): Promise<string>;
}

export interface Config {
  MARKDOWN_GLOB_PATTERN: string;
  PROJECT_ROOT: string;
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
  HOIST_ORDER: "pre" | "post";
}

export interface IDocFormatterService {
  formatDoc(item: AttachedItem): string;
  formatInlineDoc(link: DocLink, content: string): string;
  formatContext(sections: DocContextSections): string;
}
