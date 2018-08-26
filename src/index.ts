import { Upaki } from './upaki/Upaki';
import { production } from './config/production';
import { development } from './config/development';
import "reflect-metadata";
import { Environment } from './config/env';
import * as AWS from 'aws-sdk';

import * as fs from 'fs';
import * as zlib from 'zlib';

console.log(process.argv);
if (process.argv.length > 0 && process.argv[2] === "--prod") {
    Environment.config = production;
} else {
    Environment.config = development;
}
async function Teste2() {
    let upaki = new Upaki();
    try {
        let upload = await upaki.Upload('./caio.pdf',
            'testeCliv3/caio.pdf');


        upload.on('progress', (progress) => {
            console.log(progress.loaded, progress.total);
        });

        upload.on('uploaded', (data) => {
            console.log(data);
        });

        upload.on('error', (err) => {
            console.log(err);
        })

    } catch (error) {
        console.log(error);
    }
}

// https://aws.amazon.com/pt/blogs/developer/announcing-the-amazon-s3-managed-uploader-in-the-aws-sdk-for-javascript/
async function Teste() {
    let upaki = new Upaki(Environment.config.credentials);

    try {
        let upload = await upaki.MultipartUpload('./type.pdf',
            'testeCliv3/type.pdf',
            /*{
                UploadId: "rTguDaNdzG7rf9mw_pQVqtbiIqx2tjXgXwF5jmG_1LNwfSdeKHSo7JwW0nN5RXElznTphZ4.VJmaxDrjw42vpUO5mPuC2aoDkB88rsPqS7ia62hczKHP6ik2aFN_DWo2bElw13l5K6YTULm1DU5XGA--",
                Parts: [
                    {
                        ETag: "2573b2a300b62aa3405b016a51364229",
                        PartNumber: 1
                    }
                ],
                DataTransfered: 5242880
            }*/undefined,
            { maxPartSize: 5242880, concurrentParts: 1 });

        // Handle errors.
        upload.on('error', function (error) {
            console.log(error);
        });

        /* Handle progress. Example details object:
           { ETag: '"f9ef956c83756a80ad62f54ae5e7d34b"',
             PartNumber: 5,
             receivedSize: 29671068,
             uploadedSize: 29671068 }
        */
        upload.on('part', function (details) {
            console.log(details);
        });

        /* Handle upload completion. Example details object:
           { Location: 'https://bucketName.s3.amazonaws.com/filename.ext',
             Bucket: 'bucketName',
             Key: 'filename.ext',
             ETag: '"bf2acbedf84207d696c8da7dbb205b9f-5"' }
        */
        upload.on('uploaded', function (details) {
            console.log(details);
        });

        upload.on('ready', function (id) {
            console.log('Id: ', id);
        })



        /*let uploadOptions = await upaki.MakeUpload('./video.webm', 'testeCliv2/video.webm');
        console.log(uploadOptions);
        AWS.config.update({
            accessKeyId: uploadOptions.credentials.AccessKeyId, secretAccessKey: uploadOptions.credentials.SecretAccessKey, sessionToken: uploadOptions.credentials.SessionToken
        });

        var body = fs.createReadStream('./video.webm').pipe(zlib.createGzip());

        var s3 = new AWS.S3({ logger: console });
        var params = {
            Body: body,
            Bucket: uploadOptions.bucket,
            Key: uploadOptions.key
        };*/

        /*s3.upload(params).
        on('httpUploadProgress', function(evt) {
          console.log('Progress:', evt.loaded, '/', evt.total); 
        }).
        send(function(err, data) { console.log(err, data) });*/

        /*s3.upload(params, function (err, data) {
            if (err) console.log("An error occurred", err);
            console.log("Uploaded the file at", data.Location);
        })*/

        // console.log(uploadOptions.key);
    } catch (error) {
        console.log(error);
    }

}


Teste();
//Teste2();