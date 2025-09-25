import { useCallback, useContext, useEffect, useRef } from 'react';
import { Button } from '../../components';
import { Form, Label, TextArea, Toggle } from '../../components/Form';
import { MenubarContext } from '../../components/Menubar/Menubar';
import { ProjectContext } from '../../providers/ProjectProvider';
import { t } from '../../i18n';

export const InstructionsSettings = () => {
  const {project, fetchProject} = useContext(ProjectContext);
  const pageContext = useContext(MenubarContext);
  const formRef = useRef();

  useEffect(() => {
    pageContext.setProps({formRef});
  }, [formRef]);

  const updateProject = useCallback(() => {
    fetchProject(project.id, true);
  }, [project]);

  return (
    <div style={{width: 480}}>
      <Form ref={formRef} action="updateProject" formData={{...project}} params={{pk: project.id}} onSubmit={updateProject}>
        <Form.Row columnCount={1}>
          <Label text={t('projectSettings.instructions.label')} large/>
          <div style={{paddingLeft: 16}}>
            <Toggle label={t('projectSettings.instructions.toggle')} name="show_instruction"/>
          </div>
          <div style={{color: "rgba(0,0,0,0.4)", paddingLeft: 16}}>
            {t('projectSettings.instructions.hint')}
          </div>
        </Form.Row>

        <Form.Row columnCount={1}>
          <TextArea name="expert_instruction" style={{minHeight: 128}}/>
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

InstructionsSettings.title = t('projectSettings.menu.instructions');
InstructionsSettings.path = "/instruction";
