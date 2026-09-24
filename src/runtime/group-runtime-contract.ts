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

export interface CommitRuntimeGroupTurnInput {
  groupId: string;
  /** 同群内稳定的逻辑回合键；重试必须复用。 */
  turnId: string;
  speakerId: string;
  userMessage: string;
  assistantMessage: string;
  occurredAt?: string;
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

