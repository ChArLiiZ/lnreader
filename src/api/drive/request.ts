import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  DriveCreateRequestData,
  DriveFile,
  DriveResponse,
  DriveRequestParams,
} from './types';
import { PATH_SEPARATOR } from '@api/constants';
import NativeZipArchive from '@specs/NativeZipArchive';

const BASE_URL = 'https://www.googleapis.com/drive/v3/files';
const MEDIA_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

const buildParams = (params: DriveRequestParams) => {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(pair => pair.map(encodeURIComponent).join('='))
    .join('&');
};

/**
 * Validate API response and throw on HTTP errors.
 */
async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new DriveApiError(res.status, body);
  }
  return res.json();
}

export class DriveApiError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`Drive API error ${status}: ${body}`);
    this.name = 'DriveApiError';
    this.status = status;
  }
}

/**
 * Get a valid access token; if the first attempt yields a 401 from
 * the caller, call this with forceRefresh=true to clear the cache.
 */
async function getAccessToken(forceRefresh = false): Promise<string> {
  if (forceRefresh) {
    try {
      const { accessToken: old } = await GoogleSignin.getTokens();
      await GoogleSignin.clearCachedAccessToken(old);
    } catch {
      // Ignore — just proceed to get fresh tokens
    }
  }
  const { accessToken } = await GoogleSignin.getTokens();
  return accessToken;
}

/**
 * Execute a fetch with automatic 401 retry (token refresh).
 */
async function fetchWithRetry<T>(
  buildRequest: (token: string) => Promise<Response>,
): Promise<T> {
  const token = await getAccessToken();
  const res = await buildRequest(token);
  if (res.status === 401) {
    const freshToken = await getAccessToken(true);
    const retryRes = await buildRequest(freshToken);
    return handleResponse<T>(retryRes);
  }
  return handleResponse<T>(res);
}

export const list = async (
  params: DriveRequestParams,
): Promise<DriveResponse> => {
  const effectiveParams = { ...params };
  if (!effectiveParams.fields) {
    effectiveParams.fields =
      'nextPageToken, files(id, name, description, createdTime, parents)';
  }

  return fetchWithRetry<DriveResponse>(async token => {
    const url = BASE_URL + '?' + buildParams(effectiveParams);
    return fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
  });
};

export const create = async (
  data: DriveCreateRequestData,
): Promise<DriveFile> => {
  const params: DriveRequestParams = {
    fields: 'id, name, description, createdTime, parents',
    uploadType: 'multipart',
  };
  const url =
    (data.content ? MEDIA_UPLOAD_URL : BASE_URL) + '?' + buildParams(params);
  let body: FormData | string;
  data.metadata.name = data.metadata.name.replace(/\//g, PATH_SEPARATOR);
  if (data.content) {
    body = new FormData();
    body.append('metadata', {
      string: JSON.stringify(data.metadata),
      type: 'application/json',
    } as unknown as Blob);
    if (data.metadata.mimeType === 'application/json') {
      body.append('media', {
        string: data.content,
        type: data.metadata.mimeType,
      } as unknown as Blob);
    } else {
      body.append('media', {
        name: data.metadata.name,
        uri: data.content,
        type: data.metadata.mimeType,
      } as unknown as Blob);
    }
  } else {
    body = JSON.stringify(data.metadata);
  }

  return fetchWithRetry<DriveFile>(async token =>
    fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      body,
    }),
  );
};

export const updateMetadata = async (
  fileId: string,
  fileMetaData: Partial<DriveFile>,
  oldParent?: string,
) => {
  return fetchWithRetry<DriveFile>(async token => {
    const url =
      BASE_URL +
      '/' +
      fileId +
      '?' +
      buildParams({
        addParents: fileMetaData.parents?.[0],
        removeParents: oldParent,
      });
    return fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: fileMetaData.name,
        mimeType: fileMetaData.mimeType,
      }),
    });
  });
};

export const uploadMedia = async (
  sourceDirPath: string,
): Promise<DriveFile> => {
  const accessToken = await getAccessToken();

  const params: DriveRequestParams = {
    fields: 'id, parents',
    uploadType: 'media',
  };
  const url = MEDIA_UPLOAD_URL + '?' + buildParams(params);
  const response = await NativeZipArchive.remoteZip(sourceDirPath, url, {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  });
  return JSON.parse(response);
};

export const download = async (file: DriveFile, distDirPath: string) => {
  const accessToken = await getAccessToken();
  const url = BASE_URL + '/' + file.id + '?alt=media';
  return NativeZipArchive.remoteUnzip(distDirPath, url, {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  });
};
