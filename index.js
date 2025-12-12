#!/usr/bin/env node

/**
 * Dembrandt - Design Token Extraction CLI
 *
 * Extracts design tokens, brand colors, typography, spacing, and component styles
 * from any website using Playwright with advanced bot detection avoidance.
 */

import { program } from "commander";
import chalk from "chalk";
import ora from "ora";
import { chromium } from "playwright-core";
import { extractBranding } from "./lib/extractors.js";
import { displayResults } from "./lib/display.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

program
  .name("dembrandt")
  .description("Extract design tokens from any website")
  .version("0.5.0")
  .argument("<url>")
  .option("--json-only", "Output raw JSON")
  .option("--save-output", "Save JSON file to output folder")
  .option("--dark-mode", "Extract colors from dark mode")
  .option("--mobile", "Extract from mobile viewport")
  .option("--slow", "3x longer timeouts for slow-loading sites")
  .option("--no-sandbox", "Disable browser sandbox (needed for Docker/CI)")
  .action(async (input, opts) => {
    let url = input;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    const spinner = ora("Starting extraction...").start();
    let browser = null;

    try {
      let useHeaded = false;
      let result;

      while (true) {
        spinner.text = `Launching browser (${useHeaded ? "visible" : "headless"
          } mode)`;
        const launchArgs = ["--disable-blink-features=AutomationControlled"];
        if (opts.noSandbox) {
          launchArgs.push("--no-sandbox", "--disable-setuid-sandbox");
        }
        browser = await chromium.launch({
          headless: !useHeaded,
          args: launchArgs,
        });

        try {
          result = await extractBranding(url, spinner, browser, {
            navigationTimeout: 90000,
            darkMode: opts.darkMode,
            mobile: opts.mobile,
            slow: opts.slow,
          });
          break;
        } catch (err) {
          await browser.close();
          browser = null;

          if (useHeaded) throw err;

          if (
            err.message.includes("Timeout") ||
            err.message.includes("net::ERR_")
          ) {
            spinner.warn(
              "Bot detection detected → retrying with visible browser"
            );
            console.error(chalk.dim(`  ↳ Error: ${err.message}`));
            console.error(chalk.dim(`  ↳ URL: ${url}`));
            console.error(chalk.dim(`  ↳ Mode: headless`));
            useHeaded = true;
            continue;
          }
          throw err;
        }
      }

      console.log();

      // Save JSON output only if --save-output is specified
      if (opts.saveOutput && !opts.jsonOnly) {
        try {
          const domain = new URL(url).hostname.replace("www.", "");
          const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .split(".")[0];
          // Save to current working directory, not installation directory
          const outputDir = join(process.cwd(), "output", domain);
          mkdirSync(outputDir, { recursive: true });

          const filename = `${timestamp}.json`;
          const filepath = join(outputDir, filename);
          writeFileSync(filepath, JSON.stringify(result, null, 2));

          console.log(
            chalk.dim(
              `💾 JSON saved to: ${chalk.hex('#8BE9FD')(
                `output/${domain}/${filename}`
              )}`
            )
          );
        } catch (err) {
          console.log(
            chalk.hex('#FFB86C')(`⚠ Could not save JSON file: ${err.message}`)
          );
        }
      }

      // Output to terminal
      if (opts.jsonOnly) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log();
        displayResults(result);
      }
    } catch (err) {
      spinner.fail("Failed");
      console.error(chalk.red("\n✗ Extraction failed"));
      console.error(chalk.red(`  Error: ${err.message}`));
      console.error(chalk.dim(`  URL: ${url}`));
      process.exit(1);
    } finally {
      if (browser) await browser.close();
    }
  });

program.parse();
