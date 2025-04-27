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
}

export interface IDocParserService {
  parse(fileName: string, fileContent: string): Doc;
  getBlankDoc(fileName: string, content?: string, isError?: boolean): Doc;
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
}
