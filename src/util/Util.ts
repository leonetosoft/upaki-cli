import * as fs from 'fs';
import * as crypto from 'crypto';

export namespace Util {
    /**
     * Pega ext do arquivo
     * @param path 
     */
    export function getExtension(path) {
        var basename = path.split(/[\\/]/).pop(),  // extract file name from full path ...
            // (supports `\\` and `/` separators)
            pos = basename.lastIndexOf(".");       // get last position of `.`

        if (basename === "" || pos < 1)            // if file name is empty or ...
            return "";                             //  `.` not found (-1) or comes first (0)

        return basename.slice(pos + 1);            // extract extension ignoring `.`
    }

    /**
     * Pega o nome do arquivo pelo path
     * @param prevname 
     */
    export function getFileNameByPath(prevname) {
        return prevname.replace(/^(.*[/\\])?/, '').replace(/(\.[^.]*)$/, '');
    }

    export function getFileSize(path: string): Promise<number> {
        return new Promise((resolve, reject) => {
            fs.stat(path, (err, stat) => {
            if(err) {
                reject(err);
            } else {
                resolve(stat.size)
            }
            });
        });
    }

    export function Etag_DEPRECATED(buffer) {
        var hash = crypto.createHash('md5');
        hash.update(buffer);
        return hash.digest('hex');
    };


    export function Etagv2(filename, algorithm = 'md5'): Promise<string> {
        return new Promise((resolve, reject) => {
            // Algorithm depends on availability of OpenSSL on platform
            // Another algorithms: 'sha1', 'md5', 'sha256', 'sha512' ...
            let shasum = crypto.createHash(algorithm);
            try {
                let s = fs.createReadStream(filename);
                s.on('data', function (data) {
                    shasum.update(data)
                });
                // making digest
                s.on('end', function () {
                    const hash = shasum.digest('hex')
                    resolve(hash);
                });

                s.on('error', (err) => { 
                    reject(err);           
                });
            } catch (error) {
                reject(error);
            }
        });
    }
}