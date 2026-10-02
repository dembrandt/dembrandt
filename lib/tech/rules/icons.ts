import { all, attr, attrValue, bannerVersion, cls, font, glob, not, resource, resourceVersion, svg, tag, urlVersion, when, type TechRule, type VersionProbe } from '../model.js';

const fontAwesomeFamily: VersionProbe = (s) => {
  const majors = s.fontFaces.map((f) => Number(f.match(/^Font Awesome (\d+)/)?.[1])).filter(Boolean);
  if (majors.length) return String(Math.max(...majors));
  if (!s.fontFaces.includes('FontAwesome')) return undefined;
  return s.classes.fa ? '4' : Object.keys(s.classes).some((c) => /^icon-[a-z]/.test(c)) ? '3' : undefined;
};

const usesFontAwesome = all(cls(/^(fa[srlbd]?|fa-(solid|regular|brands|light|thin|duotone))$/), cls(/^fa-[a-z]/));

export const ICON_RULES: TechRule[] = [
  {
    name: 'Font Awesome', category: 'icon-set',
    iconType: (s) => (s.classes['svg-inline--fa'] ? 'svg' : 'icon-font'),
    strong: [usesFontAwesome, all(font(/^FontAwesome$/), cls(/^icon-[a-z]/), not(cls('fa'))), cls('svg-inline--fa'), glob('___FONT_AWESOME___'), all(resource(/font-?awesome/i), usesFontAwesome)],
    version: [bannerVersion(/^Font Awesome (?:Free |Pro )?([\d.]+)/), resourceVersion(/fontawesome-webfont\.[a-z0-9]+\?v=(\d+\.\d+\.\d+)/), urlVersion('(?:font-?awesome(?:-free)?|@fortawesome/fontawesome-free)'), fontAwesomeFamily, when(cls(/^fa-w-\d+$/), '5')],
  },
  {
    name: 'Material Icons', category: 'icon-set',
    iconType: (s) => (s.classes['MuiSvgIcon-root'] ? 'svg' : 'icon-font'),
    strong: [cls(/^material-icons(-outlined|-round|-sharp|-two-tone)?$/), cls('MuiSvgIcon-root')],
    version: [urlVersion('material-icons')],
  },
  {
    name: 'Material Symbols', category: 'icon-set', iconType: 'icon-font',
    strong: [cls(/^material-symbols-(outlined|rounded|sharp)$/)],
    version: [urlVersion('material-symbols')],
  },
  {
    name: 'Bootstrap Icons', category: 'icon-set',
    iconType: (s) => (s.fontFaces.includes('bootstrap-icons') ? 'icon-font' : 'svg'),
    strong: [all(cls('bi'), cls(/^bi-[a-z]/))],
    version: [bannerVersion(/^Bootstrap Icons v([\d.]+)/), urlVersion('bootstrap-icons')],
  },
  {
    name: 'Glyphicons', category: 'icon-set', iconType: 'icon-font',
    strong: [all(cls('glyphicon'), cls(/^glyphicon-[a-z]/))],
  },
  {
    name: 'Ionicons', category: 'icon-set',
    iconType: (s) => (s.tags['ion-icon'] ? 'svg' : 'icon-font'),
    strong: [tag('ion-icon'), all(font(/^Ionicons$/), cls(/^ion-[a-z]/)), cls(/ionicons/)],
    version: [bannerVersion(/^Ionicons, v([\d.]+)/), urlVersion('ionicons'), when(cls(/^ion-(md|ios)-/), '4')],
  },
  {
    name: 'Feather Icons', category: 'icon-set', iconType: 'svg',
    strong: [all(cls('feather'), cls(/^feather-[a-z]/)), attr('data-feather')],
    version: [urlVersion('feather-icons')],
  },
  {
    name: 'Lucide', category: 'icon-set', iconType: 'svg',
    strong: [all(cls('lucide'), cls(/^lucide-[a-z]/)), attr('data-lucide')],
    version: [bannerVersion(/^lucide(?:-react|-vue-next|-static)? v([\d.]+)/), urlVersion('lucide(?:-static)?')],
  },
  {
    name: 'Heroicons', category: 'icon-set', iconType: 'svg',
    strong: [cls(/heroicon/), all(attrValue('data-slot', 'icon'), not(cls(/^(lucide|tabler-icon|feather|octicon|iconify)$/)))],
    weak: [svg('0 0 24 24|1.5|none|currentColor'), svg('0 0 20 20||currentColor|')],
    version: [when(svg('0 0 24 24|1.5|none|currentColor'), '2')],
  },
  {
    name: 'Tabler Icons', category: 'icon-set',
    iconType: (s) => (s.classes.ti ? 'icon-font' : 'svg'),
    strong: [cls('tabler-icon'), cls(/^icon-tabler/), all(cls('ti'), cls(/^ti-[a-z]/))],
    version: [bannerVersion(/^(?:Tabler Icons |tabler\/icons(?:-react|-vue)? v)([\d.]+)/), urlVersion('@tabler/icons(?:-webfont)?')],
  },
  {
    name: 'Phosphor Icons', category: 'icon-set',
    iconType: (s) => (s.fontFaces.some((f) => f.startsWith('Phosphor')) ? 'icon-font' : 'svg'),
    strong: [all(cls(/^ph(-bold|-fill|-light|-thin|-duotone)?$/), cls(/^ph-[a-z]/)), svg(/^0 0 256 256\|\|currentColor\|/, 4)],
    version: [urlVersion('@phosphor-icons/web')],
  },
  {
    name: 'Octicons', category: 'icon-set', iconType: 'svg',
    strong: [all(cls('octicon'), cls(/^octicon-[a-z]/))],
  },
  {
    name: 'Remix Icon', category: 'icon-set', iconType: 'icon-font',
    strong: [cls(/^ri-[a-z0-9-]+-(line|fill)$/), all(font(/^remixicon$/), cls(/^ri-[a-z]/))],
    version: [bannerVersion(/^Remix Icon v([\d.]+)/), urlVersion('remixicon')],
  },
  {
    name: 'Material Design Icons', category: 'icon-set', iconType: 'icon-font',
    strong: [all(cls('mdi'), cls(/^mdi-[a-z]/))],
    version: [resourceVersion(/materialdesignicons-webfont\.[a-z0-9]+\?v=(\d+\.\d+\.\d+)/), urlVersion('@mdi/font')],
  },
  {
    name: 'Boxicons', category: 'icon-set', iconType: 'icon-font',
    strong: [all(cls(/^bx[sl]?$/), cls(/^bx[sl]?-[a-z]/)), tag('box-icon')],
    version: [urlVersion('boxicons')],
  },
  {
    name: 'Iconify', category: 'icon-set', iconType: 'svg',
    strong: [tag('iconify-icon'), cls('iconify')],
    version: [urlVersion('iconify-icon')],
  },
  {
    name: 'Ant Design Icons', category: 'icon-set', iconType: 'svg',
    strong: [all(cls('anticon'), cls(/^anticon-[a-z]/))],
  },
  {
    name: 'Hugeicons', category: 'icon-set', iconType: 'svg',
    strong: [cls(/hugeicons/)],
  },
  {
    name: 'SVG Icons', category: 'icon-set', iconType: 'svg',
    strong: [svg('class~icon')],
  },
];
