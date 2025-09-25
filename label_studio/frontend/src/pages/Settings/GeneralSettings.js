import React, { useCallback, useContext } from 'react';
import { Button } from '../../components';
import { Form, Input, TextArea } from '../../components/Form';
import { RadioGroup } from '../../components/Form/Elements/RadioGroup/RadioGroup';
import { ProjectContext } from '../../providers/ProjectProvider';
import { Block } from '../../utils/bem';
import { t } from '../../i18n';

export const GeneralSettings = () => {
  const {project, fetchProject} = useContext(ProjectContext);

  const updateProject = useCallback(() => {
    if (project.id) fetchProject(project.id, true);
  }, [project]);

  const colors = [
    '#FFFFFF',
    '#F52B4F',
    '#FA8C16',
    '#F6C549',
    '#9ACA4F',
    '#51AAFD',
    '#7F64FF',
    '#D55C9D',
  ];

  const samplings = [
    {
      value: "Sequential",
      label: t('projectSettings.general.sampling.sequential.label'),
      description: t('projectSettings.general.sampling.sequential.description'),
    },
    {
      value: "Uniform",
      label: t('projectSettings.general.sampling.uniform.label'),
      description: t('projectSettings.general.sampling.uniform.description'),
    },
  ];

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

          <RadioGroup name="color" label={t('projectSettings.general.color.label')} size="large" labelProps={{size: "large"}}>
            {colors.map(color => (
              <RadioGroup.Button key={color} value={color}>
                <Block name="color" style={{'--background': color}}/>
              </RadioGroup.Button>
            ))}
          </RadioGroup>

          <RadioGroup label={t('projectSettings.general.sampling.label')} labelProps={{size: "large"}} name="sampling" simple>
            {samplings.map(({value, label, description}) => (
              <RadioGroup.Button
                key={value}
                value={`${value} sampling`}
                label={label}
                description={description}
              />
            ))}
          </RadioGroup>
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
