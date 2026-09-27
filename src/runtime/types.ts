/**
 * Virtual Character OS Runtime Core 的领域类型。
 *
 * 这些类型刻意不依赖 Vue、HTTP 客户端或具体数据库，便于在浏览器、Tauri
 * 和未来的 PostgreSQL 服务端之间复用同一套确定性核心。
 */

export type Score = number;
export type Metadata = Record<string, unknown>;

export type EmotionName = string;
export type EpisodeStatus = 'active' | 'cooling' | 'dormant' | 'reopened' | 'resolved';
export type MemoryType = 'semantic' | 'episodic' | 'relational' | 'procedural';
export type MemoryReviewStatus = 'candidate' | 'confirmed' | 'rejected' | 'forgotten';
export type MemoryReviewAction = 'confirm' | 'reject' | 'forget';

export interface EmotionState {
  emotion: EmotionName;
  intensity: Score;
  baseline: Score;
  halfLifeSeconds: number;
  updatedAt: string;
}

export interface MoodState {
  valence: Score;
  arousal: Score;
  dominance: Score;
  baselineValence: Score;
  baselineArousal: Score;
  baselineDominance: Score;
  halfLifeSeconds: number;
  updatedAt: string;
}

export interface AttitudeState {
  targetId: string;
  liking: Score;
  salience: Score;
  confidence: Score;
  evidenceCount: number;
  /** 可选的长期态度半衰期；未配置时保持历史行为，不自动衰减。 */
  halfLifeSeconds?: number;
  baselineLiking?: Score;
  baselineSalience?: Score;
  baselineConfidence?: Score;
  updatedAt: string;
}

export interface RelationshipState {
  targetId: string;
  dimensions: Record<string, Score>;
  closeness: Score;
  /** 可选的关系半衰期；未配置时保持历史行为，不自动衰减。 */
  halfLifeSeconds?: number;
  baselineCloseness?: Score;
  baselineDimensions?: Record<string, Score>;
  updatedAt: string;
}

export interface Episode {
  id: string;
  targetId?: string;
  topic?: string;
  status: EpisodeStatus;
  startedAt: string;
  lastEventAt: string;
  resolvedAt?: string;
  currentIntensity: Score;
  peakIntensity: Score;
  salience: Score;
  residualInfluence: Score;
  unresolved: boolean;
  eventIds: string[];
}

export interface CharacterProfile {
  displayName: string;
  description?: string;
  speakingStyle?: string;
  boundaries?: string[];
}

export interface CharacterTrait {
  key: string;
  value: Score;
  locked?: boolean;
}

export interface CharacterValue {
  key: string;
  importance: Score;
  locked?: boolean;
}

export interface CharacterBelief {
  key: string;
  statement: string;
  confidence: Score;
  locked?: boolean;
}

export interface CharacterGoal {
  key: string;
  description: string;
  priority: Score;
  active: boolean;
}

export interface SeedMemory {
  type: MemoryType;
  content: string;
  importance?: Score;
  confidence?: Score;
  targetId?: string;
  occurredAt?: string;
  validFrom?: string;
  validUntil?: string;
}

export interface CharacterDefinition {
  id: string;
  tenantId: string;
  archetypeId?: string;
  profile: CharacterProfile;
  traits: CharacterTrait[];
  values: CharacterValue[];
  beliefs: CharacterBelief[];
  goals: CharacterGoal[];
  preferences: Record<string, Score>;
  emotions: EmotionState[];
  mood: MoodState;
  attitudes: AttitudeState[];
  relationships: RelationshipState[];
  seedMemories: SeedMemory[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ArchetypeTemplate {
  id: string;
  name: string;
  profile?: Partial<CharacterProfile>;
  traits?: CharacterTrait[];
  values?: CharacterValue[];
  beliefs?: CharacterBelief[];
  goals?: CharacterGoal[];
  preferences?: Record<string, Score>;
  defaultEmotions?: Array<Partial<EmotionState> & Pick<EmotionState, 'emotion'>>;
  defaultMood?: Partial<MoodState>;
}

export interface CharacterDelta {
  profile?: Partial<CharacterProfile>;
  traits?: Array<Partial<CharacterTrait> & Pick<CharacterTrait, 'key'>>;
  values?: Array<Partial<CharacterValue> & Pick<CharacterValue, 'key'>>;
  beliefs?: Array<Partial<CharacterBelief> & Pick<CharacterBelief, 'key'>>;
  goals?: Array<Partial<CharacterGoal> & Pick<CharacterGoal, 'key'>>;
  preferences?: Record<string, Score>;
  emotions?: Array<Partial<EmotionState> & Pick<EmotionState, 'emotion'>>;
  mood?: Partial<MoodState>;
}

export interface CharacterCompileInput {
  tenantId: string;
  id?: string;
  archetype?: ArchetypeTemplate;
  delta?: CharacterDelta;
  profile?: Partial<CharacterProfile>;
  seedMemories?: SeedMemory[];
  now?: string;
}

export interface EventEffects {
  emotionDeltas?: Record<EmotionName, Score>;
  moodDelta?: Partial<Pick<MoodState, 'valence' | 'arousal' | 'dominance'>>;
  attitudeDelta?: {
    targetId?: string;
    liking?: Score;
    salience?: Score;
    confidence?: Score;
    halfLifeSeconds?: number;
    baselineLiking?: Score;
    baselineSalience?: Score;
    baselineConfidence?: Score;
  };
  relationshipDelta?: {
    targetId?: string;
    dimensions?: Record<string, Score>;
    closeness?: Score;
    halfLifeSeconds?: number;
    baselineCloseness?: Score;
    baselineDimensions?: Record<string, Score>;
  };
  resolveEpisodeId?: string;
  memory?: {
    type: MemoryType;
    content: string;
    importance?: Score;
    confidence?: Score;
    targetId?: string;
    validFrom?: string;
    validUntil?: string;
  };
  memoryReview?: {
    memoryId: string;
    action: MemoryReviewAction;
  };
}

export interface DomainEvent {
  id: string;
  tenantId: string;
  characterId: string;
  actorId?: string;
  targetId?: string;
  eventType: string;
  topic?: string;
  importance: Score;
  payload: Metadata;
  effects?: EventEffects;
  occurredAt: string;
  sourceTurnId?: string;
  /** 可选的规范化 Turn UUID 列表，用于建立一个 Event 与多条原始 Turn 的关联。 */
  sourceTurnIds?: string[];
}

/**
 * Appraisal Engine 的结构化评价结果。
 * 评价是事件到状态之间的中间产物，不等同于最终情绪，也不直接写入 Prompt。
 */
export interface AppraisalResult {
  importance: Score;
  goalRelevance: Score;
  valueViolation: Score;
  betrayal: Score;
  threat: Score;
  loss: Score;
  socialSignificance: Score;
  surprise: Score;
  targetSalience: Score;
  /** 按人格敏感度、关系和目标相关性合成的本轮影响强度。 */
  impact: Score;
  reasons: string[];
}

/** Behavior Planner 输出的表达策略，不生成自然语言。 */
export interface BehaviorPlan {
  goal: string;
  strategy: string;
  assertiveness: Score;
  warmth: Score;
  directness: Score;
  emotionExpression: Record<string, Score>;
  constraints: string[];
  speechDirectives: Record<string, unknown>;
  confidence: Score;
}

export interface StateChange {
  id: string;
  eventId: string;
  characterId: string;
  occurredAt: string;
  stateVersion: number;
  stateType: string;
  dimension: string;
  targetId?: string;
  oldValue?: number;
  delta: number;
  newValue?: number;
  changes: Metadata;
}

export interface MemoryRecord {
  id: string;
  characterId: string;
  type: MemoryType;
  content: string;
  importance: Score;
  confidence?: Score;
  salience: Score;
  targetId?: string;
  sourceEventId?: string;
  occurredAt: string;
  validFrom?: string;
  validUntil?: string;
  reviewStatus?: MemoryReviewStatus;
  reviewedAt?: string;
  lastAccessedAt?: string;
}

export type ContextSourceType =
  | 'identity'
  | 'state'
  | 'turn'
  | 'memory'
  | 'event'
  | 'episode'
  | 'goal'
  | 'behavior_plan'
  | 'summary';

export interface ContextBuildItem {
  sourceType: ContextSourceType;
  sourceId?: string;
  rank: number;
  relevanceScore?: Score;
  tokenCount?: number;
}

export interface ContextBuildRecord {
  id: string;
  characterId: string;
  conversationId?: string;
  turnId?: string;
  modelProvider?: string;
  modelName?: string;
  totalTokenCount?: number;
  createdAt: string;
  items: ContextBuildItem[];
}

export interface RuntimeSnapshot {
  character: CharacterDefinition;
  events: DomainEvent[];
  stateChanges: StateChange[];
  memories: MemoryRecord[];
  episodes: Episode[];
  version: number;
  updatedAt: string;
}

export interface RuntimeContextRequest {
  query?: string;
  targetId?: string;
  now?: string;
  maxEvents?: number;
  maxMemories?: number;
  maxEpisodes?: number;
  conversationId?: string;
  turnId?: string;
  modelProvider?: string;
  modelName?: string;
}

export interface RuntimeContext {
  identity: CharacterProfile;
  traits: CharacterTrait[];
  values: CharacterValue[];
  beliefs: CharacterBelief[];
  currentState: {
    emotions: EmotionState[];
    mood: MoodState;
    attitudes: AttitudeState[];
    relationships: RelationshipState[];
  };
  recentEvents: DomainEvent[];
  relevantMemories: MemoryRecord[];
  relevantEpisodes: Episode[];
  appraisal?: AppraisalResult;
  behaviorPlan?: BehaviorPlan;
  contextBuild?: ContextBuildRecord;
}

export interface RuntimeCharacterListRequest {
  tenantId: string;
  limit?: number;
  cursor?: string;
}

export interface RuntimeCharacterListResult {
  items: CharacterDefinition[];
  nextCursor?: string;
}

export interface RuntimeSnapshotStore {
  listCharacters?(request: RuntimeCharacterListRequest): Promise<RuntimeCharacterListResult>;
  /** 服务端可选的原始对话持久化端口；本地快照实现可不提供。 */
  recordConversationTurn?(input: RuntimeConversationTurnInput): Promise<RuntimeConversationTurnResult>;
  /** 将原始双 Turn 和 Runtime Event 放入同一个服务端事务。 */
  commitConversationTurn?(snapshot: RuntimeSnapshot, expectedVersion: number, input: RuntimeConversationTurnInput): Promise<RuntimeConversationTurnResult>;
  /** 记录上下文组装来源；失败不应阻塞聊天主链路。 */
  recordContextBuild?(record: ContextBuildRecord): Promise<void>;
  load(characterId: string): Promise<RuntimeSnapshot | null>;
  commit(snapshot: RuntimeSnapshot, expectedVersion: number): Promise<void>;
  initialize?(snapshot: RuntimeSnapshot): Promise<void>;
}

export interface RuntimeConversationTurnInput {
  /** 客户端稳定轮次键；服务端据此生成 user/character 两条 UUID Turn。 */
  turnId: string;
  tenantId: string;
  characterId: string;
  /** 多会话键；未提供时按租户和角色使用默认会话。 */
  conversationKey?: string;
  sessionKey?: string;
  userMessage: string;
  assistantMessage: string;
  occurredAt?: string;
  metadata?: Metadata;
}

export interface RuntimeConversationTurnResult {
  conversationId: string;
  sessionId: string;
  userTurnId: string;
  assistantTurnId: string;
}

export interface RuntimeConversationTurnEventInput {
  tenantId: string;
  turn: Omit<RuntimeConversationTurnInput, 'characterId' | 'tenantId'>;
  event: Omit<RuntimeEventInput, 'characterId' | 'tenantId'>;
}

export interface RuntimeConversationTurnCommitResult {
  turn: RuntimeConversationTurnResult;
  result: RuntimeReduceResult;
}

export interface RuntimeEventInput {
  /** 客户端重试或服务端幂等写入使用的稳定事件 ID。 */
  eventId?: string;
  tenantId: string;
  characterId: string;
  eventType: string;
  importance?: Score;
  targetId?: string;
  topic?: string;
  actorId?: string;
  payload?: Metadata;
  effects?: EventEffects;
  occurredAt?: string;
  sourceTurnId?: string;
  sourceTurnIds?: string[];
}

export interface RuntimeReduceResult {
  snapshot: RuntimeSnapshot;
  event: DomainEvent;
  stateChange: StateChange;
  createdMemory?: MemoryRecord;
  changedEpisode?: Episode;
  appraisal?: AppraisalResult;
  behaviorPlan?: BehaviorPlan;
}
