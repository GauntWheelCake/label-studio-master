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
    } catch (error) {
      console.warn('[review] Failed to refresh task after annotation update', error);
    } finally {
      if (typeof setCurrentReviewStatus === 'function') {
        setCurrentReviewStatus('pending');
      }
      if (typeof extractTaskInfo === 'function') {
        extractTaskInfo();
      }
    }
  };
};
