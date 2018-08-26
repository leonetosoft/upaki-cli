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

    export function getFileSize(path: string) {
        const stats = fs.statSync(path);
        return stats.size;
    }

    export function Etag(buffer) {
        var hash = crypto.createHash('md5');
        hash.update(buffer);
        return hash.digest('hex');
    };
}