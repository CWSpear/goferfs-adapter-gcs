import * as Stream from 'stream';
import { basename, dirname, extname } from 'path';
import { lookup as mimeLookup } from 'mime';
import * as Bluebird from 'bluebird';
import * as iconv from 'iconv-lite';
import { IAdapter, Visibility, Metadata, File, StreamFile, WriteOptions, ReadOptions } from 'goferfs-types';

// no typescript support for google-cloud =/
const storage: any = require('@google-cloud/storage');

export class GcsAdapter implements IAdapter<GcsAdapter> {
    private bucket: string;
    private gcs: any;

    adapterName = 'gcs';
    targetVersion = '1.0';

    constructor({
        projectId,
        bucket,

        // must provide path to keyfile.json...
        keyFilename,
        // ...or the contents of a keyfile.json
        credentials,
    }: {
        projectId: string,
        bucket: string,
        keyFilename?: string,
        credentials?: Object,
    }) {
        this.bucket = bucket;

        if (!bucket) {
            throw new Error(`You must provide a 'bucket' to the GcsAdapter constructor`);
        }

        if (!projectId) {
            throw new Error(`You must provide a 'projectId' to the GcsAdapter constructor`);
        }

        if (!keyFilename && !credentials) {
            throw new Error(`You must provide a 'keyFilename' or 'credentials' to the GcsAdapter constructor`);
        }

        this.gcs = storage({
            projectId,
            [keyFilename ? 'keyFilename' : 'credentials']: keyFilename || credentials,
        });
    }

    async write(path: string, contents: string | Buffer, { visibility, encoding }: WriteOptions): Promise<Metadata> {
        if (typeof contents === 'string' || contents instanceof String) {
            contents = Buffer.from(<string>contents, encoding);
        }

        await this.getGcsFile(path).save(contents, {
            [visibility === Visibility.Private ? 'private' : 'public']: true,
        });

        return this.getMetadata(path);
    }

    async writeStream(path: string, stream: Stream, { visibility, encoding }: WriteOptions): Promise<Metadata> {
        const gcsFile = this.getGcsFile(path);

        return new Promise((resolve, reject) => {
            stream
                .pipe(iconv.decodeStream(encoding))
                .pipe(gcsFile.createWriteStream({
                    [visibility === Visibility.Private ? 'private' : 'public']: true,
                }))
                .on('error', reject)
                .on('finish', async () => resolve(await this.getMetadata(path)));
        }) as Promise<Metadata>;
    }

    async move(oldPath: string, newPath: string): Promise<Metadata> {
        const gcsFile = this.getGcsFile(oldPath);

        await gcsFile.move(newPath);

        return this.getMetadata(newPath);
    }

    async copy(oldPath: string, clonedPath: string): Promise<Metadata> {
        const gcsFile = this.getGcsFile(oldPath);

        await gcsFile.copy(clonedPath);

        return this.getMetadata(clonedPath);
    }

    async delete(path: string): Promise<boolean> {
        await this.getGcsFile(path).delete();

        return true;
    }

    async deleteDir(path: string): Promise<boolean> {
        await this.getBucket().deleteFiles({
            prefix: path,
        });

        return true;
    }

    // GCS doesn't have the concept of an (empty) "directory"
    async createDir(path: string): Promise<Metadata> {
        return null;
    }

    async setVisibility(path: string, visibility: Visibility): Promise<Metadata> {
        if (visibility === Visibility.Public) {
            await this.getGcsFile(path).makePublic();
        } else if (visibility === Visibility.Private) {
            await this.getGcsFile(path).makePrivate();
        } else {
            throw new Error(`Unsupported Visibility: ${visibility}`);
        }

        return this.getMetadata(path);
    }

    async getVisibility(path: string): Promise<Visibility> {

        return (await this.getMetadata(path)).visibility;
    }

    async exists(path: string): Promise<boolean> {
        return (await this.getGcsFile(path).exists())[0];
    }

    async read(path: string, { encoding }: ReadOptions): Promise<any> {
        // GCS only returns streams, so we convert to string
        let stream = this.getGcsFile(path).createReadStream();

        if (encoding) {
            stream = stream.pipe(iconv.decodeStream(encoding || 'utf8'));
        }

        const { contents, metadata }: any = await Bluebird.props({
            contents: this.streamToString(stream, encoding === null),
            metadata: this.getMetadata(path),
        });

        return new File(metadata, contents);
    }

    async readStream(path: string, { encoding }: ReadOptions): Promise<StreamFile> {
        const { stream, metadata }: any = await Bluebird.props({
            stream: this.getGcsFile(path).createReadStream().pipe(iconv.decodeStream(encoding || 'utf8')),
            metadata: this.getMetadata(path),
        });

        return new StreamFile(metadata, stream);
    }

    async getMetadata(path: string): Promise<Metadata> {
        const gcsFile = this.getGcsFile(path);

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

    private streamToString(stream: Stream, returnAsBuffer: boolean): Promise<string> {
        if (returnAsBuffer) {
            return new Promise((resolve, reject) => {
                const chunks: Buffer[] = [];
                stream
                    .on('data', (chunk: Buffer) => chunks.push(chunk))
                    .on('end', () => resolve(Buffer.concat(chunks)))
                    .on('error', reject);
            });
        }

        return new Promise((resolve, reject) => {
            const chunks: string[] = [];
            stream
                .on('data', (chunk: string) => chunks.push(chunk))
                .on('end', () => resolve(chunks.join('')))
                .on('error', reject);
        });
    }

    private getGcsFile(path: string): any {
        return this.getBucket().file(path);
    }

    private getBucket(): any {
        return this.gcs.bucket(this.bucket);
    }
}
