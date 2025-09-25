import { format } from 'date-fns';
import { useCallback, useContext } from 'react';
import { FaEllipsisV } from 'react-icons/fa';
import truncate from 'truncate-middle';
import { Button, Card, Dropdown, Menu } from '../../../components';
import { DescriptionList } from '../../../components/DescriptionList/DescriptionList';
import { confirm } from '../../../components/Modal/Modal';
import { Oneof } from '../../../components/Oneof/Oneof';
import { ApiContext } from '../../../providers/ApiProvider';
import { cn } from '../../../utils/bem';
import { t } from '../../../i18n';

export const MachineLearningList = ({ backends, fetchBackends, onEdit }) => {
  const rootClass = cn('ml');
  const api = useContext(ApiContext);

  const onDeleteModel = useCallback(async (backend) => {
    await api.callApi('deleteMLBackend', {
      params: {
        pk: backend.id,
      },
    });
    await fetchBackends();
  }, [fetchBackends, api]);

  const onStartTraining = useCallback(async (backend) => {
    await api.callApi('trainMLBackend', {
      params: {
        pk: backend.id,
      },
    });
    await fetchBackends();
  }, [fetchBackends, api]);

  return (
    <div className={rootClass}>
      {backends.map(backend => (
        <BackendCard
          key={backend.id}
          backend={backend}
          onStartTrain={onStartTraining}
          onDelete={onDeleteModel}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
};

const BackendCard = ({backend, onStartTrain, onEdit, onDelete}) => {
  const confirmDelete = useCallback((backend) => {
    confirm({
      title: t('projectSettings.machineLearning.list.confirm.title'),
      body: t('projectSettings.machineLearning.list.confirm.body'),
      buttonLook: "destructive",
      onOk(){ onDelete?.(backend); },
    });
  }, [backend, onDelete]);

  return (
    <Card style={{marginTop: 0}} header={backend.title} extra={(
      <div className={cn('ml').elem('info')}>
        <BackendState backend={backend}/>

        <Dropdown.Trigger align="right" content={(
          <Menu size="small">
            <Menu.Item onClick={() => onEdit(backend)}>{t('projectSettings.machineLearning.list.actions.edit')}</Menu.Item>
            <Menu.Item onClick={() => confirmDelete(backend)}>{t('projectSettings.machineLearning.list.actions.delete')}</Menu.Item>
          </Menu>
        )}>
          <Button type="link" icon={<FaEllipsisV/>}/>
        </Dropdown.Trigger>
      </div>
    )}>
      <DescriptionList className={cn('ml').elem('summary')}>
        <DescriptionList.Item term={t('projectSettings.machineLearning.list.fields.url')} termStyle={{whiteSpace: 'nowrap'}}>
          {truncate(backend.url, 20, 10, '...')}
        </DescriptionList.Item>
        {backend.description && (
          <DescriptionList.Item
            term={t('projectSettings.machineLearning.list.fields.description')}
            children={backend.description}
          />
        )}
        <DescriptionList.Item term={t('projectSettings.machineLearning.list.fields.version')}>
          {backend.version ? format(new Date(backend.version), 'yyyy年MM月dd日 HH:mm:ss') : t('projectSettings.machineLearning.list.fields.unknown')}
        </DescriptionList.Item>
      </DescriptionList>

      <Button disabled={backend.state !== "CO"} onClick={() => onStartTrain(backend)}>
        {t('projectSettings.machineLearning.list.actions.startTraining')}
      </Button>
    </Card>
  );
};

const BackendState = ({backend}) => {
  const { state } = backend;
  return (
    <div className={cn('ml').elem('status')}>
      <span className={cn('ml').elem('indicator').mod({state})}></span>
      <Oneof value={state} className={cn('ml').elem('status-label')}>
        <span case="DI">{t('projectSettings.machineLearning.list.status.disconnected')}</span>
        <span case="CO">{t('projectSettings.machineLearning.list.status.connected')}</span>
        <span case="ER">{t('projectSettings.machineLearning.list.status.error')}</span>
        <span case="TR">{t('projectSettings.machineLearning.list.status.training')}</span>
        <span case="PR">{t('projectSettings.machineLearning.list.status.predicting')}</span>
      </Oneof>
    </div>
  );
};
