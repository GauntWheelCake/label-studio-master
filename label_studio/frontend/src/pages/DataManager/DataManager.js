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
import "./DataManager.styl";

const ROLE_PERMISSIONS = {
  [UserRole.Admin]: { annotate: false, review: false },
  [UserRole.Annotator]: { annotate: true, review: false },
  [UserRole.Reviewer]: { annotate: false, review: true },
};

const ROLE_TOOLTIPS = {
  annotate: '当前身份不可提交标注',
  review: '当前身份不可执行审核',
  start: '当前身份不可发起标注',
};

const ANNOTATION_KEYWORDS = ['submit', 'update','提交', '更新'];
const REVIEW_KEYWORDS = ['accept', 'reject'];

const ACTION_TRANSLATIONS = [
  {
    matchers: ['retrieve predictions'],
    titleKey: 'dataManager.actions.retrievePredictions.title',
    dialogKey: 'dataManager.actions.retrievePredictions.dialog',
  },
  {
    matchers: ['delete tasks'],
    titleKey: 'dataManager.actions.deleteTasks.title',
    dialogKey: 'dataManager.actions.deleteTasks.dialog',
  },
  {
    matchers: ['delete annotations'],
    titleKey: 'dataManager.actions.deleteAnnotations.title',
    dialogKey: 'dataManager.actions.deleteAnnotations.dialog',
  },
  {
    matchers: ['delete predictions'],
    titleKey: 'dataManager.actions.deletePredictions.title',
    dialogKey: 'dataManager.actions.deletePredictions.dialog',
  },
];

const normalizeActionTitle = (value) => {
  if (!value) return '';
  return String(value).trim().toLowerCase();
};

const findActionTranslation = (action) => {
  if (!action || typeof action !== 'object') return null;

  const candidates = [
    normalizeActionTitle(action.title),
    normalizeActionTitle(action.label),
    normalizeActionTitle(action.name),
  ].filter(Boolean);

  if (!candidates.length) return null;

  return ACTION_TRANSLATIONS.find((translation) => {
    return translation.matchers.some((matcher) => candidates.includes(matcher));
  });
};

const applyActionTranslation = (action) => {
  const translation = findActionTranslation(action);

  if (!translation) return false;

  const title = t(translation.titleKey);
  const dialogText = t(translation.dialogKey);

  if (title) {
    if (typeof action.title === 'string') action.title = title;
    if (typeof action.label === 'string' && translation.matchers.includes(normalizeActionTitle(action.label))) action.label = title;
    if (typeof action.name === 'string' && translation.matchers.includes(normalizeActionTitle(action.name))) action.name = title;
  }

  if (dialogText) {
    if (typeof action.dialog === 'string') {
      action.dialog = dialogText;
    } else if (action.dialog && typeof action.dialog === 'object') {
      if (typeof action.dialog.text === 'string') action.dialog.text = dialogText;
      if (typeof action.dialog.description === 'string') action.dialog.description = dialogText;
      if (typeof action.dialog.body === 'string') action.dialog.body = dialogText;
      if (typeof action.dialog.content === 'string') action.dialog.content = dialogText;
    }

    if (action.confirmation && typeof action.confirmation === 'object') {
      if (typeof action.confirmation.text === 'string') action.confirmation.text = dialogText;
      if (typeof action.confirmation.description === 'string') action.confirmation.description = dialogText;
    }
  }

  return true;
};

const localizeDataManagerActions = (dataManager) => {
  if (!dataManager) return;

  const visited = new WeakSet();

  function processAction(action) {
    if (!action || typeof action !== 'object') return;
    if (visited.has(action)) return;
    visited.add(action);

    applyActionTranslation(action);

    if (action.children) processCollection(action.children);

    Object.keys(action).forEach((key) => {
      const value = action[key];

      if (!value) return;
      if (key === 'children') return;

      if (Array.isArray(value) || (typeof value === 'object' && /action/i.test(key))) {
        processCollection(value);
      }
    });
  }

  function processCollection(collection) {
    if (!collection) return;
    if (typeof collection !== 'object') return;
    if (visited.has(collection)) return;
    visited.add(collection);

    if (Array.isArray(collection)) {
      collection.forEach((item) => processAction(item));
      return;
    }

    if (typeof collection.values === 'function') {
      try {
        Array.from(collection.values()).forEach((item) => processAction(item));
      } catch (err) {
        // ignore failures when iterating unknown collection types
      }
    }

    if (collection && typeof collection === 'object') {
      Object.keys(collection).forEach((key) => {
        const value = collection[key];

        if (!value) return;

        if (/action/i.test(key) || key === 'children' || Array.isArray(value)) {
          processCollection(value);
        }
      });
    }
  }

  function inspectContainer(container) {
    if (!container || typeof container !== 'object') return;

    Object.keys(container).forEach((key) => {
      if (/action/i.test(key)) {
        processCollection(container[key]);
      }
    });
  }

  processCollection(dataManager.actions);
  processCollection(dataManager.actionsList);
  inspectContainer(dataManager);

  if (dataManager.store) {
    processCollection(dataManager.store.actions);
    processCollection(dataManager.store.actionsList);
    inspectContainer(dataManager.store);
  }
};

const normalizeText = (node) => (node?.textContent ?? '').trim().toLowerCase();

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
  if (!window.LabelStudio) throw Error("Label Studio Frontend doesn't exist on the page");
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
    },
    ...props,
    ...settings,
  };

  return new window.DataManager(dmConfig);
};

const REVIEW_STATUS_LABELS = {
  pending: '未审核',
  approved: '已通过',
  rejected: '已驳回',
};

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

  if (normalized.some(value => value.includes('review'))) return 'reviewer';
  if (normalized.some(value => value.includes('admin'))) return 'admin';
  if (normalized.some(value => value.includes('annot'))) return 'annotator';

  if (user.is_staff || user.is_superuser) return 'admin';

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
  const labelButtonInitialState = useRef(null);

  const applyAnnotationControlState = useCallback((roleValue) => {
    if (typeof document === 'undefined') return;

    const resolvedRole = roleValue ?? DEFAULT_ROLE;
    const permissions = ROLE_PERMISSIONS[resolvedRole] ?? ROLE_PERMISSIONS[DEFAULT_ROLE];
    const controlsRoot = document.querySelector('.lsf-controls');

    if (!controlsRoot) return;

    const interactiveElements = controlsRoot.querySelectorAll('button.lsf-button, a.lsf-button');

    interactiveElements.forEach((element) => {
      const text = normalizeText(element);
      if (!text) return;

      if (ANNOTATION_KEYWORDS.some((keyword) => text.includes(keyword))) {
        setElementRoleState(element, permissions.annotate, permissions.annotate ? '' : ROLE_TOOLTIPS.annotate);
      } else if (REVIEW_KEYWORDS.some((keyword) => text.includes(keyword))) {
        setElementRoleState(element, permissions.review, permissions.review ? '' : ROLE_TOOLTIPS.review);
      }
    });
  }, []);

  const applyDataManagerInterface = useCallback((roleValue) => {
    if (typeof document === 'undefined') return;

    const resolvedRole = roleValue ?? DEFAULT_ROLE;
    const permissions = ROLE_PERMISSIONS[resolvedRole] ?? ROLE_PERMISSIONS[DEFAULT_ROLE];
    const annotateAllowed = permissions.annotate;

    const store = dataManagerRef.current?.store;

    if (store?.interfaceEnabled && store?.disableInterface && store?.enableInterface) {
      try {
        if (!annotateAllowed) {
          if (labelButtonInitialState.current === null && typeof store.interfaceEnabled === 'function') {
            labelButtonInitialState.current = store.interfaceEnabled('labelButton');
          }
          store.disableInterface('labelButton');
        } else if (labelButtonInitialState.current !== null) {
          if (labelButtonInitialState.current) {
            store.enableInterface('labelButton');
          } else {
            store.disableInterface('labelButton');
          }
          labelButtonInitialState.current = null;
        }
      } catch (err) {
        console.warn('[roles] Failed to update Data Manager interfaces', err);
      }
    }

    const labelButtons = document.querySelectorAll('.dm-button');
    labelButtons.forEach((element) => {
      const text = normalizeText(element);
      if (!text) return;

      if (text.startsWith('label') || text.includes('标注')) {
        setElementRoleState(element, annotateAllowed, annotateAllowed ? '' : ROLE_TOOLTIPS.start);
      }
    });
  }, [dataManagerRef, labelButtonInitialState]);

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

    localizeDataManagerActions(dataManager);
    // === 自定义列：审核状态（最小侵入式注入） =========================
    try {
      // 1) 容错：不同版本的 DataManager Store 命名略有差异
      const store = dataManager.store || dataManager._store || dataManager.dm?.store;

      if (store) {
        const columnId = 'review_status';
        const translations = {
          pending: t('dataManager.review.pending'),
          approved: t('dataManager.review.approved'),
          rejected: t('dataManager.review.rejected'),
        };

        const getDisplayValue = (row) => {
          const display = row?.review_status_display ?? row?.task?.review_status_display;
          if (display != null && display !== '') return String(display);

          const val = row?.review_status ?? row?.task?.review_status ?? 'pending';
          const normalized = String(val || 'pending').toLowerCase();

          return translations[normalized] || translations.pending;
        };

        const renderTag = (value, row) => {
          const raw = row?.review_status ?? row?.task?.review_status ?? 'pending';
          const normalized = String(raw || 'pending').toLowerCase();
          const fallback = translations[normalized] || translations.pending;
          const text = String(value ?? getDisplayValue(row) ?? fallback ?? translations.pending);

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
  }, [LabelStudio, DataManager, applyRoleRestrictions]);

  const destroyDM = useCallback(() => {
    if (dataManagerRef.current) {
      dataManagerRef.current.destroy();
      dataManagerRef.current = null;
    }
    labelButtonInitialState.current = null;
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

    const observer = new MutationObserver(() => {
      applyRoleRestrictions(roleRef.current ?? DEFAULT_ROLE);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
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
    init();

    return () => destroyDM();
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
  const isSwitchingTaskRef = useRef(false);

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
  const isReviewer = userRole === 'reviewer';
  const isAdmin = userRole === 'admin';
  const canReview = isReviewer && !isAdmin;

  const resolveTaskId = useCallback((task) => {
    if (!task) return null;
    return task.id ?? task.task_id ?? task.pk ?? task.task?.id ?? null;
  }, []);

  const resolveReviewStatus = useCallback((task) => {
    if (!task) return 'pending';
    const status = task.review_status ?? task.task?.review_status ?? 'pending';
    return String(status || 'pending').toLowerCase();
  }, []);

  const extractTaskInfo = useCallback(() => {
    if (!dmRef?.store) {
      setCurrentTaskId(null);
      setCurrentReviewStatus('pending');
      return;
    }

    const selected = dmRef.store.taskStore?.selected;
    const id = resolveTaskId(selected);
    const status = resolveReviewStatus(selected);

    setCurrentTaskId(id);
    setCurrentReviewStatus(status || 'pending');
  }, [dmRef, resolveReviewStatus, resolveTaskId]);

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

        if (apiResult?.status === 404 || apiResult?.$meta?.status === 404) {
          dmRef.store?.SDK?.invoke?.('labelStreamFinished');
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

  const statusText = REVIEW_STATUS_LABELS[currentReviewStatus] ?? REVIEW_STATUS_LABELS.pending;
  const hasTask = !!currentTaskId;
  const reviewDisabled = !canReview || !hasTask;
  const disabledMessage = !hasTask
    ? '暂无可审阅的任务'
    : !canReview
      ? (isAdmin ? '管理员不可执行审核操作' : '仅审阅者可执行审核操作')
      : '';
  const approveDisabled = reviewDisabled || pendingDecision !== null;
  const rejectDisabled = reviewDisabled || pendingDecision !== null;
  const showReviewControls = mode !== 'explorer';

  return project && project.id ? (
    <Space size="small">
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
