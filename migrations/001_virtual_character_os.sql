-- Virtual Character OS v1.0
-- PostgreSQL 15+ recommended
-- Core principle: immutable raw history + append-only domain events + current-state projections.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 0. Characters / Identity
-- ============================================================

CREATE TABLE IF NOT EXISTS characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    archetype_id UUID NULL,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'archived', 'deleted')),
    schema_version INT NOT NULL DEFAULT 1 CHECK (schema_version > 0),
    state_version BIGINT NOT NULL DEFAULT 0 CHECK (state_version >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_characters_tenant_status
    ON characters (tenant_id, status);

CREATE TABLE IF NOT EXISTS character_profiles (
    character_id UUID PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    identity JSONB NOT NULL DEFAULT '{}'::jsonb,
    speech_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
    boundaries JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS character_traits (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    trait_key TEXT NOT NULL,
    value NUMERIC(5,4) NOT NULL CHECK (value BETWEEN 0 AND 1),
    confidence NUMERIC(5,4) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
    mutable BOOLEAN NOT NULL DEFAULT false,
    locked BOOLEAN NOT NULL DEFAULT false,
    source TEXT NOT NULL DEFAULT 'seed',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (character_id, trait_key)
);

CREATE INDEX IF NOT EXISTS idx_character_traits_key
    ON character_traits (trait_key);

CREATE TABLE IF NOT EXISTS character_values (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    value_key TEXT NOT NULL,
    strength NUMERIC(5,4) NOT NULL CHECK (strength BETWEEN 0 AND 1),
    priority INT NOT NULL DEFAULT 100,
    confidence NUMERIC(5,4) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
    locked BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (character_id, value_key)
);

CREATE TABLE IF NOT EXISTS character_beliefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    strength NUMERIC(5,4) NOT NULL DEFAULT 0.5 CHECK (strength BETWEEN 0 AND 1),
    confidence NUMERIC(5,4) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
    mutable BOOLEAN NOT NULL DEFAULT true,
    locked BOOLEAN NOT NULL DEFAULT false,
    source TEXT NOT NULL,
    source_event_id UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_character_beliefs_character
    ON character_beliefs (character_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS character_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    priority NUMERIC(5,4) NOT NULL DEFAULT 0.5 CHECK (priority BETWEEN 0 AND 1),
    progress NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 1),
    deadline TIMESTAMPTZ NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_character_goals_active
    ON character_goals (character_id, active, priority DESC);

-- ============================================================
-- 1. Archetypes / Fast Character Creation
-- ============================================================

CREATE TABLE IF NOT EXISTS archetypes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    base_traits JSONB NOT NULL DEFAULT '{}'::jsonb,
    base_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    base_beliefs JSONB NOT NULL DEFAULT '{}'::jsonb,
    base_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    base_behavior_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);

ALTER TABLE characters
    DROP CONSTRAINT IF EXISTS fk_characters_archetype;
ALTER TABLE characters
    ADD CONSTRAINT fk_characters_archetype
    FOREIGN KEY (archetype_id) REFERENCES archetypes(id) ON DELETE SET NULL;

-- ============================================================
-- 2. World / Targets / Attitudes / Relationships
-- ============================================================

CREATE TABLE IF NOT EXISTS targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    type TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    aliases TEXT[] NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, type, canonical_name)
);

CREATE INDEX IF NOT EXISTS idx_targets_lookup
    ON targets (tenant_id, type, canonical_name);

CREATE TABLE IF NOT EXISTS character_preferences (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
    dimension TEXT NOT NULL,
    score NUMERIC(6,4) NOT NULL CHECK (score BETWEEN -1 AND 1),
    baseline NUMERIC(6,4) NOT NULL DEFAULT 0 CHECK (baseline BETWEEN -1 AND 1),
    confidence NUMERIC(5,4) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
    salience NUMERIC(5,4) NOT NULL DEFAULT 0.5 CHECK (salience BETWEEN 0 AND 1),
    version BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (character_id, target_id, dimension)
);

CREATE INDEX IF NOT EXISTS idx_character_preferences_target
    ON character_preferences (target_id, dimension, score DESC);

CREATE TABLE IF NOT EXISTS character_attitudes (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
    dimension TEXT NOT NULL,
    score NUMERIC(6,4) NOT NULL CHECK (score BETWEEN -1 AND 1),
    baseline NUMERIC(6,4) NOT NULL DEFAULT 0 CHECK (baseline BETWEEN -1 AND 1),
    confidence NUMERIC(5,4) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
    salience NUMERIC(5,4) NOT NULL DEFAULT 0.5 CHECK (salience BETWEEN 0 AND 1),
    version BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (character_id, target_id, dimension)
);

CREATE INDEX IF NOT EXISTS idx_character_attitudes_target
    ON character_attitudes (target_id, dimension, score DESC);

CREATE TABLE IF NOT EXISTS character_relationships (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL DEFAULT 'acquaintance',
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'ended')),
    started_at TIMESTAMPTZ NULL,
    ended_at TIMESTAMPTZ NULL,
    version BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (character_id, target_id)
);

CREATE TABLE IF NOT EXISTS relationship_dimensions (
    character_id UUID NOT NULL,
    target_id UUID NOT NULL,
    dimension TEXT NOT NULL,
    score NUMERIC(6,4) NOT NULL CHECK (score BETWEEN 0 AND 1),
    baseline NUMERIC(6,4) NOT NULL DEFAULT 0 CHECK (baseline BETWEEN 0 AND 1),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (character_id, target_id, dimension),
    CONSTRAINT fk_relationship_dimensions_parent
        FOREIGN KEY (character_id, target_id)
        REFERENCES character_relationships(character_id, target_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_relationship_dimensions_target
    ON relationship_dimensions (target_id, dimension, score DESC);

-- ============================================================
-- 3. Runtime Emotional State
-- ============================================================

CREATE TABLE IF NOT EXISTS character_emotions (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    emotion_key TEXT NOT NULL,
    intensity NUMERIC(6,4) NOT NULL CHECK (intensity BETWEEN 0 AND 1),
    baseline NUMERIC(6,4) NOT NULL DEFAULT 0 CHECK (baseline BETWEEN 0 AND 1),
    half_life_seconds BIGINT NOT NULL CHECK (half_life_seconds > 0),
    source_event_id UUID NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (character_id, emotion_key)
);

CREATE INDEX IF NOT EXISTS idx_character_emotions_active
    ON character_emotions (character_id, intensity DESC);

CREATE TABLE IF NOT EXISTS character_mood (
    character_id UUID PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    valence NUMERIC(6,4) NOT NULL CHECK (valence BETWEEN -1 AND 1),
    arousal NUMERIC(6,4) NOT NULL CHECK (arousal BETWEEN 0 AND 1),
    baseline_valence NUMERIC(6,4) NOT NULL DEFAULT 0 CHECK (baseline_valence BETWEEN -1 AND 1),
    baseline_arousal NUMERIC(6,4) NOT NULL DEFAULT 0.3 CHECK (baseline_arousal BETWEEN 0 AND 1),
    half_life_seconds BIGINT NOT NULL DEFAULT 21600 CHECK (half_life_seconds > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version BIGINT NOT NULL DEFAULT 0
);

-- ============================================================
-- 4. Conversation / Context Storage
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    participant_id UUID NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'closed', 'archived')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_conversations_character_activity
    ON conversations (character_id, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS conversation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sessions_conversation
    ON conversation_sessions (conversation_id, started_at DESC);

CREATE TABLE IF NOT EXISTS conversation_turns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
    sequence_no BIGINT NOT NULL CHECK (sequence_no >= 0),
    speaker_type TEXT NOT NULL
        CHECK (speaker_type IN ('user', 'character', 'system', 'tool')),
    speaker_id UUID NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    token_count INT NULL CHECK (token_count >= 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (session_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_turns_session_created
    ON conversation_turns (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_turns_speaker
    ON conversation_turns (speaker_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conversation_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
    start_sequence BIGINT NOT NULL,
    end_sequence BIGINT NOT NULL,
    topic TEXT NULL,
    summary TEXT NULL,
    importance NUMERIC(5,4) NOT NULL DEFAULT 0.5 CHECK (importance BETWEEN 0 AND 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_sequence >= start_sequence)
);

CREATE INDEX IF NOT EXISTS idx_segments_session_range
    ON conversation_segments (session_id, start_sequence, end_sequence);

CREATE TABLE IF NOT EXISTS context_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_id UUID NOT NULL REFERENCES conversation_segments(id) ON DELETE CASCADE,
    summary_type TEXT NOT NULL DEFAULT 'segment',
    content TEXT NOT NULL,
    facts JSONB NOT NULL DEFAULT '[]'::jsonb,
    targets JSONB NOT NULL DEFAULT '[]'::jsonb,
    events JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. Domain Events / Causal State Changes
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    actor_id UUID NULL,
    target_id UUID NULL REFERENCES targets(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    importance NUMERIC(5,4) NOT NULL DEFAULT 0.5 CHECK (importance BETWEEN 0 AND 1),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_character_time
    ON events (character_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_target_time
    ON events (target_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_type_time
    ON events (event_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS event_turn_links (
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    turn_id UUID NOT NULL REFERENCES conversation_turns(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'evidence'
        CHECK (role IN ('evidence', 'trigger', 'context')),
    PRIMARY KEY (event_id, turn_id)
);

CREATE INDEX IF NOT EXISTS idx_event_turn_links_turn
    ON event_turn_links (turn_id);

CREATE TABLE IF NOT EXISTS state_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    state_type TEXT NOT NULL,
    target_id UUID NULL REFERENCES targets(id) ON DELETE SET NULL,
    dimension TEXT NOT NULL,
    old_value NUMERIC(10,4) NULL,
    delta NUMERIC(10,4) NOT NULL,
    new_value NUMERIC(10,4) NULL,
    reason JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_state_changes_character_time
    ON state_changes (character_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_state_changes_event
    ON state_changes (event_id);

CREATE INDEX IF NOT EXISTS idx_state_changes_target
    ON state_changes (target_id, dimension, created_at DESC);

-- ============================================================
-- 6. Emotion Episodes / Peaks
-- ============================================================

CREATE TABLE IF NOT EXISTS emotion_episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    episode_type TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    peak_at TIMESTAMPTZ NULL,
    recovered_at TIMESTAMPTZ NULL,
    peak_emotion TEXT NULL,
    peak_intensity NUMERIC(5,4) NULL CHECK (peak_intensity BETWEEN 0 AND 1),
    resolution TEXT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_emotion_episodes_character_time
    ON emotion_episodes (character_id, started_at DESC);

CREATE TABLE IF NOT EXISTS emotion_episode_events (
    episode_id UUID NOT NULL REFERENCES emotion_episodes(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    ordinal INT NOT NULL DEFAULT 0,
    PRIMARY KEY (episode_id, event_id)
);

-- ============================================================
-- 7. Long-term Memory
-- ============================================================

CREATE TABLE IF NOT EXISTS memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    memory_type TEXT NOT NULL
        CHECK (memory_type IN ('semantic', 'episodic', 'relational', 'procedural')),
    content TEXT NOT NULL,
    target_id UUID NULL REFERENCES targets(id) ON DELETE SET NULL,
    importance NUMERIC(5,4) NOT NULL DEFAULT 0.5 CHECK (importance BETWEEN 0 AND 1),
    confidence NUMERIC(5,4) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
    salience NUMERIC(5,4) NOT NULL DEFAULT 0.5 CHECK (salience BETWEEN 0 AND 1),
    occurred_at TIMESTAMPTZ NULL,
    valid_from TIMESTAMPTZ NULL,
    valid_until TIMESTAMPTZ NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_memories_character_type_time
    ON memories (character_id, memory_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_memories_character_target
    ON memories (character_id, target_id, importance DESC);

CREATE INDEX IF NOT EXISTS idx_memories_validity
    ON memories (character_id, valid_from, valid_until);

CREATE INDEX IF NOT EXISTS idx_memories_importance
    ON memories (character_id, importance DESC, salience DESC);

CREATE TABLE IF NOT EXISTS memory_sources (
    memory_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    event_id UUID NULL REFERENCES events(id) ON DELETE SET NULL,
    turn_id UUID NULL REFERENCES conversation_turns(id) ON DELETE SET NULL,
    weight NUMERIC(5,4) NOT NULL DEFAULT 1 CHECK (weight BETWEEN 0 AND 1),
    CHECK (event_id IS NOT NULL OR turn_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_sources_event
    ON memory_sources (memory_id, event_id)
    WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_memory_sources_turn
    ON memory_sources (memory_id, turn_id)
    WHERE turn_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS idx_memory_sources_event
    ON memory_sources (event_id);

CREATE INDEX IF NOT EXISTS idx_memory_sources_turn
    ON memory_sources (turn_id);

-- ============================================================
-- 8. Runtime Behavior Planning
-- ============================================================

CREATE TABLE IF NOT EXISTS behavior_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    conversation_id UUID NULL REFERENCES conversations(id) ON DELETE SET NULL,
    event_id UUID NULL REFERENCES events(id) ON DELETE SET NULL,
    goal TEXT NOT NULL,
    strategy TEXT NOT NULL,
    constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
    speech_directives JSONB NOT NULL DEFAULT '{}'::jsonb,
    confidence NUMERIC(5,4) NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_behavior_plans_character_time
    ON behavior_plans (character_id, created_at DESC);

-- ============================================================
-- 9. State Snapshots / Versioning / Audit
-- ============================================================

CREATE TABLE IF NOT EXISTS state_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    event_sequence BIGINT NOT NULL,
    state JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (character_id, event_sequence)
);

CREATE INDEX IF NOT EXISTS idx_state_snapshots_character_time
    ON state_snapshots (character_id, event_sequence DESC);

CREATE TABLE IF NOT EXISTS character_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    version_no INT NOT NULL,
    change_type TEXT NOT NULL,
    snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (character_id, version_no)
);

CREATE TABLE IF NOT EXISTS state_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    actor_type TEXT NOT NULL
        CHECK (actor_type IN ('system', 'llm', 'user', 'admin', 'migration')),
    actor_id UUID NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NULL,
    before_state JSONB NULL,
    after_state JSONB NULL,
    reason JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_character_time
    ON state_audit_logs (character_id, created_at DESC);

-- ============================================================
-- 10. Context Assembly Observability
-- ============================================================

CREATE TABLE IF NOT EXISTS context_builds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    conversation_id UUID NULL REFERENCES conversations(id) ON DELETE SET NULL,
    turn_id UUID NULL REFERENCES conversation_turns(id) ON DELETE SET NULL,
    model_provider TEXT NULL,
    model_name TEXT NULL,
    total_token_count INT NULL CHECK (total_token_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS context_build_items (
    context_build_id UUID NOT NULL REFERENCES context_builds(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL
        CHECK (source_type IN ('identity', 'state', 'turn', 'memory', 'event', 'episode', 'goal', 'behavior_plan', 'summary')),
    source_id UUID NULL,
    rank INT NOT NULL DEFAULT 0,
    relevance_score NUMERIC(8,5) NULL,
    token_count INT NULL CHECK (token_count >= 0),
    PRIMARY KEY (context_build_id, source_type, source_id, rank)
);

-- ============================================================
-- 11. Timestamp maintenance
-- ============================================================

CREATE OR REPLACE FUNCTION vc_os_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_characters_updated_at ON characters;
CREATE TRIGGER trg_characters_updated_at
BEFORE UPDATE ON characters
FOR EACH ROW EXECUTE FUNCTION vc_os_set_updated_at();

DROP TRIGGER IF EXISTS trg_character_profiles_updated_at ON character_profiles;
CREATE TRIGGER trg_character_profiles_updated_at
BEFORE UPDATE ON character_profiles
FOR EACH ROW EXECUTE FUNCTION vc_os_set_updated_at();

DROP TRIGGER IF EXISTS trg_character_beliefs_updated_at ON character_beliefs;
CREATE TRIGGER trg_character_beliefs_updated_at
BEFORE UPDATE ON character_beliefs
FOR EACH ROW EXECUTE FUNCTION vc_os_set_updated_at();

DROP TRIGGER IF EXISTS trg_character_goals_updated_at ON character_goals;
CREATE TRIGGER trg_character_goals_updated_at
BEFORE UPDATE ON character_goals
FOR EACH ROW EXECUTE FUNCTION vc_os_set_updated_at();

DROP TRIGGER IF EXISTS trg_archetypes_updated_at ON archetypes;
CREATE TRIGGER trg_archetypes_updated_at
BEFORE UPDATE ON archetypes
FOR EACH ROW EXECUTE FUNCTION vc_os_set_updated_at();

DROP TRIGGER IF EXISTS trg_targets_updated_at ON targets;
CREATE TRIGGER trg_targets_updated_at
BEFORE UPDATE ON targets
FOR EACH ROW EXECUTE FUNCTION vc_os_set_updated_at();

DROP TRIGGER IF EXISTS trg_character_preferences_updated_at ON character_preferences;
CREATE TRIGGER trg_character_preferences_updated_at
BEFORE UPDATE ON character_preferences
FOR EACH ROW EXECUTE FUNCTION vc_os_set_updated_at();

DROP TRIGGER IF EXISTS trg_character_attitudes_updated_at ON character_attitudes;
CREATE TRIGGER trg_character_attitudes_updated_at
BEFORE UPDATE ON character_attitudes
FOR EACH ROW EXECUTE FUNCTION vc_os_set_updated_at();

DROP TRIGGER IF EXISTS trg_character_relationships_updated_at ON character_relationships;
CREATE TRIGGER trg_character_relationships_updated_at
BEFORE UPDATE ON character_relationships
FOR EACH ROW EXECUTE FUNCTION vc_os_set_updated_at();

DROP TRIGGER IF EXISTS trg_relationship_dimensions_updated_at ON relationship_dimensions;
CREATE TRIGGER trg_relationship_dimensions_updated_at
BEFORE UPDATE ON relationship_dimensions
FOR EACH ROW EXECUTE FUNCTION vc_os_set_updated_at();

DROP TRIGGER IF EXISTS trg_character_emotions_updated_at ON character_emotions;
CREATE TRIGGER trg_character_emotions_updated_at
BEFORE UPDATE ON character_emotions
FOR EACH ROW EXECUTE FUNCTION vc_os_set_updated_at();

DROP TRIGGER IF EXISTS trg_character_mood_updated_at ON character_mood;
CREATE TRIGGER trg_character_mood_updated_at
BEFORE UPDATE ON character_mood
FOR EACH ROW EXECUTE FUNCTION vc_os_set_updated_at();

DROP TRIGGER IF EXISTS trg_context_summaries_updated_at ON context_summaries;
CREATE TRIGGER trg_context_summaries_updated_at
BEFORE UPDATE ON context_summaries
FOR EACH ROW EXECUTE FUNCTION vc_os_set_updated_at();

DROP TRIGGER IF EXISTS trg_memories_updated_at ON memories;
CREATE TRIGGER trg_memories_updated_at
BEFORE UPDATE ON memories
FOR EACH ROW EXECUTE FUNCTION vc_os_set_updated_at();

-- ============================================================
-- 12. Immutable history guards
-- ============================================================

CREATE OR REPLACE FUNCTION vc_os_block_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Immutable history: %.% cannot be modified after creation', TG_TABLE_SCHEMA, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_events_immutable_update ON events;
CREATE TRIGGER trg_events_immutable_update
BEFORE UPDATE OR DELETE ON events
FOR EACH ROW EXECUTE FUNCTION vc_os_block_history_mutation();

DROP TRIGGER IF EXISTS trg_state_changes_immutable_update ON state_changes;
CREATE TRIGGER trg_state_changes_immutable_update
BEFORE UPDATE OR DELETE ON state_changes
FOR EACH ROW EXECUTE FUNCTION vc_os_block_history_mutation();

-- ============================================================
-- 13. Optional pgvector support
-- Run only if pgvector is installed/approved in the target environment.
-- ============================================================

-- CREATE EXTENSION IF NOT EXISTS vector;
-- ALTER TABLE memories ADD COLUMN embedding vector(1536);
-- CREATE INDEX idx_memories_embedding
--     ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

COMMIT;

-- End of schema.
