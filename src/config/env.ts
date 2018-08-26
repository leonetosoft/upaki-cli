export interface Config {
    url: string;
    credentials?: UpakiCredentials;
}

export interface UpakiCredentials {
    secretToken: string, credentialKey: string
}

export namespace Environment {
    export var config: Config;
}   