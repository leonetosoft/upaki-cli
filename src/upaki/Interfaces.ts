export interface MakeUpload {
    file_id: string;
    folder_id: string;
    credentials: { AccessKeyId: string, SecretAccessKey: string, SessionToken: string, Expiration: string };
    key: string;
    bucket: string;
    region: string;
}