import { Upaki } from "../upaki";
import { readFileSync } from "fs";

//Environment.config.url = 'http://192.168.15.12:8080/api';
const upaki_credentials = JSON.parse(readFileSync('apikey.json', 'utf8'));
console.log(upaki_credentials);
const upaki = new Upaki(upaki_credentials);

upaki.getDocumentStatistics({
    useDeviceId: false
}).then(rs => {
    console.log(rs);
}).catch(err => {
console.log(err)
})