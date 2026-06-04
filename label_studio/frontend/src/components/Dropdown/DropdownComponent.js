import React, { cloneElement, forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { Block, cn } from "../../utils/bem";
import { alignElements } from "../../utils/dom";
import { aroundTransition } from "../../utils/transition";
import "./Dropdown.styl";
import { DropdownContext } from "./DropdownContext";
import { DropdownTrigger } from "./DropdownTrigger";

let lastIndex = 1;

export const Dropdown = forwardRef(
  ({ animated = true, visible = false, ...props }, ref) => {
    const rootName = cn("dropdown");

    /**@type {import('react').RefObject<HTMLElement>} */
    const dropdown = useRef();
    const { triggerRef } = useContext(DropdownContext) ?? {};
    const isInline = triggerRef === undefined;

    const { children } = props;
    const [renderable, setRenderable] = useState(visible);
    const [currentVisible, setVisible] = useState(visible);
    const [offset, setOffset] = useState({});
    const [visibility, setVisibility] = useState(
      visible ? "visible" : null,
    );

    const { align, enabled, onToggle, onVisibilityChanged } = props;

    const calculatePosition = useCallback(() => {
      const dropdownEl = dropdown.current;
      const parent = triggerRef?.current ?? dropdownEl.parentNode;
      const { left, top } = alignElements(parent, dropdownEl, `bottom-${align ?? 'left'}`);

      setOffset({ left, top });
    }, [triggerRef, align]);

    const dropdownIndex = useMemo(() => {
      return lastIndex++;
    }, []);

    const performAnimation = useCallback((visible = false) => {
      if (enabled === false && visible === true) return Promise.resolve();

      return new Promise((resolve) => {
        const menu = dropdown.current;

        if (animated !== false) {
          aroundTransition(menu, {
            transition: () => {
              setVisibility(visible ? "appear" : "disappear");
            },
            beforeTransition: () => {
              setVisibility(visible ? "before-appear" : "before-disappear");
            },
            afterTransition: () => {
              setVisibility(visible ? "visible" : null);
              resolve();
            },
          });
        } else {
          setVisibility(visible ? "visible" : null);
          resolve();
        }
      });
    }, [animated]);

    const changeVisibility = useCallback(async (visibility) => {
      onToggle?.(visibility);
      await performAnimation(visibility);
      setVisible(visibility);
      onVisibilityChanged?.(visibility);
    }, [onToggle, onVisibilityChanged, performAnimation]);

    const close = useCallback(async () => {
      if (currentVisible === false || renderable === false) return;

      await changeVisibility(false);
      setRenderable(false);
    }, [currentVisible, changeVisibility, renderable]);

    const open = useCallback(async () => {
      if (currentVisible === true || renderable === true) return;

      setRenderable(true);
    }, [currentVisible, renderable]);

    const toggle = useCallback(async () => {
      const newState = !currentVisible;

      if (newState) {
        open();
      } else {
        close();
      }
    }, [close, currentVisible, open]);

    useEffect(() => {
      if (!ref) return;

      ref.current = {
        dropdown: dropdown.current,
        visible: visibility !== null,
        toggle,
        open,
        close,
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [close, open, ref, toggle, visibility]);

    useEffect(() => {
      setVisible(visible);
    }, [visible]);

    useEffect(() => {
      if (!isInline && visibility === "before-appear") {
        calculatePosition();
      }
    }, [visibility, calculatePosition, isInline]);

    useEffect(() => {
      if (props.enabled === false) performAnimation(false);
    }, [props.enabled]);

    useEffect(() => {
      if (renderable) changeVisibility(true);
    }, [renderable]);

    const content =
      children.props && children.props.type === "Menu"
        ? cloneElement(children, {
          ...children.props,
          className: rootName.elem("menu").mix(children.props.className),
        })
        : children;

    const VISIBILITY_MAP = {
      "before-appear": "before-appear",
      "appear": "appear before-appear",
      "before-disappear": "before-disappear",
      "disappear": "disappear before-disappear",
      "visible": "visible",
    };
    const visibilityClasses = VISIBILITY_MAP[visibility] ?? (visible ? "visible" : null);

    const hasPosition = offset.left !== undefined;

    const compositeStyles = {
      ...(props.style ?? {}),
      ...(offset ?? {}),
      ...(!isInline && !hasPosition ? { left: -9999, top: -9999 } : {}),
      zIndex: 1000 + dropdownIndex,
    };

    const result = (
      <Block
        ref={dropdown}
        name="dropdown"
        mix={[props.className, visibilityClasses]}
        style={compositeStyles}
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </Block>
    );

    return renderable ? (
      props.inline === true
        ? result
        : ReactDOM.createPortal(result, document.body)
    ) : null;
  },
);

Dropdown.displayName = "Dropdown";

Dropdown.Trigger = DropdownTrigger;
