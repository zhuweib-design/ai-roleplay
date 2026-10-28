// chat_stream/tasks.rs — 全局任务注册表（支持中止，B6 第五件原样搬出）
//
// 取消标志按 channel 存一张表；P3-1 加了 TTL 惰性清理，防半开流悬挂时表项无限残留。

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::Mutex;

// ── 全局任务注册表（支持中止） ──

/// 任务表条目：取消标志 + 注册时间（P3-1：惰性清理僵尸表项）
struct TaskEntry {
    flag: Arc<AtomicBool>,
    created_at: std::time::Instant,
}

/// 全局任务 ID → 任务条目的映射
static TASKS: Mutex<Option<HashMap<String, TaskEntry>>> = Mutex::const_new(None);

/// 僵尸任务表项存活上限（半开流悬挂时防表项无限残留）
const TASK_ENTRY_TTL: Duration = Duration::from_secs(60);

/// 创建新任务并返回其取消标志
pub(super) async fn register_task(task_id: &str) -> Arc<AtomicBool> {
    let mut guard = TASKS.lock().await;
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
    let map = guard.as_mut().unwrap();
    // P3-1：惰性清理超过 TTL 的僵尸表项（任务结束应由 unregister_task 正常清理）
    map.retain(|_, e| e.created_at.elapsed() < TASK_ENTRY_TTL);
    let entry = TaskEntry {
        flag: Arc::new(AtomicBool::new(false)),
        created_at: std::time::Instant::now(),
    };
    let flag = entry.flag.clone();
    map.insert(task_id.to_string(), entry);
    flag
}

/// 取消指定任务
pub(super) async fn cancel_task(task_id: &str) -> bool {
    let mut guard = TASKS.lock().await;
    if let Some(map) = guard.as_mut() {
        if let Some(entry) = map.get(task_id) {
            entry.flag.store(true, Ordering::SeqCst);
            return true;
        }
    }
    false
}

/// 任务结束时清理注册表
pub(super) async fn unregister_task(task_id: &str) {
    let mut guard = TASKS.lock().await;
    if let Some(map) = guard.as_mut() {
        map.remove(task_id);
    }
}
