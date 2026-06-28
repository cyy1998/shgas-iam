import type { Page, Route } from '@playwright/test';
import {
  adminClientDetail,
  adminClientSearchResult,
  adminUserSearchResult,
  currentAdminUser,
} from '../test/mocks/fixtures';

function ok<T>(data: T) {
  return { code: 200, message: 'OK', data };
}

async function fulfillJson(route: Route, data: unknown) {
  await route.fulfill({
    contentType: 'application/json',
    json: data,
    status: 200,
  });
}

async function fulfillTrpc(route: Route, data: unknown) {
  await fulfillJson(route, [{ result: { data } }]);
}

export async function mockAdminApi(page: Page) {
  await page.route('**/public/user-info', (route) =>
    fulfillJson(route, ok(currentAdminUser)),
  );
  await page.route('**/rpc/admin.user.search**', (route) =>
    fulfillTrpc(route, adminUserSearchResult),
  );
  await page.route('**/rpc/admin.client.search**', (route) =>
    fulfillTrpc(route, adminClientSearchResult),
  );
  await page.route('**/rpc/admin.client.detail**', (route) =>
    fulfillTrpc(route, adminClientDetail),
  );
  await page.route('**/rpc/admin.client.create**', (route) =>
    fulfillTrpc(route, adminClientDetail),
  );
  await page.route('**/rpc/admin.client.update**', (route) =>
    fulfillTrpc(route, adminClientDetail),
  );
}
