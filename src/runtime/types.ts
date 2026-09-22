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
  updatedAt: string;
}

export interface RelationshipState {
  targetId: string;
  dimensions: Record<string, Score>;
  closeness: Score;
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
  targetId?: string;
  occurredAt?: string;
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
  };
  relationshipDelta?: {
    targetId?: string;
    dimensions?: Record<string, Score>;
    closeness?: Score;
  };
  resolveEpisodeId?: string;
  memory?: {
    type: MemoryType;
    content: string;
    importance?: Score;
    targetId?: string;
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
  salience: Score;
  targetId?: string;
  sourceEventId?: string;
  occurredAt: string;
  lastAccessedAt?: string;
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
}

export interface RuntimeSnapshotStore {
  load(characterId: string): Promise<RuntimeSnapshot | null>;
  commit(snapshot: RuntimeSnapshot, expectedVersion: number): Promise<void>;
  initialize?(snapshot: RuntimeSnapshot): Promise<void>;
}

export interface RuntimeEventInput {
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
}

export interface RuntimeReduceResult {
  snapshot: RuntimeSnapshot;
  event: DomainEvent;
  stateChange: StateChange;
  createdMemory?: MemoryRecord;
  changedEpisode?: Episode;
}
