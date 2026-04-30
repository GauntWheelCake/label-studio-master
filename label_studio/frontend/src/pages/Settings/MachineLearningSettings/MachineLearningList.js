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

  return (
    <div className={rootClass}>
      {backends.map(backend => (
        <BackendCard
          key={backend.id}
          backend={backend}
          onDelete={onDeleteModel}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
};

const BackendCard = ({ backend, onEdit, onDelete }) => {
  const confirmDelete = useCallback((backend) => {
    confirm({
      title: '删除智能标注模型',
      body: '此操作无法撤销，确定继续吗？',
      buttonLook: 'destructive',
      onOk() {
        onDelete?.(backend);
      },
    });
  }, [backend, onDelete]);

  return (
    <Card style={{ marginTop: 0 }} header={backend.title} extra={(
      <div className={cn('ml').elem('info')}>
        <BackendState backend={backend}/>

        <Dropdown.Trigger align="right" content={(
          <Menu size="small">
            <Menu.Item onClick={() => onEdit(backend)}>编辑</Menu.Item>
            <Menu.Item onClick={() => confirmDelete(backend)}>删除</Menu.Item>
          </Menu>
        )}>
          <Button type="link" icon={<FaEllipsisV/>}/>
        </Dropdown.Trigger>
      </div>
    )}>
      <DescriptionList className={cn('ml').elem('summary')}>
        <DescriptionList.Item term="服务地址" termStyle={{ whiteSpace: 'nowrap' }}>
          {truncate(backend.url, 20, 10, '...')}
        </DescriptionList.Item>
        {backend.description && (
          <DescriptionList.Item
            term="说明"
            children={backend.description}
          />
        )}
        <DescriptionList.Item term="模型版本">
          {backend.version ? format(new Date(backend.version), 'yyyy-MM-dd HH:mm:ss') : '未知'}
        </DescriptionList.Item>
      </DescriptionList>

    </Card>
  );
};

const BackendState = ({ backend }) => {
  const { state } = backend;

  return (
    <div className={cn('ml').elem('status')}>
      <span className={cn('ml').elem('indicator').mod({ state })}></span>
      <Oneof value={state} className={cn('ml').elem('status-label')}>
        <span case="DI">未连接</span>
        <span case="CO">已连接</span>
        <span case="ER">连接异常</span>
        <span case="TR">训练中</span>
        <span case="PR">生成中</span>
      </Oneof>
    </div>
  );
};
