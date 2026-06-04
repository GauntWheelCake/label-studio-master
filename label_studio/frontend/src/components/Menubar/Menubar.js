import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { StaticContent } from '../../app/StaticContent/StaticContent';
import { IconPersonInCircle, IconPin, LsDoor, LsSettings } from '../../assets/icons';
import { useAPI } from '../../providers/ApiProvider';
import { useConfig } from '../../providers/ConfigProvider';
import { useContextComponent, useFixedLocation } from '../../providers/RoutesProvider';
import { cn } from '../../utils/bem';
import { absoluteURL } from '../../utils/helpers';
import { t } from '../../i18n';
import { Breadcrumbs } from '../Breadcrumbs/Breadcrumbs';
import { Dropdown } from "../Dropdown/Dropdown";
import { Hamburger } from "../Hamburger/Hamburger";
import { Menu } from '../Menu/Menu';
import { Userpic } from '../Userpic/Userpic';
import { VersionProvider } from '../VersionNotifier/VersionNotifier';
import './Menubar.styl';
import './MenuContent.styl';
import './MenuSidebar.styl';

export const MenubarContext = createContext();

const LeftContextMenu = ({ className }) => (
  <StaticContent
    id="context-menu-left"
    className={className}
  >{(template) => <Breadcrumbs fromTemplate={template} />}</StaticContent>
);

const RightContextMenu = ({ className, ...props }) => {
  const { ContextComponent, contextProps } = useContextComponent();

  return ContextComponent ? (
    <div className={className}>
      <ContextComponent {...props} {...(contextProps ?? {})} />
    </div>
  ) : (
    <StaticContent
      id="context-menu-right"
      className={className}
    />
  );
};

export const ThemeToggle = () => {
  const [theme, setTheme] = useState(() => {
    return document.documentElement.getAttribute('data-theme') || 'light';
  });

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ls-theme', next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === 'light' ? '切换暗色模式' : '切换亮色模式'}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: '4px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'inherit',
        outline: 'none',
      }}
    >
      {theme === 'light' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
};

export const Menubar = ({
  enabled,
  defaultOpened,
  defaultPinned,
  children,
  onSidebarToggle,
  onSidebarPin,
}) => {
  const menuDropdownRef = useRef();
  const useMenuRef = useRef();
  const location = useFixedLocation();

  const config = useConfig();
  const api = useAPI();
  const [sidebarOpened, setSidebarOpened] = useState(defaultOpened ?? false);
  const [sidebarPinned, setSidebarPinned] = useState(defaultPinned ?? false);
  const [projects, setProjects] = useState([]);
  const [PageContext, setPageContext] = useState({
    Component: null,
    props: {},
  });
  const pageContextRef = useRef(PageContext);
  pageContextRef.current = PageContext;

  const menubarClass = cn('menu-header');
  const menubarContext = menubarClass.elem('context');
  const sidebarClass = cn('sidebar');
  const contentClass = cn('content-wrapper');
  const contextItem = menubarClass.elem('context-item');

  const sidebarPin = useCallback((e) => {
    e.preventDefault();

    const newState = !sidebarPinned;
    setSidebarPinned(newState);
    onSidebarPin?.(newState);
  }, [sidebarPinned]);

  const sidebarToggle = useCallback((visible) => {
    setSidebarOpened(visible);
    onSidebarToggle?.(visible);
  }, [onSidebarToggle]);

  const providerValue = useMemo(() => ({
    setContext(ctx) {
      setPageContext(prev => ({ ...prev, Component: ctx }));
    },

    setProps(props) {
      setPageContext(prev => ({ ...prev, props }));
    },

    contextIsSet(ctx) {
      return pageContextRef.current.Component === ctx;
    },
  }), []);

  useEffect(() => {
    if (!sidebarPinned) {
      menuDropdownRef?.current?.close();
    }
    useMenuRef?.current?.close();
  }, [location]);

  useEffect(() => {
    const fetchProjects = async () => {
      const data = await api.callApi('projects');
      setProjects(data ?? []);
    };
    fetchProjects();

    const handleProjectsUpdate = () => fetchProjects();
    window.addEventListener('projectsUpdated', handleProjectsUpdate);

    return () => {
      window.removeEventListener('projectsUpdated', handleProjectsUpdate);
    };
  }, [api, location.pathname]);

  return (
    <div className={contentClass}>
      {enabled && (
        <div className={menubarClass}>
          <Dropdown.Trigger
            dropdown={menuDropdownRef}
            closeOnClickOutside={!sidebarPinned}
          >
            <div className={`${menubarClass.elem('trigger')} main-menu-trigger`}>
              <img src={absoluteURL("/static/icons/logo.png?v=2")} alt={t('menubar.logoAlt')} height="28" />
              <span className={menubarClass.elem('brand')}>智能训练服务-标注平台</span>
              <Hamburger opened={sidebarOpened} />
            </div>
          </Dropdown.Trigger>

          <div className={menubarContext}>
            <LeftContextMenu className={contextItem.mod({ left: true })} />

            <RightContextMenu className={contextItem.mod({ right: true })} />
          </div>

          <ThemeToggle />

          {config.sharedAdminMode ? (
            <div className={menubarClass.elem('user')}>
              <Userpic user={config.user} />
            </div>
          ) : (
            <Dropdown.Trigger ref={useMenuRef} align="right" content={(
              <Menu>
                <Menu.Item
                  icon={<LsSettings />}
                  label={t('menubar.menu.accountAndSettings')}
                  href="/user/account"
                />
                <Menu.Item
                  icon={<LsDoor />}
                  label={t('menubar.menu.logout')}
                  href={absoluteURL("/logout")}
                  forceReload
                />
              </Menu>
            )}>
              <div className={menubarClass.elem('user')}>
                <Userpic user={config.user} />
              </div>
            </Dropdown.Trigger>
          )}
        </div>
      )}

      <VersionProvider>
        <div className={contentClass.elem('body')}>
          {enabled && (
            <Dropdown
              ref={menuDropdownRef}
              onToggle={sidebarToggle}
              onVisibilityChanged={() => window.dispatchEvent(new Event('resize'))}
              visible={sidebarOpened}
              className={[sidebarClass, sidebarClass.mod({ floating: !sidebarPinned })].join(" ")}
              style={{ width: 'var(--menu-sidebar-width)' }}
            >
              <Menu>
                {!config.sharedAdminMode && (
                  <Menu.Item
                    label={t('menubar.menu.organization')}
                    to="/people"
                    icon={<IconPersonInCircle />}
                    exact
                  />
                )}

                {projects.length > 0 && (
                  projects.map(p => (
                    <Menu.Item
                      key={p.id}
                      label={p.title || '未命名项目'}
                      to={`/projects/${p.id}/data`}
                    />
                  ))
                )}

                <Menu.Spacer />

                <Menu.Divider />

                <Menu.Item
                  icon={<IconPin />}
                  className={sidebarClass.elem('pin')}
                  onClick={sidebarPin}
                  active={sidebarPinned}
                >
                  {sidebarPinned ? t('menubar.menu.unpin') : t('menubar.menu.pin')}
                </Menu.Item>

              </Menu>
            </Dropdown>
          )}

          <MenubarContext.Provider value={providerValue}>
            <div className={contentClass.elem('content').mod({ withSidebar: sidebarPinned && sidebarOpened })}>
              {children}
            </div>
          </MenubarContext.Provider>
        </div>
      </VersionProvider>
    </div>
  );
};
