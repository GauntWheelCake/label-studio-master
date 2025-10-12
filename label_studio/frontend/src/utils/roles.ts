export enum UserRole {
  Annotator = 'annotator',
  Reviewer = 'reviewer',
}

export const DEFAULT_ROLE = UserRole.Annotator;

export const ROLE_STORAGE_KEY = 'ls:user-role';
export const ROLE_CHANGE_EVENT = 'ls:user-role-change';

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const isUserRole = (value: unknown): value is UserRole => {
  return value === UserRole.Annotator || value === UserRole.Reviewer;
};

const parseRole = (value: string | null): UserRole => {
  if (isUserRole(value)) return value;
  return DEFAULT_ROLE;
};

export const getStoredRole = (): UserRole => {
  if (!isBrowser()) return DEFAULT_ROLE;

  try {
    const stored = window.localStorage.getItem(ROLE_STORAGE_KEY);
    return parseRole(stored);
  } catch (error) {
    console.warn('[roles] Failed to read role from localStorage', error);
    return DEFAULT_ROLE;
  }
};

export const dispatchRoleChange = (role: UserRole) => {
  if (!isBrowser()) return;

  window.dispatchEvent(new CustomEvent<UserRole>(ROLE_CHANGE_EVENT, { detail: role }));
};

export const setStoredRole = (role: UserRole): UserRole => {
  if (!isBrowser()) return role;

  const nextRole = isUserRole(role) ? role : DEFAULT_ROLE;
  const currentRole = getStoredRole();

  if (currentRole === nextRole) {
    dispatchRoleChange(nextRole);
    return nextRole;
  }

  try {
    window.localStorage.setItem(ROLE_STORAGE_KEY, nextRole);
  } catch (error) {
    console.warn('[roles] Failed to persist role into localStorage', error);
  }

  dispatchRoleChange(nextRole);

  return nextRole;
};

export type RoleChangeListener = (role: UserRole) => void;

export const subscribeToRoleChange = (listener: RoleChangeListener, { immediate = false } = {}) => {
  if (!isBrowser()) {
    if (immediate) listener(DEFAULT_ROLE);
    return () => undefined;
  }

  const handleCustomEvent = (event: Event) => {
    const detail = (event as CustomEvent<UserRole>).detail;
    listener(isUserRole(detail) ? detail : getStoredRole());
  };

  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key !== ROLE_STORAGE_KEY) return;
    listener(parseRole(event.newValue));
  };

  window.addEventListener(ROLE_CHANGE_EVENT, handleCustomEvent as EventListener);
  window.addEventListener('storage', handleStorageEvent);

  if (immediate) {
    listener(getStoredRole());
  }

  return () => {
    window.removeEventListener(ROLE_CHANGE_EVENT, handleCustomEvent as EventListener);
    window.removeEventListener('storage', handleStorageEvent);
  };
};

export const ensureRoleInitialized = () => {
  if (!isBrowser()) return DEFAULT_ROLE;

  const stored = getStoredRole();

  try {
    window.localStorage.setItem(ROLE_STORAGE_KEY, stored);
  } catch (error) {
    console.warn('[roles] Unable to ensure role in localStorage', error);
  }

  return stored;
};

