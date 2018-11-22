import { S3Stream, S3StreamSessionDetails, S3StreamEvents } from './S3Stream';
import { UpakiCredentials } from './../config/env';
// import { MakeUpload, GeSignedUrl, DeviceAuthResponse, UpakiArchiveList, UpakiPathInfo, UPAKI_DEVICE_TYPE, UpakiObject } from './Interfaces';
import { Util } from "../util/Util";
import * as fs from 'fs';
// import * as s3Stream from '../lib/s3-upload-stream';
import { RestRequest } from "../request/RestRequest";
import * as AWS from 'aws-sdk';
import * as zlib from 'zlib';
import * as events from 'events';
import { Environment } from '../config/env';
import { development } from '../config/development';

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

export interface UploadEvents {
    emit(event: 'error', error: string | Error | AWS.AWSError): boolean;
    on(event: 'error', listener: (result: string | Error | AWS.AWSError) => void): this;

    on(event: "httpUploadProgress", listener: (progress: {
        loaded: number;
        total: number;
    }) => void): this;

    emit(event: 'httpUploadProgress', progress: {
        loaded: number;
        total: number;
    }): boolean;
    //PutObjectOutput
    emit(event: 'uploaded', data: UpakiObject): boolean;
    on(event: 'uploaded', listener: (data: UpakiObject) => void): this;
    on(event: 'abort', listener: () => void): this;
    emit(event: 'abort'): boolean;
    emit(event: 'aborted'): boolean;
    on(event: 'aborted', listener: () => void): this;
    on(event: 'progress', listener: (evt: UpakiUploadProgress) => void): this;
    emit(event: 'progress', data: UpakiUploadProgress): boolean;
}

export class UploadEvents extends events.EventEmitter implements UploadEvents {

}

export class Upaki {
    constructor(credentials?: UpakiCredentials) {
        if (credentials) {
            Environment.config = development;
            Environment.config.credentials = credentials;
        }
    }

    private async MakeUrlSigned(fileId: string, forceDownload: boolean): Promise<GeSignedUrl> {
        let body = {
            file_id: fileId,
            forceDownload: forceDownload
        }

        let makePost = await RestRequest.POST<GeSignedUrl>('user/downloadFile', body);
        return makePost.data;
    }

    private async MakeUpload(size: number, cloudPath: string, meta = {}, lastModify = undefined): Promise<MakeUpload> {
        /*if (!fs.existsSync(localPath)) {
            throw new Error('Arquivo não encontrado');
        }*/

        let body = {
            path: cloudPath,
            meta: meta,
            lastModify: lastModify,
            size: /*Util.getFileSize(localPath)*/ size
        }


        let makePost = await RestRequest.POST<MakeUpload>('user/uploadFileDeviceV2', body);
        return makePost.data;
    }

    public async changeName(path: string, itemId: string, newName: string): Promise<RestRequest.WSRespose<any>> {
        let stat = fs.lstatSync(path);
        let body = {
            item_id: itemId,
            is_folder: stat.isDirectory(),
            new_name: newName
        };

        let makePost = await RestRequest.POST<any>('user/renameItem', body);
        return makePost;
    }

    public async getFiles(folderId: string, next?: string) {
        let body = {
            folder_id: folderId,
            isroot: folderId ? false : true,
            next: next,
            type: 1
        };

        return await RestRequest.POST<UpakiArchiveList>('user/getArchiveList', body);
    }

    public async getPath(folderId: string, next: string) {
        let body = {
            folder_id: folderId,
            type: 1
        };

        return await RestRequest.POST<UpakiPathInfo[]>('user/getPath', body);
    }

    public async authDevice(login, password, name, type: UPAKI_DEVICE_TYPE, so: string, deviceId = undefined) {
        let body = {
            id: deviceId,
            login: login,
            password: password,
            name: name,
            type: type,
            so: so
        };

        return await RestRequest.POST_PUBLIC<DeviceAuthResponse>('public/authDevice', body);
    }

    private async CompleteUpload(file_id): Promise<any> {
        let body = {
            file_id: file_id
        };

        let makePost = await RestRequest.POST<any>('user/onCompleteUpload', body);
        return makePost.data;
    }

    private ReadFile(path) {
        let size = Util.getFileSize(path);
        if (size <= 1048576) {
            return fs.readFileSync(path);
        } else {
            return fs.createReadStream(path);
        }
    }

    private ListFiles() {

    }

    GetSignedUrl(fileId: string, forceDownload: boolean = true) {
        return new Promise((resolve, reject) => {
            this.MakeUrlSigned(fileId, forceDownload).then(rs => {
                resolve(rs.url);
            }).catch(err => {
                reject(err);
            })
        })

    }

    /**
     * Envia um arquivo simples
     * 
     * @param localPath 
     * @param cloudPath 
     * @param meta 
     */
    async Upload(localPath: string | Buffer, cloudPath: string, meta = {}, lastModify = undefined): Promise<UploadEvents> {
        let size = !Buffer.isBuffer(localPath) ? Util.getFileSize(localPath) : localPath.byteLength;
        let bytesSend = !Buffer.isBuffer(localPath) ? this.ReadFile(localPath) : localPath;
        let credentials = await this.MakeUpload(size, cloudPath, meta, lastModify);

        let s3 = new AWS.S3({
            accessKeyId: credentials.credentials.AccessKeyId,
            secretAccessKey: credentials.credentials.SecretAccessKey,
            sessionToken: credentials.credentials.SessionToken,
        });

        let body = bytesSend;
        let params = {
            Body: body,
            Bucket: credentials.bucket,
            Key: credentials.key,
            ServerSideEncryption: 'AES256'
        };

        let emitter: UploadEvents = new UploadEvents();

        let putRequest = s3.putObject(params);

        putRequest.on('httpUploadProgress', (evt) => {
            emitter.emit('progress', evt)
        }).send((err, data) => {
            if (err) {
                emitter.emit('error', err);
            } else {
                if (!Buffer.isBuffer(localPath) && !fs.existsSync(localPath)) {
                    emitter.emit('error', new Error('File removed !!!'));
                }
                else if (Util.Etag(bytesSend) === data.ETag) {
                    emitter.emit('error', new Error('Checksum error, arquivo corrompido no envio'));
                } else {
                    this.CompleteUpload(credentials.file_id);
                    emitter.emit('uploaded', { Etag: data.ETag.replace(/"/g, ''), file_id: credentials.file_id, folder_id: credentials.folder_id });
                }
            }
        });

        emitter.on('abort', () => {
            try {
                putRequest.abort();
                emitter.emit('aborted');
            } catch (error) {
                emitter.emit('aborted');
            }
        });

        return emitter;
    }


    /**
     * Envia um arquivo de multiplas partes gerenciado pela camada superior
     * @param credentials 
     * @param localPath 
     * @param session 
     * @param config 
     */
    MultipartUploadManaged(credentials: MakeUpload, localPath: string, session: S3StreamSessionDetails, config: { maxPartSize: number; concurrentParts: number }): S3StreamEvents {
        var read = fs.createReadStream(localPath);
        var etag = Util.Etag(fs.readFileSync(localPath));
        //var compress = zlib.createGzip();

        let upStream = new S3Stream(new AWS.S3({
            correctClockSkew: true,
            accessKeyId: credentials.credentials.AccessKeyId,
            secretAccessKey: credentials.credentials.SecretAccessKey,
            sessionToken: credentials.credentials.SessionToken,
        }), session);

        let upload = upStream.Upload({
            Bucket: credentials.bucket,
            Key: credentials.key,
            ServerSideEncryption: 'AES256',/*,
            ContentType: "application/octet-stream",
            ContentEncoding: 'gzip',*/
            Metadata: {
                myMD5: etag
            }
        });

        // Optional configuration
        upStream.setMaxPartSize(config.maxPartSize); // 20 MB
        upStream.setConcurrentParts(config.concurrentParts);

        upload.on('credentials', (config: any) => {
            try {
                upStream.client.config.credentials = new AWS.Credentials({
                    accessKeyId: config.AccessKeyId,
                    secretAccessKey: config.SecretAccessKey,
                    sessionToken: config.SessionToken
                });
            } catch (error) {
                console.log(error);
            }
        });

        upload.on('abort', () => {
            upStream.Abort();
        });

        upload.on('aborted', () => {
            try {
                //compress.unpipe(upStream.getStream());
                //read.unpipe(compress);
                upStream.getStream().destroy();
                //compress.destroy();
                read.destroy();
                // read.close();
                read = null;
            } catch (error) {
                console.log(error);
            }
        });

        upload.on('pause', (pause) => {
            // Escutar chamadas de pause
            if (pause) {
                upStream.pause();
            } else {
                upStream.resume();
            }
        });

        read.pipe(upStream.getStream());
        return upload;

    }

    /**
     * Envia um arquivo de multiplas partes
     * @param localPath 
     * @param cloudPath 
     * @param session 
     * @param config 
     * @param meta 
     */
    async MultipartUpload(localPath: string, cloudPath: string, session: S3StreamSessionDetails, config: { maxPartSize: number; concurrentParts: number }, meta = {}, lastModify = undefined): Promise<S3StreamEvents> {
        let credentials = await this.MakeUpload(Util.getFileSize(localPath), cloudPath, meta, lastModify);

        var read = fs.createReadStream(localPath);
        var compress = zlib.createGzip();
        var etag = Util.Etag(fs.readFileSync(localPath));
        /*let upStream = s3Stream(new AWS.S3({
            accessKeyId: credentials.credentials.AccessKeyId,
            secretAccessKey: credentials.credentials.SecretAccessKey,
            sessionToken: credentials.credentials.SessionToken,
        }));

        let upload = upStream.upload({
            "Bucket": credentials.bucket,
            "Key": credentials.key,
            ServerSideEncryption: 'AES256',
            ContentType: "application/octet-stream",
            ContentEncoding: 'gzip',
        }, session);*/

        let upStream = new S3Stream(new AWS.S3({
            correctClockSkew: true,
            accessKeyId: credentials.credentials.AccessKeyId,
            secretAccessKey: credentials.credentials.SecretAccessKey,
            sessionToken: credentials.credentials.SessionToken,
        }), session);

        let upload = upStream.Upload({
            Bucket: credentials.bucket,
            Key: credentials.key,
            ServerSideEncryption: 'AES256',
            ContentType: "application/octet-stream",
            ContentEncoding: 'gzip',
            Metadata: {
                myMD5: etag
            }
        });

        // Optional configuration
        upStream.setMaxPartSize(config.maxPartSize); // 20 MB
        upStream.setConcurrentParts(config.concurrentParts);

        upload.on('completeUpload', (details) => {
            try {
                this.CompleteUpload(credentials.file_id);
                upload.emit('uploaded', { Etag: details.ETag.replace(/"/g, ''), file_id: credentials.file_id, folder_id: credentials.folder_id });
            } catch (error) {

            }
        });

        upload.on('error', async (err) => {
            try {
                if (err.code === 'EXPIRED_TOKEN') {
                    let newCredentials = await this.MakeUpload(Util.getFileSize(localPath), cloudPath, meta);
                    /*upStream.client = new AWS.S3({
                        accessKeyId: newCredentials.credentials.AccessKeyId,
                        secretAccessKey: newCredentials.credentials.SecretAccessKey,
                        sessionToken: newCredentials.credentials.SessionToken,
                    });*/

                    upStream.client.config.credentials = new AWS.Credentials({
                        accessKeyId: newCredentials.credentials.AccessKeyId,
                        secretAccessKey: newCredentials.credentials.SecretAccessKey,
                        sessionToken: newCredentials.credentials.SessionToken
                    });
                }
            } catch (error) {
                upStream.abortUpload('Failed to upload a part to S3: ' + JSON.stringify(error));
            }
        });

        upload.on('abort', () => {
            upStream.Abort();
        });

        upload.on('aborted', () => {
            try {
                compress.unpipe(upStream.getStream());
                read.unpipe(compress);
                upStream.getStream().destroy();
                compress.destroy();
                read.destroy();
                // read.close();
                read = null;
            } catch (error) {
                console.log(error);
            }
        });

        upload.on('pause', (pause) => {
            // Escutar chamadas de pause
            if (pause) {
                upStream.pause();
            } else {
                upStream.resume();
            }
        });

        read.pipe(compress).pipe(upStream.getStream());
        return upload;

    }
}