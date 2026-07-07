import { HttpResponse, http } from 'msw';
import {
  adminClientDetail,
  adminClientSearchResult,
  adminEmploymentSearchResult,
  adminPositionSearchResult,
  adminUserSearchResult,
  currentAdminUser,
} from './fixtures';

function ok<T>(data: T) {
  return HttpResponse.json({ code: 200, message: 'OK', data });
}

function trpc<T>(data: T) {
  return HttpResponse.json([{ result: { data } }]);
}

export const handlers = [
  http.get('*/public/user-info', () => ok(currentAdminUser)),
  http.get('*/rpc/admin.user.search', () => trpc(adminUserSearchResult)),
  http.get('*/rpc/admin.client.search', () => trpc(adminClientSearchResult)),
  http.get('*/rpc/admin.client.detail', () => trpc(adminClientDetail)),
  http.get('*/rpc/admin.position.search', () =>
    trpc(adminPositionSearchResult),
  ),
  http.get('*/rpc/admin.employment.search', () =>
    trpc(adminEmploymentSearchResult),
  ),
  http.post('*/rpc/admin.client.create', () => trpc(adminClientDetail)),
  http.post('*/rpc/admin.client.update', () => trpc(adminClientDetail)),
];
