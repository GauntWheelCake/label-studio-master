export const ANNOTATION_UPDATE_EVENTS = [
  'lsf:updateAnnotation',
  'annotations:update',
  'annotations:updated',
  'annotations:delete',
  'annotations:deleted',
  'annotations:remove',
];

export const createAnnotationUpdateHandler = ({ dmRef, setCurrentReviewStatus, extractTaskInfo, resolveTaskId }) => {
  return async (payload = {}) => {
    if (typeof setCurrentReviewStatus === 'function') {
      setCurrentReviewStatus('pending');
    }

    try {
      const taskStore = dmRef?.store?.taskStore;
      const selectedTask = taskStore?.selected;
      const selectedTaskId = typeof resolveTaskId === 'function' ? resolveTaskId(selectedTask) : selectedTask?.id;

      if (selectedTaskId) {
        const payloadTask = payload?.task ?? payload?.task_id ?? payload?.taskID ?? payload;
        const payloadTaskId = typeof payloadTask === 'number'
          ? payloadTask
          : (typeof resolveTaskId === 'function' ? resolveTaskId(payloadTask) : payloadTask?.id);

        if (!payloadTaskId || payloadTaskId === selectedTaskId) {
          const loadTask = taskStore?.loadTask;
          if (typeof loadTask === 'function') {
            await loadTask.call(taskStore, selectedTaskId, { select: true });
          }
        }
      }

      const view = dmRef?.currentView ?? dmRef?.store?.currentView ?? dmRef?.store?.viewsStore?.selected;
      const reload = view?.reload ?? view?.load ?? view?.fetch;

      if (typeof reload === 'function') {
        await reload.call(view);
      } else if (typeof dmRef?.store?.update === 'function') {
        dmRef.store.update();
      }
    } catch (error) {
      console.warn('[review] Failed to refresh task after annotation update', error);
    } finally {
      if (typeof extractTaskInfo === 'function') {
        extractTaskInfo();
      }
    }
  };
};
