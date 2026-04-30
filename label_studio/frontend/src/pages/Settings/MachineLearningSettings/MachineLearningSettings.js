import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Button } from '../../../components';
import { Description } from '../../../components/Description/Description';
import { Divider } from '../../../components/Divider/Divider';
import { ErrorWrapper } from '../../../components/Error/Error';
import { InlineError } from '../../../components/Error/InlineError';
import { Form, Input, Label, Select, TextArea, Toggle } from '../../../components/Form';
import { modal } from '../../../components/Modal/Modal';
import { useAPI } from '../../../providers/ApiProvider';
import { ProjectContext } from '../../../providers/ProjectProvider';
import { MachineLearningList } from './MachineLearningList';
import './MachineLearningSettings.styl';

const text = {
  title: '\u667a\u80fd\u6807\u6ce8',
  description: '\u8fde\u63a5\u4e00\u4e2a\u667a\u80fd\u6807\u6ce8\u6a21\u578b\uff0c\u4e3a\u9879\u76ee\u6570\u636e\u751f\u6210 AI \u521d\u7a3f\u3002\u751f\u6210\u7ed3\u679c\u9700\u8981\u4eba\u5de5\u786e\u8ba4\u6216\u4fee\u6539\u540e\uff0c\u624d\u4f1a\u6210\u4e3a\u6b63\u5f0f\u6807\u6ce8\u3002',
  connectDefault: '\u8fde\u63a5\u9ed8\u8ba4\u667a\u80fd\u6807\u6ce8\u6a21\u578b',
  connectCustom: '\u8fde\u63a5\u81ea\u5b9a\u4e49\u6a21\u578b\u670d\u52a1',
  editTitle: '\u7f16\u8f91\u667a\u80fd\u6807\u6ce8\u6a21\u578b',
  addTitle: '\u8fde\u63a5\u667a\u80fd\u6807\u6ce8\u6a21\u578b',
  name: '\u6a21\u578b\u540d\u79f0',
  namePlaceholder: '\u4f8b\u5982\uff1a\u672c\u673a\u667a\u80fd\u6807\u6ce8\u670d\u52a1',
  url: '\u6a21\u578b\u670d\u52a1\u5730\u5740',
  descriptionField: '\u8bf4\u660e',
  submit: '\u6d4b\u8bd5\u8fde\u63a5\u5e76\u4fdd\u5b58',
  saveError: '\u667a\u80fd\u6807\u6ce8\u6a21\u578b\u4fdd\u5b58\u5931\u8d25\u3002',
  addError: '\u667a\u80fd\u6807\u6ce8\u6a21\u578b\u8fde\u63a5\u5931\u8d25\u3002',
  settings: '\u667a\u80fd\u6807\u6ce8\u4f7f\u7528\u8bbe\u7f6e',
  autoDraft: '\u6253\u5f00\u4efb\u52a1\u65f6\u81ea\u52a8\u751f\u6210 AI \u521d\u7a3f',
  showDrafts: '\u6807\u6ce8\u65f6\u663e\u793a AI \u521d\u7a3f',
  modelVersion: '\u6a21\u578b\u7248\u672c',
  modelVersionDescription: '\u9009\u62e9\u5411\u6807\u6ce8\u5458\u5c55\u793a\u54ea\u4e00\u4e2a\u6a21\u578b\u7248\u672c\u751f\u6210\u7684 AI \u521d\u7a3f\u3002',
  modelVersionPlaceholder: '\u672a\u9009\u62e9\u6a21\u578b\u7248\u672c',
  reset: '\u91cd\u7f6e',
  connecting: '\u6b63\u5728\u5c1d\u8bd5\u8fde\u63a5\u9ed8\u8ba4\u667a\u80fd\u6807\u6ce8\u6a21\u578b...',
  defaultConnected: '\u9ed8\u8ba4\u667a\u80fd\u6807\u6ce8\u6a21\u578b\u5df2\u8fde\u63a5',
  defaultFailed: '\u672a\u80fd\u81ea\u52a8\u8fde\u63a5\u9ed8\u8ba4\u667a\u80fd\u6807\u6ce8\u6a21\u578b',
  ok: '\u77e5\u9053\u4e86',
};

const DEFAULT_BACKEND_TITLE = 'Default Smart Labeling Backend';
const DEFAULT_BACKEND_DESCRIPTION = 'Faster R-CNN default ML backend for smart pre-annotation.';

const uniq = (items) => [...new Set(items.filter(Boolean))];

const getDefaultBackendCandidates = () => {
  const location = window.location;
  const protocol = location?.protocol || 'http:';
  const hostname = location?.hostname || 'localhost';
  const hostLike = ['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname);

  if (hostLike) {
    // Local dev on host machine: prefer host mapped port first.
    return uniq([
      `${protocol}//127.0.0.1:9090`,
      `${protocol}//localhost:9090`,
      `${protocol}//${hostname}:9090`,
      `${protocol}//127.0.0.1:9091`,
    ]);
  }

  // Non-localhost hostnames are usually containerized or remote setups.
  return uniq([
    'http://ml-backend:9091',
    `${protocol}//${hostname}:9091`,
    'http://host.docker.internal:9090',
    'http://host.docker.internal:9091',
  ]);
};

const checkBackendHealth = async (url) => {
  const normalized = url.endsWith('/') ? url.slice(0, -1) : url;
  try {
    const response = await fetch(`${normalized}/health`, { method: 'GET' });
    return response.ok;
  } catch (error) {
    return false;
  }
};

const showInfoModal = (title, body) => {
  let modalRef;

  modalRef = modal({
    title,
    body: () => <div style={{ whiteSpace: 'pre-wrap' }}>{body}</div>,
    footer: (
      <Button look="primary" onClick={() => modalRef?.close()}>
        {text.ok}
      </Button>
    ),
  });
};

export const MachineLearningSettings = () => {
  const api = useAPI();
  const {project, fetchProject, updateProject} = useContext(ProjectContext);
  const [mlError, setMLError] = useState();
  const [backends, setBackends] = useState([]);
  const [versions, setVersions] = useState([]);
  const [connectingDefault, setConnectingDefault] = useState(false);
  const defaultCandidates = useMemo(getDefaultBackendCandidates, []);

  const resetMLVersion = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();

    await updateProject({
      model_version: null,
    });
  }, [project, updateProject]);

  const fetchBackends = useCallback(async () => {
    const models = await api.callApi('mlBackends', {
      params: {
        project: project.id,
      },
    });

    if (models) setBackends(models);
  }, [api, project, setBackends]);

  const fetchMLVersions = useCallback(async () => {
    const versions = await api.callApi('modelVersions', {
      params: {
        pk: project.id,
      },
    });

    setVersions(versions);
  }, [api, project.id]);

  const connectDefaultBackend = useCallback(async () => {
    if (!project?.id || connectingDefault) return;

    setConnectingDefault(true);
    const failures = [];

    try {
      let reachableUrl = null;
      for (const url of defaultCandidates) {
        // Do a silent health check first to avoid noisy global request errors.
        // Only the first healthy candidate will be used for backend creation.
        // eslint-disable-next-line no-await-in-loop
        const healthy = await checkBackendHealth(url);
        if (healthy) {
          reachableUrl = url;
          break;
        }
        failures.push(`${url}: health check failed`);
      }

      if (!reachableUrl) {
        showInfoModal(
          text.defaultFailed,
          `${text.defaultFailed}\n\n${failures.join('\n')}\n\nYou can still use "${text.connectCustom}" and enter the backend URL manually.`
        );
        return;
      }

      const existing = backends.find((backend) => backend.url === reachableUrl);
      if (existing) {
        showInfoModal(text.defaultConnected, `${existing.title || DEFAULT_BACKEND_TITLE}\n${reachableUrl}`);
        return;
      }

      const response = await api.callApi('addMLBackend', {
        params: {},
        body: {
          project: project.id,
          title: DEFAULT_BACKEND_TITLE,
          url: reachableUrl,
          description: DEFAULT_BACKEND_DESCRIPTION,
        },
        errorFilter: () => true,
      });

      if (response && !response.error && !response.error_message) {
        await fetchBackends();
        await fetchMLVersions();
        showInfoModal(text.defaultConnected, `${DEFAULT_BACKEND_TITLE}\n${reachableUrl}`);
        return;
      }

      failures.push(
        `${reachableUrl}: ${response?.response?.detail || response?.error || response?.error_message || 'failed'}`
      );
      showInfoModal(
        text.defaultFailed,
        `${text.defaultFailed}\n\n${failures.join('\n')}\n\nYou can still use "${text.connectCustom}" and enter the backend URL manually.`
      );
    } finally {
      setConnectingDefault(false);
    }
  }, [api, backends, connectingDefault, defaultCandidates, fetchBackends, fetchMLVersions, project?.id]);

  const showMLFormModal = useCallback((backend) => {
    const action = backend ? 'updateMLBackend' : 'addMLBackend';
    const modalProps = {
      title: backend ? text.editTitle : text.addTitle,
      style: { width: 760 },
      closeOnClickOutside: false,
      body: (
        <Form
          action={action}
          formData={{ ...(backend ?? {}) }}
          params={{ pk: backend?.id }}
          onSubmit={async (response) => {
            if (!response.error_message) {
              await fetchBackends();
              modalRef.close();
            }
          }}
        >
          <Input type="hidden" name="project" value={project.id}/>

          <Form.Row columnCount={2}>
            <Input name="title" label={text.name} placeholder={text.namePlaceholder}/>
            <Input name="url" label={text.url} required/>
          </Form.Row>

          <Form.Row columnCount={1}>
            <TextArea name="description" label={text.descriptionField} style={{minHeight: 120}}/>
          </Form.Row>

          <Form.Actions>
            <Button type="submit" look="primary" onClick={() => setMLError(null)}>
              {text.submit}
            </Button>
          </Form.Actions>

          <Form.ResponseParser>{response => (
            <>
              {response.error_message && (
                <ErrorWrapper error={{
                  response: {
                    detail: backend ? text.saveError : text.addError,
                    exc_info: response.error_message,
                  },
                }}/>
              )}
            </>
          )}</Form.ResponseParser>

          <InlineError/>
        </Form>
      ),
    };

    const modalRef = modal(modalProps);
  }, [project, fetchBackends, mlError]);

  useEffect(() => {
    if (project.id) {
      fetchBackends();
      fetchMLVersions();
    }
  }, [project]);

  return (
    <>
      <Description style={{marginTop: 0, maxWidth: 760}}>
        {text.description}
      </Description>

      <div style={{display: 'flex', gap: 12, flexWrap: 'wrap'}}>
        <Button look="primary" waiting={connectingDefault} onClick={connectDefaultBackend}>
          {connectingDefault ? text.connecting : text.connectDefault}
        </Button>
        <Button onClick={() => showMLFormModal()}>
          {text.connectCustom}
        </Button>
      </div>

      <Divider height={32}/>

      <Form action="updateProject"
        formData={{...project}}
        params={{pk: project.id}}
        onSubmit={() => fetchProject()}
        autosubmit
      >
        <Form.Row columnCount={1}>
          <Label text={text.settings} large/>

          <div style={{paddingLeft: 16}}>
            <Toggle
              label={text.autoDraft}
              name="evaluate_predictions_automatically"
            />
          </div>

          <div style={{paddingLeft: 16}}>
            <Toggle
              label={text.showDrafts}
              name="show_collab_predictions"
            />
          </div>
        </Form.Row>

        {versions.length > 1 && (
          <Form.Row columnCount={1}>
            <Label
              text={text.modelVersion}
              description={text.modelVersionDescription}
              style={{marginTop: 16}}
              large
            />

            <div style={{display: 'flex', alignItems: 'center', width: 400, paddingLeft: 16}}>
              <div style={{flex: 1, paddingRight: 16}}>
                <Select
                  name="model_version"
                  defaultValue={null}
                  options={[
                    ...versions,
                  ]}
                  placeholder={text.modelVersionPlaceholder}
                />
              </div>

              <Button onClick={resetMLVersion}>
                {text.reset}
              </Button>
            </div>
          </Form.Row>
        )}
      </Form>

      <MachineLearningList
        onEdit={(backend) => showMLFormModal(backend)}
        fetchBackends={fetchBackends}
        backends={backends}
      />
    </>
  );
};

MachineLearningSettings.title = text.title;
MachineLearningSettings.path = '/ml';
