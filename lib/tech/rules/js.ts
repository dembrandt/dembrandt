import { all, asset, attr, attrValue, banner, bannerVersion, cls, codeVersion, comment, expandoVersion, glob, globalVersion, id, not, prop, propVersion, resource, tag, urlVersion, versioned, when, type TechRule } from '../model.js';

const litMajor = (lithtml: string | undefined) => lithtml?.match(/^(\d+)\./)?.[1];

export const JS_RULES: TechRule[] = [
  {
    name: 'jQuery', category: 'js-library',
    strong: [banner(/^jQuery (JavaScript Library )?v\d/), versioned('jQuery'), prop(/^jQuery\d/), asset('jquery', 'js')],
    version: [bannerVersion(/^jQuery (?:JavaScript Library )?v([\d.]+)/), codeVersion('jquery', /="(\d+\.\d+\.\d+)",(?:\w+=\/HTML\$\/i,)?\w+=function\(\w+,\w+\)\{return new \w+\.fn\.init\(/), globalVersion('jQuery'), urlVersion('jquery'), propVersion(/^jQuery(\d)/)],
  },
  {
    name: 'AngularJS', category: 'js-framework',
    strong: [banner(/^AngularJS v\d/), versioned('angular'), cls(/^ng-(scope|binding|isolate-scope)$/), attr(/^(data-|x-)?ng[-:](app|controller|repeat|model|click|if|show|view)$/)],
    mount: { selector: '[ng-app], [data-ng-app], .ng-scope' },
    version: [bannerVersion(/^AngularJS v([\d.]+)/), globalVersion('angular'), urlVersion('angular(?:\\.js|js)?')],
  },
  {
    name: 'Backbone.js', category: 'js-framework',
    strong: [versioned('Backbone'), asset('backbone', 'js', 'backbone(?:\\.js)?')],
    version: [globalVersion('Backbone'), urlVersion('backbone(?:\\.js)?')],
  },
  {
    name: 'Knockout', category: 'js-framework',
    strong: [banner(/^Knockout JavaScript library v\d/), versioned('ko'), prop('__ko__'), attrValue('data-bind', /^(text|value|foreach|click|visible|css|attr|if|with|html|template)\s*:/)],
    version: [bannerVersion(/^Knockout JavaScript library v([\d.]+)/), codeVersion('knockout', /\.version="(\d+\.\d+\.\d+)",\w+\.\w+\("version"/), globalVersion('ko'), urlVersion('knockout')],
  },
  {
    name: 'Dojo', category: 'js-framework',
    strong: [versioned('dojo'), attr(/^(dojotype|data-dojo-(type|config|props))$/), resource(/\/dojo(\.xd)?\.js/)],
    version: [globalVersion('dojo'), urlVersion('dojo')],
  },
  {
    name: 'MooTools', category: 'js-library',
    strong: [versioned('MooTools')],
    version: [globalVersion('MooTools'), urlVersion('mootools')],
  },
  {
    name: 'Prototype', category: 'js-library',
    strong: [versioned('Prototype'), prop('_prototypeUID')],
    version: [globalVersion('Prototype'), urlVersion('prototype')],
  },
  {
    name: 'YUI', category: 'js-library',
    strong: [glob('YUI'), cls(/^yui3-/), versioned('YAHOO')],
    version: [globalVersion('YAHOO'), urlVersion('yui')],
  },
  {
    name: 'Zepto', category: 'js-library',
    strong: [banner(/^Zepto v\d/), glob('Zepto')],
    version: [bannerVersion(/^Zepto v([\d.]+)/), urlVersion('zepto')],
  },
  {
    name: 'Ember.js', category: 'js-framework',
    strong: [versioned('Ember'), cls('ember-view'), cls('ember-application')],
    weak: [id(/^ember\d+$/)],
    version: [globalVersion('Ember'), urlVersion('ember(?:\\.js|-source)?')],
  },
  {
    name: 'Alpine.js', category: 'js-framework',
    strong: [versioned('Alpine'), prop(/^(__x|_x_dataStack)$/), attr('x-data')],
    mount: { selector: '[x-data]' },
    version: [codeVersion('alpine', /version:"(\d+\.\d+\.\d+)",(?:disableEffectScheduling|flushAndStopDeferringMutations)/), globalVersion('Alpine'), urlVersion('alpinejs'), when(prop(/^_x_/), '3'), when(prop('__x'), '2')],
  },
  {
    name: 'htmx', category: 'js-library',
    strong: [versioned('htmx'), prop('htmx-internal-data'), attr(/^(data-)?hx-(get|post|put|delete|patch|boost|target|swap|trigger)$/)],
    version: [codeVersion('htmx', /version:"(\d+\.\d+\.\d+)"\}(?:,\w+=\{addTriggerHandler|;htmx\.onLoad)/), globalVersion('htmx'), urlVersion('htmx(?:\\.org)?')],
  },
  {
    name: 'React', category: 'js-framework',
    strong: [prop(/^(__reactFiber\$|__reactInternalInstance\$|__reactContainere?\$|_reactRootContainer|_reactInternalComponent)$/), attr(/^data-react(root|id|-checksum)$/), versioned('React'), glob('renderer:react-dom')],
    weak: [all(comment('$'), comment('/$')), id(/(^|[-_:])(:R[0-9a-z]*:?|_R_[0-9a-z]+_)$/i), attr('data-precedence')],
    mount: { props: ['__reactContainer$', '__reactContainere$', '_reactRootContainer'], selector: '[data-reactroot]' },
    version: [
      globalVersion('renderer:react-dom'), globalVersion('React'), urlVersion('react(?:-dom)?'),
      when(all(prop('__reactFiber$'), prop('__reactEvents$'), prop('_reactRootContainer')), '17'),
      when(all(prop('_reactRootContainer'), prop('__reactInternalInstance$')), '16'),
      when(prop('__reactInternalInstance$'), '15'),
      when(all(attr('data-reactid'), not(prop('__reactFiber$'))), '0'),
    ],
  },
  {
    name: 'Preact', category: 'js-framework',
    strong: [prop('__preactattr_'), all(prop('__k'), not(prop(/^__react/))), glob('preact')],
    mount: { props: ['__k', '__preactattr_'] },
    version: [urlVersion('preact'), when(prop('__preactattr_'), '8'), when(all(prop('__k'), prop('l')), '10'), when(all(prop('__k'), prop('__e')), '11')],
  },
  {
    name: 'Vue', category: 'js-framework',
    strong: [banner(/^(Vue\.js|vue|vue\/runtime-core) v\d/), prop(/^(__vue__|__vue_app__)$/), attr('data-v-app'), versioned('Vue'), glob('__VUE__')],
    weak: [attr(/^data-v-[0-9a-f]{8}$/)],
    mount: { props: ['__vue_app__', '__vue__'] },
    version: [expandoVersion('dom:vue', '__vue_app__', 'version'), expandoVersion('dom:vue2', '__vue__', '$root.constructor.version'), expandoVersion('dom:vue2base', '__vue__', '$options._base.version'), globalVersion('Vue'), urlVersion('vue'), bannerVersion(/^(?:Vue\.js|vue|vue\/runtime-core) v([\d.]+)/), when(prop('__vue_app__'), '3'), when(attr('data-v-app'), '3'), when(prop('__v_frag'), '1'), when(prop('__vue__'), '2')],
  },
  {
    name: 'Svelte', category: 'js-framework',
    strong: [cls(/^svelte-[a-z0-9]{5,8}$/), glob('__svelte')],
    version: [globalVersion('__svelte'), when(cls(/^svelte-[a-z0-9]{5,8}$/), '3')],
  },
  {
    name: 'Solid', category: 'js-framework',
    strong: [prop(/^\$\$[a-z]+$/), glob('_$HY')],
  },
  {
    name: 'Lit', category: 'web-components',
    strong: [glob('litElementVersions'), glob('litHtmlVersions'), comment(/^\?lit\$/)],
    version: [(s) => litMajor(s.globals.litHtmlVersions)],
  },
  {
    name: 'Stimulus', category: 'js-framework',
    strong: [all(attr('data-controller'), attrValue('data-action', /^(\w+->)?[\w-]+#\w+/)), glob('Stimulus')],
    version: [urlVersion('stimulus')],
  },
  {
    name: 'Turbo', category: 'js-library',
    strong: [banner(/^Turbo \d/), glob('Turbo'), tag(/^turbo-(frame|stream)$/), attr('data-turbo')],
    version: [bannerVersion(/^Turbo ([\d.]+)/), urlVersion('turbo')],
  },
];
