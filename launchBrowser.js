const chromium = require("chrome-aws-lambda");
const puppeteer = require("puppeteer-core");

async function launchBrowser() {
  const executablePath = await chromium.executablePath;

  if (!executablePath) {
    throw new Error("Chromium executable not found. Check chrome-aws-lambda setup.");
  }

  return await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
  });
}

module.exports = launchBrowser;
