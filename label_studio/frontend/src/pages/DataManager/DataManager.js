import { useCallback, useEffect, useRef, useState } from 'react';
import { generatePath, useHistory } from 'react-router';
import { NavLink } from 'react-router-dom';
import { Button } from '../../components/Button/Button';
import { modal } from '../../components/Modal/Modal';
import { Space } from '../../components/Space/Space';
import { useLibrary } from '../../providers/LibraryProvider';
import { useProject } from '../../providers/ProjectProvider';
import { useContextProps, useFixedLocation, useParams } from '../../providers/RoutesProvider';
import { addAction, addCrumb, deleteAction, deleteCrumb } from '../../services/breadrumbs';
import { Block, Elem } from '../../utils/bem';
import { t } from '../../i18n';
import { DEFAULT_ROLE, getStoredRole, subscribeToRoleChange, UserRole } from '../../utils/roles';
import { ImportModal } from '../CreateProject/Import/ImportModal';
import { ExportPage } from '../ExportPage/ExportPage';
import { APIConfig } from './api-config';
import { ANNOTATION_UPDATE_EVENTS, createAnnotationUpdateHandler } from './annotation-events';
import { localizeReviewStatus, normalizeReviewStatusKey } from './reviewStatus';
import "./DataManager.styl";

const ROLE_PERMISSIONS = {
  [UserRole.Annotator]: { annotate: true, review: false },
  [UserRole.Reviewer]: { annotate: false, review: true },
  [UserRole.Admin]: { annotate: true, review: true },
};

const ROLE_TOOLTIPS = {
  annotate: '当前身份不可提交标注',
  review: '当前身份不可执行审核',
  start: '当前身份不可发起标注',
  delete: '当前身份不可删除注解',
};

const ANNOTATION_KEYWORDS = ['submit', 'update', '提交', '更新'];
const DELETE_KEYWORDS = ['delete', '删除'];
const REVIEW_KEYWORDS = ['accept', 'reject'];

const normalizeText = (node) => (node?.textContent ?? '').trim().toLowerCase();
const normalizeAttribute = (element, name) => (element?.getAttribute?.(name) ?? '').trim().toLowerCase();

const setElementRoleState = (element, allowed, message) => {
  if (!element) return;

  if (!allowed) {
    if (element.dataset.roleDisabled === 'true') {
      if (message) element.setAttribute('title', message);
      return;
    }

    element.dataset.roleDisabled = 'true';

    const originalTitle = element.getAttribute('title');
    element.dataset.roleOriginalTitle = originalTitle ?? '';

    const originalTabIndex = element.getAttribute('tabindex');
    element.dataset.roleOriginalTabIndex = originalTabIndex ?? '';

    if (message) {
      element.setAttribute('title', message);
    }

    element.setAttribute('aria-disabled', 'true');
    element.setAttribute('tabindex', '-1');
    element.classList.add('ls-role-disabled');
    element.style.pointerEvents = 'none';
    element.style.cursor = 'not-allowed';
    element.style.opacity = '0.5';
  } else if (element.dataset.roleDisabled === 'true') {
    const originalTitle = element.dataset.roleOriginalTitle;
    if (originalTitle !== undefined) {
      if (originalTitle) {
        element.setAttribute('title', originalTitle);
      } else {
        element.removeAttribute('title');
      }
    }

    const originalTabIndex = element.dataset.roleOriginalTabIndex;
    if (originalTabIndex !== undefined) {
      if (originalTabIndex) {
        element.setAttribute('tabindex', originalTabIndex);
      } else {
        element.removeAttribute('tabindex');
      }
    }

    element.removeAttribute('aria-disabled');
    element.classList.remove('ls-role-disabled');
    element.style.pointerEvents = '';
    element.style.cursor = '';
    element.style.opacity = '';

    delete element.dataset.roleDisabled;
    delete element.dataset.roleOriginalTitle;
    delete element.dataset.roleOriginalTabIndex;
  }
};

const initializeDataManager = async (root, props, params) => {
  if (!window.LabelStudio) throw Error("标注平台前端未在页面中加载");
  if (!root && root.dataset.dmInitialized) return;

  root.dataset.dmInitialized = true;

  const { ...settings } = root.dataset;

  const dmConfig = {
    root,
    projectId: params.id,
    apiGateway: `${window.APP_SETTINGS.hostname}/api/dm`,
    apiVersion: 2,
    polling: !window.APP_SETTINGS,
    showPreviews: false,
    apiEndpoints: APIConfig.endpoints,
    interfaces: {
      import: false,
      export: false,
      backButton: false,
      labelingHeader: false,
      labelButton: false,
    },
    ...props,
    ...settings,
  };

  return new window.DataManager(dmConfig);
};

const createReviewStatusTranslations = () => ({
  pending: t('dataManager.review.pending'),
  approved: t('dataManager.review.approved'),
  rejected: t('dataManager.review.rejected'),
});

const detectUserRole = (user = {}) => {
  const candidates = [
    user.project_role,
    user.role,
    user.role_slug,
    user.default_role,
    user.current_role,
  ];

  const normalized = candidates
    .filter(Boolean)
    .map(value => String(value).toLowerCase());

  if (normalized.some(value => value.includes('admin'))) return 'admin';
  if (normalized.some(value => value.includes('review'))) return 'reviewer';
  if (normalized.some(value => value.includes('annot'))) return 'annotator';

  return 'annotator';
};

const buildLink = (path, params) => {
  return generatePath(`/projects/:id${path}`, params);
};

export const DataManagerPage = ({...props}) => {
  const root = useRef();
  const params = useParams();
  const history = useHistory();
  const LabelStudio = useLibrary('lsf');
  const DataManager = useLibrary('dm');
  const setContextProps = useContextProps();
  const [crashed, setCrashed] = useState(false);
  const dataManagerRef = useRef();
  const [activeRole, setActiveRole] = useState(getStoredRole());
  const roleRef = useRef(activeRole);
  const interfaceInitialStateRef = useRef(new Map());

  const applyAnnotationControlState = useCallback((roleValue) => {
    if (typeof document === 'undefined') return;

    const resolvedRole = roleValue ?? DEFAULT_ROLE;
    const permissions = ROLE_PERMISSIONS[resolvedRole] ?? ROLE_PERMISSIONS[DEFAULT_ROLE];
    const controlsRoot = document.querySelector('.lsf-controls');

    if (!controlsRoot) return;

    const interactiveElements = controlsRoot.querySelectorAll('button.lsf-button, a.lsf-button');

    interactiveElements.forEach((element) => {
      const text = normalizeText(element);
      const ariaLabel = normalizeAttribute(element, 'aria-label');
      const title = normalizeAttribute(element, 'title');
      const tokens = [text, ariaLabel, title].filter(Boolean);

      if (!tokens.length) return;

      if (tokens.some((value) => ANNOTATION_KEYWORDS.some((keyword) => value.includes(keyword)))) {
        setElementRoleState(element, permissions.annotate, permissions.annotate ? '' : ROLE_TOOLTIPS.annotate);
      } else if (tokens.some((value) => REVIEW_KEYWORDS.some((keyword) => value.includes(keyword)))) {
        setElementRoleState(element, permissions.review, permissions.review ? '' : ROLE_TOOLTIPS.review);
      } else if (tokens.some((value) => DELETE_KEYWORDS.some((keyword) => value.includes(keyword)))) {
        setElementRoleState(element, permissions.annotate, permissions.annotate ? '' : ROLE_TOOLTIPS.delete);
      }
    });
  }, []);

  const applyDataManagerInterface = useCallback((roleValue) => {
    if (typeof document === 'undefined') return;

    const resolvedRole = roleValue ?? DEFAULT_ROLE;
    const permissions = ROLE_PERMISSIONS[resolvedRole] ?? ROLE_PERMISSIONS[DEFAULT_ROLE];
    const annotateAllowed = permissions.annotate;

    const store = dataManagerRef.current?.store;

    const setInterfaceAllowed = (name, allowed) => {
      if (!store?.interfaceEnabled || !store?.disableInterface || !store?.enableInterface) return;

      try {
        if (!allowed) {
          if (!interfaceInitialStateRef.current.has(name)) {
            const currentValue = store.interfaceEnabled(name);
            interfaceInitialStateRef.current.set(name, Boolean(currentValue));
          }
          store.disableInterface(name);
        } else if (interfaceInitialStateRef.current.has(name)) {
          const initialState = interfaceInitialStateRef.current.get(name);

          if (initialState) {
            store.enableInterface(name);
          } else {
            store.disableInterface(name);
          }

          interfaceInitialStateRef.current.delete(name);
        }
      } catch (err) {
        console.warn('[roles] Failed to update Data Manager interfaces', err);
      }
    };

    setInterfaceAllowed('labelButton', annotateAllowed);
    setInterfaceAllowed('annotations:delete', annotateAllowed);

    const labelButtons = document.querySelectorAll('.dm-button');
    labelButtons.forEach((element) => {
      const text = normalizeText(element);
      if (!text) return;

      if (text.startsWith('label') || text.includes('标注')) {
        setElementRoleState(element, annotateAllowed, annotateAllowed ? '' : ROLE_TOOLTIPS.start);
      }
    });
  }, [dataManagerRef, interfaceInitialStateRef]);

  const applyRoleRestrictions = useCallback((roleValue) => {
    const resolvedRole = roleValue ?? roleRef.current ?? DEFAULT_ROLE;

    roleRef.current = resolvedRole;

    if (typeof document !== 'undefined' && document.body) {
      document.body.setAttribute('data-user-role', resolvedRole);
    }

    applyAnnotationControlState(resolvedRole);
    applyDataManagerInterface(resolvedRole);
  }, [applyAnnotationControlState, applyDataManagerInterface, roleRef]);

  const init = useCallback(async () => {
    if (!LabelStudio) return;
    if (!DataManager) return;
    if (!root.current) return;
    if (dataManagerRef.current) return;

    dataManagerRef.current = dataManagerRef.current ?? await initializeDataManager(
      root.current,
      props,
      params,
    );

    const {current: dataManager} = dataManagerRef;
    // === 自定义列：审核状态（最小侵入式注入） =========================
    try {
      // 1) 容错：不同版本的 DataManager Store 命名略有差异
      const store = dataManager.store || dataManager._store || dataManager.dm?.store;

      if (store) {
        const columnId = 'review_status';
        const translations = createReviewStatusTranslations();

        const getDisplayValue = (row) => {
          const status = row?.review_status ?? row?.task?.review_status ?? 'pending';
          const display = row?.review_status_display ?? row?.task?.review_status_display;

          return localizeReviewStatus({
            translations,
            status,
            display,
          });
        };

        const renderTag = (value, row) => {
          const status = row?.review_status ?? row?.task?.review_status ?? 'pending';
          const display = row?.review_status_display ?? row?.task?.review_status_display;
          const text = localizeReviewStatus({
            translations,
            status,
            display,
            value,
          });
          const normalized = normalizeReviewStatusKey(status || 'pending');

          return `<span class="tag" data-status="${normalized}">${text}</span>`;
        };

        const applyColumnDefinition = (column) => {
          if (!column) return;

          column.id = columnId;
          column.title = t('dataManager.review.columnTitle');
          column.type = column.type ?? 'String';
          column.align = column.align ?? 'left';
          column.visible = column.visible ?? true;
          column.width = column.width ?? 110;
          column.accessor = column.accessor ?? ((row) => {
            const v = row?.review_status ?? row?.task?.review_status ?? 'pending';
            return String(v || 'pending');
          });
          column.getValue = getDisplayValue;
          column.render = (value, row) => renderTag(value, row);
        };

        const ensureRefresh = () => {
          const refresh = dataManager.update || dataManager.refresh || dataManager.forceUpdate;
          if (typeof refresh === 'function') {
            refresh.call(dataManager);
          } else if (typeof store.update === 'function') {
            store.update();
          }
        };

        let column = store.columns?.find?.((c) => c.id === columnId);

        if (!column && typeof store.addColumn === 'function') {
          store.addColumn({ id: columnId });
          column = store.columns?.find?.((c) => c.id === columnId);
        }

        if (!column && Array.isArray(store.columns)) {
          column = { id: columnId };
          store.columns.push(column);
        }

        applyColumnDefinition(column);

        const getAnnotationCount = (row) => {
          if (!row) return 0;

          const numericCandidates = [
            row?.total_annotations,
            row?.task?.total_annotations,
            row?.totalAnnotations,
            row?.task?.totalAnnotations,
          ];

          for (const candidate of numericCandidates) {
            const parsed = Number(candidate);
            if (Number.isFinite(parsed)) {
              return parsed;
            }
          }

          const arrays = [
            Array.isArray(row?.annotations) ? row.annotations : null,
            Array.isArray(row?.task?.annotations) ? row.task.annotations : null,
          ];

          const counts = arrays
            .filter((items) => Array.isArray(items))
            .map((items) => items.reduce((acc, item) => acc + (item && !item.was_cancelled ? 1 : 0), 0));

          if (counts.length) {
            return Math.max(...counts);
          }

          return 0;
        };

        const annotationColumnId = 'total_annotations';
        let annotationColumn = store.columns?.find?.((c) => c.id === annotationColumnId || c.alias === annotationColumnId);

        if (!annotationColumn && typeof store.addColumn === 'function') {
          store.addColumn({ id: annotationColumnId });
          annotationColumn = store.columns?.find?.((c) => c.id === annotationColumnId || c.alias === annotationColumnId);
        }

        if (!annotationColumn && Array.isArray(store.columns)) {
          annotationColumn = { id: annotationColumnId };
          store.columns.push(annotationColumn);
        }

        if (annotationColumn) {
          annotationColumn.id = annotationColumn.id ?? annotationColumnId;
          annotationColumn.alias = annotationColumn.alias ?? annotationColumnId;
          annotationColumn.type = annotationColumn.type ?? 'Number';
          annotationColumn.align = annotationColumn.align ?? 'center';
          annotationColumn.accessor = (row) => getAnnotationCount(row);
          annotationColumn.getValue = (value, row) => getAnnotationCount(row);
          annotationColumn.render = (value, row) => String(getAnnotationCount(row));

          if (typeof store.updateColumn === 'function') {
            store.updateColumn(annotationColumnId, annotationColumn);
          }
        }

        if (typeof store.updateColumn === 'function') {
          store.updateColumn(columnId, column);
        }

        ensureRefresh();
      }
    } catch (e) {
      // 出错不影响页面主流程
      console.warn('[DM] failed to inject review_status column', e);
    }
    // ================================================================

    dataManager.on("crash", () => setCrashed());

    dataManager.on("settingsClicked", () => {
      history.push(buildLink("/settings/labeling", {id: params.id}));
    });

    dataManager.on("importClicked", () => {
      history.push(buildLink("/data/import", {id: params.id}));
    });

    dataManager.on("exportClicked", () => {
      history.push(buildLink("/data/export", {id: params.id}));
    });

    setContextProps({dmRef: dataManager});

    applyRoleRestrictions(roleRef.current ?? DEFAULT_ROLE);
  }, [LabelStudio, DataManager, applyRoleRestrictions, params.id]);

  const destroyDM = useCallback(() => {
    if (dataManagerRef.current) {
      dataManagerRef.current.destroy();
      dataManagerRef.current = null;
    }
    interfaceInitialStateRef.current = new Map();
  }, [dataManagerRef]);

  useEffect(() => {
    const unsubscribe = subscribeToRoleChange((role) => {
      setActiveRole(role);
    }, { immediate: true });

    return unsubscribe;
  }, []);

  useEffect(() => {
    applyRoleRestrictions(activeRole);
  }, [activeRole, applyRoleRestrictions]);

  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    if (typeof document === 'undefined' || !document.body) return;

    let rafId;
    const observer = new MutationObserver(() => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        applyRoleRestrictions(roleRef.current ?? DEFAULT_ROLE);
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [applyRoleRestrictions]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const styleId = 'ls-role-style';
    let styleElement = document.getElementById(styleId);
    let created = false;

    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      styleElement.innerHTML = `
        [data-role-disabled="true"] {
          cursor: not-allowed !important;
        }

        [data-role-disabled="true"].lsf-button,
        [data-role-disabled="true"].dm-button {
          opacity: 0.5 !important;
        }
      `;
      document.head.appendChild(styleElement);
      created = true;
    }

    return () => {
      if (created && styleElement?.parentNode) {
        styleElement.parentNode.removeChild(styleElement);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const preventInteraction = (event) => {
      const target = event.target instanceof Element ? event.target.closest('[data-role-disabled="true"]') : null;
      if (target) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const preventKeydown = (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof Element) {
        const target = event.target.closest('[data-role-disabled="true"]');
        if (target) {
          event.preventDefault();
          event.stopPropagation();
        }
      }
    };

    document.addEventListener('click', preventInteraction, true);
    document.addEventListener('keydown', preventKeydown, true);

    return () => {
      document.removeEventListener('click', preventInteraction, true);
      document.removeEventListener('keydown', preventKeydown, true);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined' && document.body) {
        document.body.removeAttribute('data-user-role');
      }
    };
  }, []);

  useEffect(() => {
    init().catch((err) => {
      console.error('[DataManager] init failed', err);
      setCrashed(true);
    });

    return () => {
      // 异步销毁重型第三方库，释放主线程给浏览器先完成新页面绘制
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => destroyDM());
      } else {
        destroyDM();
      }
    };
  }, [root, init]);

  return crashed ? (
    <Block name="crash">
      <Elem name="info">{t('dataManager.crash.info')}</Elem>

      <Button to="/projects">
        {t('dataManager.crash.backToProjects')}
      </Button>
    </Block>
  ) : (
    <Block ref={root} name="datamanager"/>
  );
};

DataManagerPage.path = "/data";
DataManagerPage.pages = {
  ExportPage,
  ImportModal,
};
DataManagerPage.context = ({dmRef}) => {
  const location = useFixedLocation();
  const {project} = useProject();
  const [mode, setMode] = useState(dmRef?.mode ?? "explorer");
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [currentReviewStatus, setCurrentReviewStatus] = useState('pending');
  const [pendingDecision, setPendingDecision] = useState(null);
  const [smartLabeling, setSmartLabeling] = useState(false);
  const isSwitchingTaskRef = useRef(false);
  const smartLabelingModalRef = useRef(null);
  const isMountedRef = useRef(true);

  // Review controls are temporarily disabled; the handlers and state remain in
  // place so they can be re-enabled quickly if needed.
  const ENABLE_REVIEW_CONTROLS = false;

  const showReviewError = useCallback((message) => {
    let modalInstance;
    const footer = (
      <Space align="end">
        <Button
          size="compact"
          look="primary"
          onClick={() => modalInstance?.close()}
        >
          知道了
        </Button>
      </Space>
    );

    modalInstance = modal({
      title: '审核失败',
      body: () => (
        <div>
          {message ?? '提交审核结果时出现错误，请稍后重试。'}
        </div>
      ),
      footer,
    });

    return modalInstance;
  }, []);

  const requestRejectComment = useCallback(() => {
    return new Promise((resolve) => {
      const commentRef = { current: '' };
      const setErrorRef = { current: null };

      const RejectCommentForm = () => {
        const [value, setValue] = useState('');
        const [error, setError] = useState('');

        useEffect(() => {
          setErrorRef.current = setError;
          return () => {
            setErrorRef.current = null;
          };
        }, []);

        useEffect(() => {
          commentRef.current = value;
        }, [value]);

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              autoFocus
              rows={4}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="请输入驳回原因"
              style={{ width: '100%', resize: 'vertical', padding: '8px 10px' }}
            />
            {error ? (
              <div style={{ color: '#d32029' }}>
                {error}
              </div>
            ) : null}
          </div>
        );
      };

      let modalInstance;

      const closeWithResult = (result) => {
        resolve(result);
        modalInstance?.close();
      };

      const footer = (
        <Space align="end">
          <Button
            size="compact"
            onClick={() => closeWithResult(null)}
          >
            取消
          </Button>
          <Button
            size="compact"
            look="primary"
            onClick={() => {
              const trimmed = commentRef.current.trim();
              if (!trimmed) {
                setErrorRef.current?.('请填写驳回原因');
                return;
              }
              closeWithResult(trimmed);
            }}
          >
            提交
          </Button>
        </Space>
      );

      modalInstance = modal({
        title: '填写驳回原因',
        body: RejectCommentForm,
        allowClose: false,
        width: 480,
        footer,
      });
    });
  }, []);

  const [userRole, setUserRole] = useState(() => {
    const storedRole = getStoredRole();

    if (storedRole) return storedRole;

    return detectUserRole((typeof window !== 'undefined' ? window.APP_SETTINGS?.user : {}) ?? {});
  });

  useEffect(() => {
    const unsubscribe = subscribeToRoleChange((role) => {
      setUserRole((currentRole) => (currentRole === role ? currentRole : role));
    }, { immediate: true });

    return unsubscribe;
  }, []);
  const isReviewer = userRole === UserRole.Reviewer || userRole === UserRole.Admin;
  const canReview = isReviewer;

  const resolveTaskId = useCallback((task) => {
    if (!task) return null;
    return task.id ?? task.task_id ?? task.pk ?? task.task?.id ?? null;
  }, []);

  const resolveReviewStatus = useCallback((task) => {
    if (!task) return 'pending';
    const status = task.review_status ?? task.task?.review_status ?? 'pending';
    return String(status || 'pending').toLowerCase();
  }, []);

  const getActiveTaskInfo = useCallback(() => {
    const taskStore = dmRef?.store?.taskStore;
    const selected = [
      taskStore?.selected,
      taskStore?.selectedTask,
      taskStore?.current,
      taskStore?.currentTask,
      taskStore?.task,
      dmRef.store?.task,
      dmRef.task,
      dmRef.lsf?.task,
      dmRef.lsf?.store?.task,
      dmRef.lsf?.store?.completionStore?.selected?.task,
    ].find((candidate) => resolveTaskId(candidate));
    const id = resolveTaskId(selected);
    const status = resolveReviewStatus(selected);

    if (id) return { id, status };

    const searchParams = new URLSearchParams(location.search || '');
    const taskIdFromLocation = searchParams.get('task') || searchParams.get('task_id') || searchParams.get('taskID');
    const taskIdFromPath = location.pathname?.match?.(/\/tasks?\/(\d+)/)?.[1];
    const resolvedId = taskIdFromLocation || taskIdFromPath;

    return {
      id: resolvedId ? Number(resolvedId) : null,
      status: status || 'pending',
    };
  }, [dmRef, location.pathname, location.search, resolveReviewStatus, resolveTaskId]);

  const extractTaskInfo = useCallback(() => {
    if (!dmRef?.store) {
      if (!isMountedRef.current) return;
      setCurrentTaskId(null);
      setCurrentReviewStatus('pending');
      return;
    }

    const { id, status } = getActiveTaskInfo();

    if (!isMountedRef.current) return;
    setCurrentTaskId(id);
    setCurrentReviewStatus(status || 'pending');
  }, [dmRef, getActiveTaskInfo]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      smartLabelingModalRef.current?.close?.();
      smartLabelingModalRef.current = null;
    };
  }, []);

  const selectNextTask = useCallback(async () => {
    if (!dmRef?.store) return;

    const taskStore = dmRef.store.taskStore;

    if (!taskStore) return;

    try {
      let nextTaskResult;

      if (typeof taskStore.nextTask === 'function') {
        nextTaskResult = await taskStore.nextTask();
      } else {
        const view = dmRef.store?.currentView ?? dmRef.store?.viewsStore?.selected;
        const hasSelectedItems = view?.selected?.hasSelected;
        const selectedItems = hasSelectedItems && view?.selected?.snapshot
          ? view.selected.snapshot
          : { all: true, excluded: [] };
        const filters = {
          conjunction: view?.conjunction ?? 'and',
          items: view?.serializedFilters ?? [],
        };

        const requestBody = {
          ...(view?.ordering ? { ordering: view.ordering } : {}),
          selectedItems,
          filters,
        };

        const requestParams = {};

        const viewId = view?.id;
        if (viewId !== null && viewId !== undefined) {
          requestParams.tabID = viewId;
        }

        const apiResult = await dmRef.apiCall?.('nextTask', requestParams, { body: requestBody });

        if (!apiResult || apiResult?.error) {
          if (apiResult?.status === 404 || apiResult?.$meta?.status === 404) {
            dmRef.store?.SDK?.invoke?.('labelStreamFinished');
          }
          return;
        }

        if (typeof taskStore.applyTaskSnapshot === 'function') {
          nextTaskResult = taskStore.applyTaskSnapshot(apiResult);
        }

        if (!nextTaskResult && apiResult?.id && typeof taskStore.loadTask === 'function') {
          nextTaskResult = await taskStore.loadTask(apiResult.id, { select: true });
        }

        if (nextTaskResult && typeof taskStore.setSelected === 'function') {
          taskStore.setSelected(nextTaskResult);
        } else if (apiResult?.id) {
          taskStore?.setSelected?.(apiResult.id);
        }
      }

    } catch (error) {
      console.error('[datamanager] Failed to load next task after annotation', error);
    } finally {
      extractTaskInfo();
    }
  }, [dmRef, extractTaskInfo]);

  const links = {
    '/settings': t('dataManager.links.settings'),
    '/data/import': t('dataManager.links.import'),
    '/data/export': t('dataManager.links.export'),
  };

  const updateCrumbs = (currentMode) => {
    const isExplorer = currentMode === 'explorer';
    const dmPath = location.pathname.replace(DataManagerPage.path, '');

    if (isExplorer) {
      deleteAction(dmPath);
      deleteCrumb('dm-crumb');
    } else {
      addAction(dmPath, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dmRef?.store?.closeLabeling?.();
      });
      addCrumb({
        key: "dm-crumb",
        title: t('dataManager.breadcrumb.labeling'),
      });
    }
  };

  const showLabelingInstruction = (currentMode) => {
    const isLabelStream = currentMode === 'labelstream';
    const {expert_instruction, show_instruction} = project;

    if (isLabelStream && show_instruction && expert_instruction) {
      modal({
        title: t('dataManager.modal.labelingInstructionsTitle'),
        body: <div dangerouslySetInnerHTML={{__html: expert_instruction}}/>,
        style: { width: 680 },
      });
    }
  };

  const onDMModeChanged = (currentMode) => {
    setMode(currentMode);
    updateCrumbs(currentMode);
    showLabelingInstruction(currentMode);
    extractTaskInfo();
  };

  useEffect(() => {
    if (dmRef) {
      dmRef.on('modeChanged', onDMModeChanged);
    }

    return () => {
      dmRef?.off?.('modeChanged', onDMModeChanged);
    };
  }, [dmRef, project]);

  useEffect(() => {
    if (!dmRef) return;

    const update = () => extractTaskInfo();

    update();
    dmRef.on?.('taskSelected', update);
    dmRef.on?.('labelStudioLoad', update);
    dmRef.on?.('lsf:taskLoad', update);

    return () => {
      dmRef?.off?.('taskSelected', update);
      dmRef?.off?.('labelStudioLoad', update);
      dmRef?.off?.('lsf:taskLoad', update);
    };
  }, [dmRef, extractTaskInfo]);

  useEffect(() => {
    if (!dmRef) return;

    const handleNextTask = async () => {
      if (mode === 'explorer') return;
      if (isSwitchingTaskRef.current) return;

      isSwitchingTaskRef.current = true;

      try {
        await selectNextTask();
      } finally {
        isSwitchingTaskRef.current = false;
      }
    };

    const events = ['lsf:submitAnnotation', 'annotations:completed'];

    events.forEach((event) => dmRef.on?.(event, handleNextTask));

    return () => {
      events.forEach((event) => dmRef?.off?.(event, handleNextTask));
    };
  }, [dmRef, mode, selectNextTask]);

  useEffect(() => {
    if (!dmRef) return;

    const handler = createAnnotationUpdateHandler({ dmRef, setCurrentReviewStatus, extractTaskInfo, resolveTaskId });

    ANNOTATION_UPDATE_EVENTS.forEach((event) => dmRef.on?.(event, handler));

    return () => {
      ANNOTATION_UPDATE_EVENTS.forEach((event) => dmRef?.off?.(event, handler));
    };
  }, [dmRef, extractTaskInfo, resolveTaskId]);

  const sendReviewDecision = useCallback(async (decision, options = {}) => {
    if (!dmRef) return;

    const selected = dmRef.store?.taskStore?.selected;
    const taskId = resolveTaskId(selected);

    if (!taskId) return;

    setPendingDecision(decision);

    try {
      const comment = options.comment ?? '';

      const result = await dmRef.apiCall?.('reviewDecision', { taskID: taskId }, {
        body: { decision, comment },
      });

      if (result?.error || (result?.response && result.response?.detail)) {
        const responseDetail = typeof result?.response === 'string'
          ? result.response
          : result?.response?.detail;
        throw new Error(responseDetail || result.error || '提交审核结果失败');
      }

      if (result) {
        const loadTask = dmRef.store?.taskStore?.loadTask;

        if (typeof loadTask === 'function') {
          await loadTask.call(dmRef.store.taskStore, taskId, { select: true });
        }

        const updatedStatus = result?.review_status ?? decision;
        if (updatedStatus) {
          setCurrentReviewStatus(String(updatedStatus || 'pending').toLowerCase());
        }

        extractTaskInfo();
      }
      return true;
    } catch (error) {
      console.error('[review] Failed to submit review decision', error);
      const detail = error?.message ?? '提交审核结果时出现错误，请稍后重试。';
      showReviewError(detail);
      return false;
    } finally {
      setPendingDecision(null);
    }
  }, [dmRef, extractTaskInfo, resolveTaskId, showReviewError]);

  const handleApprove = useCallback(() => {
    sendReviewDecision('approved', { comment: '' });
  }, [sendReviewDecision]);

  const handleReject = useCallback(async () => {
    const comment = await requestRejectComment();
    if (!comment) return;
    await sendReviewDecision('rejected', { comment });
  }, [requestRejectComment, sendReviewDecision]);

  const refreshCurrentView = useCallback(async () => {
    const view = dmRef?.store?.currentView ?? dmRef?.store?.viewsStore?.selected;

    if (typeof view?.reload === 'function') {
      await view.reload();
      return;
    }

    if (typeof view?.fetchTasks === 'function') {
      await view.fetchTasks();
      return;
    }

    if (typeof dmRef?.store?.taskStore?.reload === 'function') {
      await dmRef.store.taskStore.reload();
    }
  }, [dmRef]);

  const showSmartLabelingResult = useCallback((title, message) => {
    let modalInstance;

    modalInstance = modal({
      title,
      body: () => <div style={{ whiteSpace: 'pre-wrap' }}>{message}</div>,
      footer: (
        <Space align="end">
          <Button
            size="compact"
            look="primary"
            onClick={() => modalInstance?.close()}
          >
            {'\u77e5\u9053\u4e86'}
          </Button>
        </Space>
      ),
    });
  }, []);

  const showSmartLabelingProgress = useCallback(() => {
    smartLabelingModalRef.current?.close?.();
    smartLabelingModalRef.current = modal({
      title: '\u6b63\u5728\u8fdb\u884c\u667a\u80fd\u6807\u6ce8',
      allowClose: false,
      closeOnClickOutside: false,
      body: () => (
        <div>
          {'\u6b63\u5728\u751f\u6210 AI \u521d\u7a3f\uff0c\u8bf7\u52ff\u8df3\u8f6c\u5230\u5176\u4ed6\u9875\u9762\u6216\u5237\u65b0\u6d4f\u89c8\u5668\uff0c\u4ee5\u514d\u4e2d\u65ad\u672c\u6b21\u667a\u80fd\u6807\u6ce8\u3002'}
        </div>
      ),
    });
  }, []);

  const closeSmartLabelingProgress = useCallback(() => {
    smartLabelingModalRef.current?.close?.();
    smartLabelingModalRef.current = null;
  }, []);

  const getSmartLabelingSelection = useCallback(() => {
    const view = dmRef?.store?.currentView ?? dmRef?.store?.viewsStore?.selected;
    const hasSelectedItems = view?.selected?.hasSelected;
    const selectedItems = hasSelectedItems && view?.selected?.snapshot
      ? view.selected.snapshot
      : null;

    return {
      view,
      hasSelectedItems: Boolean(hasSelectedItems),
      selectedItems,
    };
  }, [dmRef]);

  const hasSmartLabelingSelection = useCallback(() => {
    const { hasSelectedItems, selectedItems } = getSmartLabelingSelection();
    const included = selectedItems?.included ?? [];
    const excluded = selectedItems?.excluded ?? [];

    return hasSelectedItems && (
      selectedItems?.all === true ||
      included.length > 0 ||
      excluded.length > 0
    );
  }, [getSmartLabelingSelection]);

  const buildSmartLabelingRequest = useCallback(() => {
    const { view, selectedItems, hasSelectedItems } = getSmartLabelingSelection();

    return {
      ...(view?.ordering ? { ordering: view.ordering } : {}),
      selectedItems: hasSelectedItems ? selectedItems : { all: true, excluded: [] },
      filters: {
        conjunction: view?.conjunction ?? 'and',
        items: view?.serializedFilters ?? [],
      },
    };
  }, [getSmartLabelingSelection]);

  const buildCurrentTaskSmartLabelingRequestFor = useCallback((taskId) => ({
    selectedItems: {
      all: false,
      included: [taskId],
    },
  }), []);

  const loadSmartLabelingBackends = useCallback(async () => {
    if (!dmRef || !project?.id) return [];

    const result = await dmRef.apiCall?.('mlBackends', {
      project: project.id,
    });

    return Array.isArray(result) ? result : [];
  }, [dmRef, project?.id]);

  const formatBackendList = useCallback((backends = []) => {
    if (!backends.length) return '\u672a\u8fde\u63a5\u667a\u80fd\u6807\u6ce8\u6a21\u578b';

    return backends.map((backend) => {
      const title = backend.title || `\u6a21\u578b ${backend.id}`;
      const state = backend.state === 'CO'
        ? '\u5df2\u8fde\u63a5'
        : backend.state === 'ER'
          ? '\u8fde\u63a5\u5f02\u5e38'
          : '\u672a\u8fde\u63a5';
      const url = backend.url ? `\uff08${backend.url}\uff09` : '';

      return `${title}${url} - ${state}`;
    }).join('\n');
  }, []);

  const runSmartLabeling = useCallback(async (requestBody) => {
    if (!dmRef || !project?.id || smartLabeling) return;

    setSmartLabeling(true);
    showSmartLabelingProgress();

    try {
      const result = await dmRef.apiCall?.('invokeAction', {
        project: project.id,
        id: 'retrieve_tasks_predictions',
      }, {
        body: requestBody ?? buildSmartLabelingRequest(),
      });

      if (!isMountedRef.current) return;

      if (result?.error || result?.response?.detail) {
        const detail = result?.response?.detail || result?.detail || result?.error;
        throw new Error(detail || '\u0041\u0049 \u521d\u7a3f\u751f\u6210\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u667a\u80fd\u6807\u6ce8\u6a21\u578b\u662f\u5426\u5df2\u8fde\u63a5\u3002');
      }

      if (mode !== 'explorer' && currentTaskId && typeof dmRef.lsf?.loadTask === 'function') {
        await dmRef.lsf.loadTask(currentTaskId);
        extractTaskInfo();
      } else if (mode !== 'explorer' && currentTaskId && typeof dmRef.store?.taskStore?.loadTask === 'function') {
        const task = await dmRef.store.taskStore.loadTask.call(dmRef.store.taskStore, currentTaskId, { select: true });
        dmRef.store.taskStore?.setSelected?.(task ?? currentTaskId);
        extractTaskInfo();
      } else {
        await refreshCurrentView();
      }
      const failureLines = Array.isArray(result?.failures)
        ? result.failures.slice(0, 5).map((failure) => {
          const taskId = failure?.task_id ?? '-';
          const message = failure?.message || failure?.code || '\u672a\u77e5\u9519\u8bef';

          return `Task ${taskId}\uff1a${message}`;
        })
        : [];
      const hasFailureDetail = typeof result?.detail === 'string' && result.detail.includes('\u5931\u8d25');
      const failureSummary = result?.failed_predictions && !hasFailureDetail
        ? `\n\u5931\u8d25 ${result.failed_predictions} \u6761${failureLines.length ? `\n${failureLines.join('\n')}` : ''}`
        : '';

      showSmartLabelingResult(
        '\u0041\u0049 \u521d\u7a3f\u751f\u6210\u5b8c\u6210',
        `${result?.detail || '\u0041\u0049 \u521d\u7a3f\u5df2\u751f\u6210\uff0c\u8bf7\u8fdb\u5165\u6807\u6ce8\u9875\u786e\u8ba4\u6216\u4fee\u6539\u3002'}${failureSummary}`
      );
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error('[smart-labeling] Failed to generate AI drafts', error);
      showSmartLabelingResult('\u667a\u80fd\u9884\u6807\u6ce8\u5931\u8d25', error?.message || '\u8bf7\u68c0\u67e5\u667a\u80fd\u6807\u6ce8\u6a21\u578b\u662f\u5426\u5df2\u8fde\u63a5\uff0c\u6216\u7a0d\u540e\u91cd\u8bd5\u3002');
    } finally {
      if (!isMountedRef.current) return;
      closeSmartLabelingProgress();
      setSmartLabeling(false);
    }
  }, [buildSmartLabelingRequest, closeSmartLabelingProgress, currentTaskId, dmRef, extractTaskInfo, mode, project?.id, refreshCurrentView, showSmartLabelingProgress, showSmartLabelingResult, smartLabeling]);

  const confirmSmartLabeling = useCallback(async () => {
    const isCurrentTaskMode = mode !== 'explorer';
    const activeTaskId = isCurrentTaskMode ? (getActiveTaskInfo().id ?? currentTaskId) : null;
    const requestBody = isCurrentTaskMode ? buildCurrentTaskSmartLabelingRequestFor(activeTaskId) : buildSmartLabelingRequest();

    if (isCurrentTaskMode && !activeTaskId) {
      showSmartLabelingResult(
        '\u8bf7\u5148\u6253\u5f00\u4efb\u52a1',
        '\u8bf7\u5148\u6253\u5f00\u9700\u8981\u667a\u80fd\u9884\u6807\u6ce8\u7684\u4efb\u52a1\uff0c\u7136\u540e\u518d\u70b9\u51fb\u201c\u667a\u80fd\u9884\u6807\u6ce8\u201d\u3002'
      );
      return;
    }

    const hasListSelection = !isCurrentTaskMode && hasSmartLabelingSelection();

    const backends = await loadSmartLabelingBackends();
    const connectedBackends = backends.filter((backend) => backend.state === 'CO');

    if (!connectedBackends.length) {
      showSmartLabelingResult(
        '\u667a\u80fd\u6807\u6ce8\u6a21\u578b\u672a\u8fde\u63a5',
        '\u5f53\u524d\u6ca1\u6709\u53ef\u7528\u7684\u667a\u80fd\u6807\u6ce8\u6a21\u578b\uff0c\u8bf7\u5148\u5230\u201c\u9879\u76ee\u8bbe\u7f6e > \u667a\u80fd\u6807\u6ce8\u201d\u8fde\u63a5\u53ef\u7528\u7684\u6a21\u578b\u670d\u52a1\u3002'
      );
      return;
    }

    let modalInstance;
    let selectedBackendId = connectedBackends[0]?.id;
    const requiresBackendChoice = connectedBackends.length > 1;

    modalInstance = modal({
      title: '\u751f\u6210 AI \u521d\u7a3f',
      body: () => (
        <div>
          <p>{isCurrentTaskMode
            ? '\u5c06\u4ec5\u4e3a\u5f53\u524d\u6253\u5f00\u7684\u4efb\u52a1\u751f\u6210 AI \u521d\u7a3f\u3002\u751f\u6210\u540e\u9700\u8981\u4eba\u5de5\u786e\u8ba4\u6216\u4fee\u6539\uff0c\u624d\u4f1a\u6210\u4e3a\u6b63\u5f0f\u6807\u6ce8\u3002'
            : hasListSelection
              ? '\u5c06\u4e3a\u6570\u636e\u5217\u8868\u4e2d\u5f53\u524d\u52fe\u9009\u7684\u4efb\u52a1\u751f\u6210 AI \u521d\u7a3f\u3002\u751f\u6210\u540e\u9700\u8981\u4eba\u5de5\u786e\u8ba4\u6216\u4fee\u6539\uff0c\u624d\u4f1a\u6210\u4e3a\u6b63\u5f0f\u6807\u6ce8\u3002'
              : '\u5f53\u524d\u672a\u52fe\u9009\u4efb\u52a1\uff0c\u5c06\u6309\u5f53\u524d\u7b5b\u9009\u6761\u4ef6\u5bf9\u5217\u8868\u4e2d\u7684\u4efb\u52a1\u6279\u91cf\u751f\u6210 AI \u521d\u7a3f\u3002\u751f\u6210\u540e\u9700\u8981\u4eba\u5de5\u786e\u8ba4\u6216\u4fee\u6539\uff0c\u624d\u4f1a\u6210\u4e3a\u6b63\u5f0f\u6807\u6ce8\u3002'}</p>
          <p style={{ marginTop: 12, fontWeight: 600 }}>
            {requiresBackendChoice
              ? '\u8bf7\u9009\u62e9\u672c\u6b21\u8981\u8c03\u7528\u7684\u673a\u5668\u5b66\u4e60\u540e\u7aef\uff1a'
              : '\u672c\u6b21\u5c06\u8c03\u7528\u7684\u673a\u5668\u5b66\u4e60\u540e\u7aef\uff1a'}
          </p>
          {requiresBackendChoice ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {connectedBackends.map((backend) => {
                const title = backend.title || `\u6a21\u578b ${backend.id}`;
                const url = backend.url ? `\uff08${backend.url}\uff09` : '';

                return (
                  <label key={backend.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <input
                      type="radio"
                      name="smart-labeling-backend"
                      defaultChecked={backend.id === selectedBackendId}
                      onChange={() => {
                        selectedBackendId = backend.id;
                      }}
                    />
                    <span>{`${title}${url}`}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{formatBackendList(connectedBackends)}</pre>
          )}
        </div>
      ),
      footer: (
        <Space align="end">
          <Button size="compact" onClick={() => modalInstance?.close()}>
            {'\u53d6\u6d88'}
          </Button>
          <Button
            size="compact"
            look="primary"
            onClick={() => {
              if (!selectedBackendId) {
                showSmartLabelingResult(
                  '\u8bf7\u9009\u62e9\u6a21\u578b',
                  '\u8bf7\u5148\u9009\u62e9\u672c\u6b21\u8981\u8c03\u7528\u7684\u667a\u80fd\u6807\u6ce8\u6a21\u578b\u3002'
                );
                return;
              }
              modalInstance?.close();
              runSmartLabeling({
                ...requestBody,
                ml_backend_id: selectedBackendId,
              });
            }}
          >
            {'\u5f00\u59cb\u751f\u6210'}
          </Button>
        </Space>
      ),
    });
  }, [buildCurrentTaskSmartLabelingRequestFor, buildSmartLabelingRequest, currentTaskId, formatBackendList, getActiveTaskInfo, hasSmartLabelingSelection, loadSmartLabelingBackends, mode, runSmartLabeling, showSmartLabelingResult]);

  const reviewStatusTranslations = createReviewStatusTranslations();
  const statusText = localizeReviewStatus({
    translations: reviewStatusTranslations,
    status: currentReviewStatus,
    display: currentReviewStatus,
    value: currentReviewStatus,
  });
  const hasTask = !!currentTaskId;
  const reviewDisabled = !canReview || !hasTask;
  const disabledMessage = !hasTask
    ? '暂无可审阅的任务'
    : !canReview
      ? '仅审阅者可执行审核操作'
      : '';
  const approveDisabled = reviewDisabled || pendingDecision !== null;
  const rejectDisabled = reviewDisabled || pendingDecision !== null;
  const showReviewControls = ENABLE_REVIEW_CONTROLS && mode !== 'explorer';

  return project && project.id ? (
    <Space size="small">
      {mode !== 'explorer' && (
        <Button
          size="compact"
          onClick={() => dmRef?.store?.closeLabeling?.()}
        >
          {'\u8fd4\u56de'}
        </Button>
      )}

      <Button
        size="compact"
        look="primary"
        waiting={smartLabeling}
        onClick={confirmSmartLabeling}
      >
        {'\u667a\u80fd\u9884\u6807\u6ce8'}
      </Button>

      {showReviewControls && (
        <Space size="small">
          <span>
            审核状态：
            <span style={{ fontWeight: 600 }}>
              {statusText}
            </span>
          </span>
          <Button
            size="compact"
            look="primary"
            disabled={approveDisabled}
            waiting={pendingDecision === 'approved'}
            onClick={handleApprove}
            title={approveDisabled && disabledMessage ? disabledMessage : undefined}
          >
            通过
          </Button>
          <Button
            size="compact"
            disabled={rejectDisabled}
            waiting={pendingDecision === 'rejected'}
            onClick={handleReject}
            title={rejectDisabled && disabledMessage ? disabledMessage : undefined}
          >
            驳回
          </Button>
        </Space>
      )}

      {(project.expert_instruction && mode !== 'explorer') && (
        <Button size="compact" onClick={() => {
          modal({
            title: t('dataManager.instructions.modalTitle'),
            body: () => <div dangerouslySetInnerHTML={{__html: project.expert_instruction}}/>,
          });
        }}>
          {t('dataManager.instructions.button')}
        </Button>
      )}

      {Object.entries(links).map(([path, label]) => (
        <Button
          key={path}
          tag={NavLink}
          size="compact"
          to={`/projects/${project.id}${path}`}
        >
          {label}
        </Button>
      ))}
    </Space>
  ) : null;
};
