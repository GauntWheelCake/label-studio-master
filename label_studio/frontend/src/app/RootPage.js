import React from 'react';
import { Menubar } from '../components/Menubar/Menubar';
import { ProjectRoutes } from '../routes/ProjectRoutes';

const isStorageTrue = (key, defaultValue = true) => {
  const value = localStorage.getItem(key);
  if (value === null) return defaultValue;
  return value !== 'false';
};

export const RootPage = ({content}) => {
  const pinned = isStorageTrue('sidebar-pinned');
  const opened = pinned && isStorageTrue('sidebar-opened');

  return (
    <Menubar
      enabled={true}
      defaultOpened={opened}
      defaultPinned={pinned}
      onSidebarToggle={(visible) => localStorage.setItem('sidebar-opened', visible)}
      onSidebarPin={(pinned) => localStorage.setItem('sidebar-pinned', pinned)}
    >
      <ProjectRoutes content={content}/>
    </Menubar>
  );
};
