import { all, any, asset, attr, attrValue, attrVersion, banner, bannerVersion, classVersion, cls, codeVersion, cssVar, cssVarNamed, glob, globalVersion, id, layer, pathVersion, tag, urlVersion, versioned, when, type TechRule } from '../model.js';

export const UI_RULES: TechRule[] = [
  {
    name: 'Material UI (MUI)', category: 'ui-library',
    strong: [cls(/^Mui[A-Z][A-Za-z]+-[a-zA-Z]/, 3), attrValue('data-meta', /^Mui[A-Z]/)],
    version: [bannerVersion(/^mui\/material v([\d.]+)/), urlVersion('@(?:mui/material|material-ui/core)'), when(attrValue('data-meta', /^Mui[A-Z]/), '4')],
  },
  {
    name: 'Chakra UI', category: 'ui-library',
    strong: [cssVar('--chakra-', 5), cls(/^chakra-[a-z]/, 3)],
    version: [when(all(cssVar('--chakra-'), layer('tokens', 'recipes')), '3')],
  },
  {
    name: 'Ant Design', category: 'ui-library',
    strong: [cls(/^ant-[a-z]/, 3), cssVar('--ant-', 5), versioned('antd')],
    version: [bannerVersion(/^antd v([\d.]+)/), globalVersion('antd'), urlVersion('(?:antd|ant-design-vue)')],
  },
  {
    name: 'Mantine', category: 'ui-library',
    strong: [cls(/^mantine-[A-Za-z0-9]/, 3), cssVar('--mantine-', 5), attr(/^data-mantine-/)],
  },
  {
    name: 'PrimeReact/Vue/NG', category: 'ui-library',
    strong: [all(cls('p-component'), any(attr('data-pc-name'), cls(/^p-(button|menubar|card|inputtext|datatable|dropdown|dialog)$/))), attr(/^data-prime(react|vue)-style-id$/), layer('primereact'), layer('primevue'), layer('primeng')],
  },
  {
    name: 'Fluent UI', category: 'ui-library',
    strong: [cls(/^ms-[A-Z]/, 3), cls(/^fui-[A-Z]/, 2), attr('data-merge-styles'), tag(/^fluent-[a-z]/, 2)],
    version: [codeVersion('fluent', /\("@fluentui\/react","(\d+\.\d+\.\d+)"\)/), urlVersion('@fluentui/web-components'), when(cls(/^fui-[A-Z]/), '9'), when(cls(/^ms-[A-Z]/), '8')],
  },
  {
    name: 'Carbon Design System', category: 'ui-library',
    strong: [cls(/^(cds|bx)--[a-z]/, 3), cssVar('--cds-', 5), tag(/^cds-[a-z]/)],
    version: [urlVersion('carbon-components')],
  },
  {
    name: 'Shopify Polaris', category: 'ui-library',
    strong: [cls(/^Polaris-[A-Z]/, 3)],
    version: [codeVersion('polaris', /--polaris-version-number:\s*"(\d+\.\d+\.\d+)"/)],
  },
  {
    name: 'Radix UI', category: 'ui-library',
    strong: [attr(/^data-radix-/), id(/^radix-/)],
  },
  {
    name: 'shadcn/ui', category: 'ui-library',
    strong: [all(
      cssVarNamed('--muted-foreground'), cssVarNamed('--primary-foreground'), cssVarNamed('--popover'), cssVarNamed('--ring'),
      any(attrValue('data-slot', /^(button|card|card-header|card-content|input|badge|dialog-content|dropdown-menu-trigger|tabs-list|label|separator)$/), cls(/^(bg|text|border|ring)-(card|popover|muted|accent|destructive|primary|secondary)(-foreground)?$/, 3)),
    )],
    requires: ['Tailwind CSS'],
  },
  {
    name: 'Headless UI', category: 'ui-library',
    strong: [attr('data-headlessui-state'), attr('data-headlessui-focus-guard'), id(/^headlessui-/)],
  },
  {
    name: 'React Aria', category: 'ui-library',
    strong: [attr('data-rac'), cls(/^react-aria-[A-Z]/), attr('data-react-aria-pressable')],
  },
  {
    name: 'Base UI', category: 'ui-library',
    strong: [id(/^base-ui-/), attr(/^data-base-ui-/)],
    weak: [attr('data-activation-direction'), attr(/^data-composite-item/), attr(/^data-(starting|ending)-style$/), attr(/^data-base-ui-/), all(attr('data-unchecked'), attr('data-closed'))],
  },
  {
    name: 'Ark UI', category: 'ui-library',
    strong: [all(attr('data-scope'), attr('data-part')), glob(/^__zag__/)],
  },
  {
    name: 'Blueprint', category: 'ui-library',
    strong: [cls(/^bp\d-[a-z]/, 3), cls(/^pt-(button|navbar|card|intent-)/, 3)],
    version: [classVersion(/^bp(\d)-/)],
  },
  {
    name: 'React Suite', category: 'ui-library',
    strong: [cls(/^rs-[a-z]/, 3), cssVar('--rs-', 20)],
  },
  {
    name: 'Arco Design', category: 'ui-library',
    strong: [cls(/^arco-[a-z]/, 3)],
  },
  {
    name: 'Semi Design', category: 'ui-library',
    strong: [cls(/^semi-[a-z]/, 3), cssVar('--semi-', 20)],
  },
  {
    name: 'Vuetify', category: 'ui-library',
    strong: [versioned('Vuetify'), cls(/^v-application/), all(cls(/^v-(btn|card|app-bar|toolbar|main|container)$/, 2), any(cssVar('--v-'), cls(/^(v-)?theme--(light|dark)$/)))],
    version: [bannerVersion(/^Vuetify v([\d.]+)/), globalVersion('Vuetify'), urlVersion('vuetify'), when(layer('vuetify-core'), '4'), when(cssVar('--v-', 20), '3'), when(cls(/^theme--(light|dark)$/), '2')],
  },
  {
    name: 'Quasar', category: 'ui-library',
    strong: [versioned('Quasar'), cls(/^q-(btn|card|layout|page|toolbar|header|notifications__list)$/, 2), all(cssVar('--q-'), cls(/^q-[a-z]/))],
    version: [bannerVersion(/^Quasar Framework v([\d.]+)/), globalVersion('Quasar'), urlVersion('quasar')],
  },
  {
    name: 'Element Plus/UI', category: 'ui-library',
    strong: [versioned('ElementPlus'), versioned('ELEMENT'), cls(/^el-[a-z]/, 3), cssVar('--el-', 20)],
    version: [globalVersion('ElementPlus'), globalVersion('ELEMENT'), urlVersion('element-(?:plus|ui)')],
  },
  {
    name: 'jQuery UI', category: 'ui-library',
    strong: [banner(/^jQuery UI -? ?v\d/), cls(/^ui-(widget|state-default|corner-all|helper-reset|tabs|dialog|datepicker)$/, 2), asset('jquery-?ui', 'js|css', 'jquery-?ui')],
    version: [bannerVersion(/^jQuery UI -? ?v([\d.]+)/), pathVersion('jQuery.ui.version'), urlVersion('jquery-?ui')],
  },
  {
    name: 'styled-components', category: 'css-in-js',
    strong: [attr('data-styled'), attr('data-styled-version'), attr('data-styled-components')],
    version: [attrVersion('data-styled-version')],
  },
  {
    name: 'Emotion', category: 'css-in-js',
    strong: [attr('data-emotion')],
  },
  {
    name: 'JSS', category: 'css-in-js',
    strong: [attr('data-jss')],
  },
  {
    name: 'Stitches', category: 'css-in-js',
    strong: [cssVar('--sxs')],
  },
  {
    name: 'Griffel', category: 'css-in-js',
    strong: [attr('data-make-styles-bucket')],
  },
];
