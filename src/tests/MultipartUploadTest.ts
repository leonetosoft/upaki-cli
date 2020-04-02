import { Upaki, Parts } from "../upaki";
import { readFileSync } from "fs";
import { join } from "path";
import { Environment } from "../config/env";

Environment.config.url = 'http://192.168.15.12:8080/api';
const upaki_credentials = JSON.parse(readFileSync('apikey.json', 'utf8'));
console.log(upaki_credentials);
const upaki = new Upaki(upaki_credentials);

async function test() {
    let upload = await upaki.MultipartUpload(
        join('data-test', '7z1900-x64.exe'),
        'TESTE-UPAKI-CLI/7z1900-x64.exe',
        {},
        { maxPartSize: 5242880, concurrentParts: 1, uploadTimeout: 30000 },
        {},
        undefined,
        true);

    upload.on('error', (error) => {
        console.log(error.code);
        console.log(error);
    });

    upload.on('part', (details) => {
        console.log(`Part uploaded Etag=${details.ETag} PartNumber=${details.PartNumber} Uploaded size ${details.uploadedSize}`);
    });

    upload.on('dbug', (msg) => {
        console.log(`MultipartUploader[DBUG]: ${msg}`);
    });

    upload.on('uploaded', (details) => {
        console.log(`Upload complete`);
        console.log(details);
    });

    upload.on('retrying', (partNumber, parts: Parts[]) => {
        console.log(`Retry send partNumber=${partNumber} parts sended=${JSON.stringify(parts)}`);
    });

    upload.on('ready', (id) => {
        console.log(`Upload ready id: ${id}`);
    });
}

test();