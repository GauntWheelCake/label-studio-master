"use strict";
(self["webpackChunkfrontend"] = self["webpackChunkfrontend"] || []).push([["src_pages_CreateProject_CreateProject_js"],{

/***/ "./src/pages/CreateProject/CreateProject.js"
/*!**************************************************!*\
  !*** ./src/pages/CreateProject/CreateProject.js ***!
  \**************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   CreateProject: () => (/* binding */ CreateProject)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "./node_modules/react/index.js");
/* harmony import */ var react_router__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react-router */ "./node_modules/react-router/esm/react-router.js");
/* harmony import */ var _components__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../components */ "./src/components/index.js");
/* harmony import */ var _components_Modal_Modal__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../components/Modal/Modal */ "./src/components/Modal/Modal.js");
/* harmony import */ var _components_Space_Space__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../components/Space/Space */ "./src/components/Space/Space.js");
/* harmony import */ var _providers_ApiProvider__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../providers/ApiProvider */ "./src/providers/ApiProvider.js");
/* harmony import */ var _utils_bem__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../../utils/bem */ "./src/utils/bem.tsx");
/* harmony import */ var _Config_Config__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./Config/Config */ "./src/pages/CreateProject/Config/Config.js");
/* harmony import */ var _CreateProject_styl__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./CreateProject.styl */ "./src/pages/CreateProject/CreateProject.styl");
/* harmony import */ var _Import_Import__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./Import/Import */ "./src/pages/CreateProject/Import/Import.js");
/* harmony import */ var _Import_useImportPage__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! ./Import/useImportPage */ "./src/pages/CreateProject/Import/useImportPage.js");
/* harmony import */ var _utils_useDraftProject__WEBPACK_IMPORTED_MODULE_11__ = __webpack_require__(/*! ./utils/useDraftProject */ "./src/pages/CreateProject/utils/useDraftProject.js");
/* harmony import */ var _i18n__WEBPACK_IMPORTED_MODULE_12__ = __webpack_require__(/*! ../../i18n */ "./src/i18n/index.js");
/* harmony import */ var _assets_icons__WEBPACK_IMPORTED_MODULE_13__ = __webpack_require__(/*! ../../assets/icons */ "./src/assets/icons/index.js");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__ = __webpack_require__(/*! react/jsx-runtime */ "./node_modules/react/jsx-runtime.js");















const StepIconProject = () => /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("svg", {
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  children: /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("path", {
    d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
  })
});
const StepIconUpload = () => /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsxs)("svg", {
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("path", {
    d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
  }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("polyline", {
    points: "17 8 12 3 7 8"
  }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("line", {
    x1: "12",
    y1: "3",
    x2: "12",
    y2: "15"
  })]
});
const StepIconConfig = () => /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsxs)("svg", {
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("path", {
    d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
  })]
});
const ProjectName = ({
  name,
  setName,
  onSaveName,
  error,
  description,
  setDescription,
  show = true
}) => !show ? null : /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsxs)("form", {
  className: (0,_utils_bem__WEBPACK_IMPORTED_MODULE_6__.cn)("project-name"),
  onSubmit: e => {
    e.preventDefault();
  },
  children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsxs)("div", {
    className: "field field--wide",
    children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("label", {
      htmlFor: "project_name",
      children: (0,_i18n__WEBPACK_IMPORTED_MODULE_12__.t)('createProject.projectName.label')
    }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("input", {
      name: "name",
      id: "project_name",
      value: name,
      onChange: e => setName(e.target.value),
      onBlur: onSaveName
    }), error && /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("span", {
      className: "error",
      children: error
    })]
  }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsxs)("div", {
    className: "field field--wide",
    children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("label", {
      htmlFor: "project_description",
      children: (0,_i18n__WEBPACK_IMPORTED_MODULE_12__.t)('createProject.projectDescription.label')
    }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("textarea", {
      name: "description",
      id: "project_description",
      placeholder: (0,_i18n__WEBPACK_IMPORTED_MODULE_12__.t)('createProject.projectDescription.placeholder'),
      rows: "4",
      value: description,
      onChange: e => setDescription(e.target.value)
    })]
  })]
});
const WizardSteps = ({
  current,
  onSelect
}) => {
  const steps = [{
    key: 'name',
    label: '项目信息',
    icon: /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)(StepIconProject, {})
  }, {
    key: 'import',
    label: '数据导入',
    icon: /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)(StepIconUpload, {})
  }, {
    key: 'config',
    label: '标注配置',
    icon: /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)(StepIconConfig, {})
  }];
  const currentIndex = steps.findIndex(s => s.key === current);
  const stepsClass = (0,_utils_bem__WEBPACK_IMPORTED_MODULE_6__.cn)('wizard-steps');
  const stepClass = (0,_utils_bem__WEBPACK_IMPORTED_MODULE_6__.cn)('wizard-step');
  return /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("div", {
    className: stepsClass.toString(),
    children: steps.map((step, index) => {
      const isCompleted = index < currentIndex;
      const isCurrent = index === currentIndex;
      const canClick = isCompleted;
      return /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsxs)(react__WEBPACK_IMPORTED_MODULE_0__.Fragment, {
        children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsxs)("button", {
          type: "button",
          className: stepClass.mod({
            completed: isCompleted,
            current: isCurrent,
            pending: !isCompleted && !isCurrent
          }).toString(),
          onClick: () => canClick && (onSelect === null || onSelect === void 0 ? void 0 : onSelect(step.key)),
          disabled: !canClick,
          children: [isCompleted ? /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)(_assets_icons__WEBPACK_IMPORTED_MODULE_13__.LsCheck, {
            width: "14",
            height: "14"
          }) : step.icon, /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("span", {
            children: step.label
          })]
        }), index < steps.length - 1 && /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("span", {
          className: stepClass.elem('arrow').toString(),
          children: /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)(_assets_icons__WEBPACK_IMPORTED_MODULE_13__.LsChevronRight, {
            width: "14",
            height: "14"
          })
        })]
      }, step.key);
    })
  });
};
const CreateProject = ({
  onClose
}) => {
  const [step, setStep] = react__WEBPACK_IMPORTED_MODULE_0__.useState("name");
  const [waiting, setWaitingStatus] = react__WEBPACK_IMPORTED_MODULE_0__.useState(false);
  const [configValid, setConfigValid] = react__WEBPACK_IMPORTED_MODULE_0__.useState(false);
  const project = (0,_utils_useDraftProject__WEBPACK_IMPORTED_MODULE_11__.useDraftProject)();
  const history = (0,react_router__WEBPACK_IMPORTED_MODULE_1__.useHistory)();
  const api = (0,_providers_ApiProvider__WEBPACK_IMPORTED_MODULE_5__.useAPI)();
  const [name, setName] = react__WEBPACK_IMPORTED_MODULE_0__.useState("");
  const [error, setError] = react__WEBPACK_IMPORTED_MODULE_0__.useState();
  const [description, setDescription] = react__WEBPACK_IMPORTED_MODULE_0__.useState("");
  const [config, setConfig] = react__WEBPACK_IMPORTED_MODULE_0__.useState("<View></View>");
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    setError(null);
  }, [name]);
  const {
    columns,
    uploading,
    uploadDisabled,
    finishUpload,
    pageProps
  } = (0,_Import_useImportPage__WEBPACK_IMPORTED_MODULE_10__.useImportPage)(project);
  const rootClass = (0,_utils_bem__WEBPACK_IMPORTED_MODULE_6__.cn)("create-project");
  const stepOrder = ['name', 'import', 'config'];
  const currentIndex = stepOrder.indexOf(step);
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => project && !name && setName(project.title), [project]);
  const projectBody = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => ({
    title: name,
    description,
    label_config: config
  }), [name, description, config]);
  const onCreate = react__WEBPACK_IMPORTED_MODULE_0__.useCallback(async () => {
    const imported = await finishUpload();
    if (!imported) return;
    setWaitingStatus(true);
    const response = await api.callApi('updateProject', {
      params: {
        pk: project.id
      },
      body: projectBody
    });
    setWaitingStatus(false);
    if (response !== null) {
      history.push(`/projects/${response.id}/data`);
    }
  }, [project, projectBody, finishUpload]);
  const onSaveName = async () => {
    var _err$validation_error;
    if (!name.trim()) {
      setError('项目名不能为空');
      return false;
    }
    const res = await api.callApi('updateProjectRaw', {
      params: {
        pk: project.id
      },
      body: {
        title: name
      }
    });
    if (res.ok) {
      setError(null);
      return true;
    }
    const err = await res.json();
    setError(((_err$validation_error = err.validation_errors) === null || _err$validation_error === void 0 ? void 0 : _err$validation_error.title) || '保存失败');
    return false;
  };
  const onCancel = react__WEBPACK_IMPORTED_MODULE_0__.useCallback(async () => {
    setWaitingStatus(true);
    if (project) await api.callApi('deleteProject', {
      params: {
        pk: project.id
      }
    });
    setWaitingStatus(false);
    history.replace("/projects");
    onClose === null || onClose === void 0 ? void 0 : onClose();
  }, [project]);
  const goToNextStep = async () => {
    if (step === 'name') {
      const ok = await onSaveName();
      if (ok) setStep('import');
    } else if (step === 'import') {
      setStep('config');
    }
  };
  const goToPrevStep = () => {
    if (step === 'import') setStep('name');else if (step === 'config') setStep('import');
  };
  const canGoNext = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => {
    if (step === 'name') return name.trim().length > 0 && !error;
    if (step === 'import') return !uploadDisabled;
    return false;
  }, [step, name, error, uploadDisabled]);
  const canSave = react__WEBPACK_IMPORTED_MODULE_0__.useMemo(() => {
    return configValid && !uploadDisabled && !waiting && !uploading;
  }, [configValid, uploadDisabled, waiting, uploading]);
  const handleStepSelect = nextStep => {
    const nextIndex = stepOrder.indexOf(nextStep);
    if (nextIndex < currentIndex) {
      setStep(nextStep);
    }
  };
  return /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)(_components_Modal_Modal__WEBPACK_IMPORTED_MODULE_3__.Modal, {
    onHide: () => history.push("/projects"),
    fullscreen: true,
    visible: true,
    bare: true,
    closeOnClickOutside: false,
    children: /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsxs)("div", {
      className: rootClass,
      children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsxs)(_components_Modal_Modal__WEBPACK_IMPORTED_MODULE_3__.Modal.Header, {
        children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("h1", {
          children: (0,_i18n__WEBPACK_IMPORTED_MODULE_12__.t)('createProject.header.title')
        }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)(WizardSteps, {
          current: step,
          onSelect: handleStepSelect
        }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)(_components__WEBPACK_IMPORTED_MODULE_2__.Button, {
          look: "danger",
          size: "compact",
          onClick: onCancel,
          waiting: waiting,
          children: (0,_i18n__WEBPACK_IMPORTED_MODULE_12__.t)('createProject.actions.delete')
        })]
      }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsxs)("div", {
        className: rootClass.elem("body"),
        children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)(ProjectName, {
          name: name,
          setName: setName,
          error: error,
          onSaveName: onSaveName,
          description: description,
          setDescription: setDescription,
          show: step === "name"
        }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)(_Import_Import__WEBPACK_IMPORTED_MODULE_9__.ImportPage, {
          project: project,
          show: step === "import",
          ...pageProps
        }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)(_Config_Config__WEBPACK_IMPORTED_MODULE_7__.ConfigPage, {
          project: project,
          onUpdate: setConfig,
          show: step === "config",
          columns: columns,
          disableSaveButton: true,
          onValidate: validation => setConfigValid(!(validation !== null && validation !== void 0 && validation.error))
        })]
      }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)("div", {
        className: rootClass.elem("footer"),
        children: /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsxs)(_components_Space_Space__WEBPACK_IMPORTED_MODULE_4__.Space, {
          children: [step !== 'name' && /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)(_components__WEBPACK_IMPORTED_MODULE_2__.Button, {
            size: "compact",
            onClick: goToPrevStep,
            children: "\u4E0A\u4E00\u6B65"
          }), step === 'name' && /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)(_components__WEBPACK_IMPORTED_MODULE_2__.Button, {
            look: "primary",
            size: "compact",
            onClick: goToNextStep,
            disabled: !canGoNext,
            children: "\u4E0B\u4E00\u6B65"
          }), step === 'import' && /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)(_components__WEBPACK_IMPORTED_MODULE_2__.Button, {
            look: "primary",
            size: "compact",
            onClick: goToNextStep,
            disabled: !canGoNext,
            children: "\u4E0B\u4E00\u6B65"
          }), step === 'config' && /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_14__.jsx)(_components__WEBPACK_IMPORTED_MODULE_2__.Button, {
            look: "primary",
            size: "compact",
            onClick: onCreate,
            disabled: !canSave,
            waiting: waiting || uploading,
            children: "\u4FDD\u5B58"
          })]
        })
      })]
    })
  });
};

/***/ },

/***/ "./src/pages/CreateProject/utils/useDraftProject.js"
/*!**********************************************************!*\
  !*** ./src/pages/CreateProject/utils/useDraftProject.js ***!
  \**********************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   useDraftProject: () => (/* binding */ useDraftProject)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "./node_modules/react/index.js");
/* harmony import */ var _providers_ApiProvider__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../providers/ApiProvider */ "./src/providers/ApiProvider.js");


const useDraftProject = () => {
  const api = (0,_providers_ApiProvider__WEBPACK_IMPORTED_MODULE_1__.useAPI)();
  const [project, setProject] = react__WEBPACK_IMPORTED_MODULE_0__.useState();
  const fetchDraftProject = react__WEBPACK_IMPORTED_MODULE_0__.useCallback(async () => {
    const projects = await api.callApi('projects');

    // always create the new one
    const lastIndex = (projects !== null && projects !== void 0 ? projects : []).length;
    let projectNumber = lastIndex + 1;
    let projectName = `New Project #${projectNumber}`;

    // dirty hack to get proper non-duplicate name
    while (projects.find(({
      title
    }) => title === projectName)) {
      projectNumber++;
      projectName = `New Project #${projectNumber}`;
    }
    const draft = await api.callApi('createProject', {
      body: {
        title: projectName
      }
    });
    if (draft) setProject(draft);
  }, []);
  react__WEBPACK_IMPORTED_MODULE_0__.useEffect(() => {
    fetchDraftProject();
  }, []);
  return project;
};

/***/ },

/***/ "./src/pages/CreateProject/CreateProject.styl"
/*!****************************************************!*\
  !*** ./src/pages/CreateProject/CreateProject.styl ***!
  \****************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
// extracted by mini-css-extract-plugin
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({"create-project":"ls-create-project","modal__header":"ls-modal__header","create-project__body":"ls-create-project__body","create-project__footer":"ls-create-project__footer","project-name":"ls-project-name","wizard-steps":"ls-wizard-steps","wizard-step":"ls-wizard-step","wizard-step_completed":"ls-wizard-step_completed","wizard-step_current":"ls-wizard-step_current","wizard-step_pending":"ls-wizard-step_pending","wizard-step__arrow":"ls-wizard-step__arrow"});

/***/ }

}]);
//# sourceMappingURL=src_pages_CreateProject_CreateProject_js.index.js.map