/**
 * 数据银行 RAG 类型定义 (F09)
 *
 * 业务逻辑：
 * - 用户上传文本文档（TXT/MD/PDF文本/HTML），按段落分块存储
 * - 三层作用域：全局（global）/角色级（character）/聊天级（chat）
 * - 对话时从最近消息提取关键词，检索匹配段落注入提示词
 *
 * 规则约束：
 * - 单文件上限 5MB
 * - 段落按双换行分割，超过 2000 字符进一步切分
 * - 最大注入段数可配置（默认 3 段）
 */

/** 文档作用域 */
export type DataBankScope = 'global' | 'character' | 'chat';

/** 文档分块 */
export interface DocumentChunk {
  /** 块 ID（documentId + '-' + index） */
  id: string;
  /** 所属文档 ID */
  documentId: string;
  /** 块在文档中的序号（从 0 开始） */
  index: number;
  /** 块文本内容 */
  content: string;
  /** Token 计数（估算） */
  tokenCount: number;
}

/** 数据银行文档 */
export interface DataBankDocument {
  /** 文档 ID（UUID） */
  id: string;
  /** 文件名 */
  name: string;
  /** 作用域 */
  scope: DataBankScope;
  /** scope='character' 时绑定的角色 ID */
  characterId?: string;
  /** scope='chat' 时绑定的对话 ID */
  chatId?: string;
  /** 分块列表 */
  chunks: DocumentChunk[];
  /** 原始文件大小（字节） */
  fileSize: number;
  /** MIME 类型 */
  mimeType: string;
  /** 创建时间（ISO 字符串） */
  createdAt: string;
  /** 更新时间（ISO 字符串） */
  updatedAt: string;
}

/** RAG 检索结果 */
export interface RetrievedChunk {
  /** 匹配的块 */
  chunk: DocumentChunk;
  /** 所属文档名 */
  documentName: string;
  /** 所属文档 ID */
  documentId: string;
  /** 相关性得分（关键词命中数） */
  score: number;
  /** 命中的关键词列表 */
  matchedKeywords: string[];
}

/** RAG 注入配置 */
export interface RAGConfig {
  /** 最大注入段数（默认 3） */
  maxChunks?: number;
  /** 注入深度（默认 0，即用户消息之前） */
  depth?: number;
  /** 关键词提取的消息条数（默认 5） */
  recentMessageCount?: number;
  /** 最大关键词数（默认 20） */
  maxKeywords?: number;
}

/** 默认 RAG 配置 */
export const DEFAULT_RAG_CONFIG: Required<RAGConfig> = {
  maxChunks: 3,
  depth: 0,
  recentMessageCount: 5,
  maxKeywords: 20,
};

/** 单文件大小上限（5MB） */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** 单块最大字符数 */
export const MAX_CHUNK_LENGTH = 2000;
