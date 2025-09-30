import { createAnnotationUpdateHandler } from '../../../src/pages/DataManager/annotation-events';
import { localizeReviewStatus } from '../../../src/pages/DataManager/reviewStatus';

describe('createAnnotationUpdateHandler', () => {
  const resolveTaskId = (task: any) => {
    if (!task) return null;
    if (typeof task === 'number') return task;
    return task.id ?? task.task_id ?? task.task?.id ?? null;
  };

  it('reloads selected task and resets review status when annotation update matches the selected task', async () => {
    const loadTask = jest.fn().mockResolvedValue(undefined);
    const extractTaskInfo = jest.fn();
    const setCurrentReviewStatus = jest.fn();

    const taskStore = {
      selected: { id: 101 },
      loadTask,
    };

    const dmRef = {
      store: {
        taskStore,
      },
    } as any;

    const handler = createAnnotationUpdateHandler({
      dmRef,
      setCurrentReviewStatus,
      extractTaskInfo,
      resolveTaskId,
    });

    await handler({ task: { id: 101 } });

    expect(loadTask).toHaveBeenCalledWith(101, { select: true });
    expect(setCurrentReviewStatus).toHaveBeenCalledWith('pending');
    expect(extractTaskInfo).toHaveBeenCalled();
  });

  it('still resets review status if no task reload is possible', async () => {
    const extractTaskInfo = jest.fn();
    const setCurrentReviewStatus = jest.fn();

    const dmRef = {
      store: {
        taskStore: {
          selected: { id: 202 },
        },
      },
    } as any;

    const handler = createAnnotationUpdateHandler({
      dmRef,
      setCurrentReviewStatus,
      extractTaskInfo,
      resolveTaskId,
    });

    await handler({ task: { id: 202 } });

    expect(setCurrentReviewStatus).toHaveBeenCalledWith('pending');
    expect(extractTaskInfo).toHaveBeenCalled();
  });
});

describe('localizeReviewStatus', () => {
  const translations = {
    pending: '未审核',
    approved: '已通过',
    rejected: '已驳回',
  };

  it('maps unlocalized review_status_display values to localized labels', () => {
    const result = localizeReviewStatus({
      translations,
      status: 'approved',
      display: 'approved',
    });

    expect(result).toBe('已通过');
  });
});
