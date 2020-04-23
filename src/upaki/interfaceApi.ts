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
    endpoint: string;
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

export interface UpakiProxyConfig {
    PROXY_SERVER: string;
    PROXY_PORT: number;
    PROXY_USER: string;
    PROXY_PASS: string;
    PROXY_PROTOCOL: 'http' | 'https';
}

export interface UpakiCertificate {
    business_id: string;
    certificate_signatures: UpakiSignatures[];
    cn: string;
    file_id: string;
    id: string;
    info: string;
    password: string;
}

export interface UpakiSignatures {
    autor: string;
    id: string;
}

export interface DocumentStatisticsBody {
    dia?: string|number;
    mes?: string|number;
    ano?: string|number;
    useDeviceId: boolean;
}

export interface DocumentStatisticResponse {
    dia: {
        dia: number;
        total: number;
        totalDocs: number;
    },
    mes: {
        dia: number;
        total: number;
        totalDocs: number;
    }
}