/**
 * 角色卡版本控制 —— 顶层引擎（多仓库编排）
 *
 * 维护 characterId → CharacterRepository 映射与当前操作者。
 * 持久化由调用方（Pinia store）经 toJSON/fromJSON 驱动，引擎自身不碰存储。
 */

import { t } from '@/i18n';
import { CharacterRepository } from './character-version-repository';
import type { CharacterCard } from './character-card';
import type { RepositoryInfo, SerializedRepository, VersionAuthor } from './character-version-types';

/**
 * 角色卡版本控制引擎
 *
 * 维护多个角色卡的版本仓库映射：
 * characterId → CharacterRepository
 *
 * 持久化策略：由调用方（Pinia Store）通过 toJSON/fromJSON 调用，
 * 引擎自身不直接读写存储后端。
 */
export class VersionControlEngine {
  private repos: Map<string, CharacterRepository> = new Map();
  private currentAuthor: VersionAuthor;

  constructor(author?: VersionAuthor) {
    this.currentAuthor = author ?? { name: t('cv.localUser') };
  }

  /** 设置当前操作者 */
  setAuthor(author: VersionAuthor): void {
    this.currentAuthor = author;
  }

  /** 获取当前操作者 */
  getAuthor(): VersionAuthor {
    return this.currentAuthor;
  }

  /**
   * 初始化某角色的版本仓库
   *
   * 若已存在则直接返回，避免重复初始化。
   *
   * @returns 角色对应的仓库
   */
  initRepository(characterId: string, initialCard: CharacterCard): CharacterRepository {
    let repo = this.repos.get(characterId);
    if (!repo) {
      repo = new CharacterRepository(characterId);
      repo.initialize(initialCard, this.currentAuthor);
      this.repos.set(characterId, repo);
    }
    return repo;
  }

  /**
   * 获取角色仓库（不存在返回 null）
   */
  getRepository(characterId: string): CharacterRepository | null {
    return this.repos.get(characterId) ?? null;
  }

  /**
   * 获取或创建角色仓库
   *
   * 不存在时使用提供的初始角色卡创建。
   */
  ensureRepository(characterId: string, initialCard: CharacterCard): CharacterRepository {
    return this.initRepository(characterId, initialCard);
  }

  /**
   * 删除角色仓库（连同全部版本历史）
   */
  deleteRepository(characterId: string): boolean {
    return this.repos.delete(characterId);
  }

  /**
   * 列出全部仓库信息
   */
  listRepositories(): RepositoryInfo[] {
    return Array.from(this.repos.values()).map((r) => r.getInfo());
  }

  /**
   * 序列化全量数据（用于持久化）
   */
  toJSON(): SerializedRepository[] {
    return Array.from(this.repos.values()).map((r) => r.toJSON());
  }

  /**
   * 反序列化（替换当前全部仓库）
   */
  loadFromJSON(data: SerializedRepository[]): void {
    this.repos.clear();
    for (const item of data) {
      const repo = CharacterRepository.fromJSON(item);
      this.repos.set(repo.characterId, repo);
    }
  }
}
