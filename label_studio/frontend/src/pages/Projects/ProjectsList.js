import chr from 'chroma-js';
import { format } from 'date-fns';
import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { LsBulb, LsCheck, LsEllipsis, LsMinus } from '../../assets/icons';
import { Button, Dropdown, Menu, Userpic } from '../../components';
import { modal } from '../../components/Modal/Modal';
import { useAPI } from '../../providers/ApiProvider';
import { Block, Elem } from '../../utils/bem';
import { absoluteURL } from '../../utils/helpers';
import { t } from '../../i18n';

export const ProjectsList = ({ projects, openModal, onProjectDelete }) => {
  return (
    <Elem name="list">
      {projects.map(project => (
        <ProjectCard key={project.id} project={project} onDelete={onProjectDelete} />
      ))}
      <CreateProjectCard onClick={openModal} />
    </Elem>
  );
};

export const EmptyProjectsList = ({ openModal }) => {
  return (
    <Block name="empty-projects-page">
      <Elem name="heidi" tag="img" src={absoluteURL("/static/images/opossum_looking.png")} />
      <Elem name="header" tag="h1">{t('projectsPage.empty.title')}</Elem>
      <p>{t('projectsPage.empty.description')}</p>
      <Elem name="action" tag={Button} onClick={openModal} look="primary">{t('projectsPage.empty.action')}</Elem>
    </Block>
  );
};

const CreateProjectCard = ({ onClick }) => {
  return (
    <Elem name="link" tag="button" type="button" mod={{ create: true }} onClick={onClick}>
      <Block name="project-card" mod={{ create: true }}>
        <Elem name="header">
          <Elem name="title">
            <Elem name="title-text">
              {t('projectsPage.createCard.title')}
            </Elem>
          </Elem>
          <Elem name="summary">
            {t('projectsPage.createCard.description')}
          </Elem>
        </Elem>
        <Elem name="description">
          {t('projectsPage.createCard.hint')}
        </Elem>
        <Elem name="info">
          <Button look="primary">{t('projectsPage.context.createButton')}</Button>
        </Elem>
      </Block>
    </Elem>
  );
};

const ProjectCard = ({ project, onDelete }) => {
  const api = useAPI();
  const dropdownRef = React.useRef(null);
  const color = useMemo(() => {
    return project.color === '#FFFFFF' ? null : project.color;
  }, [project]);

  const projectColors = useMemo(() => {
    return color ? {
      '--header-color': color,
      '--background-color': chr(color).alpha(0.2).css(),
    } : {};
  }, [color]);

  const handleDelete = (e) => {
    e.stopPropagation();
    e.preventDefault();

    dropdownRef.current?.close();

    const title = project.title ?? t('projectsPage.card.untitled');
    let modalRef;

    modalRef = modal({
      title: '删除项目',
      body: () => (
        <div style={{ whiteSpace: 'pre-wrap' }}>
          确定要删除项目 "{title}" 吗？此操作不可撤销，项目中的所有标注数据也将被删除。
        </div>
      ),
      footer: (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button onClick={() => modalRef?.close()}>
            取消
          </Button>
          <Button look="destructive" onClick={async () => {
            modalRef?.close();
            await api.callApi('deleteProject', { params: { pk: project.id } });
            onDelete?.();
          }}>
            删除
          </Button>
        </div>
      ),
    });
  };

  return (
    <Elem tag={NavLink} name="link" to={`/projects/${project.id}/data`} data-external>
      <Block name="project-card" mod={{ colored: !!color }} style={projectColors}>
        <Elem name="header">
          <Elem name="title">
            <Elem name="title-text">
              {project.title ?? t('projectsPage.card.untitled')}
            </Elem>

            <Elem name="menu" onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}>
              <Dropdown.Trigger ref={dropdownRef} content={(
                <Menu>
                  <Menu.Item href={`/projects/${project.id}/settings`}>{t('projectsPage.card.menu.settings')}</Menu.Item>
                  <Menu.Item href={`/projects/${project.id}/data?labeling=1`}>{t('projectsPage.card.menu.label')}</Menu.Item>
                  <Menu.Item onClick={handleDelete}>删除项目</Menu.Item>
                </Menu>
              )}>
                <Button size="small" type="text" icon={<LsEllipsis />} />
              </Dropdown.Trigger>
            </Elem>
          </Elem>
          <Elem name="summary">
            <Elem name="annotation">
              <Elem name="total">
                {project.num_tasks_with_annotations} / {project.task_number}
              </Elem>
              <Elem name="detail">
                <Elem name="detail-item" mod={{ type: "completed" }}>
                  <Elem tag={LsCheck} name="icon" />
                  {project.total_annotations_number}
                </Elem>
                <Elem name="detail-item" mod={{ type: "rejected" }}>
                  <Elem tag={LsMinus} name="icon" />
                  {project.skipped_annotations_number}
                </Elem>
                <Elem name="detail-item" mod={{ type: "predictions" }}>
                  <Elem tag={LsBulb} name="icon" />
                  {project.total_predictions_number}
                </Elem>
              </Elem>
            </Elem>
          </Elem>
        </Elem>
        <Elem name="description">
          {project.description}
        </Elem>
        <Elem name="info">
          {project.created_at && (
            <Elem name="created-date">
              {t('projectsPage.card.createdAt')} {format(new Date(project.created_at), 'yyyy年MM月dd日 HH:mm')}
            </Elem>
          )}
          <Elem name="created-by">
            <Userpic src="#" user={project.created_by} showUsername />
          </Elem>
        </Elem>
      </Block>
    </Elem>
  );
};
