import * as AWS from 'aws-sdk';
import * as events from 'events';
import * as stream from 'stream';
import { Util } from '../util/Util';
import { UpakiObject } from './Upaki';
export interface Parts {
    ETag: string, PartNumber: number;
}
export interface S3StreamSessionDetails {
    UploadId?: string;
    Parts?: Parts[];
    DataTransfered?: number;
}

export interface S3StreamEvents {
    on(event: 'completeUpload', listener: (result: AWS.S3.CompleteMultipartUploadOutput) => void): this;
    emit(event: 'completeUpload', result: AWS.S3.CompleteMultipartUploadOutput): boolean;

    emit(event: 'error', error: { code: string, err: Error }): boolean;
    on(event: 'error', listener: (result: { code: string, err: Error }) => void): this;

    emit(event: 'ready', uploadId: string): boolean;
    on(event: 'ready', listener: (uploadId: string) => void): this;

    emit(event: 'credentials', config: AWS.S3.ClientConfiguration): boolean;
    on(event: 'credentials', listener: (config: AWS.S3.ClientConfiguration) => void): this;

    emit(event: 'part', partDetails: { ETag: string, PartNumber: number, receivedSize: number, uploadedSize: number }): boolean;
    on(event: 'part', listener: (partDetails: { ETag: string, PartNumber: number, receivedSize: number, uploadedSize: number }) => void): this;

    emit(event: 'pause', pause: boolean): boolean;
    on(event: 'pause', listener: (pause: boolean) => void): this;

    emit(event: 'dbug', pause: string): boolean;
    on(event: 'dbug', listener: (pause: string) => void): this;

    emit(event: 'pausing', pendingParts: number): boolean;
    on(event: 'pausing', listener: (pendingParts: number) => void): this;

    emit(event: 'paused', session: { UploadId: string, Parts: Parts[], uploadedSize: number }): boolean;
    on(event: 'paused', listener: (partDetails: { UploadId: string, Parts: Parts[], uploadedSize: number }) => void): this;

    emit(event: 'resume'): boolean;
    on(event: 'resume', listener: () => void): this;

    emit(event: 'abort'): boolean;
    on(event: 'abort', listener: () => void): this;

    emit(event: 'aborted'): boolean;
    on(event: 'aborted', listener: () => void): this;

    emit(event: 'retry'): boolean;
    on(event: 'retry', listener: (partNumber: number) => void): this;
    emit(event: 'retrying', partNumber: number, parts: Parts[]): boolean;
    on(event: 'retrying', listener: (partNumber: number, parts: Parts[]) => void): this;

    emit(event: 'uploaded', data: UpakiObject): boolean;
    on(event: 'uploaded', listener: (data: UpakiObject) => void): this;
}

export class S3StreamEvents extends events.EventEmitter implements S3StreamEvents {

}

export class S3Stream {
    multipartUploadID: string;
    partNumber: number;
    partIds: Parts[];
    receivedSize: number;
    uploadedSize: number;
    uploadWithSession: boolean;

    started = false;
    paused = false;
    pendingParts = 0;
    concurrentPartThreshold = 1;
    private aborted = false;

    receivedBuffers = [];
    receivedBuffersLength = 0;
    partSizeThreshold = 5242880;

    requests: [{ request: AWS.Request<AWS.S3.Types.UploadPartOutput, AWS.AWSError>, id: string }];

    private ws: stream.Writable;
    externalEvent: S3StreamEvents;
    e: events.EventEmitter;

    client: AWS.S3;
    destinationDetails: AWS.S3.Types.CreateMultipartUploadRequest;

    constructor(client: AWS.S3, sessionDetails: S3StreamSessionDetails = {}) {
        this.multipartUploadID = sessionDetails.UploadId ? sessionDetails.UploadId : null;
        this.partNumber = sessionDetails.Parts ? (sessionDetails.Parts.length) : 1;
        this.partIds = sessionDetails.Parts || [];
        this.receivedSize = sessionDetails.DataTransfered || 0;
        this.uploadedSize = sessionDetails.DataTransfered || 0;
        this.uploadWithSession = sessionDetails.UploadId ? true : false;
        this.client = client;

        if (sessionDetails.Parts) {
            this.removeNull();
        }

        // Create the writable stream interface.
        this.ws = new stream.Writable({
            highWaterMark: 4194304 // 4 MB
        });
    }

    getStream(): stream.Writable {
        return this.ws;
    }

    closeStream() {
        this.ws = undefined;
    }

    removeNull() {
        if (this.partIds) {
            this.partIds = this.partIds.filter(el => el !== null);
        }
    }

    addRequestUpload(request: AWS.Request<AWS.S3.Types.UploadPartOutput, AWS.AWSError>, Etag: string) {
        if (!this.requests) {
            this.requests = [{ id: Etag, request: request }];
        } else {
            this.requests.push({ id: Etag, request: request });
        }
        this.externalEvent.emit('dbug', `Request add, id = ${Etag}`);
    }

    closeRequests(id?: string) {

        if (id) {
            this.externalEvent.emit('dbug', `Request close request, id = ${id}`);
            let index = this.requests.findIndex(req => req.id === id);
            if (index !== -1) {
                this.externalEvent.emit('dbug', `Request close request, REMOVED id = ${id} index=${index}`);
                this.requests.splice(index, 1);
            } else {
                this.externalEvent.emit('dbug', `Request id = ${id} not found in request array`);
            }
        } else {
            if (this.requests) {
                // abortar todas
                this.requests.forEach(req => {
                    try {
                        this.externalEvent.emit('dbug', `Aborting request, id = ${req.id}`);
                        req.request.abort();
                        this.externalEvent.emit('dbug', `Aborting request, id = ${req.id} OK`);
                    } catch (error) {

                    }
                });
                this.requests = undefined;
            } else {
                this.externalEvent.emit('dbug', `Request is empty, id = ${id}`);
            }
        }
    }

    Abort() {
        this.aborted = true;
        this.closeRequests();
        // this.closeStream();
        this.externalEvent.emit('aborted');
        // this.externalEvent.emit('dbug', `Aborting stream`);
        /*try {
            this.ws.destroy(new Error('Operation aborted!'));
        } catch (error) {
            console.log(error);
        }*/
    }

    Upload(destinationDetails: AWS.S3.Types.CreateMultipartUploadRequest): S3StreamEvents {
        this.destinationDetails = destinationDetails;
        this.e = new events.EventEmitter();
        this.externalEvent = new S3StreamEvents();

        let t = 0;
        // Handler to receive data and upload it to S3.
        this.ws._write = (incomingBuffer, enc, next) => {
            t += incomingBuffer.length;
            let write = () => {
                this.absorbBuffer(incomingBuffer);

                if (this.receivedBuffersLength < this.partSizeThreshold)
                    return next(); // Ready to receive more data in _write.

                // We need to upload some data
                this.uploadHandler(next);
            }

            // abortar
            if (this.aborted) {
                return;
            }

            // Pause/resume check #1 out of 2:
            //   Block incoming writes immediately on pause.
            if (this.paused)
                this.e.once('resume', write);
            else
                write();

        };


        // Overwrite the end method so that we can hijack it to flush the last part and then complete
        // the multipart upload
        (<any>this.ws).originalEnd = this.ws.end;
        (<any>this.ws.end) = (Part, encoding, callback) => {
            if (this.aborted) {
                this.externalEvent.emit('dbug', `Stream ended!`);
                return;
            }

            (<any>this.ws).originalEnd(Part, encoding, () => {
                if (Part)
                    this.absorbBuffer(Part);

                // Upload any remaining data
                var uploadRemainingData = () => {
                    if (this.receivedBuffersLength > 0) {
                        this.uploadHandler(uploadRemainingData);
                        return;
                    }

                    if (this.pendingParts > 0) {
                        setTimeout(uploadRemainingData, 50); // Wait 50 ms for the pending uploads to finish before trying again.
                        return;
                    }

                    this.completeUpload();
                };

                uploadRemainingData();

                if (typeof callback == 'function')
                    callback();
            });
        };

        return this.externalEvent;
    }

    // Turn all the individual parts we uploaded to S3 into a finalized upload.
    completeUpload() {
        // There is a possibility that the incoming stream was empty, therefore the MPU never started
        // and cannot be finalized.
        if (this.aborted) {
            return;
        }
        if (this.multipartUploadID) {
            this.client.completeMultipartUpload({
                Bucket: this.destinationDetails.Bucket,
                Key: this.destinationDetails.Key,
                UploadId: this.multipartUploadID,
                MultipartUpload: {
                    Parts: this.partIds
                }
            }, (err, result) => {
                if (err) {

                    if (err.code === 'TimeoutError' || err.code === 'RequestTimeout') {
                        this.externalEvent.emit('error', { code: 'TIMEOUT_ERROR', err: new Error('Timeout error.') });
                    } else if (err.code === 'NetworkingError') {
                        this.externalEvent.emit('error', { code: 'NETWORKING_ERROR', err: new Error('Networking error.') });
                    } else if (err.code === 'CredentialsError' || err.code === 'InvalidAccessKeyId' || err.code === 'ExpiredToken' || err.code === 'InvalidToken' || err.code === 'CredentialsNotSupported') {
                        this.externalEvent.emit('error', { code: 'EXPIRED_TOKEN', err: new Error('Token expired error.') });
                    } else {
                        this.externalEvent.emit('error', { code: 'UNKNOW_ERROR', err: new Error(err.code) });
                        this.abortUpload('Failed to complete the multipart upload on S3: ' + JSON.stringify(err));
                    }

                    this.externalEvent.once('retry', () => {
                        try {
                            this.completeUpload();
                            this.externalEvent.emit('retrying', this.partNumber, this.partIds);
                        } catch (error) {
                            this.externalEvent.emit('error', { code: 'RETRY_ERROR', err: error });
                        }
                    });

                    this.abortUpload('Failed to complete the multipart upload on S3: ' + JSON.stringify(err));
                }
                else {
                    // Emit both events for backwards compatibility, and to follow the spec.
                    // this.ws.emit('uploaded', result);
                    // this.ws.emit('finish', result);
                    this.externalEvent.emit('completeUpload', result);
                    this.started = false;
                }
            }
            );
        }
    };

    // When a fatal error occurs abort the multipart upload
    abortUpload(rootError) {
        this.client.abortMultipartUpload({
            Bucket: this.destinationDetails.Bucket,
            Key: this.destinationDetails.Key,
            UploadId: this.multipartUploadID
        }, (abortError) => {
            if (abortError)
                this.externalEvent.emit('error', { code: 'FATAL_ERROR', err: new Error(rootError + '\n Additionally failed to abort the multipart upload on S3: ' + abortError) });
            else
                this.externalEvent.emit('error', { code: 'ABORT_MULTIPART', err: new Error(rootError + '\n Additionally failed to abort the multipart upload on S3: ' + abortError) });
        }
        );
    }

    createMultipartUpload() {
        if (this.aborted) {
            return;
        }
        this.client.createMultipartUpload(this.destinationDetails, (err, data) => {
            if (err) {
                if (err.code === 'TimeoutError' || err.code === 'RequestTimeout') {
                    this.externalEvent.emit('error', { code: 'TIMEOUT_ERROR', err: new Error('Timeout error.') });
                } else if (err.code === 'NetworkingError' || err.code === 'UnknownEndpoint') {
                    this.externalEvent.emit('error', { code: 'NETWORKING_ERROR', err: new Error('Networking error.') });
                } else if (err.code === 'CredentialsError' || err.code === 'InvalidAccessKeyId' || err.code === 'ExpiredToken' || err.code === 'InvalidToken' || err.code === 'CredentialsNotSupported') {
                    this.externalEvent.emit('error', { code: 'EXPIRED_TOKEN', err: new Error('Token expired error.') });
                } else {
                    this.externalEvent.emit('error', { code: 'UNKNOW_ERROR', err: new Error(err.code) });
                }

                this.externalEvent.once('retry', () => {
                    try {
                        this.createMultipartUpload();
                        this.externalEvent.emit('retrying', this.partNumber, this.partIds);
                    } catch (error) {
                        this.externalEvent.emit('error', { code: 'RETRY_ERROR', err: error });
                    }
                });

                this.externalEvent.emit('error', { code: 'CREATE_MULTIPART_ERROR', err: new Error(err.code + ' - ' + err.message) });

            } else {
                this.multipartUploadID = data.UploadId;
                // this.externalEvent.emit('uploadId', this.multipartUploadID);
                this.externalEvent.emit('ready', this.multipartUploadID);
                this.e.emit('ready'); // Internal event
            }
        }
        );
    };

    // Concurrently upload parts to S3.
    private uploadHandler(next) {

        let upload = () => {
            // Pause/resume check #2 out of 2:
            //   Block queued up parts until resumption.
            let uploadNow = () => {
                this.pendingParts++;
                this.flushPart((partDetails) => {
                    --this.pendingParts;
                    if (partDetails) {
                        this.e.emit('part'); // Internal event
                        this.externalEvent.emit('part', partDetails); // External event

                        // if we're paused and this was the last outstanding part,
                        // we can notify the caller that we're really paused now.
                        if (this.paused && this.pendingParts === 0)
                            this.notifyPaused();
                    } else {
                        // console.log('ignorada um arranjo de buffers');
                        this.externalEvent.emit('dbug', `Ignorado um arranjo de buffers`);
                        this.e.emit('part'); // Internal event
                    }
                });
                next();
            }

            if (this.paused)
                this.e.once('resume', uploadNow);
            else {
                uploadNow();
            }
            //uploadNow();
        };
        // If this is the first part, and we're just starting,
        // but we have a multipartUploadID, then we're beginning
        // a resume and can fire the 'ready' event externally.
        if (this.multipartUploadID && !this.started)
            this.externalEvent.emit('ready', this.multipartUploadID);

        this.started = true;

        if (this.pendingParts < this.concurrentPartThreshold) {
            // Has the MPU been created yet?
            if (this.multipartUploadID)
                upload(); // Upload the part immediately.
            else {
                this.e.once('ready', upload); // Wait until multipart upload is initialized.
                this.createMultipartUpload();
            }
        }
        else {
            // Block uploading (and receiving of more data) until we upload
            // some of the pending parts
            this.e.once('part', upload);
        }
    };


    // Absorb an incoming buffer from _write into a buffer queue
    private absorbBuffer(incomingBuffer) {
        this.receivedBuffers.push(incomingBuffer);
        this.receivedBuffersLength += incomingBuffer.length;
    };

    // Ask the stream to pause - will allow existing
    // part uploads to complete first.
    pause() {
        // if already mid-pause, this does nothing
        if (this.paused) return false;

        // if there's no active upload, this does nothing
        if (!this.started) return false;

        this.paused = true;
        // give caller how many parts are mid-upload
        this.externalEvent.emit('pausing', this.pendingParts);

        // if there are no parts outstanding, declare the stream
        // paused and return currently sent part details.
        if (this.pendingParts === 0)
            this.notifyPaused();

        // otherwise, the 'paused' event will get sent once the
        // last part finishes uploading.

        return true;
    }


    resume() {
        // if we're not paused, this does nothing
        if (!this.paused) return false;

        this.paused = false;
        this.e.emit('resume'); // internal event
        this.externalEvent.emit('resume'); // external event

        return true;
    };


    private notifyPaused() {
        this.externalEvent.emit('paused', {
            UploadId: this.multipartUploadID,
            Parts: this.partIds,
            uploadedSize: this.uploadedSize
        });
    };

    getMaxPartSize() {
        return this.partSizeThreshold;
    };

    setMaxPartSize(partSize) {
        if (partSize < 5242880)
            partSize = 5242880;

        this.partSizeThreshold = partSize;
    }

    // Set the maximum amount of data that we will keep in memory before flushing it to S3 as a part
    // of the multipart upload
    setConcurrentParts(parts) {
        if (parts < 1)
            parts = 1;

        this.concurrentPartThreshold = parts;
        //return ws; [OLHAR]
    };

    getConcurrentParts() {
        return this.concurrentPartThreshold;
    };

    private EtagCheck(Etag) {
        return this.partIds.findIndex(el => el.ETag === Etag) !== -1;
    }

    // Take a list of received buffers and return a combined buffer that is exactly
    // partSizeThreshold in size.
    private preparePartBuffer() {
        // Combine the buffers we've received and reset the list of buffers.
        // Combine os buffers que recebemos e redefina a lista de buffers.
        var combinedBuffer = Buffer.concat(this.receivedBuffers, this.receivedBuffersLength);
        this.receivedBuffers.length = 0; // Trick to reset the array while keeping the original reference
        this.receivedBuffersLength = 0;

        if (combinedBuffer.length > this.partSizeThreshold) {
            // The combined buffer is too big, so slice off the end and put it back in the array.
            // O buffer combinado é muito grande, então corte o final e coloque-o de volta no array.
            var remainder = new Buffer(combinedBuffer.length - this.partSizeThreshold);
            combinedBuffer.copy(remainder, 0, this.partSizeThreshold);
            this.receivedBuffers.push(remainder);
            this.receivedBuffersLength = remainder.length;

            // Return the perfectly sized part.
            var uploadBuffer = new Buffer(this.partSizeThreshold);
            combinedBuffer.copy(uploadBuffer, 0, 0, this.partSizeThreshold);
            return uploadBuffer;
        }
        else {
            // It just happened to be perfectly sized, so return it.
            return combinedBuffer;
        }
    };

    private flushPart(callback, partBuffer = this.preparePartBuffer(), retry = false) {
        //var partBuffer = this.preparePartBuffer();
        this.removeNull();

        if (this.aborted) {
            this.externalEvent.emit('dbug', `Request flush part aborted`);
            return;
        }
        var etagObject = Util.Etag(partBuffer);
        if (!retry) {
            this.externalEvent.emit('dbug', `Etag part ${etagObject}`);
            if (this.uploadWithSession && this.EtagCheck(etagObject)) {
                callback(null);
                this.externalEvent.emit('dbug', `Etag part ${etagObject} already sended! next()`);
                return;
            } else {
                this.externalEvent.emit('dbug', `Etag part ${etagObject} continue upload!`);
                this.uploadWithSession = false;
            }
            this.partNumber++;
            this.receivedSize += partBuffer.length;
        }
        let localPartNumber = this.partNumber;

        let reqUploadPart = this.client.uploadPart({
            Body: partBuffer,
            Bucket: this.destinationDetails.Bucket,
            Key: this.destinationDetails.Key,
            UploadId: this.multipartUploadID,
            PartNumber: localPartNumber,
        }, (err, result) => {
            if (etagObject !== undefined) {
                try {
                    this.closeRequests(etagObject);
                } catch (error) {
                }
            }

            if (err) {
                try {
                    this.closeRequests();
                } catch (error) {
                }
                if (err.code === 'NoSuchUpload') {
                    this.externalEvent.emit('error', { code: 'UPLOAD_ID_NO_FOUND', err: new Error('Upload id not found or completed.') });
                }
                else if (err.code === 'RequestAbortedError') {
                    this.externalEvent.emit('error', { code: 'ABORT_REQUEST', err: new Error(err.message) });
                }
                else if (err.code === 'TimeoutError' || err.code === 'RequestTimeout') {
                    this.externalEvent.emit('error', { code: 'TIMEOUT_ERROR', err: new Error('Timeout error.') });
                } else if (err.code === 'NetworkingError' || err.code === 'NetworkingError' || err.code === 'UnknownEndpoint') {
                    this.externalEvent.emit('error', { code: 'NETWORKING_ERROR', err: new Error('Networking error.') });
                } else if (err.code === 'CredentialsError' || err.code === 'InvalidAccessKeyId' || err.code === 'ExpiredToken' || err.code === 'InvalidToken' || err.code === 'CredentialsNotSupported') {
                    this.externalEvent.emit('error', { code: 'EXPIRED_TOKEN', err: new Error('Token expired error.') });
                }
                else {
                    this.abortUpload('Failed to upload a part to S3: ' + JSON.stringify(err));
                }

                this.externalEvent.once('retry', () => {
                    try {
                        this.flushPart(callback, partBuffer, true);
                        this.externalEvent.emit('retrying', this.partNumber, this.partIds);
                    } catch (error) {
                        this.externalEvent.emit('error', { code: 'RETRY_ERROR', err: error });
                    }
                });
            }
            else if (etagObject !== result.ETag.replace(/"/g, '')) {
                this.externalEvent.emit('error', { code: 'CHECKSUM_ERROR', err: new Error('Error in checksum of file.') });

                this.externalEvent.once('retry', () => {
                    try {
                        this.flushPart(callback, partBuffer, true);
                        this.externalEvent.emit('retrying', this.partNumber, this.partIds);
                    } catch (error) {
                        this.externalEvent.emit('error', { code: 'RETRY_ERROR', err: error });
                    }
                });
            }
            else {
                this.uploadedSize += partBuffer.length;
                this.partIds[localPartNumber - 1] = {
                    ETag: result.ETag.replace(/"/g, ''),
                    PartNumber: localPartNumber
                };

                this.removeNull();

                callback({
                    ETag: result.ETag.replace(/"/g, ''),
                    PartNumber: localPartNumber,
                    receivedSize: this.receivedSize,
                    uploadedSize: this.uploadedSize
                });
            }
        }).on('httpUploadProgress', (progress) => {
            this.externalEvent.emit('dbug', `Part ${etagObject} number ${localPartNumber} loaded=${progress.loaded} total=${progress.total} percent=${Math.round(progress.loaded / progress.total * 100)}%`);
        });

        this.addRequestUpload(reqUploadPart, etagObject);
    };
}