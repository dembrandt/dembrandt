import { all, any, asset, attr, banner, bannerVersion, cls, comment, cssVar, font, generator, generatorVersion, glob, globalVersion, id, not, pathVersion, prop, resource, sheet, tag, urlVersion, versioned, when, type TechRule } from '../model.js';

export const ERA_RULES: TechRule[] = [
  {
    name: 'Slick', category: 'ui-library',
    strong: [cls('slick-slider'), cls('slick-initialized'), attr('data-slick-index')],
    version: [urlVersion('slick(?:-carousel)?')],
  },
  {
    name: 'Owl Carousel', category: 'ui-library',
    strong: [cls(/^owl-(carousel|stage|item)$/, 2), banner(/^Owl Carousel v\d/)],
    version: [bannerVersion(/^Owl Carousel v([\d.]+)/), urlVersion('owl\\.?carousel2?')],
  },
  {
    name: 'Swiper', category: 'ui-library',
    strong: [cls(/^swiper-(wrapper|slide)$/, 2), cssVar('--swiper-'), banner(/^Swiper \d/)],
    version: [bannerVersion(/^Swiper ([\d.]+)/), urlVersion('swiper')],
  },
  {
    name: 'bxSlider', category: 'ui-library',
    strong: [cls(/^bx-(wrapper|viewport)$/), banner(/^bxSlider v\d/)],
    version: [bannerVersion(/^bxSlider v([\d.]+)/), urlVersion('bxslider')],
  },
  {
    name: 'FlexSlider', category: 'ui-library',
    strong: [all(cls('flexslider'), cls(/^flex-(control-nav|direction-nav|active-slide|viewport)$/)), font(/^flexslider-icon$/), banner(/^jQuery FlexSlider v\d/)],
    version: [bannerVersion(/^jQuery FlexSlider v([\d.]+)/), urlVersion('flexslider')],
  },
  {
    name: 'Fancybox', category: 'ui-library',
    strong: [attr('data-fancybox'), cls(/^fancybox-(container|slide|content|overlay|wrap)$/), cls('fancybox__container')],
    version: [urlVersion('(?:@fancyapps/)?fancybox')],
  },
  {
    name: 'Magnific Popup', category: 'ui-library',
    strong: [cls(/^mfp-(wrap|bg|container|content)$/)],
    version: [urlVersion('magnific-popup(?:\\.js)?')],
  },
  {
    name: 'Lightbox2', category: 'ui-library',
    strong: [cls(/^(lightboxOverlay|lb-outerContainer)$/), banner(/^Lightbox v\d/)],
    weak: [attr('data-lightbox'), glob('lightbox')],
    version: [bannerVersion(/^Lightbox v([\d.]+)/), urlVersion('lightbox2')],
  },
  {
    name: 'Colorbox', category: 'ui-library',
    strong: [cls('cboxElement'), id(/^(colorbox|cboxOverlay)$/), banner(/^Colorbox \d/)],
    version: [bannerVersion(/^Colorbox ([\d.]+)/), urlVersion('(?:jquery[.-])?colorbox')],
  },
  {
    name: 'Select2', category: 'ui-library',
    strong: [cls(/^select2-(container|selection|hidden-accessible)$/), banner(/^Select2 \d/)],
    version: [bannerVersion(/^Select2 ([\d.]+)/), urlVersion('select2')],
  },
  {
    name: 'Chosen', category: 'ui-library',
    strong: [cls(/^chosen-(container|single|drop|results)$/, 2), banner(/^Chosen v\d/)],
    version: [bannerVersion(/^Chosen v([\d.]+)/), urlVersion('chosen(?:-js)?')],
  },
  {
    name: 'DataTables', category: 'ui-library',
    strong: [versioned('DataTable'), cls(/^(dataTables_wrapper|dataTable|dt-container)$/), banner(/^DataTables \d/)],
    version: [globalVersion('DataTable'), bannerVersion(/^DataTables ([\d.]+)/), urlVersion('(?:datatables(?:\\.net)?|dataTables)')],
  },
  {
    name: 'Isotope', category: 'ui-library',
    strong: [glob('Isotope'), banner(/^Isotope PACKAGED v\d/)],
    version: [bannerVersion(/^Isotope PACKAGED v([\d.]+)/), urlVersion('isotope(?:-layout)?')],
  },
  {
    name: 'Masonry', category: 'ui-library',
    strong: [all(glob('Masonry'), not(glob('Isotope'))), banner(/^Masonry PACKAGED v\d/)],
    version: [bannerVersion(/^Masonry PACKAGED v([\d.]+)/), urlVersion('masonry(?:-layout)?')],
  },
  {
    name: 'Flatpickr', category: 'ui-library',
    strong: [cls(/^flatpickr-(calendar|input)$/), prop('_flatpickr'), banner(/^flatpickr v\d/)],
    version: [bannerVersion(/^flatpickr v([\d.]+)/), urlVersion('flatpickr')],
  },
  {
    name: 'Splide', category: 'ui-library',
    strong: [all(cls('splide'), cls(/^splide__(track|list|slide)$/)), glob('Splide')],
    version: [urlVersion('(?:@splidejs/)?splide')],
  },
  {
    name: 'Bootstrap Datepicker', category: 'ui-library',
    strong: [all(cls('datepicker'), cls(/^datepicker-(days|inline|dropdown|switch|months)$/)), banner(/^Datepicker for Bootstrap v\d/)],
    version: [bannerVersion(/^Datepicker for Bootstrap v([\d.]+)/), urlVersion('bootstrap-datepicker')],
  },
  {
    name: 'AOS', category: 'js-library',
    strong: [attr('data-aos'), cls('aos-init'), glob('AOS')],
    version: [urlVersion('aos')],
  },
  {
    name: 'Animate.css', category: 'css-framework',
    strong: [cls('animate__animated'), all(cls('animated'), cls(/^(bounce|fade|slide|zoom|flip|rotate|lightSpeed|roll)(In|Out)/)), asset('animate', 'css', 'animate\\.css')],
    version: [urlVersion('animate(?:\\.css)?'), when(cls('animate__animated'), '4'), when(cls('animated'), '3')],
  },
  {
    name: 'jQuery Mobile', category: 'ui-library',
    strong: [cls('ui-mobile'), all(cls('ui-page'), attr('data-role')), banner(/^jQuery Mobile \d/)],
    version: [pathVersion('jQuery.mobile.version'), bannerVersion(/^jQuery Mobile ([\d.]+)/), urlVersion('jquery[.-]mobile')],
  },
  {
    name: 'Kendo UI', category: 'ui-library',
    strong: [glob('kendo'), cls(/^k-(widget|input|button|datepicker|tabstrip|grid|dropdown)$/, 2)],
    version: [globalVersion('kendo'), urlVersion('kendo(?:-ui(?:-core)?)?')],
  },
  {
    name: 'Ext JS', category: 'ui-library',
    strong: [versioned('Ext'), cls(/^ext-(strict|webkit|gecko|ie\d?|chrome)$/), cls(/^x-(panel|btn|grid|window|toolbar|form)(-|$)/, 3)],
    version: [globalVersion('Ext'), urlVersion('ext(?:js|-core)?')],
  },
  {
    name: 'Material Design Lite', category: 'ui-library',
    strong: [cls(/^mdl-(layout|button|card|js-[a-z]+|textfield|grid)$/, 2), glob('componentHandler')],
    version: [urlVersion('material-design-lite')],
  },
  {
    name: 'Angular Material', category: 'ui-library',
    strong: [cls(/^mat-(mdc-)?(button|card|toolbar|form-field|icon|typography|app-background)/, 2), tag(/^mat-[a-z]/)],
    requires: ['Angular'],
  },
  {
    name: 'Material Components Web', category: 'ui-library',
    strong: [cls(/^mdc-[a-z]/, 3), glob('mdc')],
    weak: [cssVar('--mdc-')],
    version: [urlVersion('material-components-web')],
    yieldsTo: ['Angular Material'],
  },
  {
    name: 'AngularJS Material', category: 'ui-library',
    strong: [versioned('ngMaterial'), tag(/^md-(button|toolbar|content|card|input-container|icon|sidenav|list)$/, 2)],
    version: [globalVersion('ngMaterial'), urlVersion('angular-material')],
    requires: ['AngularJS'],
  },
  {
    name: 'UI Bootstrap', category: 'ui-library',
    strong: [tag(/^uib-[a-z]/), attr(/^uib-[a-z]/), attr(/^(accordion|tab-heading|tab-content)-transclude$/)],
    version: [urlVersion('angular-ui-bootstrap')],
  },
  {
    name: 'Onsen UI', category: 'ui-library',
    strong: [tag(/^ons-[a-z]/), glob('ons'), banner(/^onsenui v\d/)],
    version: [bannerVersion(/^onsenui v([\d.]+)/), urlVersion('onsenui')],
  },
  {
    name: 'Framework7', category: 'ui-library',
    strong: [cls('framework7-root'), glob('Framework7'), cssVar('--f7-', 5), banner(/^Framework7 \d/)],
    version: [bannerVersion(/^Framework7 ([\d.]+)/), urlVersion('framework7')],
  },
  {
    name: 'Buefy', category: 'ui-library',
    strong: [glob('Buefy'), banner(/^Buefy v\d/)],
    version: [bannerVersion(/^Buefy v([\d.]+)/), urlVersion('buefy')],
  },
  {
    name: 'BootstrapVue', category: 'ui-library',
    strong: [glob(/^[Bb]ootstrapVue$/), id(/^__BVID__/), banner(/^BootstrapVue \d/)],
    version: [bannerVersion(/^BootstrapVue ([\d.]+)/), urlVersion('bootstrap-vue')],
  },
  {
    name: 'View UI', category: 'ui-library',
    strong: [cls(/^ivu-[a-z]/, 3), versioned('iview')],
    version: [globalVersion('iview'), urlVersion('(?:view-design|iview|view-ui-plus)')],
  },
  {
    name: 'Marionette', category: 'js-framework',
    strong: [versioned('Marionette')],
    version: [globalVersion('Marionette'), urlVersion('(?:backbone\\.)?marionette')],
  },
  {
    name: 'Riot', category: 'js-framework',
    strong: [versioned('riot'), prop('__riot-events__'), banner(/^Riot v\d/)],
    version: [globalVersion('riot'), bannerVersion(/^Riot v([\d.]+)/), urlVersion('riot')],
  },
  {
    name: 'Mithril', category: 'js-framework',
    strong: [versioned('m')],
    weak: [prop('vnodes'), glob('m')],
    version: [globalVersion('m'), urlVersion('mithril')],
  },
  {
    name: 'Inferno', category: 'js-framework',
    strong: [versioned('Inferno'), all(prop('$V'), prop('$EV'))],
    version: [globalVersion('Inferno'), urlVersion('inferno')],
  },
  {
    name: 'Polymer', category: 'web-components',
    strong: [versioned('Polymer'), tag('dom-module')],
    version: [globalVersion('Polymer'), urlVersion('polymer')],
  },
  {
    name: 'Meteor', category: 'meta-framework',
    strong: [glob('__meteor_runtime_config__'), glob('Meteor')],
    version: [pathVersion('Meteor.release')],
  },
  {
    name: 'Aurelia', category: 'js-framework',
    strong: [attr('aurelia-app'), cls('au-target')],
  },
  {
    name: 'Unpoly', category: 'js-library',
    strong: [versioned('up'), attr(/^up-(target|follow|main|layer|submit)$/), cssVar('--up-')],
    version: [globalVersion('up'), urlVersion('unpoly')],
  },
  {
    name: 'Livewire', category: 'js-framework',
    strong: [attr(/^wire:(id|model|click|snapshot|effects)/), glob('Livewire')],
  },
  {
    name: 'Phoenix LiveView', category: 'js-framework',
    strong: [attr(/^data-phx-(main|session|static)$/), attr(/^phx-(click|submit|change|hook)$/), glob('liveSocket')],
  },
  {
    name: 'Blazor', category: 'js-framework',
    strong: [glob('Blazor'), comment(/^Blazor:/), resource(/\/_framework\/blazor\.(web|server|webassembly)\.js/)],
  },
  {
    name: 'Modernizr', category: 'js-library',
    strong: [glob('Modernizr'), asset('modernizr', 'js')],
    version: [pathVersion('Modernizr._version'), urlVersion('modernizr')],
  },
  {
    name: 'script.aculo.us', category: 'js-library',
    strong: [glob('Scriptaculous'), asset('scriptaculous', 'js')],
    version: [pathVersion('Scriptaculous.Version'), urlVersion('scriptaculous')],
  },
  {
    name: 'Basscss', category: 'css-framework',
    strong: [sheet('mxn2', 'max-width-3', 'caps'), asset('basscss', 'css')],
    version: [urlVersion('basscss')],
  },
  {
    name: 'Docsify', category: 'site-builder',
    strong: [versioned('Docsify'), glob('$docsify')],
    version: [globalVersion('Docsify'), urlVersion('docsify')],
  },
  {
    name: 'MkDocs', category: 'site-builder',
    strong: [generator(/^mkdocs-\d/)],
    version: [generatorVersion(/^mkdocs-([\d.]+)/)],
  },
  {
    name: 'Hexo', category: 'site-builder',
    strong: [generator(/^Hexo \d/)],
    version: [generatorVersion(/^Hexo ([\d.]+)/)],
  },
  {
    name: 'GitBook', category: 'site-builder',
    strong: [generator(/^GitBook/)],
    version: [generatorVersion(/^GitBook ([\d.]+)/)],
  },
  {
    name: 'Dashicons', category: 'icon-set', iconType: 'icon-font',
    strong: [all(cls('dashicons'), cls(/^dashicons-[a-z]/))],
    version: [urlVersion('dashicons')],
  },
  {
    name: 'Open Iconic', category: 'icon-set', iconType: 'icon-font',
    strong: [all(cls('oi'), any(attr('data-glyph'), cls(/^oi-[a-z]/)))],
    version: [urlVersion('open-iconic')],
  },
  {
    name: 'Line Awesome', category: 'icon-set', iconType: 'icon-font',
    strong: [all(font(/^Line Awesome/), cls(/^la-[a-z]/)), all(cls(/^la[sbrld]$/), cls(/^la-[a-z]/))],
    version: [urlVersion('line-awesome')],
  },
  {
    name: 'Simple Line Icons', category: 'icon-set', iconType: 'icon-font',
    strong: [all(font(/^simple-line-icons$/), cls(/^icon-[a-z]/))],
    version: [urlVersion('simple-line-icons')],
  },
  {
    name: 'Foundation Icons', category: 'icon-set', iconType: 'icon-font',
    strong: [all(font(/^foundation-icons$/), cls(/^fi-[a-z]/))],
    version: [urlVersion('foundation-icons')],
  },
  {
    name: 'Genericons', category: 'icon-set', iconType: 'icon-font',
    strong: [all(cls('genericon'), cls(/^genericon-[a-z]/))],
    version: [urlVersion('genericons')],
  },
  {
    name: 'Typicons', category: 'icon-set', iconType: 'icon-font',
    strong: [all(cls('typcn'), cls(/^typcn-[a-z]/))],
    version: [urlVersion('typicons(?:\\.font)?')],
  },
  {
    name: 'Themify Icons', category: 'icon-set', iconType: 'icon-font',
    strong: [all(font(/^themify$/), cls(/^ti-[a-z]/), not(cls('ti')))],
  },
  {
    name: 'IcoMoon', category: 'icon-set', iconType: 'icon-font',
    strong: [all(font(/^icomoon$/i), cls(/^icon-[a-z]/))],
  },
  {
    name: 'Fontello', category: 'icon-set', iconType: 'icon-font',
    strong: [all(font(/^fontello$/i), cls(/^icon-[a-z]/))],
  },
];
