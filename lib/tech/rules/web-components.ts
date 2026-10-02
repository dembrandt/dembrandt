import { all, cls, codeVersion, cssVar, glob, pathVersion, prop, tag, urlVersion, type TechRule } from '../model.js';

export const WEB_COMPONENT_RULES: TechRule[] = [
  {
    name: 'Stencil', category: 'web-components',
    strong: [all(cls('hydrated'), prop(/^s-(hn|sn|cr|p)$/))],
  },
  {
    name: 'FAST', category: 'web-components',
    strong: [glob('FAST'), prop('$fastController')],
  },
  {
    name: 'Shoelace', category: 'web-components',
    strong: [tag(/^sl-(button|icon|icon-button|input|card|dialog|dropdown|menu|menu-item|alert|badge|select|option|tab|tab-group|tooltip|checkbox|switch|drawer|avatar|spinner|details|divider|tag|textarea|radio)$/), glob('ShoelaceElement')],
    version: [codeVersion('shoelace', /ShoelaceElement\.version\s*=\s*"(\d+\.\d+\.\d+)"/), urlVersion('@shoelace-style/shoelace')],
  },
  {
    name: 'Web Awesome', category: 'web-components',
    strong: [tag(/^wa-[a-z]/, 2), cssVar('--wa-', 5)],
    version: [urlVersion('@awesome\\.me/webawesome')],
  },
  {
    name: 'Ionic', category: 'web-components',
    strong: [tag(/^ion-(app|content|header|toolbar|button|card|list|item|tabs)$/), glob('Ionic')],
    version: [urlVersion('@ionic/core')],
  },
  {
    name: 'Material Web', category: 'web-components',
    strong: [tag(/^md-(filled|outlined|text|elevated|filled-tonal)-(button|text-field|select|card)$/), tag(/^md-(checkbox|switch|fab|dialog|tabs|list|menu|chip-set)$/)],
  },
  {
    name: 'Vaadin', category: 'web-components',
    strong: [tag(/^vaadin-[a-z]/), glob('Vaadin'), cssVar('--lumo-', 5), cssVar('--vaadin-', 5)],
    version: [pathVersion('Vaadin.registrations.0.version')],
  },
  {
    name: 'UI5 Web Components', category: 'web-components',
    strong: [tag(/^ui5-[a-z]/, 2)],
    version: [codeVersion('ui5', /\{version:"(\d+\.\d+\.\d+)",major:\d+,minor:\d+,patch:\d+/)],
  },
  {
    name: 'Spectrum Web Components', category: 'web-components',
    strong: [tag('sp-theme'), tag(/^sp-[a-z]/, 2)],
  },
];
