import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ImportModal } from '../CreateProject/Import/ImportModal';
import { ExportPage } from '../ExportPage/ExportPage';
import { APIConfig } from './api-config';
import "./DataManager.styl";

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

    // 2) 定义一个列配置（尽量对齐 DataManager 的“列对象”约定）
    const reviewStatusColumn = {
      id: 'review_status',               // 唯一键
      title: '审核状态',                   // 表头
      // DataManager 内部每条 Task 的原始数据通常会被放到 item 或 task
      // 尝试从常见位置读取（缺省给 pending）
      getValue: (row) => {
        const val = row?.review_status ?? row?.task?.review_status ?? 'pending';
        return String(val || 'pending');
      },
      // 可选：用于排序/筛选用的原始值
      accessor: (row) => {
        const v = row?.review_status ?? row?.task?.review_status ?? 'pending';
        return String(v || 'pending');
      },
      // 渲染到单元格里的内容（用我们全局的 .tag 样式）
      render: (value/*, row*/) => {
        const map = {
          pending:  '未审核',
          approved: '已通过',
          rejected: '已驳回',
        };
        const v = (value || 'pending').toLowerCase();
        const text = map[v] || map.pending;
        // 用最通用的字符串/HTML 渲染（不同版本可能也支持 ReactNode）
        return `<span class="tag" data-status="${v}">${text}</span>`;
      },
      // UI 细节
      width: 110,
      visible: true,
      // 某些版本使用 type/align 之类的字段，这里给出合理默认
      type: 'string',
      align: 'left',
    };

    // 3) 注入列：优先使用官方 addColumn；没有就直接 push 再触发刷新
    if (store?.addColumn) {
      store.addColumn(reviewStatusColumn);
    } else if (store?.columns && Array.isArray(store.columns)) {
      const exists = store.columns.find(c => c.id === 'review_status');
      if (!exists) store.columns.push(reviewStatusColumn);
      // 常见的刷新钩子：update/refresh/forceUpdate，按可用性调用一个
      (dataManager.update || dataManager.refresh || store.update || (()=>{})).call(dataManager);
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
  }, [LabelStudio, DataManager]);

  const destroyDM = useCallback(() => {
    if (dataManagerRef.current) {
      dataManagerRef.current.destroy();
      dataManagerRef.current = null;
    }
  }, [dataManagerRef]);

  useEffect(() => {
    init();

    return () => destroyDM();
  }, [root, init]);

  return crashed ? (
    <Block name="crash">
      <Elem name="info">Project was deleted or not yet created</Elem>

      <Button to="/projects">
        Back to projects
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

  const userRole = useMemo(() => detectUserRole(window.APP_SETTINGS?.user ?? {}), []);
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

  const links = {
    '/settings': 'Settings',
    '/data/import': "Import",
    '/data/export': 'Export',
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
        title: "Labeling",
      });
    }
  };

  const showLabelingInstruction = (currentMode) => {
    const isLabelStream = currentMode === 'labelstream';
    const {expert_instruction, show_instruction} = project;

    if (isLabelStream && show_instruction && expert_instruction) {
      modal({
        title: "Labeling Instructions",
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

  const sendReviewDecision = useCallback(async (decision) => {
    if (!dmRef) return;

    const selected = dmRef.store?.taskStore?.selected;
    const taskId = resolveTaskId(selected);

    if (!taskId) return;

    setPendingDecision(decision);

    try {
      const result = await dmRef.apiCall?.('reviewDecision', { taskID: taskId }, {
        body: { decision, comment: '' },
      });

      if (result) {
        const loadTask = dmRef.store?.taskStore?.loadTask;

        if (typeof loadTask === 'function') {
          await loadTask.call(dmRef.store.taskStore, taskId, { select: true });
        }

        extractTaskInfo();
      }
    } finally {
      setPendingDecision(null);
    }
  }, [dmRef, extractTaskInfo, resolveTaskId]);

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
            onClick={() => sendReviewDecision('approved')}
            title={approveDisabled && disabledMessage ? disabledMessage : undefined}
          >
            通过
          </Button>
          <Button
            size="compact"
            disabled={rejectDisabled}
            waiting={pendingDecision === 'rejected'}
            onClick={() => sendReviewDecision('rejected')}
            title={rejectDisabled && disabledMessage ? disabledMessage : undefined}
          >
            驳回
          </Button>
        </Space>
      )}

      {(project.expert_instruction && mode !== 'explorer') && (
        <Button size="compact" onClick={() => {
          modal({
            title: "Instructions",
            body: () => <div dangerouslySetInnerHTML={{__html: project.expert_instruction}}/>,
          });
        }}>
          Instructions
        </Button>
      )}

      {Object.entries(links).map(([path, label]) => (
        <Button
          key={path}
          tag={NavLink}
          size="compact"
          to={`/projects/${project.id}${path}`}
          data-external
        >
          {label}
        </Button>
      ))}
    </Space>
  ) : null;
};
