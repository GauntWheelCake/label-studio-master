import React from 'react';
import { useParams as useRouterParams } from 'react-router';
import { Redirect } from 'react-router-dom';
import { Button } from '../../components';
import { Oneof } from '../../components/Oneof/Oneof';
import { Spinner } from '../../components/Spinner/Spinner';
import { t } from '../../i18n';
import { ApiContext } from '../../providers/ApiProvider';
import { useContextProps } from '../../providers/RoutesProvider';
import { Block, Elem } from '../../utils/bem';
import { CreateProject } from '../CreateProject/CreateProject';
import { DataManagerPage } from '../DataManager/DataManager';
import { SettingsPage } from '../Settings';
import './Projects.styl';
import { ProjectsList } from './ProjectsList';
import { storeSsoToken } from '../../utils/datasetManagementApi';

export const ProjectsPage = () => {
  const api = React.useContext(ApiContext);
  const [projectsList, setProjectsList] = React.useState([]);
  const [networkState, setNetworkState] = React.useState(null);
  const setContextProps = useContextProps();

  const [modal, setModal] = React.useState(false);
  const openModal = setModal.bind(null, true);
  const closeModal = setModal.bind(null, false);

  const fetchProjects = async () => {
    setNetworkState('loading');
    const projects = await api.callApi("projects");

    setProjectsList(projects ?? []);
    setNetworkState('loaded');
  };

  const handleProjectDelete = () => {
    fetchProjects();
    window.dispatchEvent(new Event('projectsUpdated'));
  };

  React.useEffect(() => {
    fetchProjects();
  }, []);

  React.useEffect(() => {
    // Capture the SSO token from the URL before cleaning it, so internal
    // navigation can still make direct external API calls.
    const url = new URL(window.location.href);
    if (url.searchParams.has('token')) {
      storeSsoToken(url.searchParams.get('token'));
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  React.useEffect(() => {
    setContextProps({ openModal, showButton: true });
  }, [projectsList.length]);

  return (
    <Block name="projects-page">
      <Oneof value={networkState}>
        <Elem name="loading" case="loading">
          <Spinner size={64} />
        </Elem>
        <Elem name="content" case="loaded">
          <ProjectsList projects={projectsList} openModal={openModal} onProjectDelete={handleProjectDelete} />
          {modal && (
            <CreateProject onClose={closeModal} />
          )}
        </Elem>
      </Oneof>
    </Block>
  );
};

ProjectsPage.title = t('menubar.menu.projects');
ProjectsPage.path = "/projects";
ProjectsPage.exact = true;
ProjectsPage.routes = ({ store }) => [
  {
    title: () => store.project?.title,
    path: "/:id(\\d+)",
    exact: true,
    component: () => {
      const params = useRouterParams();
      return <Redirect to={`/projects/${params.id}/data`} />;
    },
    pages: {
      DataManagerPage,
      SettingsPage,
    },
  },
];
ProjectsPage.context = ({ openModal, showButton }) => {
  if (!showButton) return null;
  return <Button onClick={openModal} look="primary" size="compact">{t('projectsPage.context.createButton')}</Button>;
};
