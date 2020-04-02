import { Upaki, Parts } from "../upaki";
import { readFileSync } from "fs";
import { join } from "path";
import { Environment } from "../config/env";

Environment.config.url = 'http://192.168.15.12:8080/api';
const upaki_credentials = JSON.parse(readFileSync('apikey.json', 'utf8'));
console.log(upaki_credentials);
const upaki = new Upaki(upaki_credentials);

async function test() {
    let upload = await upaki.Upload(
        join('data-test', '7z1900-x64.exe'),
        'TESTE-UPAKI-CLI/7z1900-x64_single.exe',
        {}
    );

    upload.on('progress', (progress) => {
        // console.log(progress.loaded, progress.total);
        console.log(`Upload bytes sent ${progress.loaded}/${progress.total}`);
    });

    upload.on('uploaded', (data) => {
        console.log(`Upload  finished ${data}`);
    });

    upload.on('error', (err) => {
        console.log(err);
    })
}

test();