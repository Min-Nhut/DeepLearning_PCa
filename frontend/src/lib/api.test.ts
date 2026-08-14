import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';

/**
 * The fetch wrapper decides what the doctor sees when something goes wrong.
 * Two behaviours matter beyond "does it parse JSON": a network failure has to
 * read as a server problem rather than a silent nothing (a bare `catch {}`
 * elsewhere in this app once made a broken button look like a dead one), and
 * "nothing recorded yet" must not surface as an error, because that is the
 * normal state of every freshly uploaded image.
 */
function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('request shape', () => {
  it('attaches the bearer token when one is given', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    await api.getCases('tok123');

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get('Authorization')).toBe('Bearer tok123');
  });

  it('sends no Authorization header when there is no token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { access_token: 'x', token_type: 'bearer' }));
    await api.login('a@b.c', 'pw');

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('sets a JSON content type for a JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await api.login('a@b.c', 'pw');

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get('Content-Type')).toBe('application/json');
  });
});

describe('error mapping', () => {
  it('surfaces the backend message rather than a bare status', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { detail: 'Tối đa 12 slide / ca' }));

    await expect(api.getCases('tok')).rejects.toMatchObject({
      status: 400,
      message: 'Tối đa 12 slide / ca',
    });
  });

  it('reports a network failure as a connection problem, not silence', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await api.getCases('tok').catch((e) => e);
    expect(error).toBeInstanceOf(api.ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toContain('máy chủ');
  });

  it('falls back to the status text when the body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>gateway</html>', { status: 502, statusText: 'Bad Gateway' }));

    await expect(api.getCases('tok')).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' });
  });

  it('keeps the status code so callers can react to a specific one', async () => {
    fetchMock.mockResolvedValue(jsonResponse(423, { detail: 'Đã khóa' }));
    await expect(api.updateReview('tok', 1, { free_notes: 'x' })).rejects.toMatchObject({ status: 423 });
  });
});

describe('"nothing yet" is normal data, not an error', () => {
  it('resolves a missing review to null', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { detail: 'Không tìm thấy' }));
    await expect(api.getReview('tok', 1)).resolves.toBeNull();
  });

  it('resolves a missing inference run to null', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { detail: 'Không tìm thấy' }));
    await expect(api.getInference('tok', 1)).resolves.toBeNull();
  });

  it('still raises on a real failure of the same call', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { detail: 'Lỗi máy chủ' }));
    await expect(api.getReview('tok', 1)).rejects.toMatchObject({ status: 500 });
  });
});

describe('empty responses', () => {
  it('treats 204 as success with no body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(api.deleteImage('tok', 1)).resolves.toBeUndefined();
  });
});
