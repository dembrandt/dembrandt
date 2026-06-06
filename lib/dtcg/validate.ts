/**
 * W3C Design Tokens Community Group (DTCG) Validator
 * Validates design tokens against the W3C DTCG specification
 * @see https://www.designtokens.org/TR/2025.10/format/
 */

/**
 * Valid token types according to W3C DTCG spec
 */
const VALID_TOKEN_TYPES = [
  'color',
  'dimension',
  'fontFamily',
  'fontWeight',
  'duration',
  'cubicBezier',
  'number',
  'strokeStyle',
  'border',
  'transition',
  'shadow',
  'gradient',
  'typography'
];

/**
 * Valid font weight string aliases
 */
const FONT_WEIGHT_ALIASES = {
  'thin': 100,
  'hairline': 100,
  'extra-light': 200,
  'ultra-light': 200,
  'light': 300,
  'normal': 400,
  'regular': 400,
  'book': 400,
  'medium': 500,
  'semi-bold': 600,
  'demi-bold': 600,
  'bold': 700,
  'extra-bold': 800,
  'ultra-bold': 800,
  'black': 900,
  'heavy': 900,
  'extra-black': 950,
  'ultra-black': 950
};

/**
 * Valid stroke style string values
 */
const STROKE_STYLE_VALUES = [
  'solid',
  'dashed',
  'dotted',
  'double',
  'groove',
  'ridge',
  'outset',
  'inset'
];

/**
 * Valid color spaces and their component requirements
 * Per W3C Design Tokens Color Module 2025.10
 */
const COLOR_SPACES = {
  'srgb': { components: 3, ranges: [[0, 1], [0, 1], [0, 1]] },
  'srgb-linear': { components: 3, ranges: [[0, 1], [0, 1], [0, 1]] },
  'hsl': { components: 3, ranges: [[0, 360], [0, 100], [0, 100]] },
  'hwb': { components: 3, ranges: [[0, 360], [0, 100], [0, 100]] },
  'lab': { components: 3, ranges: [[0, 100], [-Infinity, Infinity], [-Infinity, Infinity]] },
  'lch': { components: 3, ranges: [[0, 100], [0, Infinity], [0, 360]] },
  'oklab': { components: 3, ranges: [[0, 1], [-Infinity, Infinity], [-Infinity, Infinity]] },
  'oklch': { components: 3, ranges: [[0, 1], [0, Infinity], [0, 360]] },
  'display-p3': { components: 3, ranges: [[0, 1], [0, 1], [0, 1]] },
  'a98-rgb': { components: 3, ranges: [[0, 1], [0, 1], [0, 1]] },
  'prophoto-rgb': { components: 3, ranges: [[0, 1], [0, 1], [0, 1]] },
  'rec2020': { components: 3, ranges: [[0, 1], [0, 1], [0, 1]] },
  // Spec table lists XYZ as [0,1], but the real D65/D50 reference whites exceed 1
  // (e.g. D65 white Z ≈ 1.089). Treating XYZ as effectively unbounded avoids
  // rejecting physically valid colors. See Color Module 4.2.13 / 4.2.14.
  'xyz-d65': { components: 3, ranges: [[-Infinity, Infinity], [-Infinity, Infinity], [-Infinity, Infinity]] },
  'xyz-d50': { components: 3, ranges: [[-Infinity, Infinity], [-Infinity, Infinity], [-Infinity, Infinity]] }
};

/**
 * Validates a color value per W3C Design Tokens Color Module
 * Color can be:
 * - String hex format: #rrggbb (no alpha in hex per spec)
 * - Object format with colorSpace, components, optional alpha and hex
 * - Reference: {token.path}
 */
function validateColorValue(value, path, errors, _warnings) {
  if (typeof value === 'string') {
    // Per Color Module §4.1, a color $value MUST be an object (colorSpace +
    // components) or a reference. Bare strings such as "#0066cc" are not valid.
    if (!isReference(value)) {
      errors.push(`Color at ${path} must be an object with colorSpace and components, or a reference. Bare strings like "#0066cc" are not valid color values (Color Module §4.1).`);
    }
  } else if (typeof value === 'object' && value !== null) {
    // W3C color object format
    if (!value.colorSpace) {
      errors.push(`Color object at ${path} must have colorSpace property`);
      return;
    }

    // Validate color space is supported
    const colorSpaceInfo = COLOR_SPACES[value.colorSpace];
    if (!colorSpaceInfo) {
      errors.push(`Color at ${path} has unsupported colorSpace "${value.colorSpace}". Supported: ${Object.keys(COLOR_SPACES).join(', ')}`);
      return;
    }

    // Validate components array
    if (!Array.isArray(value.components)) {
      errors.push(`Color object at ${path} must have components array`);
      return;
    }

    if (value.components.length !== colorSpaceInfo.components) {
      errors.push(`Color object at ${path} must have components array with exactly ${colorSpaceInfo.components} values`);
      return;
    }

    // Validate each component
    value.components.forEach((component, idx) => {
      // A component may be a property-level JSON Pointer reference ($ref) per §7.3.1.
      if (isPointerRef(component)) {
        const resolved = resolvePointerDeep(component.$ref);
        if (resolved.error) {
          errors.push(`${resolved.error} at ${path}.components[${idx}]`);
        } else if (resolved.value !== 'none' && typeof resolved.value !== 'number') {
          errors.push(`Color component reference at ${path}.components[${idx}] must resolve to a number or "none"`);
        }
        return;
      }
      // Components can be numbers or "none" keyword
      if (component !== 'none' && typeof component !== 'number') {
        errors.push(`Color component at ${path}.components[${idx}] must be a number or "none"`);
        return;
      }

      // Validate numeric component ranges
      if (typeof component === 'number') {
        const [min, max] = colorSpaceInfo.ranges[idx];

        // Check if this is a hue component (0-360 exclusive)
        const isHueComponent =
          (value.colorSpace === 'hsl' && idx === 0) ||
          (value.colorSpace === 'hwb' && idx === 0) ||
          (value.colorSpace === 'lch' && idx === 2) ||
          (value.colorSpace === 'oklch' && idx === 2);

        if (isHueComponent) {
          // Hue component (0-360 exclusive)
          if (component < 0 || component >= 360) {
            errors.push(`Color hue component at ${path}.components[${idx}] must be >= 0 and < 360`);
          }
        } else if (min !== -Infinity && max !== Infinity) {
          // Other bounded components
          if (component < min || component > max) {
            errors.push(`Color component at ${path}.components[${idx}] must be between ${min} and ${max}`);
          }
        } else if (min !== -Infinity && max === Infinity) {
          // Chroma-like components (>= 0)
          if (component < min) {
            errors.push(`Color component at ${path}.components[${idx}] must be >= ${min}`);
          }
        }
        // Unbounded components (like a, b in lab) - no validation needed
      }
    });

    // hex property is optional but should be 6-digit string if present
    if (value.hex !== undefined) {
      if (typeof value.hex !== 'string') {
        errors.push(`Color hex property at ${path} must be a string`);
      } else if (!value.hex.match(/^#[0-9a-fA-F]{6}$/)) {
        errors.push(`Color hex property at ${path} must be 6-digit hex format (#rrggbb)`);
      }
    }

    // alpha property is optional but must be [0-1] if present
    if (value.alpha !== undefined) {
      if (typeof value.alpha !== 'number') {
        errors.push(`Color alpha property at ${path} must be a number`);
      } else if (value.alpha < 0 || value.alpha > 1) {
        errors.push(`Color alpha property at ${path} must be between 0 and 1`);
      }
    }
  } else {
    errors.push(`Color at ${path} must be a string or object`);
  }
}

/**
 * Validates a dimension value
 * Must have unit "px" or "rem" per spec
 */
function validateDimensionValue(value, path, errors) {
  // References are allowed wherever a dimension value is expected.
  if (isReference(value)) return;
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    // Object format: { value: number, unit: "px" | "rem" } — the only valid form per §8.2.
    // Each of value/unit may be a property-level JSON Pointer reference ($ref) per §7.3.2.
    if (isPointerRef(value.value)) {
      const r = resolvePointerDeep(value.value.$ref);
      if (r.error) errors.push(`${r.error} at ${path}.value`);
      else if (typeof r.value !== 'number') errors.push(`Dimension value reference at ${path}.value must resolve to a number`);
    } else if (typeof value.value !== 'number') {
      errors.push(`Dimension object at ${path} must have numeric value property`);
    }
    if (isPointerRef(value.unit)) {
      const r = resolvePointerDeep(value.unit.$ref);
      if (r.error) errors.push(`${r.error} at ${path}.unit`);
      else if (r.value !== 'px' && r.value !== 'rem') errors.push(`Dimension unit reference at ${path}.unit must resolve to "px" or "rem"`);
    } else if (value.unit !== 'px' && value.unit !== 'rem') {
      errors.push(`Dimension unit at ${path} must be "px" or "rem"`);
    }
  } else {
    errors.push(`Dimension at ${path} must be an object { value, unit } with unit "px" or "rem", or a reference. Bare numbers and strings like "8px" are not valid (§8.2).`);
  }
}

/**
 * Validates a duration value
 * Must have unit "ms" or "s"
 */
function validateDurationValue(value, path, errors) {
  // References are allowed wherever a duration value is expected.
  if (isReference(value)) return;
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    // Each of value/unit may be a property-level JSON Pointer reference ($ref) per §7.3.2.
    if (isPointerRef(value.value)) {
      const r = resolvePointerDeep(value.value.$ref);
      if (r.error) errors.push(`${r.error} at ${path}.value`);
      else if (typeof r.value !== 'number') errors.push(`Duration value reference at ${path}.value must resolve to a number`);
    } else if (typeof value.value !== 'number') {
      errors.push(`Duration object at ${path} must have numeric value property`);
    }
    if (isPointerRef(value.unit)) {
      const r = resolvePointerDeep(value.unit.$ref);
      if (r.error) errors.push(`${r.error} at ${path}.unit`);
      else if (r.value !== 'ms' && r.value !== 's') errors.push(`Duration unit reference at ${path}.unit must resolve to "ms" or "s"`);
    } else if (value.unit !== 'ms' && value.unit !== 's') {
      errors.push(`Duration unit at ${path} must be "ms" or "s"`);
    }
  } else {
    errors.push(`Duration at ${path} must be an object { value, unit } with unit "ms" or "s", or a reference.`);
  }
}

/**
 * Validates a cubic bezier value
 * Must be array of 4 numbers: [P1x, P1y, P2x, P2y]
 * P1x and P2x must be in range [0, 1]
 */
function validateCubicBezierValue(value, path, errors) {
  if (!Array.isArray(value) || value.length !== 4) {
    errors.push(`cubicBezier at ${path} must be an array of exactly 4 numbers`);
    return;
  }

  value.forEach((num, idx) => {
    if (typeof num !== 'number') {
      errors.push(`cubicBezier at ${path}[${idx}] must be a number`);
    }
  });

  // X coordinates (indices 0 and 2) must be in [0, 1]
  if (typeof value[0] === 'number' && (value[0] < 0 || value[0] > 1)) {
    errors.push(`cubicBezier at ${path}[0] (P1x) must be in range [0, 1]`);
  }
  if (typeof value[2] === 'number' && (value[2] < 0 || value[2] > 1)) {
    errors.push(`cubicBezier at ${path}[2] (P2x) must be in range [0, 1]`);
  }
}

/**
 * Validates a stroke style value
 * Can be string enum or object with dashArray and lineCap
 */
function validateStrokeStyleValue(value, path, errors, warnings) {
  if (isReference(value)) return;
  if (typeof value === 'string') {
    if (!STROKE_STYLE_VALUES.includes(value)) {
      errors.push(`strokeStyle at ${path} must be one of: ${STROKE_STYLE_VALUES.join(', ')}`);
    }
  } else if (typeof value === 'object' && value !== null) {
    // Object format: { dashArray: dimension[], lineCap: "round"|"butt"|"square" }
    if (!value.dashArray) {
      errors.push(`strokeStyle object at ${path} must have dashArray property`);
    } else if (!Array.isArray(value.dashArray)) {
      errors.push(`strokeStyle dashArray at ${path} must be an array`);
    } else {
      // Each dash entry must be a dimension value or a reference to a dimension token
      value.dashArray.forEach((d, i) => validateSubValue(d, 'dimension', `${path}.dashArray[${i}]`, errors, warnings));
    }

    if (!value.lineCap) {
      errors.push(`strokeStyle object at ${path} must have lineCap property`);
    } else if (!['round', 'butt', 'square'].includes(value.lineCap)) {
      errors.push(`strokeStyle lineCap at ${path} must be "round", "butt", or "square"`);
    }
  } else {
    errors.push(`strokeStyle at ${path} must be a string or object`);
  }
}

/**
 * Validates a border value
 * Must have color, width, and style properties
 */
function validateBorderValue(value, path, errors, warnings) {
  if (isReference(value)) return;
  if (typeof value !== 'object' || value === null) {
    errors.push(`Border at ${path} must be an object`);
    return;
  }

  if (!('color' in value)) {
    errors.push(`Border at ${path} must have color property`);
  } else {
    validateSubValue(value.color, 'color', `${path}.color`, errors, warnings);
  }

  if (!('width' in value)) {
    errors.push(`Border at ${path} must have width property`);
  } else {
    validateSubValue(value.width, 'dimension', `${path}.width`, errors, warnings);
  }

  if (!('style' in value)) {
    errors.push(`Border at ${path} must have style property`);
  } else {
    validateSubValue(value.style, 'strokeStyle', `${path}.style`, errors, warnings);
  }
}

/**
 * Validates a transition value
 * Must have duration, delay, and timingFunction properties
 */
function validateTransitionValue(value, path, errors, warnings) {
  if (isReference(value)) return;
  if (typeof value !== 'object' || value === null) {
    errors.push(`Transition at ${path} must be an object`);
    return;
  }

  const fields = [['duration', 'duration'], ['delay', 'duration'], ['timingFunction', 'cubicBezier']];
  for (const [field, subType] of fields) {
    if (!(field in value)) {
      errors.push(`Transition at ${path} must have ${field} property`);
    } else {
      validateSubValue(value[field], subType, `${path}.${field}`, errors, warnings);
    }
  }
}

/**
 * Validates a shadow value
 * Can be single shadow object or array of shadow objects
 * Each shadow must have: color, offsetX, offsetY, blur, spread
 * Optional: inset (boolean)
 */
function validateShadowValue(value, path, errors, warnings) {
  const subFields = [['color', 'color'], ['offsetX', 'dimension'], ['offsetY', 'dimension'], ['blur', 'dimension'], ['spread', 'dimension']];

  const validateSingleShadow = (shadow, shadowPath) => {
    // A shadow array element (or the single value) may be a reference to a shadow token.
    if (isReference(shadow)) return;
    if (typeof shadow !== 'object' || shadow === null) {
      errors.push(`Shadow at ${shadowPath} must be an object or a reference`);
      return;
    }

    for (const [field, subType] of subFields) {
      if (!(field in shadow)) {
        errors.push(`Shadow at ${shadowPath} is missing required field: ${field}`);
      } else {
        validateSubValue(shadow[field], subType, `${shadowPath}.${field}`, errors, warnings);
      }
    }

    // inset is optional but must be boolean if present
    if (shadow.inset !== undefined && typeof shadow.inset !== 'boolean') {
      errors.push(`Shadow inset property at ${shadowPath} must be a boolean`);
    }
  };

  if (isReference(value)) return;
  if (Array.isArray(value)) {
    value.forEach((shadow, idx) => {
      validateSingleShadow(shadow, `${path}[${idx}]`);
    });
  } else {
    validateSingleShadow(value, path);
  }
}

/**
 * Validates a gradient value
 * Must be array of gradient stops
 * Each stop must have: color, position (number in [0, 1])
 */
function validateGradientValue(value, path, errors, warnings) {
  if (isReference(value)) return;
  if (!Array.isArray(value)) {
    errors.push(`Gradient at ${path} must be an array of gradient stops`);
    return;
  }

  value.forEach((stop, idx) => {
    const stopPath = `${path}[${idx}]`;
    // An array element may be a reference to a gradient token.
    if (isReference(stop)) return;
    if (typeof stop !== 'object' || stop === null) {
      errors.push(`Gradient stop at ${stopPath} must be an object or a reference`);
      return;
    }

    if (!('color' in stop)) {
      errors.push(`Gradient stop at ${stopPath} must have color property`);
    } else {
      validateSubValue(stop.color, 'color', `${stopPath}.color`, errors, warnings);
    }

    // position is a number token; out-of-range values are clamped per §9.7, so any number is accepted.
    if (!('position' in stop)) {
      errors.push(`Gradient stop at ${stopPath} must have position property`);
    } else {
      validateSubValue(stop.position, 'number', `${stopPath}.position`, errors, warnings);
    }
  });
}

/**
 * Validates a typography value
 * Must have: fontFamily, fontSize, fontWeight, letterSpacing, lineHeight
 */
function validateTypographyValue(value, path, errors, warnings) {
  if (isReference(value)) return;
  if (typeof value !== 'object' || value === null) {
    errors.push(`Typography at ${path} must be an object`);
    return;
  }

  // Required fields per spec §9.8, each a value of the given type or a reference to such a token.
  const fields = [
    ['fontFamily', 'fontFamily'],
    ['fontSize', 'dimension'],
    ['fontWeight', 'fontWeight'],
    ['letterSpacing', 'dimension'],
    ['lineHeight', 'number'],
  ];
  for (const [field, subType] of fields) {
    if (!(field in value)) {
      errors.push(`Typography at ${path} is missing required field: ${field}`);
    } else {
      validateSubValue(value[field], subType, `${path}.${field}`, errors, warnings);
    }
  }

  // Warn about unknown fields
  const allowedFields = fields.map((f) => f[0]);
  for (const field of Object.keys(value)) {
    if (!allowedFields.includes(field)) {
      warnings.push(`Typography at ${path} has unknown field: ${field}`);
    }
  }
}

/**
 * Validates a font weight value: a number in [1, 1000] or a predefined string alias.
 */
function validateFontWeightValue(value, path, errors) {
  if (typeof value === 'number') {
    if (value < 1 || value > 1000) {
      errors.push(`fontWeight at ${path} must be a number between 1-1000`);
    }
  } else if (typeof value === 'string') {
    if (!Object.prototype.hasOwnProperty.call(FONT_WEIGHT_ALIASES, value)) {
      errors.push(`fontWeight at ${path} must be a valid weight alias (e.g., "bold", "normal") or a number between 1-1000`);
    }
  } else {
    errors.push(`fontWeight at ${path} must be a number or string`);
  }
}

/**
 * Validates a composite sub-value that must be of `expectedType` or a reference
 * to a token of that type. Curly-brace references ({token.path}) are accepted
 * here; deeper type-checking of references happens during reference resolution.
 */
function validateSubValue(value, expectedType, path, errors, warnings) {
  // Curly-brace token reference — accepted here; resolved elsewhere.
  if (isReference(value)) return;
  // Property-level JSON Pointer reference ($ref object): resolve and validate the target.
  if (isPointerRef(value)) {
    const resolved = resolvePointerDeep(value.$ref);
    if (resolved.error) {
      errors.push(`${resolved.error} at ${path}`);
      return;
    }
    validateSubValue(resolved.value, expectedType, path, errors, warnings);
    return;
  }
  switch (expectedType) {
    case 'color':
      validateColorValue(value, path, errors, warnings);
      break;
    case 'dimension':
      validateDimensionValue(value, path, errors);
      break;
    case 'duration':
      validateDurationValue(value, path, errors);
      break;
    case 'cubicBezier':
      validateCubicBezierValue(value, path, errors);
      break;
    case 'strokeStyle':
      validateStrokeStyleValue(value, path, errors, warnings);
      break;
    case 'fontWeight':
      validateFontWeightValue(value, path, errors);
      break;
    case 'fontFamily':
      if (typeof value !== 'string' && !Array.isArray(value)) {
        errors.push(`fontFamily at ${path} must be a string or array`);
      }
      break;
    case 'number':
      if (typeof value !== 'number') {
        errors.push(`number at ${path} must be a number`);
      }
      break;
  }
}

/**
 * Checks if a value is a reference (matches {path} syntax)
 * Note: {path} must have at least one character inside
 */
function isReference(value) {
  return typeof value === 'string' && /^\{.+\}$/.test(value);
}

/**
 * Extracts the path from a reference string
 * e.g., "{color.primary}" => "color.primary"
 */
function extractReferencePath(reference) {
  return reference.replace(/^\{|\}$/g, '');
}

/**
 * The parsed root document for the current validation run. JSON Pointer ($ref)
 * references are resolved against this. Set at the start of validateTokens /
 * validateTokensObject and cleared afterwards.
 */
let _rootDoc = null;

/**
 * True if a value is a property-level JSON Pointer reference object: { "$ref": "#/..." }.
 */
function isPointerRef(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && typeof value.$ref === 'string';
}

/**
 * Resolves an RFC 6901 JSON Pointer (e.g. "#/colors/blue/$value/components/0")
 * against the current root document. Returns { value } or { error }.
 */
function resolveJsonPointer(pointer) {
  if (typeof pointer !== 'string' || pointer[0] !== '#') {
    return { error: `JSON Pointer "${pointer}" must start with "#"` };
  }
  const frag = pointer.slice(1);
  if (frag === '' || frag === '/') {
    return { value: _rootDoc };
  }
  if (frag[0] !== '/') {
    return { error: `JSON Pointer "${pointer}" must start with "#/"` };
  }
  // RFC 6901: split on "/", unescape ~1 -> "/" and ~0 -> "~"
  const segments = frag.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = _rootDoc;
  for (const seg of segments) {
    if (current === null || current === undefined) {
      return { error: `JSON Pointer "${pointer}" cannot be resolved (missing "${seg}")` };
    }
    if (Array.isArray(current)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) {
        return { error: `JSON Pointer "${pointer}" has an invalid array index "${seg}"` };
      }
      current = current[idx];
    } else if (typeof current === 'object') {
      if (!Object.prototype.hasOwnProperty.call(current, seg)) {
        return { error: `JSON Pointer "${pointer}" cannot be resolved (no "${seg}")` };
      }
      current = current[seg];
    } else {
      return { error: `JSON Pointer "${pointer}" cannot descend into primitive at "${seg}"` };
    }
  }
  return { value: current };
}

/**
 * Resolves a JSON Pointer and follows any further $ref / curly-brace references
 * the target may itself be, with circular-reference detection.
 * Returns { value } (fully resolved) or { error }.
 */
function resolvePointerDeep(pointer, registry?, visited = new Set()) {
  if (visited.has(pointer)) {
    return { error: `Circular $ref detected: ${Array.from(visited).join(' → ')} → ${pointer}` };
  }
  visited.add(pointer);
  const result = resolveJsonPointer(pointer);
  if (result.error) return result;
  let value = result.value;
  // The target may itself be a pointer-ref object or a curly-brace reference.
  if (isPointerRef(value)) {
    return resolvePointerDeep(value.$ref, registry, visited);
  }
  if (isReference(value) && registry) {
    const resolved = resolveReference(extractReferencePath(value), registry);
    if (resolved.error) return { error: resolved.error };
    value = resolved.value;
  }
  return { value };
}

/**
 * Reserved $-prefixed property keys defined by the spec. Any other $-prefixed
 * key is an invalid token/group name (§5.1.1). $root is handled separately as
 * it names a reserved root token.
 */
const RESERVED_DOLLAR_KEYS = new Set([
  '$value', '$type', '$description', '$extensions', '$deprecated', '$extends', '$ref', '$schema'
]);

/**
 * Validates the optional $deprecated property (token or group level): must be
 * a boolean or a string explanation (§5.2.4 / §6.3.1).
 */
function validateDeprecated(obj, path, errors) {
  if ('$deprecated' in obj) {
    const d = obj.$deprecated;
    if (typeof d !== 'boolean' && typeof d !== 'string') {
      errors.push(`$deprecated at ${path} must be a boolean or a string explanation`);
    }
  }
}

/**
 * Resolves a group reference (used by $extends): a curly-brace "{group.path}"
 * or a JSON Pointer "#/group/path". Returns { value } (the target node) or { error }.
 */
function resolveGroupNode(ref) {
  if (isReference(ref)) {
    const segments = extractReferencePath(ref).split('.');
    let node = _rootDoc;
    for (const seg of segments) {
      if (node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, seg)) {
        node = node[seg];
      } else {
        return { error: `$extends target "${ref}" cannot be resolved` };
      }
    }
    return { value: node };
  }
  if (typeof ref === 'string' && ref[0] === '#') {
    return resolveJsonPointer(ref);
  }
  return { error: `$extends must be a reference to a group` };
}

/**
 * Validates a group's optional $extends inheritance (§6.4): the target must
 * resolve, must be a group (not a token), and the chain must not be circular.
 */
function validateExtends(group, path, errors) {
  if (!('$extends' in group)) return;
  const chain = new Set();
  let node = group;
  let label = path;
  while (node && typeof node === 'object' && '$extends' in node) {
    const ext = node.$extends;
    if (typeof ext !== 'string' || !(isReference(ext) || ext[0] === '#')) {
      errors.push(`$extends at ${label} must be a reference to a group`);
      return;
    }
    const key = isReference(ext) ? extractReferencePath(ext) : ext;
    if (key === path || chain.has(key)) {
      errors.push(`Circular $extends detected involving ${path}`);
      return;
    }
    chain.add(key);
    const resolved = resolveGroupNode(ext);
    if (resolved.error) {
      errors.push(`${resolved.error} at ${label}`);
      return;
    }
    const target = resolved.value;
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      errors.push(`$extends target "${ext}" at ${label} is not a group`);
      return;
    }
    if ('$value' in target || '$ref' in target) {
      errors.push(`$extends at ${label} must not reference a token (§6.4)`);
      return;
    }
    node = target;
    label = key;
  }
}

/**
 * Builds a registry of all tokens in the document
 * Returns a Map where keys are paths and values are token objects
 */
function buildTokenRegistry(obj, path = '', registry = new Map(), parentType = null) {
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('$') && key !== '$root') continue;

    const currentPath = path ? `${path}.${key}` : key;

    if (value && typeof value === 'object') {
      if ('$value' in value) {
        // This is a token - add to registry
        const tokenType = (value as any).$type || parentType;
        registry.set(currentPath, {
          ...value,
          $type: tokenType,
          $path: currentPath
        });
      } else if ('$ref' in value && typeof value.$ref === 'string') {
        // Token defined by a JSON Pointer $ref — store the resolved value so that
        // curly-brace references to this token resolve correctly.
        const resolved = resolveJsonPointer(value.$ref);
        registry.set(currentPath, {
          ...value,
          $value: resolved.error ? undefined : resolved.value,
          $type: (value as any).$type || parentType,
          $path: currentPath
        });
      } else {
        // This is a group - check for group-level $type
        const groupType = (value as any).$type || parentType;
        buildTokenRegistry(value, currentPath, registry, groupType);
      }
    }
  }
  return registry;
}

/**
 * Resolves a reference to its final value
 * Returns { value, type, error } where error is set if resolution failed
 */
function resolveReference(referencePath, registry, visitedPaths = new Set()) {
  // Check for circular references
  if (visitedPaths.has(referencePath)) {
    return {
      error: `Circular reference detected: ${Array.from(visitedPaths).join(' → ')} → ${referencePath}`
    };
  }

  // Look up the token
  const token = registry.get(referencePath);
  if (!token) {
    return {
      error: `Reference "{${referencePath}}" points to non-existent token`
    };
  }

  // Mark this path as visited
  visitedPaths.add(referencePath);

  // Check if the token's value is itself a reference
  if (isReference(token.$value)) {
    const nextPath = extractReferencePath(token.$value);
    return resolveReference(nextPath, registry, visitedPaths);
  }

  // Return the resolved value and type
  return {
    value: token.$value,
    type: token.$type
  };
}

/**
 * Validates a token value based on its type
 */
function validateTokenValue(token, path, errors, warnings, registry = null, parentType = null) {
  let type = token.$type || parentType;

  // A token is defined by either $value or a JSON Pointer $ref (§7.1.2).
  if (!('$value' in token) && !('$ref' in token)) {
    errors.push(`Token at ${path} is missing $value`);
    return;
  }

  let value;
  if ('$value' in token) {
    value = token.$value;
    // Curly-brace token reference at the value position.
    if (isReference(value)) {
      if (registry) {
        const referencePath = extractReferencePath(value);
        const resolved = resolveReference(referencePath, registry);
        if (resolved.error) {
          errors.push(`${resolved.error} at ${path}`);
          return;
        }
        value = resolved.value;
        if (!type) {
          type = resolved.type;
        }
      } else {
        // References are allowed but not validated if no registry provided
        return;
      }
    }
  } else {
    // Token-level JSON Pointer $ref (alternative to $value): resolve the target.
    const resolved = resolvePointerDeep(token.$ref, registry);
    if (resolved.error) {
      errors.push(`${resolved.error} at ${path}`);
      return;
    }
    value = resolved.value;
  }

  // Check for unknown $type
  if (type && !VALID_TOKEN_TYPES.includes(type)) {
    warnings.push(`Unknown $type "${type}" at ${path}`);
  }

  if (!type) {
    errors.push(`Token at ${path} has no determinable type (no $type property or group type)`);
    return;
  }

  // Type-specific validation
  switch (type) {
    case 'color':
      validateColorValue(value, path, errors, warnings);
      break;
    case 'dimension':
      validateDimensionValue(value, path, errors);
      break;
    case 'fontFamily':
      if (typeof value !== 'string' && !Array.isArray(value)) {
        errors.push(`fontFamily at ${path} must be a string or array`);
      }
      break;
    case 'fontWeight':
      validateFontWeightValue(value, path, errors);
      break;
    case 'duration':
      validateDurationValue(value, path, errors);
      break;
    case 'cubicBezier':
      validateCubicBezierValue(value, path, errors);
      break;
    case 'number':
      if (typeof value !== 'number') {
        errors.push(`number at ${path} must be a number`);
      }
      break;
    case 'strokeStyle':
      validateStrokeStyleValue(value, path, errors, warnings);
      break;
    case 'border':
      validateBorderValue(value, path, errors, warnings);
      break;
    case 'transition':
      validateTransitionValue(value, path, errors, warnings);
      break;
    case 'shadow':
      validateShadowValue(value, path, errors, warnings);
      break;
    case 'gradient':
      validateGradientValue(value, path, errors, warnings);
      break;
    case 'typography':
      validateTypographyValue(value, path, errors, warnings);
      break;
  }
}

/**
 * Recursively validates tokens in an object
 */
function validateToken(obj, path, errors, warnings, registry = null, parentType = null) {
  // Validate group-level properties of the current (root) group.
  if (path === '') {
    validateDeprecated(obj, 'root', errors);
    validateExtends(obj, 'root', errors);
  }

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    // $-prefixed keys: reserved properties are skipped; $root is a reserved
    // root token (processed below); any other $-name is invalid (§5.1.1).
    if (key.startsWith('$')) {
      if (key !== '$root') {
        if (!RESERVED_DOLLAR_KEYS.has(key)) {
          errors.push(`Name "${key}" at ${currentPath} must not begin with "$" (reserved by the spec, §5.1.1)`);
        }
        continue;
      }
    }

    // Check for invalid characters in token names
    if (/[{}."]/.test(key)) {
      errors.push(`Token name "${key}" at ${currentPath} contains invalid characters ({, }, ., or ")`);
    }

    // Check if this is a token (has $value or $ref) or a group
    if (value && typeof value === 'object') {
      validateDeprecated(value, currentPath, errors);

      if ('$value' in value || '$ref' in value) {
        // This is a token - validate it
        validateTokenValue(value, currentPath, errors, warnings, registry, parentType);
      } else if ('$type' in value && Object.keys(value).filter(k => !k.startsWith('$') || k === '$root').length === 0) {
        // Object has $type but no $value, $ref, $root, or child tokens/groups - invalid token
        errors.push(`Token at ${currentPath} is missing $value`);
      } else {
        // This is a group - validate group properties, then recurse
        const groupType = (value as any).$type || parentType;
        validateExtends(value, currentPath, errors);
        validateToken(value, currentPath, errors, warnings, registry, groupType);
      }
    }
  }
}

/**
 * Counts the total number of tokens in a token tree
 */
function countTokens(obj, count = 0) {
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('$') && key !== '$root') continue;
    if (value && typeof value === 'object') {
      if ('$value' in value || '$ref' in value) {
        count++;
      } else {
        count = countTokens(value, count);
      }
    }
  }
  return count;
}

/**
 * Validates a design tokens JSON string against the W3C DTCG specification
 */
export function validateTokens(jsonString) {
  if (!jsonString || typeof jsonString !== 'string' || !jsonString.trim()) {
    return { valid: false, errors: ['Input is empty'] };
  }

  try {
    const tokens = JSON.parse(jsonString);
    const errors = [];
    const warnings = [];

    // Validate root structure
    if (typeof tokens !== 'object' || tokens === null || Array.isArray(tokens)) {
      return { valid: false, errors: ['Root must be an object'] };
    }

    // Resolver documents (.resolver.json) follow a different schema.
    if (isResolverDocument(tokens)) {
      return validateResolverObject(tokens);
    }

    // Build token registry for reference resolution
    _rootDoc = tokens;
    const registry = buildTokenRegistry(tokens);

    // Run validation
    validateToken(tokens, '', errors, warnings, registry);
    _rootDoc = null;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      tokenCount: countTokens(tokens)
    };
  } catch (error) {
    _rootDoc = null;
    return {
      valid: false,
      errors: [`Invalid JSON: ${error.message}`]
    };
  }
}

/**
 * Validates a design tokens object (already parsed) against the W3C DTCG specification
 */
export function validateTokensObject(tokens) {
  if (!tokens) {
    return { valid: false, errors: ['Input is empty'] };
  }

  const errors = [];
  const warnings = [];

  // Validate root structure
  if (typeof tokens !== 'object' || tokens === null || Array.isArray(tokens)) {
    return { valid: false, errors: ['Root must be an object'] };
  }

  // Resolver documents (.resolver.json) follow a different schema.
  if (isResolverDocument(tokens)) {
    return validateResolverObject(tokens);
  }

  // Build token registry for reference resolution
  _rootDoc = tokens;
  const registry = buildTokenRegistry(tokens);

  // Run validation
  validateToken(tokens, '', errors, warnings, registry);
  _rootDoc = null;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    tokenCount: countTokens(tokens)
  };
}

/**
 * Detects whether a parsed document is a Resolver document (Resolver Module)
 * rather than a token document.
 */
function isResolverDocument(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return (
    Array.isArray(obj.resolutionOrder) ||
    (typeof obj.version === 'string' && (typeof obj.sets === 'object' || typeof obj.modifiers === 'object'))
  );
}

/**
 * Validates an array of token sources (used by sets and modifier contexts).
 * Each element must be a ReferenceObject ({ $ref }) or an inline tokens object.
 */
function validateResolverSources(sources, label, errors) {
  if (!Array.isArray(sources)) {
    errors.push(`${label} must be an array of sources`);
    return;
  }
  sources.forEach((source, i) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      errors.push(`${label}[${i}] must be a token source object or a { "$ref": … } reference`);
    } else if ('$ref' in source && typeof source.$ref !== 'string') {
      errors.push(`${label}[${i}].$ref must be a string`);
    }
  });
}

/**
 * Validates a Resolver document (.resolver.json) against the Resolver Module.
 * Returns the same result shape as validateTokens.
 */
function validateResolverObject(doc) {
  const errors = [];
  const warnings = [];

  // Version (required, must be 2025.10)
  if (!('version' in doc)) {
    errors.push('Resolver document must declare a version (Resolver §4.1.2)');
  } else if (doc.version !== '2025.10') {
    errors.push('Resolver version must be "2025.10"');
  }

  if ('name' in doc && typeof doc.name !== 'string') errors.push('Resolver "name" must be a string');
  if ('description' in doc && typeof doc.description !== 'string') errors.push('Resolver "description" must be a string');

  // Sets
  if ('sets' in doc) {
    if (typeof doc.sets !== 'object' || doc.sets === null || Array.isArray(doc.sets)) {
      errors.push('Resolver "sets" must be a map of named sets');
    } else {
      for (const [name, set] of Object.entries(doc.sets)) {
        if (!set || typeof set !== 'object' || Array.isArray(set)) {
          errors.push(`Set "${name}" must be an object`);
          continue;
        }
        if (!('sources' in set)) {
          errors.push(`Set "${name}" must contain a sources array (Resolver §4.1.4)`);
        } else {
          validateResolverSources(set.sources, `Set "${name}" sources`, errors);
        }
        if ('description' in set && typeof set.description !== 'string') {
          errors.push(`Set "${name}" description must be a string`);
        }
      }
    }
  }

  // Modifiers
  if ('modifiers' in doc) {
    if (typeof doc.modifiers !== 'object' || doc.modifiers === null || Array.isArray(doc.modifiers)) {
      errors.push('Resolver "modifiers" must be a map of named modifiers');
    } else {
      for (const [name, mod] of Object.entries(doc.modifiers)) {
        if (!mod || typeof mod !== 'object' || Array.isArray(mod)) {
          errors.push(`Modifier "${name}" must be an object`);
          continue;
        }
        if (!('contexts' in mod)) {
          errors.push(`Modifier "${name}" must declare a contexts map (Resolver §4.1.5.1)`);
        } else if (typeof mod.contexts !== 'object' || mod.contexts === null || Array.isArray(mod.contexts)) {
          errors.push(`Modifier "${name}" contexts must be a map`);
        } else {
          const contextKeys = Object.keys(mod.contexts);
          if (contextKeys.length === 0) {
            errors.push(`Modifier "${name}" must not have an empty contexts map`);
          } else if (contextKeys.length === 1) {
            warnings.push(`Modifier "${name}" should have two or more contexts (one is equivalent to a set)`);
          }
          for (const [ctxName, sources] of Object.entries(mod.contexts)) {
            validateResolverSources(sources, `Modifier "${name}" context "${ctxName}"`, errors);
          }
          if ('default' in mod && !contextKeys.includes(mod.default as any)) {
            errors.push(`Modifier "${name}" default "${mod.default}" must be one of its contexts`);
          }
        }
        if ('description' in mod && typeof mod.description !== 'string') {
          errors.push(`Modifier "${name}" description must be a string`);
        }
      }
    }
  }

  // Resolution order (required)
  if (!('resolutionOrder' in doc)) {
    errors.push('Resolver document must declare resolutionOrder (Resolver §4.1.6)');
  } else if (!Array.isArray(doc.resolutionOrder)) {
    errors.push('resolutionOrder must be an array');
  } else {
    const inlineNames = new Set();
    doc.resolutionOrder.forEach((item, i) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push(`resolutionOrder[${i}] must be a reference object or an inline set/modifier`);
        return;
      }
      if ('$ref' in item) {
        if (typeof item.$ref !== 'string') {
          errors.push(`resolutionOrder[${i}].$ref must be a string`);
        } else if (item.$ref.startsWith('#/resolutionOrder')) {
          errors.push(`resolutionOrder[${i}] must not reference the resolutionOrder array (Resolver §4.2.1)`);
        }
        return;
      }
      // Inline set/modifier: MUST have type and a unique name (Resolver §4.1.6.1)
      if (item.type !== 'set' && item.type !== 'modifier') {
        errors.push(`resolutionOrder[${i}] inline item must have type "set" or "modifier"`);
      }
      if (typeof item.name !== 'string') {
        errors.push(`resolutionOrder[${i}] inline item must have a name`);
      } else if (inlineNames.has(item.name)) {
        errors.push(`resolutionOrder inline name "${item.name}" is duplicated`);
      } else {
        inlineNames.add(item.name);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    documentType: 'resolver',
    tokenCount: 0,
    resolutionCount: Array.isArray(doc.resolutionOrder) ? doc.resolutionOrder.length : 0
  };
}

/**
 * Analyzes validation errors and provides detailed insights with suggestions
 */
export function analyzeErrors(validationResult) {
  if (!validationResult.errors || validationResult.errors.length === 0) {
    return {
      ...validationResult,
      analysis: {
        summary: 'No errors found',
        categories: {},
        suggestions: []
      }
    };
  }

  const analysis = {
    categories: {
      structure: [],
      type: [],
      value: [],
      naming: [],
      reference: []
    },
    suggestions: []
  };

  // Analyze each error
  validationResult.errors.forEach((error, index) => {
    const analyzed = analyzeError(error, index + 1);
    analysis.categories[analyzed.category].push(analyzed);
    if (analyzed.suggestion) {
      analysis.suggestions.push(analyzed.suggestion);
    }
  });

  // Create summary
  const errorCounts = Object.entries(analysis.categories)
    .filter(([_, errors]) => errors.length > 0)
    .map(([category, errors]) => `${errors.length} ${category}`)
    .join(', ');

  (analysis as any).summary = `Found ${validationResult.errors.length} error(s): ${errorCounts}`;

  return {
    ...validationResult,
    analysis
  };
}

/**
 * Analyzes a single error and provides category, context, and suggestions
 */
function analyzeError(errorMessage, errorNumber) {
  const error = {
    number: errorNumber,
    message: errorMessage,
    category: 'value',
    path: extractPath(errorMessage),
    suggestion: null,
    details: null
  };

  // Categorize and add suggestions based on error patterns
  if (errorMessage.includes('Invalid JSON')) {
    error.category = 'structure';
    error.suggestion = 'Check for missing commas, brackets, or quotes. Use a JSON validator to find syntax errors.';
    error.details = 'The input is not valid JSON. Common issues include trailing commas, unquoted keys, or mismatched brackets.';
  } else if (errorMessage.includes('Root must be an object')) {
    error.category = 'structure';
    error.suggestion = 'Wrap your tokens in a JSON object with curly braces: { "color": { ... } }';
    error.details = 'Design tokens must be defined within a root object, not as an array or primitive value.';
  } else if (errorMessage.includes('Input is empty')) {
    error.category = 'structure';
    error.suggestion = 'Paste your design tokens JSON into the editor.';
    error.details = 'No input was provided for validation.';
  } else if (errorMessage.includes('missing $value')) {
    error.category = 'structure';
    error.suggestion = `Add a "$value" property to the token at ${error.path}. Example: "$value": "#ff0000"`;
    error.details = 'All tokens must have a $value property that contains the actual token value.';
  } else if (errorMessage.includes('Unknown $type')) {
    error.category = 'type';
    const match = errorMessage.match(/"([^"]+)"/);
    if (match) {
      error.suggestion = `Change "$type": "${match[1]}" to one of: ${VALID_TOKEN_TYPES.join(', ')}`;
    }
    error.details = 'The $type must be one of the 13 supported token types defined in the DTCG Format Module.';
  } else if (errorMessage.includes('contains invalid characters')) {
    error.category = 'naming';
    error.suggestion = 'Token names cannot contain dots (.), curly braces ({ }), or quotes ("). Use hyphens or underscores instead.';
    error.details = 'Token names must follow DTCG naming conventions: alphanumeric, hyphens, and underscores only.';
  } else if (errorMessage.includes('colorSpace')) {
    error.category = 'value';
    if (errorMessage.includes('must have colorSpace')) {
      error.suggestion = `Add "colorSpace" property. Example: "colorSpace": "srgb"`;
    } else if (errorMessage.includes('unsupported colorSpace')) {
      const supportedSpaces = Object.keys(COLOR_SPACES).join(', ');
      error.suggestion = `Use one of the 14 supported color spaces: ${supportedSpaces}`;
    }
    error.details = 'Color tokens using object format must specify a valid colorSpace from the Color Module 2025.10.';
  } else if (errorMessage.includes('components')) {
    error.category = 'value';
    if (errorMessage.includes('must have components array')) {
      error.suggestion = 'Add "components" array with color values. Example: "components": [1, 0, 0] for red in sRGB.';
    } else if (errorMessage.includes('exactly 3 values')) {
      error.suggestion = 'Color components must be an array of exactly 3 numeric values or "none".';
    } else if (errorMessage.includes('must be a number or "none"')) {
      error.suggestion = 'Each component must be either a number or the string "none".';
    } else if (errorMessage.includes('must be between')) {
      const match = errorMessage.match(/between ([\d.]+) and ([\d.]+)/);
      if (match) {
        error.suggestion = `Component value must be in range [${match[1]}, ${match[2]}]. Check the color space requirements.`;
      }
    } else if (errorMessage.includes('must be >= 0 and < 360')) {
      error.suggestion = 'Hue values must be in the range [0, 360) - note that 360 is NOT valid, use 0 instead for a full rotation.';
    }
    error.details = 'Color components must conform to the range requirements of their color space.';
  } else if (errorMessage.includes('alpha')) {
    error.category = 'value';
    error.suggestion = 'Alpha must be a number between 0 and 1, where 0 is fully transparent and 1 is fully opaque.';
    error.details = 'The alpha channel controls opacity and must be a numeric value in the range [0, 1].';
  } else if (errorMessage.includes('fontWeight')) {
    error.category = 'value';
    if (errorMessage.includes('between 1-1000')) {
      error.suggestion = `Use a numeric weight between 1-1000, or use an alias like: ${Object.keys(FONT_WEIGHT_ALIASES).slice(0, 5).join(', ')}, etc.`;
    } else if (errorMessage.includes('valid weight alias')) {
      error.suggestion = `Use one of these aliases: ${Object.keys(FONT_WEIGHT_ALIASES).join(', ')}`;
    }
    error.details = 'Font weight must be a number 1-1000 or a recognized weight alias.';
  } else if (errorMessage.includes('dimension') && errorMessage.includes('unit')) {
    error.category = 'value';
    error.suggestion = 'Dimension units must be "px" or "rem" per the DTCG Format Module 2025.10.';
    error.details = 'The specification only allows "px" and "rem" units for dimensions.';
  } else if (errorMessage.includes('duration') && errorMessage.includes('unit')) {
    error.category = 'value';
    error.suggestion = 'Duration units must be "ms" (milliseconds) or "s" (seconds).';
    error.details = 'Duration values must use milliseconds or seconds as the unit.';
  } else if (errorMessage.includes('cubicBezier')) {
    error.category = 'value';
    if (errorMessage.includes('exactly 4 numbers')) {
      error.suggestion = 'cubicBezier must be an array of 4 numbers: [P1x, P1y, P2x, P2y]. Example: [0.42, 0, 0.58, 1]';
    } else if (errorMessage.includes('must be in range [0, 1]')) {
      error.suggestion = 'X coordinates (P1x and P2x) must be between 0 and 1. Y coordinates can be any value.';
    }
    error.details = 'Cubic bezier values define easing curves with control points.';
  } else if (errorMessage.includes('Shadow') && errorMessage.includes('missing required field')) {
    error.category = 'structure';
    const match = errorMessage.match(/field: (\w+)/);
    if (match) {
      error.suggestion = `Add the "${match[1]}" property to your shadow object. Shadows require: offsetX, offsetY, blur, spread, and color.`;
    }
    error.details = 'Shadow tokens must have all required fields: offsetX, offsetY, blur, spread, and color. Inset is optional.';
  } else if (errorMessage.includes('Typography') && errorMessage.includes('missing required field')) {
    error.category = 'structure';
    const match = errorMessage.match(/field: (\w+)/);
    if (match) {
      error.suggestion = `Add the "${match[1]}" property. Typography requires: fontFamily, fontSize, fontWeight, lineHeight, and letterSpacing.`;
    }
    error.details = 'Typography tokens must have all 5 required fields per the Format Module.';
  } else if (errorMessage.includes('strokeStyle')) {
    error.category = 'value';
    error.suggestion = `Use one of: ${STROKE_STYLE_VALUES.join(', ')}, or provide an object with dashArray and optional lineCap.`;
    error.details = 'Stroke style can be a predefined string or a custom object with dash patterns.';
  } else if (errorMessage.includes('Gradient')) {
    error.category = 'value';
    if (errorMessage.includes('must be an array')) {
      error.suggestion = 'Gradients must be an array of stops. Example: [{"color": "#000", "position": 0}, {"color": "#fff", "position": 1}]';
    } else if (errorMessage.includes('must have color property')) {
      error.suggestion = 'Each gradient stop must have a "color" property.';
    } else if (errorMessage.includes('must have position property')) {
      error.suggestion = 'Each gradient stop must have a "position" property (typically 0 to 1).';
    }
    error.details = 'Gradients are arrays of color stops, each with a color and position.';
  } else if (errorMessage.includes('Border') && errorMessage.includes('must have')) {
    error.category = 'structure';
    const match = errorMessage.match(/must have (\w+) property/);
    if (match) {
      error.suggestion = `Add the "${match[1]}" property. Border requires: color, width, and style.`;
    }
    error.details = 'Border tokens are composite types requiring color, width, and style properties.';
  } else if (errorMessage.includes('Transition') && errorMessage.includes('must have')) {
    error.category = 'structure';
    const match = errorMessage.match(/must have (\w+) property/);
    if (match) {
      error.suggestion = `Add the "${match[1]}" property. Transition requires: duration, delay, and timingFunction.`;
    }
    error.details = 'Transition tokens define animation timing with duration, delay, and easing.';
  }

  return error;
}

/**
 * Extracts the token path from an error message
 */
function extractPath(errorMessage) {
  // Try to find "at <path>" pattern
  const atMatch = errorMessage.match(/at ([\w.[\]]+)/);
  if (atMatch) {
    return atMatch[1];
  }

  // Try to find path in quotes
  const quoteMatch = errorMessage.match(/"([\w.]+)"/);
  if (quoteMatch && !quoteMatch[1].includes(' ')) {
    return quoteMatch[1];
  }

  return 'root';
}
