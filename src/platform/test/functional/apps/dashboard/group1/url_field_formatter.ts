/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { common, dashboard, settings, visChart, discover } = getPageObjects([
    'common',
    'dashboard',
    'settings',
    'visChart',
    'discover',
  ]);
  const kibanaServer = getService('kibanaServer');
  const testSubjects = getService('testSubjects');
  const find = getService('find');
  const browser = getService('browser');
  const fieldName = 'clientip';
  const deployment = getService('deployment');
  const retry = getService('retry');
  const security = getService('security');
  const dataGrid = getService('dataGrid');

  const checkUrl = async (fieldValue: string) => {
    const windowHandlers = await browser.getAllWindowHandles();
    expect(windowHandlers.length).to.equal(2);
    await browser.switchToWindow(windowHandlers[1]);
    const currentUrl = await browser.getCurrentUrl();
    const fieldUrl = deployment.getHostPort() + '/app/' + fieldValue;
    expect(currentUrl).to.equal(fieldUrl);
  };

  // Fails in chrome 129+: https://github.com/elastic/kibana-operations/issues/199
  describe.skip('Changing field formatter to Url', () => {
    before(async function () {
      await security.testUser.setRoles(['kibana_admin', 'test_logstash_reader', 'animals']);
      await kibanaServer.savedObjects.cleanStandardList();
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/dashboard/current/kibana'
      );
      await kibanaServer.uiSettings.replace({
        defaultIndex: '0bf35f60-3dc9-11e8-8660-4d65aa086b3c',
      });
      await common.navigateToApp('settings');
      await settings.clickKibanaIndexPatterns();
      await settings.clickIndexPatternLogstash();
      await settings.filterField(fieldName);
      await settings.openControlsByName(fieldName);
      await settings.toggleRow('formatRow');
      await settings.setFieldFormat('url');
      await settings.controlChangeSave();
    });

    after(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await security.testUser.restoreDefaults();
    });

    it('applied on dashboard', async () => {
      await dashboard.navigateToApp();
      await dashboard.loadSavedDashboard('dashboard with table');
      await dashboard.waitForRenderComplete();
      const fieldLink = await visChart.getFieldLinkInVisTable(`${fieldName}: Descending`);
      const fieldValue = await fieldLink.getVisibleText();
      await fieldLink.moveMouseTo();
      await fieldLink.click();
      await retry.try(async () => {
        await checkUrl(fieldValue);
      });
    });

    it('applied on discover', async () => {
      const from = 'Sep 19, 2017 @ 06:31:44.000';
      const to = 'Sep 23, 2018 @ 18:31:44.000';
      await common.setTime({ from, to });
      await common.navigateToApp('discover');
      await discover.selectIndexPattern('logstash-*');
      await dataGrid.clickRowToggle();
      await retry.waitForWithTimeout(`${fieldName} is visible`, 30000, async () => {
        return await testSubjects.isDisplayed(`tableDocViewRow-${fieldName}-value`);
      });
      const fieldLink = await find.byCssSelector(
        `[data-test-subj="tableDocViewRow-${fieldName}-value"] a`
      );
      const fieldValue = await fieldLink.getVisibleText();
      await retry.try(async () => {
        await fieldLink.click();
        await checkUrl(fieldValue);
      });
    });

    afterEach(async function () {
      const windowHandlers = await browser.getAllWindowHandles();
      if (windowHandlers.length > 1) {
        await browser.closeCurrentWindow();
        await browser.switchToWindow(windowHandlers[0]);
      }
    });
  });
}
