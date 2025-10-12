import React, { createRef } from "react";
import { render, unmountComponentAtNode } from "react-dom";
import { ApiProvider } from "../../providers/ApiProvider";
import { ConfigProvider } from "../../providers/ConfigProvider";
import { CurrentUserProvider } from "../../providers/CurrentUser";
import { MultiProvider } from "../../providers/MultiProvider";
import { cn } from "../../utils/bem";
import { Button } from "../Button/Button";
import { Space } from "../Space/Space";
import { Modal } from "./ModalPopup";
import { t } from "../../i18n";

const translateModalTitle = (title) => {
  if (!title) return title;

  const normalized = String(title).trim();
  const mapping = {
    "Destructive action.": t('modal.titles.destructive'),
    "Destructive action": t('modal.titles.destructive'),
    "Confirm action.": t('modal.titles.confirm'),
    "Confirm action": t('modal.titles.confirm'),
  };

  return mapping[normalized] ?? title;
};

const standaloneModal = (props) => {
  const modalRef = createRef();
  const rootDiv = document.createElement("div");
  let renderCount = 0;
  rootDiv.className = cn("modal-holder").toClassName();

  document.body.appendChild(rootDiv);

  const renderModal = (props, animate) => {
    renderCount++;

    // simple modals don't require any parts of the app and can't cause the loop of death
    render((
      <MultiProvider key={`modal-${renderCount}`} providers={props.simple ? [] : [
        <ConfigProvider key="config"/>,
        <ApiProvider key="api"/>,
        <CurrentUserProvider key="current-user"/>,
      ]}>
        <Modal
          ref={modalRef}
          {...props}
          onHide={() => {
            props.onHidden?.();
            unmountComponentAtNode(rootDiv);
            rootDiv.remove();
          }}
          animateAppearance={animate}
        />
      </MultiProvider>
    ), rootDiv);
  };

  renderModal(props, true);

  return {
    update(newProps) {
      renderModal({...props, ...(newProps ?? {}), visible: true}, false);
    },
    close() {
      const result = modalRef.current.hide();
      unmountComponentAtNode(rootDiv);
      rootDiv.remove();
      return result;
    },
  };
};

export const confirm = ({ okText, onOk, cancelText, onCancel, buttonLook, ...props }) => {
  const resolvedOkText = okText ?? t('modal.actions.ok');
  const resolvedCancelText = cancelText ?? t('modal.actions.cancel');
  const translatedTitle = translateModalTitle(props.title);

  const modal = standaloneModal({
    ...props,
    title: translatedTitle,
    allowClose: false,
    footer: (
      <Space align="end">
        <Button
          onClick={() => {
            onCancel?.();
            modal.close();
          }}
          size="compact"
          autoFocus
        >
          {resolvedCancelText}
        </Button>

        <Button
          onClick={() => {
            onOk?.();
            modal.close();
          }}
          size="compact"
          look={buttonLook ?? 'primary'}
        >
          {resolvedOkText}
        </Button>
      </Space>
    ),
  });

  return modal;
};

export const info = ({ okText, onOkPress, ...props }) => {
  const modal = standaloneModal({
    ...props,
    footer: (
      <Space align="end">
        <Button
          onClick={() => {
            onOkPress?.();
            modal.close();
          }}
          look="primary"
          size="compact"
        >
          {okText ?? t('modal.actions.ok')}
        </Button>
      </Space>
    ),
  });

  return modal;
};

export { standaloneModal as modal };
export { Modal };

Object.assign(Modal, {
  info,
  confirm,
  modal: standaloneModal,
});
