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
  getDocMap(): DocIndex;
  docs: Doc[];
}

export type AttachedItemFileType = "doc" | "file";
export type AttachedItemType = "auto" | "agent" | "always" | "related";
export interface AttachedItem {
  filePath: string;
  description?: string;
  content?: string;
  fileType: AttachedItemFileType;
  type: AttachedItemType;
}

export interface ContextItem {
  doc: Doc;
  type: AttachedItemType;
  linkedViaAnchor?: string;
}

export interface IDocContextService {
  buildContextItems(
    attachedFiles: string[],
    relevantDocsByDescription: string[]
  ): Promise<ContextItem[]>;
  buildContextOutput(attachedFiles: string[], relevantDocsByDescription: string[]): Promise<string>;
}

export interface IDocFormatterService {
  formatContextOutput(items: ContextItem[]): Promise<string>;
  formatDoc(item: ContextItem): Promise<string>;
}
