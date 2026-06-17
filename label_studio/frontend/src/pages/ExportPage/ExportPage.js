import React, { useEffect, useRef, useState } from 'react';
import { useHistory } from 'react-router';
import { Button } from '../../components';
import { Form, Input, Toggle, RadioGroup } from '../../components/Form';
import { Modal } from '../../components/Modal/Modal';
import { Space } from '../../components/Space/Space';
import { useAPI } from '../../providers/ApiProvider';
import { useFixedLocation, useParams } from '../../providers/RoutesProvider';
import { BemWithSpecifiContext } from '../../utils/bem';
import { isDefined } from '../../utils/helpers';
import "./ExportPage.styl";
import { t } from '../../i18n';

const formatNameAliases = {
  BRUSH: {
    'Brush labels to NumPy': 'BRUSH_TO_NUMPY',
    'Brush labels to PNG': 'BRUSH_TO_PNG',
  },
};

const localizeWithFallback = (key, fallback) => {
  const translated = t(key);

  if (translated == null || translated === key) return fallback;

  return translated;
};

const getFormatLocalizationKey = (format, fallbackKey) => {
  if (!format) return fallbackKey;

  const aliases = formatNameAliases[format.name];
  const aliasedName = aliases?.[format.title];

  if (aliasedName) return aliasedName;

  return fallbackKey;
};

const localizeFormat = (format) => {
  if (!format?.name) return format;

  const localizationKey = getFormatLocalizationKey(format, format.name);
  const titleKey = `exportPage.formats.${localizationKey}.title`;
  const descriptionKey = `exportPage.formats.${localizationKey}.description`;

  const localizedFormat = {
    ...format,
    title: localizeWithFallback(titleKey, format.title),
    description: localizeWithFallback(descriptionKey, format.description),
  };

  if (Array.isArray(format.tags)) {
    localizedFormat.tags = format.tags.map(tag => {
      const tagLocalizationKey = getFormatLocalizationKey(format, format.name);
      const tagKey = `exportPage.formats.${tagLocalizationKey}.tags.${tag}`;

      return localizeWithFallback(tagKey, tag);
    });
  }

  return localizedFormat;
};

// const formats = {
//   json: 'JSON',
//   csv: 'CSV',
// };

const downloadFile = (blob, filename) => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
};

const {Block, Elem} = BemWithSpecifiContext();

export const ExportPage = () => {
  const history = useHistory();
  const location = useFixedLocation();
  const pageParams = useParams();
  const api = useAPI();

  const [previousExports, setPreviousExports] = useState([]);
  const [downloading, setDownloading] = useState(false);
  const [downloadingMessage, setDownloadingMessage] = useState(false);
  const [availableFormats, setAvailableFormats] = useState([]);
  const [currentFormat, setCurrentFormat] = useState('JSON');
  const [exportTarget, setExportTarget] = useState('local');
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitRatios, setSplitRatios] = useState({train: 80, val: 10, test: 10});
  const [splitRatiosValid, setSplitRatiosValid] = useState(true);

  /** @type {import('react').RefObject<Form>} */
  const form = useRef();

  const effectiveSplitEnabled = exportTarget === 'dataset' ? true : splitEnabled;

  const proceedExport = async () => {
    setDownloading(true);

    const message = setTimeout(() => {
      setDownloadingMessage(true);
    }, 1000);

    if (effectiveSplitEnabled) {
      const total = splitRatios.train + splitRatios.val + splitRatios.test;
      if (total !== 100) {
        setSplitRatiosValid(false);
        setDownloading(false);
        setDownloadingMessage(false);
        clearTimeout(message);
        return;
      }
    }
    setSplitRatiosValid(true);

    if (exportTarget === 'dataset') {
      const response = await api.callApi('exportToDataset', {
        params: {
          pk: pageParams.id,
        },
        body: {
          exportType: currentFormat,
          split_ratios: JSON.stringify(splitRatios),
        },
      });

      if (response) {
        if (response.status === 'ok') {
          Modal.info({
            title: t('exportPage.modal.uploadedTitle'),
            body: t('exportPage.modal.uploadedBody'),
            simple: true,
          });
        } else if (response.detail) {
          Modal.info({
            title: t('exportPage.modal.emptyTitle'),
            body: response.detail,
            simple: true,
          });
        } else {
          api.handleError(response);
        }
      }
    } else {
      const params = form.current.assembleFormData({
        asJSON: true,
        full: true,
        booleansAsNumbers: true,
      });

      const response = await api.callApi('exportRaw', {
        params: {
          pk: pageParams.id,
          ...params,
          split_enabled: splitEnabled ? 1 : 0,
          split_ratios: JSON.stringify(splitRatios),
        },
      });

      if (response) {
        if (response.ok) {
          const blob = await response.blob();
          downloadFile(blob, response.headers.get('filename'));

          Modal.info({
            title: t('exportPage.modal.readyTitle'),
            body: t('exportPage.notice.approvedOnly'),
            simple: true,
          });
        } else if (response.status === 400) {
          let detail = t('exportPage.notice.noApproved');

          try {
            const payload = await response.clone().json();
            detail = payload?.detail ?? detail;
          } catch (e) {
            /* ignore */
          }

          Modal.info({
            title: t('exportPage.modal.emptyTitle'),
            body: detail,
            simple: true,
          });
        } else {
          api.handleError(response);
        }
      }
    }

    setDownloading(false);
    setDownloadingMessage(false);
    clearTimeout(message);
  };

  useEffect(() => {
    if (effectiveSplitEnabled) {
      const total = splitRatios.train + splitRatios.val + splitRatios.test;
      setSplitRatiosValid(total === 100);
    } else {
      setSplitRatiosValid(true);
    }
  }, [effectiveSplitEnabled, splitRatios]);

  useEffect(() => {
    if (isDefined(pageParams.id)) {
      api.callApi("previousExports", {
        params: {
          pk: pageParams.id,
        },
      }).then(({export_files}) => {
        setPreviousExports(export_files.slice(0, 1));
      });

      api.callApi("exportFormats", {
        params: {
          pk: pageParams.id,
        },
      }).then(formats => {
        const localizedFormats = (formats ?? []).map(localizeFormat);

        setAvailableFormats(localizedFormats);
        setCurrentFormat(localizedFormats[0]?.name);
      });

      api.callApi("project", {
        params: {
          pk: pageParams.id,
        },
      }).then(project => {
        if (project) {
          setSplitEnabled(!!project.export_split_enabled);
          const ratios = project.export_split_ratios;
          if (ratios && typeof ratios === 'object' &&
              'train' in ratios && 'val' in ratios && 'test' in ratios) {
            setSplitRatios({
              train: Number(ratios.train) || 0,
              val: Number(ratios.val) || 0,
              test: Number(ratios.test) || 0,
            });
          }
        }
      });
    }
  }, [pageParams]);

  // const formatSelect = (
  //   <Label text="Export format" style={{display: "block", width: "mix-content"}} flat>
  //     <Dropdown.Trigger content={(
  //       <Menu size="medium">
  //         {Object.entries(formats).map(([key, value]) => {
  //           return <Menu.Item key={key} onClick={() => setFormat(key)}>{value}</Menu.Item>;
  //         })}
  //       </Menu>
  //     )}>
  //       <Button size="small" style={{textAlign: "left"}}>
  //         <span>{formats[format]}</span>
  //       </Button>
  //     </Dropdown.Trigger>
  //   </Label>
  // );

  // const aggregation = (
  //   <Form.Row columnCount={2}>
  //     {/* TODO: We don't have api for different formats yet, so let's hide the select for now */}
  //     {/* {formatSelect} */}

  //     <RadioGroup label="Aggregation of annotations" size="small" name="aggregator_type" labelProps={{size: "large", flat: true}}>
  //       <RadioGroup.Button value="majority_vote" checked>
  //         Majority vote
  //       </RadioGroup.Button>
  //       <RadioGroup.Button value="no_aggregation">
  //         No aggregation
  //       </RadioGroup.Button>
  //     </RadioGroup>
  //   </Form.Row>
  // );

  // const exportHistory = (
  //   <Label text="Previous exports" size="large" flat>
  //     {previousExports.map(file => {
  //       const basename = file.url.split('/').reverse()[0];
  //       return (
  //         <Button key={file.url} href={file.url} size="medium" download={basename} icon={<FaFileDownload/>}>
  //           {basename}
  //         </Button>
  //       );
  //     })}
  //   </Label>
  // );

  return (
    <Modal
      onHide={() => {
        const path = location.pathname.replace(ExportPage.path, '');
        const search = location.search;
        history.replace(`${path}${search !== '?' ? search : ''}`);
      }}
      title={t('exportPage.title')}
      style={{width: 720}}
      closeOnClickOutside={false}
      allowClose={!downloading}
      // footer="Read more about supported export formats in the Documentation."
      visible
    >
      <Block name="export-page">
        <FormatInfo
          availableFormats={availableFormats}
          selected={currentFormat}
          onClick={format => setCurrentFormat(format.name)}
        />

        <Form ref={form}>
          <Input type="hidden" name="exportType" value={currentFormat}/>

          <Elem name="options" style={{marginTop: 16}}>
            <RadioGroup
              label={t('exportPage.target.label')}
              name="export_target"
              value={exportTarget}
              onChange={value => setExportTarget(value)}
              labelProps={{size: "large", flat: true}}
            >
              <RadioGroup.Button value="local">{t('exportPage.target.local')}</RadioGroup.Button>
              <RadioGroup.Button value="dataset">{t('exportPage.target.dataset')}</RadioGroup.Button>
            </RadioGroup>
          </Elem>

          <SplitConfig
            enabled={effectiveSplitEnabled}
            ratios={splitRatios}
            ratiosValid={splitRatiosValid}
            onChangeEnabled={setSplitEnabled}
            onChangeRatios={setSplitRatios}
            toggleDisabled={exportTarget === 'dataset'}
          />
        </Form>

        <Elem name="notice">
          {t('exportPage.notice.approvedOnly')}
        </Elem>

        <Elem name="footer">
          <Space style={{width: '100%'}} spread>
            <Elem name="recent">
              {/* {exportHistory} */}
            </Elem>
            <Elem name="actions">
              <Space>
                {downloadingMessage && (
                  exportTarget === 'dataset'
                    ? t('exportPage.status.uploading')
                    : t('exportPage.status.preparing')
                )}
                <Elem
                  tag={Button}
                  name="finish"
                  look="primary"
                  onClick={proceedExport}
                  waiting={downloading}
                  disabled={downloading || (effectiveSplitEnabled && !splitRatiosValid)}
                >
                  {t('exportPage.actions.export')}
                </Elem>
              </Space>
            </Elem>
          </Space>
        </Elem>
      </Block>
    </Modal>
  );
};

const FormatInfo = ({availableFormats, selected, onClick}) => {
  return (
    <Block name="formats">
      <Elem name="info">{t('exportPage.formatInfo.description')}</Elem>
      <Elem name="list">
        {availableFormats.map(format => (
          <Elem
            key={format.name}
            name="item"
            mod={{
              active: !format.disabled,
              selected: format.name === selected,
            }}
            onClick={!format.disabled ? () => onClick(format) : null}
          >
            <Elem name="name">
              {format.title}

              <Space size="small">
                {format.tags?.map?.((tag, index) => (
                  <Elem key={index} name="tag">{tag}</Elem>
                ))}
              </Space>
            </Elem>

            {format.description && <Elem name="description">{format.description}</Elem>}
          </Elem>
        ))}
      </Elem>
    </Block>
  );
};

const SplitConfig = ({enabled, ratios, ratiosValid, onChangeEnabled, onChangeRatios, toggleDisabled}) => {
  const total = ratios.train + ratios.val + ratios.test;
  const isValid = total === 100;

  const handleChange = (key, value) => {
    const num = Math.max(0, Math.min(100, parseInt(value, 10) || 0));
    onChangeRatios({...ratios, [key]: num});
  };

  return (
    <Block name="split-config" mod={{visible: enabled}}>
      <Elem name="row">
        <Toggle
          label={t('exportPage.split.enabled')}
          checked={enabled}
          onChange={e => onChangeEnabled(e.target.checked)}
          disabled={toggleDisabled}
        />
      </Elem>
      {enabled && (
        <Elem name="inputs">
          {['train', 'val', 'test'].map(key => (
            <Elem key={key} name="field">
              <Input
                type="number"
                min={0}
                max={100}
                label={t(`exportPage.split.${key}`)}
                value={ratios[key]}
                onChange={e => handleChange(key, e.target.value)}
              />
            </Elem>
          ))}
          <Elem name="total" mod={{invalid: !isValid || !ratiosValid}}>
            {t('exportPage.split.total')}: {total}%
          </Elem>
          {!isValid && (
            <Elem name="error" mod={{visible: true}}>
              {t('exportPage.split.invalidTotal')}
            </Elem>
          )}
        </Elem>
      )}
    </Block>
  );
};

ExportPage.path = "/export";
ExportPage.modal = true;
