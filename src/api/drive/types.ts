export interface DriveFile {
  kind: string;
  mimeType?: string;
  parents: string[];
  id: string;
  name: string;
  description?: string;
  createdTime?: string;
}

/** @deprecated Use DriveResponse instead */
export type DriveReponse = DriveResponse;

export interface DriveResponse {
  nextPageToken?: string;
  kind: string;
  incompleteSearch: boolean;
  files: DriveFile[];
}

export interface DriveRequestParams {
  q?: string;
  orderBy?: string;
  pageSize?: number;
  fields?: string;
  pageToken?: string;
  uploadType?: string;
  addParents?: string;
  removeParents?: string;
}

export interface DriveCreateRequestData {
  metadata: {
    name: string;
    mimeType: string;
    description?: string;
    parents?: string[];
  };
  content?: string;
}
