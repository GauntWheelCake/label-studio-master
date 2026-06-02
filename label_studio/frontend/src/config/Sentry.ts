import * as Sentry from "@sentry/browser";
import * as ReactSentry from '@sentry/react';
import { RouterHistory } from "@sentry/react/dist/reactrouter";
import { Integrations } from "@sentry/tracing";
import { Route } from 'react-router-dom';

export const initSentry = (history: RouterHistory) => {
  // Sentry disabled for intranet deployment
  return;
};

const setTags = () => {
  const tags: Record<string, any> = {};

  if (APP_SETTINGS.user.email) {
    Sentry.setUser({
      email: APP_SETTINGS.user.email,
      username: APP_SETTINGS.user.username,
    });
  }

  if (APP_SETTINGS.version) {
    Object.entries(APP_SETTINGS.version).forEach(([packageName, data]: [string, any]) => {
      const {version, commit} = data ?? {};

      if (version) {
        tags['version-' + packageName] = version;
      }
      if (commit) {
        tags['commit-' + packageName] = commit;
      }
    });
  }

  Sentry.setTags(tags);
};

export const SentryRoute = ReactSentry.withSentryRouting(Route);
