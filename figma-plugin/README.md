# Dembrandt Design System Importer - Figma Plugin

This Figma plugin imports design tokens extracted by the dembrandt CLI tool, automatically creating color styles, text styles, and visual documentation pages in Figma.

## Features

- 🎨 **Automatic Color Style Creation**: Imports all extracted colors as Figma paint styles
- ✍️ **Text Style Generation**: Creates text styles with proper font families, sizes, weights, and line heights
- 📄 **Visual Documentation**: Generates beautiful documentation pages showing your design system
- 🏷️ **Smart Naming**: Styles are intelligently named based on semantic meaning
- 🔄 **Fallback Fonts**: Automatically falls back to Inter/Roboto if extracted fonts aren't available

## Installation

### Method 1: Load as Development Plugin (Recommended for testing)

1. Open Figma Desktop app
2. Go to **Plugins** → **Development** → **Import plugin from manifest...**
3. Navigate to the `figma-plugin` folder and select `manifest.json`
4. The plugin is now available in your **Plugins** → **Development** menu

### Method 2: Install from Figma Community (Coming soon)

Once published, you'll be able to install directly from Figma Community.

## Usage

### Step 1: Extract Design Tokens

Run dembrandt with the `--figma` flag:

```bash
npx dembrandt https://example.com --figma
```

This will generate two files:
- `output/example.com/TIMESTAMP.json` - Full extraction data
- `output/example.com/TIMESTAMP-figma.json` - Figma-ready format

### Step 2: Import into Figma

1. Open Figma (or create a new file)
2. Go to **Plugins** → **Development** → **Dembrandt Design System Importer**
3. Copy the contents of the `*-figma.json` file
4. Paste into the plugin's text area
5. Click **Import Design System**

### Step 3: Use Your Styles

The plugin creates:

- **Color Styles**: Found under `Dembrandt/[Color Name]` in the Fill/Stroke style picker
- **Text Styles**: Found under `Dembrandt/[Style Name]` in the Text style picker
- **Documentation Pages**:
  - `📋 Overview` - Metadata and instructions
  - `🎨 Colors` - Visual color palette with swatches
  - `✍️ Typography` - Typography samples and scale

## Plugin Structure

```
figma-plugin/
├── manifest.json   # Plugin configuration
├── code.js         # Main plugin logic (runs in Figma sandbox)
├── ui.html         # User interface (runs in iframe)
└── README.md       # This file
```

## Development

### Testing the Plugin

1. Make changes to `code.js` or `ui.html`
2. In Figma, go to **Plugins** → **Development** → **Dembrandt Design System Importer** (it will reload automatically)
3. Test with sample data from `examples/stripe.com.json` or similar

### Sample Test Data

You can use the example files in the `examples` folder:

```bash
# Generate Figma JSON from existing extraction
node -e "
const { transformToFigmaFormat } = require('./lib/figma-exporter.js');
const data = require('./examples/stripe.com.json');
console.log(JSON.stringify(transformToFigmaFormat(data), null, 2));
" > examples/stripe.com-figma.json
```

### Debugging

Enable the Figma plugin console:
1. Go to **Plugins** → **Development** → **Open Console**
2. Run the plugin
3. Check for any console errors or warnings

## Limitations

- **Font Availability**: The plugin can only use fonts available in Figma. If an extracted font isn't available, it falls back to Inter or Roboto.
- **Font Style Mapping**: Font weights are mapped to standard style names (Regular, Bold, etc.). Some custom font styles may not map correctly.
- **Style Limit**: To keep files manageable, the plugin imports:
  - Up to 20 colors (highest confidence)
  - Up to 15 text styles (highest confidence)

## Troubleshooting

### "Invalid JSON" Error
- Make sure you're copying the entire contents of the `-figma.json` file
- Verify the JSON is valid using a JSON validator

### "Could not load font" Warning
- Some extracted fonts may not be available in Figma
- The plugin automatically falls back to Inter/Roboto
- You can manually change fonts after import

### Styles Not Appearing
- Check that you're looking under the `Dembrandt/` prefix
- Try refreshing the style picker
- Make sure the import completed successfully (check the success message)

## Future Enhancements

- [ ] Support for effect styles (shadows, blurs)
- [ ] Spacing scale visualization
- [ ] Component generation (buttons, inputs)
- [ ] Direct API integration (no JSON copy/paste)
- [ ] Style organization options
- [ ] Update existing styles instead of creating duplicates

## Contributing

Found a bug or have a feature request? Please open an issue in the main dembrandt repository.

## License

Part of the dembrandt project. See main repository for license information.
