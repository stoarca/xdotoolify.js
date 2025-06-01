import Xdotoolify, { XWebDriver } from '../src/xdotoolify';
import { Builder, WebDriver } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox';

export async function setupTestEnvironment(): Promise<XWebDriver> {
  const { execSync } = require('child_process');
  const { mkdtempSync, writeFileSync, mkdirSync } = require('fs');
  const tmpdir = mkdtempSync('/tmp/xdotoolify-selenium-test');

  const firefoxOpts = new firefox.Options();
  firefoxOpts.setProfile(tmpdir);
  firefoxOpts.setPreference('focusmanager.testmode', false);
  firefoxOpts.setPreference('security.fileuri.strict_origin_policy', false);
  firefoxOpts.setPreference('gfx.direct2d.disabled', true);
  firefoxOpts.setPreference('dom.storage.next_gen', true);
  firefoxOpts.setPreference('layers.acceleration.disabled', true);
  firefoxOpts.setPreference('devtools.webconsole.persistlog', true);
  firefoxOpts.setPreference('app.update.auto', false);
  firefoxOpts.setPreference('app.update.enabled', false);
  firefoxOpts.setPreference('browser.fullscreen.animate', false);
  firefoxOpts.setPreference('browser.fullscreen.autohide', false);
  firefoxOpts.setPreference('full-screen-api.warning.delay', 0);
  firefoxOpts.setPreference('full-screen-api.warning.timeout', 0);
  firefoxOpts.setPreference('browser.formfill.enable', false);
  firefoxOpts.setPreference('ui.caretBlinkTime', 0);
  firefoxOpts.setPreference('layout.spellcheckDefault', 0);
  firefoxOpts.setPreference('security.enterprise_roots.enabled', true);
  firefoxOpts.setPreference('security.cert_pinning.enforcement_level', 0);
  firefoxOpts.setPreference('security.ssl.enable_ocsp_stapling', false);
  firefoxOpts.setPreference('security.ssl.enable_ocsp_must_staple', false);
  firefoxOpts.setPreference('security.default_personal_cert', 'Select Automatically');
  firefoxOpts.setAcceptInsecureCerts(true);
  firefoxOpts.addArguments('-no-remote');
  firefoxOpts.addArguments('--shm-size=2g');

  const driver = await new Builder()
    .forBrowser('firefox')
    .setFirefoxOptions(firefoxOpts)
    .build();

  await driver.manage().window().setRect({
    width: 1280,
    height: 1024
  });

  await driver.get('about:blank');

  const page = Xdotoolify(driver);
  return page;
}

export async function teardownTestEnvironment(page: XWebDriver | null): Promise<void> {
  if (page) {
    await page.quit();
  }
}

export async function resetPageState(page: XWebDriver): Promise<void> {
  page = Xdotoolify(page);
  Xdotoolify.defaultCheckUntilTimeout = 300;
  await page.get('about:blank');
}
