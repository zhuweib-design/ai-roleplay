import { describe, expect, it, vi } from 'vitest';
import { recordGroupObservation } from '@/services/group-chat-runtime';
import type { ChatRuntimeIntegration } from '@/runtime/chat-bridge';

const observation = {
  groupId: 'group-1', assistantMessageId: 'msg-1', speakerId: 'speaker',
  userMessage: '公开问题', assistantMessage: '公开回答',
};

describe('群聊旁听事件', () => {
  it('为旁听角色生成稳定幂等键，只写公开内容与发言者标识', async () => {
    const ingestEvent = vi.fn().mockResolvedValue({});
    const listener = {
      tenantId: 'tenant-a', characterId: 'listener-a',
      api: { ingestEvent },
    } as unknown as ChatRuntimeIntegration;
    await recordGroupObservation(listener, observation);
    await recordGroupObservation(listener, observation);
    expect(ingestEvent).toHaveBeenCalledTimes(2);
    const [characterId, input] = ingestEvent.mock.calls[0]!;
    expect(characterId).toBe(listener.characterId);
    expect(input).toMatchObject({
      tenantId: 'tenant-a', eventType: 'group_observation',
      payload: { groupId: 'group-1', speakerId: 'speaker', userMessage: '公开问题', assistantMessage: '公开回答' },
    });
    expect(input.eventId).toBe(ingestEvent.mock.calls[1]![1].eventId);
    expect(input).not.toHaveProperty('sourceTurnIds');
  });

  it('旁听写入失败不阻断群聊回复', async () => {
    const onError = vi.fn();
    const listener = {
      tenantId: 'tenant-a', characterId: 'listener-a', onError,
      api: { ingestEvent: vi.fn().mockRejectedValue(new Error('存储不可用')) },
    } as unknown as ChatRuntimeIntegration;
    await expect(recordGroupObservation(listener, observation)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: '存储不可用' }), 'event');
  });
});
