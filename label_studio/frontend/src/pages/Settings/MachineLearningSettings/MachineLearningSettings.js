import { useCallback, useContext, useEffect, useState } from 'react';
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
import { t } from '../../../i18n';
import './MachineLearningSettings.styl';

export const MachineLearningSettings = () => {
  const api = useAPI();
  const {project, fetchProject, updateProject} = useContext(ProjectContext);
  const [mlError, setMLError] = useState();
  const [backends, setBackends] = useState([]);
  const [versions, setVersions] = useState([]);

  const resetMLVersion = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();

    await updateProject({
      model_version: null,
    });
  }, [api, project]);

  const fetchBackends = useCallback(async () => {
    const models = await api.callApi('mlBackends', {
      params: {
        project: project.id,
      },
    });


    if (models) setBackends(models);
  }, [api, project, setBackends]);

  const fetchMLVersions = useCallback(async () => {
    const versions = await api.callApi("modelVersions", {
      params: {
        pk: project.id,
      },
    });

    setVersions(versions);
  }, [api, project.id]);

  const showMLFormModal = useCallback((backend) => {
    const action = backend ? "updateMLBackend" : "addMLBackend";
    const modalProps = {
      title: backend ? t('projectSettings.machineLearning.form.editTitle') : t('projectSettings.machineLearning.form.addTitle'),
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
            <Input name="title" label={t('projectSettings.machineLearning.form.name')} placeholder={t('projectSettings.machineLearning.form.namePlaceholder')}/>
            <Input name="url" label={t('projectSettings.machineLearning.form.url')} required/>
          </Form.Row>

          <Form.Row columnCount={1}>
            <TextArea name="description" label={t('projectSettings.machineLearning.form.description')} style={{minHeight: 120}}/>
          </Form.Row>

          <Form.Actions>
            <Button type="submit" look="primary" onClick={() => setMLError(null)}>
              {t('projectSettings.machineLearning.form.submit')}
            </Button>
          </Form.Actions>

          <Form.ResponseParser>{response => (
            <>
              {response.error_message && (
                <ErrorWrapper error={{
                  response: {
                    detail: backend ? t('projectSettings.machineLearning.form.saveError') : t('projectSettings.machineLearning.form.addError'),
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
      <Description style={{marginTop: 0, maxWidth: 680}}>
        {t('projectSettings.machineLearning.description.intro')}
        {t('projectSettings.machineLearning.description.hint')}
        {t('projectSettings.machineLearning.description.link')}
        {t('projectSettings.machineLearning.description.suffix')}
      </Description>
      <Button onClick={() => showMLFormModal()}>
        {t('projectSettings.machineLearning.actions.addModel')}
      </Button>

      <Divider height={32}/>

      <Form action="updateProject"
        formData={{...project}}
        params={{pk: project.id}}
        onSubmit={() => fetchProject()}
        autosubmit
      >
        <Form.Row columnCount={1}>
          <Label text={t('projectSettings.machineLearning.section.assistedLabeling')} large/>

          <div style={{paddingLeft: 16}}>
            <Toggle
              label={t('projectSettings.machineLearning.section.startTraining')}
              name="start_training_on_annotation_update"
            />
          </div>

          <div style={{paddingLeft: 16}}>
            <Toggle
              label={t('projectSettings.machineLearning.section.retrievePredictions')}
              name="evaluate_predictions_automatically"
            />
          </div>

          <div style={{paddingLeft: 16}}>
            <Toggle
              label={t('projectSettings.machineLearning.section.showPredictions')}
              name="show_collab_predictions"
            />
          </div>
        </Form.Row>

        {versions.length > 1 && (
          <Form.Row columnCount={1}>
            <Label
              text={t('projectSettings.machineLearning.section.modelVersion')}
              description={t('projectSettings.machineLearning.section.modelVersionDescription')}
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
                  placeholder={t('projectSettings.machineLearning.section.modelVersionPlaceholder')}
                />
              </div>

              <Button onClick={resetMLVersion}>
                {t('projectSettings.machineLearning.actions.reset')}
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

MachineLearningSettings.title = t('projectSettings.menu.machineLearning');
MachineLearningSettings.path = "/ml";
