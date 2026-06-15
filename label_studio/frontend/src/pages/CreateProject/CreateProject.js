import React from 'react';
import { useHistory } from 'react-router';
import { Button } from '../../components';
import { Modal } from '../../components/Modal/Modal';
import { Space } from '../../components/Space/Space';
import { Select } from '../../components/Form/Elements';
import { useAPI } from '../../providers/ApiProvider';
import { cn } from '../../utils/bem';
import { ConfigPage } from './Config/Config';
import "./CreateProject.styl";
import { ImportPage } from './Import/Import';
import { useImportPage } from './Import/useImportPage';
import { useDraftProject } from './utils/useDraftProject';
import { t } from '../../i18n';
import { LsCheck, LsChevronRight } from '../../assets/icons';

const StepIconProject = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const StepIconUpload = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const StepIconConfig = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);


  const ProjectName = ({ name, setName, onSaveName, error, description, setDescription, modelClass, setModelClass, modelClassOptions, modelClassLoading, show = true }) => !show ? null :(
    <form className={cn("project-name")} onSubmit={e => { e.preventDefault(); }}>
      <div className="field field--wide">
        <label htmlFor="project_name">{t('createProject.projectName.label')}</label>
        <input name="name" id="project_name" value={name} onChange={e => setName(e.target.value)} onBlur={onSaveName} />
        {error && <span className="error">{error}</span>}
      </div>
      <div className="field field--wide">
        <label htmlFor="project_description">{t('createProject.projectDescription.label')}</label>
        <textarea
          name="description"
          id="project_description"
          placeholder={t('createProject.projectDescription.placeholder')}
          rows="4"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>
      <div className="field field--wide">
        <Select
          name="model_class"
          label={t('createProject.projectModelClass.label')}
          placeholder={t('createProject.projectModelClass.placeholder')}
          value={modelClass}
          options={modelClassOptions}
          onChange={e => setModelClass(e.target.value)}
          required
          disabled={modelClassLoading}
        />
      </div>
  </form>
);

const WizardSteps = ({ current, onSelect }) => {
  const steps = [
    { key: 'name', label: '项目信息', icon: <StepIconProject /> },
    { key: 'import', label: '数据导入', icon: <StepIconUpload /> },
    { key: 'config', label: '标注配置', icon: <StepIconConfig /> },
  ];

  const currentIndex = steps.findIndex(s => s.key === current);
  const stepsClass = cn('wizard-steps');
  const stepClass = cn('wizard-step');

  return (
    <div className={stepsClass.toString()}>
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const canClick = isCompleted;

        return (
          <React.Fragment key={step.key}>
            <button
              type="button"
              className={stepClass.mod({ completed: isCompleted, current: isCurrent, pending: !isCompleted && !isCurrent }).toString()}
              onClick={() => canClick && onSelect?.(step.key)}
              disabled={!canClick}
            >
              {isCompleted ? <LsCheck width="14" height="14" /> : step.icon}
              <span>{step.label}</span>
            </button>
            {index < steps.length - 1 && (
              <span className={stepClass.elem('arrow').toString()}>
                <LsChevronRight width="14" height="14" />
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const CreateProject = ({ onClose }) => {
  const [step, setStep] = React.useState("name");
  const [waiting, setWaitingStatus] = React.useState(false);
  const [configValid, setConfigValid] = React.useState(false);

  const project = useDraftProject();
  const history = useHistory();
  const api = useAPI();

  const [name, setName] = React.useState("");
  const [error, setError] = React.useState();
  const [description, setDescription] = React.useState("");
  const [config, setConfig] = React.useState("<View></View>");
  const [modelClass, setModelClass] = React.useState("");
  const [modelClassOptions, setModelClassOptions] = React.useState([]);
  const [modelClassLoading, setModelClassLoading] = React.useState(false);

  React.useEffect(() => { setError(null); }, [name, modelClass]);

  const { columns, uploading, uploadDisabled, finishUpload, pageProps } = useImportPage(project);

  const rootClass = cn("create-project");
  const stepOrder = ['name', 'import', 'config'];
  const currentIndex = stepOrder.indexOf(step);

  React.useEffect(() => project && !name && setName(project.title), [project]);

  React.useEffect(() => {
    let cancelled = false;

    const fetchModelClasses = async () => {
      setModelClassLoading(true);
      const result = await api.callApi('modelClassDict');

      if (!cancelled) {
        setModelClassLoading(false);
        if (result?.items) {
          setModelClassOptions(result.items);
        }
      }
    };

    fetchModelClasses();
    return () => { cancelled = true; };
  }, [api]);

  const projectBody = React.useMemo(() => ({
    title: name,
    description,
    label_config: config,
    model_class: modelClass,
  }), [name, description, config, modelClass]);

  const onCreate = React.useCallback(async () => {
    const imported = await finishUpload();
    if (!imported) return;

    setWaitingStatus(true);
    const response = await api.callApi('updateProject',{
      params: {
        pk: project.id,
      },
      body: projectBody,
    });

    if (response !== null) {
      await api.callApi('createFeDataset', {
        body: {
          datatype: modelClass,
          name,
          remark: description,
          type: 0,
        },
      });
      history.push(`/projects/${response.id}/data`);
    }
    setWaitingStatus(false);
  }, [project, projectBody, finishUpload, api, modelClass, name, description, history]);

  const onSaveName = async () => {
    if (!name.trim()) {
      setError('项目名不能为空');
      return false;
    }
    if (!modelClass) {
      setError('请选择模型分类');
      return false;
    }
    const res = await api.callApi('updateProjectRaw', {
      params: {
        pk: project.id,
      },
      body: {
        title: name,
        description,
        model_class: modelClass,
      },
    });
    if (res.ok) {
      setError(null);
      return true;
    }
    const err = await res.json();
    setError(err.validation_errors?.title || err.detail || '保存失败');
    return false;
  };

  const onCancel = React.useCallback(async () => {
    setWaitingStatus(true);
    if (project) await api.callApi('deleteProject', {
      params: {
        pk: project.id,
      },
    });
    setWaitingStatus(false);
    history.replace("/projects");
    onClose?.();
  }, [project]);

  const goToNextStep = async () => {
    if (step === 'name') {
      const ok = await onSaveName();
      if (ok) setStep('import');
    } else if (step === 'import') {
      setStep('config');
    }
  };

  const goToPrevStep = () => {
    if (step === 'import') setStep('name');
    else if (step === 'config') setStep('import');
  };

  const canGoNext = React.useMemo(() => {
    if (step === 'name') return name.trim().length > 0 && !error && !!modelClass;
    if (step === 'import') return !uploadDisabled;
    return false;
  }, [step, name, error, modelClass, uploadDisabled]);

  const canSave = React.useMemo(() => {
    return configValid && !uploadDisabled && !waiting && !uploading;
  }, [configValid, uploadDisabled, waiting, uploading]);

  const handleStepSelect = (nextStep) => {
    const nextIndex = stepOrder.indexOf(nextStep);
    if (nextIndex < currentIndex) {
      setStep(nextStep);
    }
  };

  return (
    <Modal onHide={() => history.push("/projects")} fullscreen visible bare closeOnClickOutside={false}>
      <div className={rootClass}>
        <Modal.Header>
          <h1>{t('createProject.header.title')}</h1>
          <WizardSteps current={step} onSelect={handleStepSelect} />
          <Button look="danger" size="compact" onClick={onCancel} waiting={waiting}>
            {t('createProject.actions.delete')}
          </Button>
        </Modal.Header>

        <div className={rootClass.elem("body")}>
          <ProjectName
            name={name}
            setName={setName}
            error={error}
            onSaveName={onSaveName}
            description={description}
            setDescription={setDescription}
            modelClass={modelClass}
            setModelClass={setModelClass}
            modelClassOptions={modelClassOptions}
            modelClassLoading={modelClassLoading}
            show={step === "name"}
          />
          <ImportPage project={project} show={step === "import"} {...pageProps} />
          <ConfigPage
            project={project}
            onUpdate={setConfig}
            show={step === "config"}
            columns={columns}
            disableSaveButton={true}
            onValidate={(validation) => setConfigValid(!validation?.error)}
          />
        </div>

        <div className={rootClass.elem("footer")}>
          <Space>
            {step !== 'name' && (
              <Button size="compact" onClick={goToPrevStep}>
                上一步
              </Button>
            )}
            {step === 'name' && (
              <Button look="primary" size="compact" onClick={goToNextStep} disabled={!canGoNext}>
                下一步
              </Button>
            )}
            {step === 'import' && (
              <Button look="primary" size="compact" onClick={goToNextStep} disabled={!canGoNext}>
                下一步
              </Button>
            )}
            {step === 'config' && (
              <Button look="primary" size="compact" onClick={onCreate} disabled={!canSave} waiting={waiting || uploading}>
                保存
              </Button>
            )}
          </Space>
        </div>
      </div>
    </Modal>
  );
};

CreateProject.title = 'Create Project';
CreateProject.path = '/create-project';
CreateProject.exact = true;
CreateProject.context = () => null;
