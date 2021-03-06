import { Environment } from '../config/env';
import * as request from 'request';
import { Upaki } from '../upaki/Upaki';
import { CURRENT_API_VERSION } from '../version';

export namespace RestRequest {

    export function getDefaultHeaders(headers) {
        headers["content-type"] = 'application/json';
        headers["Authorization"] = 'JWT ' + Environment.config.credentials.credentialKey + ' ' + Environment.config.credentials.secretToken;
        return headers;
    }
    export interface WSRespose<T> {
        code: number;
        msg: string;
        data: T
    }

    export function requestAwaiter<T>(options): Promise<WSRespose<T>> {
        return new Promise((resolve, reject) => {
            options.url = `${options.url}${options.url.indexOf('?') === -1 ? `?apiVersion=${CURRENT_API_VERSION}`: `&apiVersion=${CURRENT_API_VERSION}`}`;
            request({ ...options, proxy: Upaki.PROXY_CONFIG }, (error: any, response: request.Response, body: any) => {
                if (error || ((response && response.statusCode != 200) || !response)) {
                    if (response && response.statusCode === 403) {
                        reject(new Error(JSON.stringify(response.body)));
                    } else {
                        reject(new Error(body));
                    }
                } else if (body.code != undefined && body.code == 1) {
                    resolve(body as WSRespose<T>);
                } else {
                    reject(new Error(body.msg));
                }
            })
        });
    }

    export async function GET<T>(route: string, headers: {}) {
        headers = getDefaultHeaders(headers);
        const options = {
            method: 'GET',
            url: Environment.config.url + '/' + route,
            headers: headers,
            json: true
        };
        return await requestAwaiter<T>(options);
    }

    export async function POST<T>(route: string, body: any, headers = {}) {
        headers = getDefaultHeaders(headers);
        const options = {
            method: 'POST',
            url: Environment.config.url + '/' + route,
            headers: headers,
            body: body,
            json: true
        };
        return await requestAwaiter<T>(options);
    }

    export async function POST_PUBLIC<T>(route: string, body: any, headers = {}) {
        const options = {
            method: 'POST',
            url: Environment.config.url + '/' + route,
            headers: headers,
            body: body,
            json: true
        };
        return await requestAwaiter<T>(options);
    }

    export async function PUT<T>(route: string, body: any, headers: {}) {
        headers = getDefaultHeaders(headers);
        const options = {
            method: 'PUT',
            url: Environment.config.url + '/' + route,
            headers: headers,
            body: body,
            json: true
        };
        return await requestAwaiter<T>(options);
    }
}