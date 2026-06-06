import { describe, it, expect } from './_vitest-shim.js';
import { validateTokens, validateTokensObject } from '../lib/dtcg/validate.js';

describe('DTCG Validator - W3C Spec Compliant', () => {
  describe('Basic validation', () => {
    it('should reject empty input', () => {
      const result = validateTokens('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Input is empty');
    });

    it('should reject null input', () => {
      const result = validateTokens(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Input is empty');
    });

    it('should reject invalid JSON', () => {
      const result = validateTokens('{invalid json}');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid JSON');
    });

    it('should reject non-object root', () => {
      const result = validateTokens('[]');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Root must be an object');
    });

    it('should accept valid empty object', () => {
      const result = validateTokens('{}');
      expect(result.valid).toBe(true);
      expect(result.tokenCount).toBe(0);
    });
  });

  describe('Color tokens', () => {
    it('should reject a bare hex string color value (Color Module §4.1 requires an object)', () => {
      const tokens = JSON.stringify({
        color: {
          primary: {
            $type: 'color',
            $value: '#ff0000'
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
    });

    it('should accept a color object with optional 6-digit hex fallback', () => {
      const tokens = JSON.stringify({
        color: {
          primary: {
            $type: 'color',
            $value: { colorSpace: 'srgb', components: [1, 0, 0], hex: '#ff0000' }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
    });

    it('should reject a bare 8-digit hex string color value', () => {
      const tokens = JSON.stringify({
        color: {
          primary: {
            $type: 'color',
            $value: '#ff0000aa'
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
    });

    describe('Color spaces - W3C Color Module 2025.10', () => {
      it('should validate srgb color space', () => {
        const tokens = JSON.stringify({
          color: {
            red: {
              $type: 'color',
              $value: {
                colorSpace: 'srgb',
                components: [1, 0, 0]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should validate srgb-linear color space', () => {
        const tokens = JSON.stringify({
          color: {
            red: {
              $type: 'color',
              $value: {
                colorSpace: 'srgb-linear',
                components: [1, 0, 0]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should validate hsl color space', () => {
        const tokens = JSON.stringify({
          color: {
            blue: {
              $type: 'color',
              $value: {
                colorSpace: 'hsl',
                components: [240, 100, 50]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should validate hwb color space', () => {
        const tokens = JSON.stringify({
          color: {
            red: {
              $type: 'color',
              $value: {
                colorSpace: 'hwb',
                components: [0, 0, 0]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should validate lab color space', () => {
        const tokens = JSON.stringify({
          color: {
            white: {
              $type: 'color',
              $value: {
                colorSpace: 'lab',
                components: [100, 0, 0]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should validate lch color space', () => {
        const tokens = JSON.stringify({
          color: {
            magenta: {
              $type: 'color',
              $value: {
                colorSpace: 'lch',
                components: [60, 100, 330]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should validate oklab color space', () => {
        const tokens = JSON.stringify({
          color: {
            white: {
              $type: 'color',
              $value: {
                colorSpace: 'oklab',
                components: [1, 0, 0]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should validate oklch color space', () => {
        const tokens = JSON.stringify({
          color: {
            magenta: {
              $type: 'color',
              $value: {
                colorSpace: 'oklch',
                components: [0.7, 0.3, 330]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should validate display-p3 color space', () => {
        const tokens = JSON.stringify({
          color: {
            vibrantGreen: {
              $type: 'color',
              $value: {
                colorSpace: 'display-p3',
                components: [0, 1, 0]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should validate a98-rgb color space', () => {
        const tokens = JSON.stringify({
          color: {
            red: {
              $type: 'color',
              $value: {
                colorSpace: 'a98-rgb',
                components: [1, 0, 0]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should validate prophoto-rgb color space', () => {
        const tokens = JSON.stringify({
          color: {
            red: {
              $type: 'color',
              $value: {
                colorSpace: 'prophoto-rgb',
                components: [1, 0, 0]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should validate rec2020 color space', () => {
        const tokens = JSON.stringify({
          color: {
            red: {
              $type: 'color',
              $value: {
                colorSpace: 'rec2020',
                components: [1, 0, 0]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should validate xyz-d65 color space', () => {
        const tokens = JSON.stringify({
          color: {
            white: {
              $type: 'color',
              $value: {
                colorSpace: 'xyz-d65',
                components: [0.95, 1, 1.09]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should validate xyz-d50 color space', () => {
        const tokens = JSON.stringify({
          color: {
            white: {
              $type: 'color',
              $value: {
                colorSpace: 'xyz-d50',
                components: [0.96, 1, 0.82]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should error on unsupported color space', () => {
        const tokens = JSON.stringify({
          color: {
            red: {
              $type: 'color',
              $value: {
                colorSpace: 'cmyk',
                components: [0, 100, 100, 0]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('unsupported colorSpace'))).toBe(true);
      });
    });

    describe('"none" keyword support', () => {
      it('should validate color with "none" component', () => {
        const tokens = JSON.stringify({
          color: {
            transparent: {
              $type: 'color',
              $value: {
                colorSpace: 'srgb',
                components: ['none', 0, 0]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should validate color with multiple "none" components', () => {
        const tokens = JSON.stringify({
          color: {
            transparent: {
              $type: 'color',
              $value: {
                colorSpace: 'srgb',
                components: ['none', 'none', 0]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });
    });

    describe('Component range validation', () => {
      it('should error on srgb component below 0', () => {
        const tokens = JSON.stringify({
          color: {
            invalid: {
              $type: 'color',
              $value: {
                colorSpace: 'srgb',
                components: [-0.1, 0, 0]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('must be between 0 and 1'))).toBe(true);
      });

      it('should error on srgb component above 1', () => {
        const tokens = JSON.stringify({
          color: {
            invalid: {
              $type: 'color',
              $value: {
                colorSpace: 'srgb',
                components: [1.1, 0, 0]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('must be between 0 and 1'))).toBe(true);
      });

      it('should error on hsl saturation below 0', () => {
        const tokens = JSON.stringify({
          color: {
            invalid: {
              $type: 'color',
              $value: {
                colorSpace: 'hsl',
                components: [180, -5, 50]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('must be between 0 and 100'))).toBe(true);
      });

      it('should error on hsl lightness above 100', () => {
        const tokens = JSON.stringify({
          color: {
            invalid: {
              $type: 'color',
              $value: {
                colorSpace: 'hsl',
                components: [180, 50, 105]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('must be between 0 and 100'))).toBe(true);
      });

      it('should error on hue value at 360 (exclusive upper bound)', () => {
        const tokens = JSON.stringify({
          color: {
            invalid: {
              $type: 'color',
              $value: {
                colorSpace: 'hsl',
                components: [360, 50, 50]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('must be >= 0 and < 360'))).toBe(true);
      });

      it('should validate hue value at 359.9', () => {
        const tokens = JSON.stringify({
          color: {
            almostRed: {
              $type: 'color',
              $value: {
                colorSpace: 'hsl',
                components: [359.9, 100, 50]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should error on lab lightness below 0', () => {
        const tokens = JSON.stringify({
          color: {
            invalid: {
              $type: 'color',
              $value: {
                colorSpace: 'lab',
                components: [-1, 0, 0]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('must be between 0 and 100'))).toBe(true);
      });

      it('should error on lab lightness above 100', () => {
        const tokens = JSON.stringify({
          color: {
            invalid: {
              $type: 'color',
              $value: {
                colorSpace: 'lab',
                components: [101, 0, 0]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('must be between 0 and 100'))).toBe(true);
      });

      it('should error on lch chroma below 0', () => {
        const tokens = JSON.stringify({
          color: {
            invalid: {
              $type: 'color',
              $value: {
                colorSpace: 'lch',
                components: [50, -1, 180]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('must be >= 0'))).toBe(true);
      });
    });

    describe('Alpha channel validation', () => {
      it('should validate alpha between 0 and 1', () => {
        const tokens = JSON.stringify({
          color: {
            semiTransparent: {
              $type: 'color',
              $value: {
                colorSpace: 'srgb',
                components: [1, 0, 0],
                alpha: 0.5
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should error on alpha below 0', () => {
        const tokens = JSON.stringify({
          color: {
            invalid: {
              $type: 'color',
              $value: {
                colorSpace: 'srgb',
                components: [1, 0, 0],
                alpha: -0.1
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('alpha property') && e.includes('must be between 0 and 1'))).toBe(true);
      });

      it('should error on alpha above 1', () => {
        const tokens = JSON.stringify({
          color: {
            invalid: {
              $type: 'color',
              $value: {
                colorSpace: 'srgb',
                components: [1, 0, 0],
                alpha: 1.5
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('alpha property') && e.includes('must be between 0 and 1'))).toBe(true);
      });

      it('should error on non-numeric alpha', () => {
        const tokens = JSON.stringify({
          color: {
            invalid: {
              $type: 'color',
              $value: {
                colorSpace: 'srgb',
                components: [1, 0, 0],
                alpha: '0.5'
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('alpha property') && e.includes('must be a number'))).toBe(true);
      });
    });

    it('should error on missing colorSpace', () => {
      const tokens = JSON.stringify({
        color: {
          primary: {
            $type: 'color',
            $value: {
              components: [1, 0, 0]
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Color object at color.primary must have colorSpace property');
    });

    it('should error on invalid components array length', () => {
      const tokens = JSON.stringify({
        color: {
          primary: {
            $type: 'color',
            $value: {
              colorSpace: 'srgb',
              components: [1, 0]
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Color object at color.primary must have components array with exactly 3 values');
    });

    it('should error on invalid component type', () => {
      const tokens = JSON.stringify({
        color: {
          primary: {
            $type: 'color',
            $value: {
              colorSpace: 'srgb',
              components: ['red', 0, 0]
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('must be a number or "none"'))).toBe(true);
    });
  });

  describe('Dimension tokens', () => {
    it('should reject a string dimension shorthand (§8.2 requires an object)', () => {
      const tokens = JSON.stringify({
        spacing: {
          small: {
            $type: 'dimension',
            $value: '8px'
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
    });

    it('should reject a bare number dimension (§8.2 requires { value, unit })', () => {
      const tokens = JSON.stringify({
        spacing: {
          small: {
            $type: 'dimension',
            $value: 8
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
    });

    it('should validate dimension object format', () => {
      const tokens = JSON.stringify({
        spacing: {
          small: {
            $type: 'dimension',
            $value: {
              value: 8,
              unit: 'px'
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
    });

    it('should error on dimension with invalid unit (em)', () => {
      const tokens = JSON.stringify({
        spacing: {
          small: {
            $type: 'dimension',
            $value: '8em'
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('"px" or "rem"'))).toBe(true);
    });

    it('should error on dimension object with invalid unit', () => {
      const tokens = JSON.stringify({
        spacing: {
          small: {
            $type: 'dimension',
            $value: {
              value: 8,
              unit: 'em'
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Dimension unit at spacing.small must be "px" or "rem"');
    });
  });

  describe('Font tokens', () => {
    it('should validate fontFamily as string', () => {
      const tokens = JSON.stringify({
        font: {
          body: {
            $type: 'fontFamily',
            $value: 'Arial'
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
    });

    it('should validate fontFamily as array', () => {
      const tokens = JSON.stringify({
        font: {
          body: {
            $type: 'fontFamily',
            $value: ['Arial', 'Helvetica', 'sans-serif']
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
    });

    it('should validate fontWeight as number', () => {
      const tokens = JSON.stringify({
        font: {
          bold: {
            $type: 'fontWeight',
            $value: 700
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
    });

    it('should validate fontWeight string aliases', () => {
      const aliases = ['bold', 'normal', 'light', 'black'];
      aliases.forEach(alias => {
        const tokens = JSON.stringify({
          font: {
            weight: {
              $type: 'fontWeight',
              $value: alias
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });
    });

    it('should error on invalid fontWeight string', () => {
      const tokens = JSON.stringify({
        font: {
          weight: {
            $type: 'fontWeight',
            $value: 'super-bold'
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('valid weight alias'))).toBe(true);
    });

    it('should error on fontWeight below 1', () => {
      const tokens = JSON.stringify({
        font: {
          invalid: {
            $type: 'fontWeight',
            $value: 0
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('fontWeight at font.invalid must be a number between 1-1000');
    });

    it('should error on fontWeight above 1000', () => {
      const tokens = JSON.stringify({
        font: {
          invalid: {
            $type: 'fontWeight',
            $value: 1001
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('fontWeight at font.invalid must be a number between 1-1000');
    });
  });

  describe('Duration tokens', () => {
    it('should validate duration with ms unit', () => {
      const tokens = JSON.stringify({
        duration: {
          quick: {
            $type: 'duration',
            $value: {
              value: 100,
              unit: 'ms'
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
    });

    it('should validate duration with s unit', () => {
      const tokens = JSON.stringify({
        duration: {
          slow: {
            $type: 'duration',
            $value: {
              value: 1.5,
              unit: 's'
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
    });

    it('should error on duration with invalid unit', () => {
      const tokens = JSON.stringify({
        duration: {
          invalid: {
            $type: 'duration',
            $value: {
              value: 100,
              unit: 'sec'
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Duration unit at duration.invalid must be "ms" or "s"');
    });
  });

  describe('CubicBezier tokens', () => {
    it('should validate cubicBezier with valid values', () => {
      const tokens = JSON.stringify({
        easing: {
          accelerate: {
            $type: 'cubicBezier',
            $value: [0.5, 0, 1, 1]
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
    });

    it('should error on cubicBezier with wrong array length', () => {
      const tokens = JSON.stringify({
        easing: {
          invalid: {
            $type: 'cubicBezier',
            $value: [0.5, 0, 1]
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('cubicBezier at easing.invalid must be an array of exactly 4 numbers');
    });

    it('should error on cubicBezier with P1x out of range', () => {
      const tokens = JSON.stringify({
        easing: {
          invalid: {
            $type: 'cubicBezier',
            $value: [1.5, 0, 1, 1]
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('cubicBezier at easing.invalid[0] (P1x) must be in range [0, 1]');
    });

    it('should error on cubicBezier with P2x out of range', () => {
      const tokens = JSON.stringify({
        easing: {
          invalid: {
            $type: 'cubicBezier',
            $value: [0.5, 0, -0.5, 1]
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('cubicBezier at easing.invalid[2] (P2x) must be in range [0, 1]');
    });
  });

  describe('StrokeStyle tokens', () => {
    it('should validate strokeStyle with string value', () => {
      const values = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'outset', 'inset'];
      values.forEach(value => {
        const tokens = JSON.stringify({
          border: {
            style: {
              $type: 'strokeStyle',
              $value: value
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });
    });

    it('should validate strokeStyle with object value', () => {
      const tokens = JSON.stringify({
        border: {
          custom: {
            $type: 'strokeStyle',
            $value: {
              dashArray: [{ value: 10, unit: 'px' }, { value: 5, unit: 'px' }],
              lineCap: 'round'
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
    });

    it('should error on invalid strokeStyle string', () => {
      const tokens = JSON.stringify({
        border: {
          invalid: {
            $type: 'strokeStyle',
            $value: 'wavy'
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('must be one of:'))).toBe(true);
    });

    it('should error on strokeStyle object missing dashArray', () => {
      const tokens = JSON.stringify({
        border: {
          invalid: {
            $type: 'strokeStyle',
            $value: {
              lineCap: 'round'
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('strokeStyle object at border.invalid must have dashArray property');
    });

    it('should error on strokeStyle object with invalid lineCap', () => {
      const tokens = JSON.stringify({
        border: {
          invalid: {
            $type: 'strokeStyle',
            $value: {
              dashArray: [{ value: 10, unit: 'px' }],
              lineCap: 'pointy'
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('strokeStyle lineCap at border.invalid must be "round", "butt", or "square"');
    });
  });

  describe('Border tokens', () => {
    it('should validate border with all properties', () => {
      const tokens = JSON.stringify({
        border: {
          heavy: {
            $type: 'border',
            $value: {
              color: { colorSpace: 'srgb', components: [0, 0, 0] },
              width: { value: 3, unit: 'px' },
              style: 'solid'
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
    });

    it('should error on border missing color', () => {
      const tokens = JSON.stringify({
        border: {
          invalid: {
            $type: 'border',
            $value: {
              width: { value: 1, unit: 'px' },
              style: 'solid'
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Border at border.invalid must have color property');
    });
  });

  describe('Transition tokens', () => {
    it('should validate transition with all properties', () => {
      const tokens = JSON.stringify({
        transition: {
          smooth: {
            $type: 'transition',
            $value: {
              duration: { value: 200, unit: 'ms' },
              delay: { value: 0, unit: 'ms' },
              timingFunction: [0.5, 0, 1, 1]
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
    });

    it('should error on transition missing duration', () => {
      const tokens = JSON.stringify({
        transition: {
          invalid: {
            $type: 'transition',
            $value: {
              delay: { value: 0, unit: 'ms' },
              timingFunction: [0.5, 0, 1, 1]
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Transition at transition.invalid must have duration property');
    });
  });

  describe('Shadow tokens', () => {
    it('should validate shadow with all required fields', () => {
      const tokens = JSON.stringify({
        shadow: {
          card: {
            $type: 'shadow',
            $value: {
              offsetX: { value: 0, unit: 'px' },
              offsetY: { value: 4, unit: 'px' },
              blur: { value: 8, unit: 'px' },
              spread: { value: 0, unit: 'px' },
              color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.2 }
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
    });

    it('should validate shadow with inset property', () => {
      const tokens = JSON.stringify({
        shadow: {
          inner: {
            $type: 'shadow',
            $value: {
              offsetX: { value: 0, unit: 'px' },
              offsetY: { value: 2, unit: 'px' },
              blur: { value: 4, unit: 'px' },
              spread: { value: 0, unit: 'px' },
              color: { colorSpace: 'srgb', components: [0, 0, 0] },
              inset: true
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
    });

    it('should validate shadow array', () => {
      const tokens = JSON.stringify({
        shadow: {
          layered: {
            $type: 'shadow',
            $value: [
              {
                offsetX: { value: 0, unit: 'px' },
                offsetY: { value: 2, unit: 'px' },
                blur: { value: 4, unit: 'px' },
                spread: { value: 0, unit: 'px' },
                color: { colorSpace: 'srgb', components: [0, 0, 0] }
              },
              {
                offsetX: { value: 0, unit: 'px' },
                offsetY: { value: 4, unit: 'px' },
                blur: { value: 8, unit: 'px' },
                spread: { value: 0, unit: 'px' },
                color: { colorSpace: 'srgb', components: [0, 0, 0] }
              }
            ]
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
    });

    it('should error on shadow missing spread', () => {
      const tokens = JSON.stringify({
        shadow: {
          invalid: {
            $type: 'shadow',
            $value: {
              offsetX: { value: 0, unit: 'px' },
              offsetY: { value: 4, unit: 'px' },
              blur: { value: 8, unit: 'px' },
              color: '#000000'
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Shadow at shadow.invalid is missing required field: spread');
    });

    it('should error on shadow with non-boolean inset', () => {
      const tokens = JSON.stringify({
        shadow: {
          invalid: {
            $type: 'shadow',
            $value: {
              offsetX: { value: 0, unit: 'px' },
              offsetY: { value: 4, unit: 'px' },
              blur: { value: 8, unit: 'px' },
              spread: { value: 0, unit: 'px' },
              color: '#000000',
              inset: 'true'
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Shadow inset property at shadow.invalid must be a boolean');
    });
  });

  describe('Gradient tokens', () => {
    it('should validate gradient with stops', () => {
      const tokens = JSON.stringify({
        gradient: {
          blueToRed: {
            $type: 'gradient',
            $value: [
              {
                color: { colorSpace: 'srgb', components: [0, 0, 1] },
                position: 0
              },
              {
                color: { colorSpace: 'srgb', components: [1, 0, 0] },
                position: 1
              }
            ]
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
    });

    it('should error on gradient that is not an array', () => {
      const tokens = JSON.stringify({
        gradient: {
          invalid: {
            $type: 'gradient',
            $value: {
              color: '#0000ff',
              position: 0
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Gradient at gradient.invalid must be an array of gradient stops');
    });

    it('should error on gradient stop missing color', () => {
      const tokens = JSON.stringify({
        gradient: {
          invalid: {
            $type: 'gradient',
            $value: [
              {
                position: 0
              }
            ]
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Gradient stop at gradient.invalid[0] must have color property');
    });

    it('should error on gradient stop missing position', () => {
      const tokens = JSON.stringify({
        gradient: {
          invalid: {
            $type: 'gradient',
            $value: [
              {
                color: '#0000ff'
              }
            ]
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Gradient stop at gradient.invalid[0] must have position property');
    });
  });

  describe('Typography tokens', () => {
    it('should validate typography with all required fields', () => {
      const tokens = JSON.stringify({
        text: {
          heading: {
            $type: 'typography',
            $value: {
              fontFamily: 'Arial',
              fontSize: { value: 24, unit: 'px' },
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: { value: 0.5, unit: 'px' }
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
    });

    it('should error on typography missing fontFamily', () => {
      const tokens = JSON.stringify({
        text: {
          invalid: {
            $type: 'typography',
            $value: {
              fontSize: { value: 16, unit: 'px' },
              fontWeight: 400,
              lineHeight: 1.5,
              letterSpacing: { value: 0, unit: 'px' }
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Typography at text.invalid is missing required field: fontFamily');
    });

    it('should error on typography missing fontSize', () => {
      const tokens = JSON.stringify({
        text: {
          invalid: {
            $type: 'typography',
            $value: {
              fontFamily: 'Arial',
              fontWeight: 400,
              lineHeight: 1.5,
              letterSpacing: { value: 0, unit: 'px' }
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Typography at text.invalid is missing required field: fontSize');
    });

    it('should warn on typography with unknown field', () => {
      const tokens = JSON.stringify({
        text: {
          heading: {
            $type: 'typography',
            $value: {
              fontFamily: 'Arial',
              fontSize: { value: 24, unit: 'px' },
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: { value: 0.5, unit: 'px' },
              textDecoration: 'underline'
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Typography at text.heading has unknown field: textDecoration');
    });
  });

  describe('Token naming rules', () => {
    it('should error on token name with dot', () => {
      const tokens = JSON.stringify({
        'color.primary': {
          $type: 'color',
          $value: '#ff0000'
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('contains invalid characters'))).toBe(true);
    });

    it('should error on token name with curly braces', () => {
      const tokens = JSON.stringify({
        'color{primary}': {
          $type: 'color',
          $value: '#ff0000'
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('contains invalid characters'))).toBe(true);
    });

    it('should allow valid token names', () => {
      const tokens = JSON.stringify({
        'color-primary-500': {
          $type: 'color',
          $value: { colorSpace: 'srgb', components: [1, 0, 0] }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
    });
  });

  describe('Token groups and nesting', () => {
    it('should validate nested token groups', () => {
      const tokens = JSON.stringify({
        color: {
          primary: {
            500: {
              $type: 'color',
              $value: { colorSpace: 'srgb', components: [1, 0, 0] }
            },
            600: {
              $type: 'color',
              $value: { colorSpace: 'srgb', components: [0.8, 0, 0] }
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
      expect(result.tokenCount).toBe(2);
    });

    it('should count tokens correctly in complex structure', () => {
      const tokens = JSON.stringify({
        color: {
          primary: {
            $type: 'color',
            $value: { colorSpace: 'srgb', components: [1, 0, 0] }
          }
        },
        spacing: {
          small: {
            $type: 'dimension',
            $value: { value: 8, unit: 'px' }
          },
          medium: {
            $type: 'dimension',
            $value: { value: 16, unit: 'px' }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
      expect(result.tokenCount).toBe(3);
    });
  });

  describe('Missing $value', () => {
    it('should error on token missing $value', () => {
      const tokens = JSON.stringify({
        color: {
          primary: {
            $type: 'color'
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Token at color.primary is missing $value');
    });
  });

  describe('Unknown token types', () => {
    it('should warn on unknown $type', () => {
      const tokens = JSON.stringify({
        custom: {
          value: {
            $type: 'customType',
            $value: 'something'
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Unknown $type "customType" at custom.value');
    });
  });

  describe('validateTokensObject', () => {
    it('should validate object directly', () => {
      const tokens = {
        color: {
          primary: {
            $type: 'color',
            $value: { colorSpace: 'srgb', components: [1, 0, 0] }
          }
        }
      };
      const result = validateTokensObject(tokens);
      expect(result.valid).toBe(true);
      expect(result.tokenCount).toBe(1);
    });

    it('should reject null object', () => {
      const result = validateTokensObject(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Input is empty');
    });

    it('should reject undefined object', () => {
      const result = validateTokensObject(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Input is empty');
    });
  });

  describe('Real world examples', () => {
    it('should validate a complete design system', () => {
      const tokens = JSON.stringify({
        color: {
          primary: {
            $type: 'color',
            $value: { colorSpace: 'srgb', components: [0, 0.4, 0.8] }
          },
          semantic: {
            background: {
              $type: 'color',
              $value: {
                colorSpace: 'srgb',
                components: [1, 1, 1],
                hex: '#ffffff'
              }
            }
          }
        },
        spacing: {
          small: {
            $type: 'dimension',
            $value: {
              value: 8,
              unit: 'px'
            }
          },
          medium: {
            $type: 'dimension',
            $value: { value: 16, unit: 'px' }
          }
        },
        typography: {
          heading: {
            $type: 'typography',
            $value: {
              fontFamily: 'Arial',
              fontSize: { value: 24, unit: 'px' },
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: { value: 0, unit: 'px' }
            }
          }
        },
        shadow: {
          card: {
            $type: 'shadow',
            $value: {
              offsetX: { value: 0, unit: 'px' },
              offsetY: { value: 4, unit: 'px' },
              blur: { value: 8, unit: 'px' },
              spread: { value: 0, unit: 'px' },
              color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.2 }
            }
          }
        },
        duration: {
          quick: {
            $type: 'duration',
            $value: {
              value: 100,
              unit: 'ms'
            }
          }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
      expect(result.tokenCount).toBe(7);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Token References (Aliases)', () => {
    describe('Basic references', () => {
      it('should validate simple color reference', () => {
        const tokens = JSON.stringify({
          color: {
            base: {
              $type: 'color',
              $value: { colorSpace: 'srgb', components: [1, 0, 0] }
            },
            primary: {
              $type: 'color',
              $value: '{color.base}'
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
        expect(result.tokenCount).toBe(2);
      });

      it('should validate reference with nested groups', () => {
        const tokens = JSON.stringify({
          palette: {
            brand: {
              primary: {
                $type: 'color',
                $value: { colorSpace: 'srgb', components: [0, 0.4, 0.8] }
              }
            }
          },
          semantic: {
            link: {
              $type: 'color',
              $value: '{palette.brand.primary}'
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should error on reference to non-existent token', () => {
        const tokens = JSON.stringify({
          color: {
            primary: {
              $type: 'color',
              $value: '{color.nonexistent}'
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('non-existent'))).toBe(true);
      });

      it('should inherit type from referenced token', () => {
        const tokens = JSON.stringify({
          color: {
            base: {
              $type: 'color',
              $value: { colorSpace: 'srgb', components: [1, 0, 0] }
            },
            alias: {
              $value: '{color.base}'
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });
    });

    describe('Chained references', () => {
      it('should resolve multi-level reference chains', () => {
        const tokens = JSON.stringify({
          color: {
            base: {
              $type: 'color',
              $value: { colorSpace: 'srgb', components: [1, 0, 0] }
            },
            level1: {
              $type: 'color',
              $value: '{color.base}'
            },
            level2: {
              $type: 'color',
              $value: '{color.level1}'
            },
            level3: {
              $type: 'color',
              $value: '{color.level2}'
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
        expect(result.tokenCount).toBe(4);
      });

      it('should inherit type through reference chain', () => {
        const tokens = JSON.stringify({
          dimension: {
            base: {
              $type: 'dimension',
              $value: { value: 16, unit: 'px' }
            },
            alias1: {
              $value: '{dimension.base}'
            },
            alias2: {
              $value: '{dimension.alias1}'
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });
    });

    describe('Circular references', () => {
      it('should detect simple circular reference', () => {
        const tokens = JSON.stringify({
          color: {
            a: {
              $type: 'color',
              $value: '{color.b}'
            },
            b: {
              $type: 'color',
              $value: '{color.a}'
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Circular reference'))).toBe(true);
      });

      it('should detect multi-level circular reference', () => {
        const tokens = JSON.stringify({
          color: {
            a: {
              $type: 'color',
              $value: '{color.b}'
            },
            b: {
              $type: 'color',
              $value: '{color.c}'
            },
            c: {
              $type: 'color',
              $value: '{color.a}'
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Circular reference'))).toBe(true);
      });

      it('should detect self-reference', () => {
        const tokens = JSON.stringify({
          color: {
            broken: {
              $type: 'color',
              $value: '{color.broken}'
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Circular reference'))).toBe(true);
      });
    });

    describe('Type inheritance through references', () => {
      it('should validate dimension reference', () => {
        const tokens = JSON.stringify({
          spacing: {
            base: {
              $type: 'dimension',
              $value: { value: 8, unit: 'px' }
            },
            small: {
              $value: '{spacing.base}'
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should validate fontWeight reference', () => {
        const tokens = JSON.stringify({
          weight: {
            normal: {
              $type: 'fontWeight',
              $value: 400
            },
            body: {
              $value: '{weight.normal}'
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should work with explicit types on tokens', () => {
        const tokens = JSON.stringify({
          color: {
            $type: 'color',
            base: {
              $type: 'color',
              $value: { colorSpace: 'srgb', components: [1, 0, 0] }
            },
            primary: {
              $type: 'color',
              $value: '{color.base}'
            }
          }
        });
        const result = validateTokens(tokens);
        // Reference resolves correctly with explicit types
        expect(result.valid).toBe(true);
        expect(result.errors.length).toBe(0);
      });
    });

    describe('References in composite tokens', () => {
      it('should validate shadow with color reference', () => {
        const tokens = JSON.stringify({
          color: {
            shadowColor: {
              $type: 'color',
              $value: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.5 }
            }
          },
          shadow: {
            card: {
              $type: 'shadow',
              $value: {
                color: '{color.shadowColor}',
                offsetX: { value: 0, unit: 'px' },
                offsetY: { value: 4, unit: 'px' },
                blur: { value: 8, unit: 'px' },
                spread: { value: 0, unit: 'px' }
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should validate border with multiple references', () => {
        const tokens = JSON.stringify({
          color: {
            borderColor: {
              $type: 'color',
              $value: { colorSpace: 'srgb', components: [0.8, 0.8, 0.8] }
            }
          },
          dimension: {
            borderWidth: {
              $type: 'dimension',
              $value: { value: 1, unit: 'px' }
            }
          },
          border: {
            default: {
              $type: 'border',
              $value: {
                color: '{color.borderColor}',
                width: '{dimension.borderWidth}',
                style: 'solid'
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });
    });

    describe('References inside composite arrays and sub-values (spec §7.3, §9.1)', () => {
      it('should accept a reference as a shadow array element', () => {
        const tokens = JSON.stringify({
          base: {
            shadow: {
              $type: 'shadow',
              $value: {
                color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.2 },
                offsetX: { value: 0, unit: 'px' },
                offsetY: { value: 2, unit: 'px' },
                blur: { value: 4, unit: 'px' },
                spread: { value: 0, unit: 'px' }
              }
            }
          },
          layered: {
            $type: 'shadow',
            $value: [
              '{base.shadow}',
              {
                color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.3 },
                offsetX: { value: 0, unit: 'px' },
                offsetY: { value: 8, unit: 'px' },
                blur: { value: 16, unit: 'px' },
                spread: { value: 0, unit: 'px' }
              }
            ]
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should accept references for gradient stop color and position', () => {
        const tokens = JSON.stringify({
          brand: {
            primary: { $type: 'color', $value: { colorSpace: 'srgb', components: [0, 1, 0.4] } }
          },
          end: { $type: 'number', $value: 1 },
          ramp: {
            $type: 'gradient',
            $value: [
              { color: { colorSpace: 'srgb', components: [0, 0, 0] }, position: 0 },
              { color: '{brand.primary}', position: '{end}' }
            ]
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should accept references for every typography sub-value', () => {
        const tokens = JSON.stringify({
          font: { body: { $type: 'fontFamily', $value: 'Inter' } },
          size: { md: { $type: 'dimension', $value: { value: 16, unit: 'px' } } },
          weight: { bold: { $type: 'fontWeight', $value: 700 } },
          spacing: { tight: { $type: 'dimension', $value: { value: 0, unit: 'px' } } },
          lh: { normal: { $type: 'number', $value: 1.4 } },
          heading: {
            $type: 'typography',
            $value: {
              fontFamily: '{font.body}',
              fontSize: '{size.md}',
              fontWeight: '{weight.bold}',
              letterSpacing: '{spacing.tight}',
              lineHeight: '{lh.normal}'
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should reject an invalid border sub-value (width as a string)', () => {
        const tokens = JSON.stringify({
          border: {
            bad: {
              $type: 'border',
              $value: {
                color: { colorSpace: 'srgb', components: [0, 0, 0] },
                width: '3px',
                style: 'solid'
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
      });

      it('should reject an invalid strokeStyle dashArray entry', () => {
        const tokens = JSON.stringify({
          stroke: {
            bad: {
              $type: 'strokeStyle',
              $value: { dashArray: ['3px', { value: 2, unit: 'px' }], lineCap: 'round' }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
      });
    });

    describe('JSON Pointer $ref (RFC 6901, spec §6.6.2 / §7.1.2 / §7.3)', () => {
      it('should resolve a token-level $ref to another token value (Example 32)', () => {
        const tokens = JSON.stringify({
          colors: {
            blue: {
              $type: 'color',
              $value: { colorSpace: 'srgb', components: [0, 0.4, 0.8], hex: '#0066cc' }
            }
          },
          semantic: {
            primary: { $ref: '#/colors/blue/$value', $type: 'color' }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
        expect(result.tokenCount).toBe(2);
      });

      it('should resolve a token-level $ref to a single component (number)', () => {
        const tokens = JSON.stringify({
          colors: {
            blue: { $type: 'color', $value: { colorSpace: 'srgb', components: [0, 0.4, 0.8] } }
          },
          primaryHue: { $ref: '#/colors/blue/$value/components/0', $type: 'number' }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should accept property-level $ref inside color components (Example 35)', () => {
        const tokens = JSON.stringify({
          base: {
            blue: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.2, 0.4, 0.9] } }
          },
          semantic: {
            primary: {
              $type: 'color',
              $value: {
                colorSpace: 'srgb',
                components: [
                  { $ref: '#/base/blue/$value/components/0' },
                  { $ref: '#/base/blue/$value/components/1' },
                  0.7
                ]
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should accept property-level $ref for dimension value and unit (Example 36)', () => {
        const tokens = JSON.stringify({
          base: { spacing: { $type: 'dimension', $value: { value: 16, unit: 'px' } } },
          layout: {
            small: {
              $type: 'dimension',
              $value: { value: { $ref: '#/base/spacing/$value/value' }, unit: 'rem' }
            },
            large: {
              $type: 'dimension',
              $value: { value: 32, unit: { $ref: '#/base/spacing/$value/unit' } }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });

      it('should error on an unresolvable JSON Pointer', () => {
        const tokens = JSON.stringify({
          a: { $ref: '#/does/not/exist', $type: 'color' }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('cannot be resolved'))).toBe(true);
      });

      it('should error on a circular $ref chain', () => {
        const tokens = JSON.stringify({
          a: { $ref: '#/b', $type: 'color' },
          b: { $ref: '#/a', $type: 'color' }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(false);
      });
    });

    describe('Reference validation edge cases', () => {
      it('should accept malformed reference syntax as literal string for non-color types', () => {
        const tokens = JSON.stringify({
          text: {
            value: {
              $type: 'fontFamily',
              $value: '{incomplete'
            }
          }
        });
        const result = validateTokens(tokens);
        // This should be valid since fontFamily can be any string
        expect(result.valid).toBe(true);
      });

      it('should treat empty braces as literal string, not reference', () => {
        const tokens = JSON.stringify({
          color: {
            broken: {
              $type: 'color',
              $value: '{}'
            }
          }
        });
        const result = validateTokens(tokens);
        // {} doesn't match the reference pattern, so it is treated as a literal
        // string — which is not a valid color value (must be an object) → error.
        expect(result.valid).toBe(false);
      });

      it('should validate references across different type groups', () => {
        const tokens = JSON.stringify({
          base: {
            size: {
              $type: 'dimension',
              $value: { value: 16, unit: 'px' }
            }
          },
          typography: {
            body: {
              $type: 'typography',
              $value: {
                fontFamily: 'Arial',
                fontSize: '{base.size}',
                fontWeight: 400,
                lineHeight: 1.5,
                letterSpacing: { value: 0, unit: 'px' }
              }
            }
          }
        });
        const result = validateTokens(tokens);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('$root, $deprecated, $extends and reserved names (Format §5.1.1, §5.2.4, §6.2, §6.4)', () => {
    it('should validate a $root token within a group (Example 24)', () => {
      const tokens = JSON.stringify({
        spacing: {
          $type: 'dimension',
          $root: { $value: { value: 16, unit: 'px' } },
          small: { $value: { value: 8, unit: 'px' } },
          large: { $value: { value: 32, unit: 'px' } }
        }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(true);
      expect(result.tokenCount).toBe(3);
    });

    it('should resolve a curly reference to a $root token but not to the group', () => {
      const ok = JSON.stringify({
        color: { accent: { $type: 'color', $root: { $value: { colorSpace: 'srgb', components: [1, 0, 0] } } } },
        alias: { $type: 'color', $value: '{color.accent.$root}' }
      });
      expect(validateTokens(ok).valid).toBe(true);

      const bad = JSON.stringify({
        color: { accent: { $type: 'color', $root: { $value: { colorSpace: 'srgb', components: [1, 0, 0] } } } },
        alias: { $type: 'color', $value: '{color.accent}' }
      });
      expect(validateTokens(bad).valid).toBe(false);
    });

    it('should accept $deprecated as boolean or string', () => {
      const tokens = JSON.stringify({
        color: {
          old: { $type: 'color', $deprecated: true, $value: { colorSpace: 'srgb', components: [0, 0, 0] } },
          legacy: { $type: 'color', $deprecated: 'Use {color.new} instead.', $value: { colorSpace: 'srgb', components: [0, 0, 0] } }
        }
      });
      expect(validateTokens(tokens).valid).toBe(true);
    });

    it('should reject a non-boolean/non-string $deprecated', () => {
      const tokens = JSON.stringify({
        color: { x: { $type: 'color', $deprecated: 42, $value: { colorSpace: 'srgb', components: [0, 0, 0] } } }
      });
      expect(validateTokens(tokens).valid).toBe(false);
    });

    it('should reject a token/group name beginning with $', () => {
      const tokens = JSON.stringify({
        $custom: { $type: 'color', $value: { colorSpace: 'srgb', components: [0, 0, 0] } }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('must not begin with "$"'))).toBe(true);
    });

    it('should validate a group $extends referencing another group (Example 13)', () => {
      const tokens = JSON.stringify({
        button: {
          $type: 'color',
          background: { $value: { colorSpace: 'srgb', components: [0, 0.4, 0.8] } }
        },
        'button-primary': {
          $extends: '{button}',
          background: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.8, 0, 0.4] } }
        }
      });
      expect(validateTokens(tokens).valid).toBe(true);
    });

    it('should reject $extends that references a token, not a group', () => {
      const tokens = JSON.stringify({
        base: { $type: 'color', $value: { colorSpace: 'srgb', components: [0, 0, 0] } },
        derived: { $extends: '{base}', x: { $type: 'color', $value: { colorSpace: 'srgb', components: [1, 1, 1] } } }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('must not reference a token'))).toBe(true);
    });

    it('should detect a circular $extends chain (Example 17)', () => {
      const tokens = JSON.stringify({
        groupA: { $extends: '{groupB}', token: { $type: 'color', $value: { colorSpace: 'srgb', components: [0, 0, 0] } } },
        groupB: { $extends: '{groupA}', token: { $type: 'color', $value: { colorSpace: 'srgb', components: [1, 1, 1] } } }
      });
      const result = validateTokens(tokens);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Circular $extends'))).toBe(true);
    });
  });

  describe('Resolver module (.resolver.json, Resolver Module 2025.10)', () => {
    it('should validate a resolver document with sets and a modifier (Example 6)', () => {
      const doc = JSON.stringify({
        version: '2025.10',
        sets: {
          size: { sources: [{ $ref: 'foundation/size.json' }] },
          typography: { sources: [{ $ref: 'foundation/typography.json' }] }
        },
        modifiers: {
          theme: {
            description: 'Color theme',
            contexts: {
              light: [{ $ref: 'theme/light.json' }],
              dark: [{ $ref: 'theme/dark.json' }]
            },
            default: 'light'
          }
        },
        resolutionOrder: [
          { $ref: '#/sets/size' },
          { $ref: '#/sets/typography' },
          { $ref: '#/modifiers/theme' }
        ]
      });
      const result = validateTokens(doc);
      expect((result as any).documentType).toBe('resolver');
      expect(result.valid).toBe(true);
    });

    it('should error on a missing or wrong version', () => {
      const doc = JSON.stringify({
        version: '2024.01',
        resolutionOrder: [{ type: 'set', name: 'S', sources: [] }]
      });
      const result = validateTokens(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('version must be "2025.10"'))).toBe(true);
    });

    it('should error on a modifier with an empty contexts map', () => {
      const doc = JSON.stringify({
        version: '2025.10',
        modifiers: { broken: { contexts: {} } },
        resolutionOrder: [{ $ref: '#/modifiers/broken' }]
      });
      const result = validateTokens(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('empty contexts map'))).toBe(true);
    });

    it('should error when default is not one of the contexts', () => {
      const doc = JSON.stringify({
        version: '2025.10',
        modifiers: {
          theme: { contexts: { light: [], dark: [] }, default: 'blue' }
        },
        resolutionOrder: [{ $ref: '#/modifiers/theme' }]
      });
      const result = validateTokens(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('default "blue"'))).toBe(true);
    });

    it('should error on an inline resolutionOrder item missing type/name (Example 8)', () => {
      const doc = JSON.stringify({
        version: '2025.10',
        resolutionOrder: [{ sources: [{ $ref: 'foundation/size.json' }] }]
      });
      const result = validateTokens(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('type "set" or "modifier"'))).toBe(true);
    });

    it('should error on a reference object pointing into resolutionOrder (Example 9)', () => {
      const doc = JSON.stringify({
        version: '2025.10',
        resolutionOrder: [{ $ref: '#/resolutionOrder/0' }]
      });
      const result = validateTokens(doc);
      expect(result.valid).toBe(false);
    });

    it('should warn on a modifier with only one context', () => {
      const doc = JSON.stringify({
        version: '2025.10',
        modifiers: { theme: { contexts: { only: [] } } },
        resolutionOrder: [{ $ref: '#/modifiers/theme' }]
      });
      const result = validateTokens(doc);
      expect(result.warnings.some((w) => w.includes('two or more contexts'))).toBe(true);
    });
  });
});
