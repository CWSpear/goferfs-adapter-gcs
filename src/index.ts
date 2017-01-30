import * as Stream from 'stream';
import { basename, dirname, extname } from 'path';
import { lookup as mimeLookup } from 'mime';
import * as Bluebird from 'bluebird';
import { IAdapter } from 'goferfs-types/interfaces';
import { Visibility, Metadata, File, StreamFile } from 'goferfs-types';

// no typescript support for google-cloud =/
const storage = require('@google-cloud/storage');

export default class GcsAdapter implements IAdapter {
    private bucket: string;
    private gcs: any;
    private bucketEnsured: boolean = false;

    targetVersion = '1.0';

    constructor({
        projectId,
        bucket,

        // must provide path to keyfile.json...
        keyFilename,
        // ...or the contents of a keyfile.json...
        credentials,
        // ...or an API key for auth
        key,
    }: {
        projectId: string,
        bucket: string,
        keyFilename?: string,
        credentials?: string,
        key?: string,
    }) {
        this.bucket = bucket;

        this.gcs = storage({
            projectId: projectId,
            [
                (keyFilename && 'keyFilename') ||
                (credentials && 'credentials') ||
                (key && 'key')
            ]: keyFilename || credentials || keyFilename,
        });
    }

    async write(path: string, contents: string, { visibility }: { visibility: Visibility } = { visibility: Visibility.Public }): Promise<Metadata> {
        await (await this.getGcsFile(path)).save(contents, {
            [visibility === Visibility.Private ? 'private' : 'public']: true,
        });

        return this.getMetadata(path);
    }

    async writeStream(path: string, stream: Stream, { visibility }: { visibility: Visibility } = { visibility: Visibility.Public }): Promise<Metadata> {
        const gcsFile = await this.getGcsFile(path);

        return new Promise((resolve, reject) => {
            stream
                .pipe(gcsFile.createWriteStream({
                    [visibility === Visibility.Private ? 'private' : 'public']: true,
                }))
                .on('error', reject)
                .on('finish', async () => resolve(await this.getMetadata(path)));
        }) as Promise<Metadata>;
    }

    async move(oldPath: string, newPath: string): Promise<Metadata> {
        const gcsFile = await this.getGcsFile(oldPath);

        await gcsFile.move(newPath);

        return this.getMetadata(newPath);
    }

    async copy(oldPath: string, clonedPath: string): Promise<Metadata> {
        const gcsFile = await this.getGcsFile(oldPath);

        await gcsFile.copy(clonedPath);

        return this.getMetadata(clonedPath);
    }

    async delete(path: string): Promise<boolean> {
        await (await this.getGcsFile(path)).delete();

        return true;
    }

    async deleteDir(path: string): Promise<boolean> {
        await (await this.getBucket()).deleteFiles({
            prefix: path,
        });

        return true;
    }

    // GCS doesn't have the concept of an (empty) "directory"
    async createDir(path: string): Promise<Metadata> {
        return null;
    }

    async setVisibility(path: string, visibility: Visibility): Promise<Metadata> {
        let response;
        if (visibility === Visibility.Public) {
            response = await (await this.getGcsFile(path)).makePublic();
        } else if (visibility === Visibility.Private) {
            response = await (await this.getGcsFile(path)).makePrivate();
        } else {
            throw new Error(`Unsupported Visibility: ${visibility}`);
        }

        return this.getMetadata(path);
    }

    async getVisibility(path: string): Promise<Visibility> {

        return (await this.getMetadata(path)).visibility;
    }

    async exists(path: string): Promise<boolean> {
        return (await (await this.getGcsFile(path)).exists())[0];
    }

    async read(path: string): Promise<any> {
        // GCS only returns streams, so we convert to string
        const { contents, metadata }: any = await Bluebird.props({
            contents: this.streamToString((await this.getGcsFile(path)).createReadStream()),
            metadata: this.getMetadata(path),
        });

        return new File(metadata, contents);
    }

    async readStream(path: string): Promise<StreamFile> {
        const { stream, metadata }: any = await Bluebird.props({
            stream: (await this.getGcsFile(path)).createReadStream(),
            metadata: this.getMetadata(path),
        });

        return new StreamFile(metadata, stream);
    }

    async getMetadata(path: string): Promise<Metadata> {
        const gcsFile = await this.getGcsFile(path);

        const [[metadata], [acl]] = await await Bluebird.all([
            gcsFile.getMetadata(),
            gcsFile.acl.get(),
        ]);

        return this.getMetadataFromGcsMetadata(metadata, acl);
    }

    private async getMetadataFromGcsMetadata(gscFileMetadata: any, gscFileAcl: any): Promise<Metadata> {
        return new Metadata({
            path: gscFileMetadata.name,
            name: basename(gscFileMetadata.name),
            ext: extname(gscFileMetadata.name),
            parentDir: dirname(gscFileMetadata.name),
            size: +gscFileMetadata.size,
            isFile: true,
            isDir: false,
            timestamp: new Date(gscFileMetadata.timeCreated),
            visibility: this.getVisibilityFromAcl(gscFileAcl),
            mimetype: mimeLookup(gscFileMetadata.name),
        });
    }

    private getVisibilityFromAcl(gscFileAcl: any): Visibility {
        for (let acl of gscFileAcl) {
            if (acl.entity === 'allUsers' && acl.role === 'READER') {
                return Visibility.Public;
            }
        }

        return Visibility.Private;
    }

    private streamToString(stream: Stream): Promise<string> {
        return new Promise((resolve, reject) => {
            const chunks: Array<string> = [];
            stream
                .on('data', (chunk: string) => chunks.push(chunk))
                .on('end', () => resolve(chunks.join('')))
                .on('error', reject);
        });
    }

    private async getGcsFile(path: string): Promise<any> {
        return (await this.getBucket()).file(path);
    }

    private async getBucket(): Promise<any> {
        const bucket = this.gcs.bucket(this.bucket);

        if (this.bucketEnsured) {
            return bucket;
        }

        const [exists] = await bucket.exists();

        if (exists) {
            return bucket;
        }

        await bucket.create();

        return bucket;
    }
}
