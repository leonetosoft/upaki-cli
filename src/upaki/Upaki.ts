import { S3Stream, S3StreamEvents } from './S3Stream';
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
import * as proxy from 'proxy-agent';
import { UpakiObject, UpakiUploadProgress, GeSignedUrl, MakeUpload, UpakiArchiveList, UpakiPathInfo, UpakiUserProfile, UPAKI_DEVICE_TYPE, DeviceAuthResponse, S3StreamSessionDetails, UpakiProxyConfig, UpakiCertificate, DocumentStatisticsBody, DocumentStatisticResponse } from './interfaceApi';

export interface UploadEvents {
    emit(event: 'error', error: string | Error | AWS.AWSError | { code: string, err: any, details: { Etag: string, file_id: string, folder_id: string } }): boolean;
    on(event: 'error', listener: (result: string | Error | AWS.AWSError | { code: string, err: any, details: { Etag: string, file_id: string, folder_id: string } }) => void): this;

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
    static PROXY_CONFIG: string;
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

    public async getDocumentStatistics({ dia, mes, ano, useDeviceId }: DocumentStatisticsBody): Promise<RestRequest.WSRespose<DocumentStatisticResponse>> {
        let body = {
            dia,
            mes,
            ano,
            useDeviceId
        };

        return await RestRequest.POST<DocumentStatisticResponse>('user/getDocumentStatistics', body);
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

    public async getPath(folderId: string) {
        let body = {
            folder_id: folderId,
            type: 1
        };

        return await RestRequest.POST<UpakiPathInfo[]>('user/getPath', body);
    }

    public async getUserProfile() {
        let body = {};
        return await RestRequest.GET<UpakiUserProfile>('user/getUserProfile', body);
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

    public async listAvailableSignatures() {
        return await RestRequest.GET<UpakiCertificate[]>('cert/listAvailableSignatures', {});
    }

    public async signFile({ signatureId, fileId }: { signatureId: string, fileId: string }) {
        let body = {
            signatureId: signatureId,
            fileId: fileId
        };

        return await RestRequest.POST<{}>('cert/signFile', body);
    }

    async CompleteUpload(file_id): Promise<any> {
        let body = {
            file_id: file_id
        };

        let makePost = await RestRequest.POST<any>('user/onCompleteUpload', body);
        return makePost.data;
    }

    private async ReadFile(path) {
        let size = await Util.getFileSize(path);
        try {
            if (size <= 1048576) {
                return fs.readFileSync(path);
            } else {
                return fs.createReadStream(path);
            }
        } catch (error) {
            throw error;
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

    static UpdateProxyAgent(proxyConf: UpakiProxyConfig): string {
        let conf = proxyConf.PROXY_PASS && proxyConf.PROXY_PASS !== '' ?
            `${proxyConf.PROXY_PROTOCOL}://${proxyConf.PROXY_USER}:${proxyConf.PROXY_PASS}@${proxyConf.PROXY_SERVER}:${proxyConf.PROXY_PORT}` :
            `${proxyConf.PROXY_PROTOCOL}://${proxyConf.PROXY_SERVER}:${proxyConf.PROXY_PORT}`;

        //const r = request.defaults({'proxy': conf})

        Upaki.PROXY_CONFIG = conf;

        AWS.config.update({
            httpOptions: {
                agent: proxy(conf) as any
            }
        });

        return conf;
    }

    /**
     * Envia um arquivo simples
     * 
     * @param localPath 
     * @param cloudPath 
     * @param meta 
     */
    async Upload(localPath: string | Buffer, cloudPath: string, meta = {}, lastModify = undefined): Promise<UploadEvents> {
        var etag = await Util.Etagv2(localPath); // se passar por aqui eh consistente para enviar

        let size = !Buffer.isBuffer(localPath) ? await Util.getFileSize(localPath) : localPath.byteLength;
        let bytesSend = !Buffer.isBuffer(localPath) ? await this.ReadFile(localPath) : localPath;
        let credentials = await this.MakeUpload(size, cloudPath, meta, lastModify);


        let s3 = new AWS.S3({
            accessKeyId: credentials.credentials.AccessKeyId,
            secretAccessKey: credentials.credentials.SecretAccessKey,
            sessionToken: credentials.credentials.SessionToken,
            ...(credentials.endpoint ? { endpoint: `https://s3.${credentials.endpoint}` } : {}),
            httpOptions: { timeout: 0 }
        });

        let body = bytesSend;
        let params = {
            Body: body,
            Bucket: credentials.bucket,
            Key: credentials.key,
            ServerSideEncryption: 'AES256',
            Metadata: {
                myMD5: etag
            }
        };

        let emitter: UploadEvents = new UploadEvents();

        let putRequest = s3.putObject(params);

        putRequest.on('httpUploadProgress', (evt) => {
            emitter.emit('progress', evt)
        }).send(async (err, data) => {
            if (err) {
                emitter.emit('error', err);
            } else {
                if (!Buffer.isBuffer(localPath) && !fs.existsSync(localPath)) {
                    emitter.emit('error', new Error('File removed !!!'));
                }
                else if (etag === data.ETag) {
                    emitter.emit('error', new Error('Checksum error, arquivo corrompido no envio'));
                } else {
                    // this.CompleteUpload(credentials.file_id);
                    // emitter.emit('uploaded', { Etag: data.ETag.replace(/"/g, ''), file_id: credentials.file_id, folder_id: credentials.folder_id });

                    try {
                        await this.CompleteUpload(credentials.file_id);
                        emitter.emit('uploaded', { Etag: data.ETag.replace(/"/g, ''), file_id: credentials.file_id, folder_id: credentials.folder_id });
                    } catch (errorComplete) {
                        emitter.emit('error', { code: 'COMPLETE_UPLOAD_ERROR', err: errorComplete, details: { Etag: data.ETag.replace(/"/g, ''), file_id: credentials.file_id, folder_id: credentials.folder_id } });
                    }
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
    async MultipartUploadManaged(credentials: MakeUpload, localPath: string, session: S3StreamSessionDetails, config: { maxPartSize: number; concurrentParts: number, uploadTimeout: number }): Promise<S3StreamEvents> {
        var etag = await Util.Etagv2(localPath); // etag vem primeiro porque pode ocorrer um erro na leitura das informacoes
        var read = fs.createReadStream(localPath);
        //var compress = zlib.createGzip();

        let upStream = new S3Stream(new AWS.S3({
            /* region: credentials.region,*/
            correctClockSkew: true,
            accessKeyId: credentials.credentials.AccessKeyId,
            secretAccessKey: credentials.credentials.SecretAccessKey,
            sessionToken: credentials.credentials.SessionToken,
            ...(credentials.endpoint ? { endpoint: `https://s3.${credentials.endpoint}` } : {}),
            httpOptions: { timeout: config.uploadTimeout ? config.uploadTimeout : 0 }
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
                // REMOVIDO 20/09 upStream.getStream().destroy();
                //compress.destroy();
                // REMOVIDO 20/09 read.destroy();
                // read.close();
                // REMOVIDO 20/0 read = null;
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
    async MultipartUpload(localPath: string, cloudPath: string, session: S3StreamSessionDetails, config: { maxPartSize: number; concurrentParts: number, uploadTimeout: number }, meta = {}, lastModify = undefined, compressContent = true): Promise<S3StreamEvents> {
        var etag = await Util.Etagv2(localPath); // etag vem primeiro porque pode ocorrer um erro na leitura das informacoes
        let credentials = await this.MakeUpload(await Util.getFileSize(localPath), cloudPath, meta, lastModify);

        var read = fs.createReadStream(localPath);
        var compress = zlib.createGzip();
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
            /* region: credentials.region,*/
            accessKeyId: credentials.credentials.AccessKeyId,
            secretAccessKey: credentials.credentials.SecretAccessKey,
            sessionToken: credentials.credentials.SessionToken,
            ...(credentials.endpoint ? { endpoint: `https://s3.${credentials.endpoint}` } : {}),
            httpOptions: { timeout: config.uploadTimeout ? config.uploadTimeout : 0 }
        }), session);

        let opts: AWS.S3.Types.CreateMultipartUploadRequest;
        opts = {
            Bucket: credentials.bucket,
            Key: credentials.key,
            ServerSideEncryption: 'AES256',
            Metadata: {
                myMD5: etag
            }
        }

        if (compressContent) {
            opts.ContentType = 'application/octet-stream';
            opts.ContentEncoding = 'gzip';
        }

        let upload = upStream.Upload(/*{
            Bucket: credentials.bucket,
            Key: credentials.key,
            ServerSideEncryption: 'AES256',
            ContentType: "application/octet-stream",
            ContentEncoding: 'gzip',
            Metadata: {
                myMD5: etag
            }
        }*/opts);

        // Optional configuration
        upStream.setMaxPartSize(config.maxPartSize); // 20 MB
        upStream.setConcurrentParts(config.concurrentParts);

        upload.on('completeUpload', async (details) => {
            try {
                await this.CompleteUpload(credentials.file_id);
                upload.emit('uploaded', { Etag: details.ETag.replace(/"/g, ''), file_id: credentials.file_id, folder_id: credentials.folder_id });
            } catch (error) {
                upload.emit('error', { code: 'COMPLETE_UPLOAD_ERROR', err: error, details: { Etag: details.ETag.replace(/"/g, ''), file_id: credentials.file_id, folder_id: credentials.folder_id } });
            }
        });

        upload.on('error', async (err) => {
            try {
                if (err.code === 'EXPIRED_TOKEN') {
                    let newCredentials = await this.MakeUpload(await Util.getFileSize(localPath), cloudPath, meta);
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
                //compress.unpipe(upStream.getStream());
                //read.unpipe(compress);
                //upStream.getStream().destroy();
                //compress.destroy();
                //read.destroy();
                // read.close();
                //read = null;
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
        if (compressContent) {
            read.pipe(compress).pipe(upStream.getStream());
        } else {
            read.pipe(upStream.getStream());
        }
        return upload;

    }
}