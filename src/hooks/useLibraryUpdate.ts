import { useMemo } from 'react';
import { useMMKVObject } from 'react-native-mmkv';
import ServiceManager, { QueuedBackgroundTask } from '@services/ServiceManager';

/**
 * Returns `true` while a library update task is running or queued in the
 * ServiceManager task queue.  Components that display a `RefreshControl`
 * can use this to reflect the real update state instead of hard-coding
 * `refreshing={false}`.
 */
export function useIsLibraryUpdating(): boolean {
  const [taskQueue] = useMMKVObject<QueuedBackgroundTask[]>(
    ServiceManager.manager.STORE_KEY,
  );

  return useMemo(() => {
    if (!taskQueue || taskQueue.length === 0) {
      return false;
    }
    return taskQueue.some(
      t => t.task.name === 'UPDATE_LIBRARY' && t.meta?.isRunning,
    );
  }, [taskQueue]);
}
