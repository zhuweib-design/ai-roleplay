/** 浏览器与服务端共享的群聊契约，不依赖 SQL 实现。 */
export interface CreateRuntimeGroupInput {
  groupId: string;
  name: string;
  memberIds: string[];
}


export interface RuntimeGroupState {
  groupId: string;
  name: string;
  status: 'active' | 'archived';
  version: number;
  memberIds: string[];
}

export interface SetRuntimeGroupStatusInput {
  groupId: string;
  status: 'active' | 'archived';
  /** 可选乐观锁版本；不一致时返回 409，避免覆盖其他客户端的定义变更。 */
  expectedVersion?: number;
}

export interface CommitRuntimeGroupTurnInput {
  groupId: string;
  /** 同群内稳定的逻辑回合键；重试必须复用。 */
  turnId: string;
  speakerId: string;
  userMessage: string;
  assistantMessage: string;
  occurredAt?: string;
}

/**
 * 服务端可靠投递队列条目。
 * 客户端先入队（单条 INSERT 即可持久化），再尝试原子提交；
 * 提交失败时保留 pending，供显式重试。
 */
export interface RuntimeGroupOutboxEntry {
  groupId: string;
  turnId: string;
  speakerId: string;
  userMessage: string;
  assistantMessage: string;
  occurredAt: string;
  status: 'pending' | 'committed' | 'failed';
  attempts: number;
  lastError?: string;
  committedTurnId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeGroupTurn {
  id: string;
  groupId: string;
  turnId: string;
  sequenceNo: number;
  speakerId: string;
  userMessage: string;
  assistantMessage: string;
  occurredAt: string;
  eventIds: Record<string, string>;
}

export class GroupRuntimeError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'GroupRuntimeError';
  }
}

