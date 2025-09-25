import { useMemo, useState } from "react";
import { useHistory } from "react-router";
import { Button } from "../../components";
import { Label } from "../../components/Form";
import { confirm } from "../../components/Modal/Modal";
import { Space } from "../../components/Space/Space";
import { Spinner } from "../../components/Spinner/Spinner";
import { useAPI } from "../../providers/ApiProvider";
import { useProject } from "../../providers/ProjectProvider";
import { t } from "../../i18n";

export const DangerZone = () => {
  const {project} = useProject();
  const api = useAPI();
  const history = useHistory();
  const [processing, setProcessing] = useState(null);

  const handleOnClick = (type) => () => {
    confirm({
      title: t('projectSettings.dangerZone.confirm.title'),
      body: t('projectSettings.dangerZone.confirm.body'),
      okText: t('projectSettings.dangerZone.confirm.ok'),
      buttonLook: "destructive",
      onOk: async () => {
        setProcessing(type);
        if(type === 'annotations') {
          // console.log('delete annotations');
        } else if(type === 'tasks') {
          // console.log('delete tasks');
        } else if(type === 'predictions') {
          // console.log('delete predictions');
        } else if(type === 'tabs') {
          await api.callApi('deleteTabs', {
            body: {
              project: project.id,
            },
          });
        } else if(type === 'project') {
          await api.callApi('deleteProject', {
            params: {
              pk: project.id,
            },
          });
          history.replace('/projects');
        }
        setProcessing(null);
      },
    });
  };

  const formatCountLabel = (key, count) => {
    const template = t(key);
    const value = count ?? 0;

    return template.includes('{count}') ? template.replace('{count}', value) : template;
  };

  const buttons = useMemo(() => [{
    type: 'annotations',
    disabled: true, //&& !project.total_annotations_number,
    label: formatCountLabel('projectSettings.dangerZone.actions.deleteAnnotations', project.total_annotations_number),
  }, {
    type: 'tasks',
    disabled: true, //&& !project.task_number,
    label: formatCountLabel('projectSettings.dangerZone.actions.deleteTasks', project.task_number),
  }, {
    type: 'predictions',
    disabled: true, //&& !project.total_predictions_number,
    label: formatCountLabel('projectSettings.dangerZone.actions.deletePredictions', project.total_predictions_number),
  }, {
    type: 'tabs',
    label: t('projectSettings.dangerZone.actions.dropTabs'),
  }, {
    type: 'project',
    label: t('projectSettings.dangerZone.actions.deleteProject'),
  }], [project]);

  return (
    <div style={{width: 480}}>
      <Label
        text={t('projectSettings.dangerZone.heading')}
        description={t('projectSettings.dangerZone.description')}
        style={{display: 'block', width: 415}}
      />

      {project.id ? (
        <Space direction="vertical" spread style={{marginTop: 32}}>
          {buttons.map((btn) => {
            const waiting = processing === btn.type;
            const disabled = btn.disabled || (processing && !waiting);
            return (btn.disabled !== true) && (
              <Button key={btn.type} look="danger" disabled={disabled} waiting={waiting} onClick={handleOnClick(btn.type)}>
                {btn.label}
              </Button>
            );
          })}
        </Space>
      ) : (
        <div style={{display: "flex", justifyContent: "center", marginTop: 32}}>
          <Spinner size={32}/>
        </div>
      )}
    </div>
  );
};

DangerZone.title = t('projectSettings.menu.dangerZone');
DangerZone.path = "/danger-zone";
