export interface Parts {
    ETag: string, PartNumber: number;
}
export interface S3StreamSessionDetails {
    UploadId?: string;
    Parts?: Parts[];
    DataTransfered?: number;
}

export interface UpakiUploadProgress {
    loaded: number, total: number
}

export interface MakeUpload {
    file_id: string;
    folder_id: string;
    credentials: { AccessKeyId: string, SecretAccessKey: string, SessionToken: string, Expiration: string };
    key: string;
    bucket: string;
    region: string;
}

export interface GeSignedUrl {
    filename: string;
    url: string;
}

export interface DeviceAuthResponse {
    deviceId: string;
    userId: string;
    credentialKey: string;
    secretToken: string;
}

export enum UPAKI_DEVICE_TYPE {
    BROWSER = 1,
    DESKTOP = 2,
    MOBILE = 3
}

export interface UpakiObject {
    file_id: string;
    folder_id: string;
    Etag: string;
}

export interface UpakiIArchiveViewer {
    id: string;
    isFolder: number;
    name: string;
    is_shared: number;
    created_at: string;
    status: number;
    extension: string;
    size: number;
}

export interface UpakiArchiveList {
    list: UpakiIArchiveViewer[];
    next: string;
}

export interface UpakiPathInfo {
    index: string;
    name: string;
    id: string;
}

export interface UpakiUserProfile {
    busines_id: string;
    email: string;
    id: string;
    name: string;
    nickname: string;
    view_first_on_order: string;
    view_order_name_items: string;
    view_share_user: string;
    view_share_workgroup: string;
    view_type: string;
}