import { S3Stream, S3StreamSessionDetails, S3StreamEvents } from './S3Stream';
import { UpakiCredentials } from './../config/env';
import { MakeUpload } from './Interfaces';
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

export interface UpakiObject {
    file_id: string;
    folder_id: string;
    Etag: string;
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


    private async MakeUpload(localPath: string, cloudPath: string, meta = {}, lastModify = undefined): Promise<MakeUpload> {
        if (!fs.existsSync(localPath)) {
            throw new Error('Arquivo não encontrado');
        }

        let body = {
            path: cloudPath,
            meta: meta,
            lastModify: lastModify,
            size: Util.getFileSize(localPath)
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

    /**
     * Envia um arquivo simples
     * 
     * @param localPath 
     * @param cloudPath 
     * @param meta 
     */
    async Upload(localPath: string, cloudPath: string, meta = {}, lastModify = undefined): Promise<UploadEvents> {
        let credentials = await this.MakeUpload(localPath, cloudPath, meta, lastModify);

        let s3 = new AWS.S3({
            accessKeyId: credentials.credentials.AccessKeyId,
            secretAccessKey: credentials.credentials.SecretAccessKey,
            sessionToken: credentials.credentials.SessionToken,
        });

        let body = this.ReadFile(localPath);
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
                if (!fs.existsSync(localPath)) {
                    emitter.emit('error', new Error('File removed !!!'));
                }
                else if (Util.Etag(fs.readFileSync(localPath)) === data.ETag) {
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
            ServerSideEncryption: 'AES256'/*,
            ContentType: "application/octet-stream",
            ContentEncoding: 'gzip',*/
        });

        // Optional configuration
        upStream.setMaxPartSize(config.maxPartSize); // 20 MB
        upStream.setConcurrentParts(config.concurrentParts);

        /*upload.on('completeUpload', (details) => {
            try {
                this.CompleteUpload(credentials.file_id);
                upload.emit('uploaded', { Etag: details.ETag.replace(/"/g, ''), file_id: credentials.file_id, folder_id: credentials.folder_id });
            } catch (error) {

            }
        });*/

        /*upload.on('error', async (err) => {
            try {
                if (err.code === 'EXPIRED_TOKEN') {
                    let newCredentials = await this.MakeUpload(localPath, cloudPath, meta);
                    upStream.client = new AWS.S3({
                        accessKeyId: newCredentials.credentials.AccessKeyId,
                        secretAccessKey: newCredentials.credentials.SecretAccessKey,
                        sessionToken: newCredentials.credentials.SessionToken,
                    });
                }
            } catch (error) {
                upStream.abortUpload('Failed to upload a part to S3: ' + JSON.stringify(error));
            }
        });*/

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
        let credentials = await this.MakeUpload(localPath, cloudPath, meta, lastModify);

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
                    let newCredentials = await this.MakeUpload(localPath, cloudPath, meta);
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