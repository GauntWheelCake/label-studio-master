import React, { useCallback, useContext } from 'react';
import { Button } from '../../components';
import { Form, Input, TextArea } from '../../components/Form';
import { ProjectContext } from '../../providers/ProjectProvider';
import { t } from '../../i18n';

export const GeneralSettings = () => {
  const {project, fetchProject} = useContext(ProjectContext);

  const updateProject = useCallback(() => {
    if (project.id) fetchProject(project.id, true);
  }, [project]);

  return (
    <div style={{width: 480}}>
      <Form
        action="updateProject"
        formData={{...project}}
        params={{pk: project.id}}
        onSubmit={updateProject}
      >
        <Form.Row columnCount={1} rowGap="32px">
          <Input
            name="title"
            label={t('projectSettings.general.projectName.label')}
            labelProps={{large: true}}
          />

          <TextArea
            name="description"
            label={t('projectSettings.general.description.label')}
            labelProps={{large: true}}
            style={{minHeight: 128}}
          />
        </Form.Row>

        <Form.Actions>
          <Form.Indicator>
            <span case="success">{t('projectSettings.form.saved')}</span>
          </Form.Indicator>
          <Button type="submit" look="primary" style={{width: 120}}>{t('projectSettings.form.save')}</Button>
        </Form.Actions>
      </Form>
    </div>
  );
};

GeneralSettings.menuItem = t('projectSettings.menu.general');
GeneralSettings.path = "/";
GeneralSettings.exact = true;
