import * as assert from 'assert';
import { goferTests } from 'goferfs-test-suite';

import { GcsAdapter } from './.';
const storage = require('@google-cloud/storage');

const credentials = JSON.parse(process.env.GCS_CREDENTIALS);
const bucket = process.env.GCS_BUCKET;
const projectId = process.env.GCS_PROJECT_ID;

describe('Google Cloud Storage Adapter', function () {
    this.timeout(10000);

    it.skip(`should work, but doesn't`, () => {
        const gcs = storage({
            projectId,
            credentials,
        });

        return gcs.bucket(bucket).file('test.txt').save('Contents');
    });

    it('should work, and does', () => {
        const gcs = storage({
            projectId,
            credentials,
        });

        return gcs.bucket(bucket).file('test/test.txt').save('Contents');
    });


    const adapter = new GcsAdapter({
        projectId,
        bucket,
        credentials,
    });

    describe('Adapter Specific Tests', () => {
        it('should require a bucket', () => {
            assert.throws(() => (new GcsAdapter({ projectId, bucket: '', credentials })), /'bucket'/);
        });

        it('should require a projectId', () => {
            assert.throws(() => (new GcsAdapter({ projectId: '', bucket, credentials })), /'projectId'/);
        });

        it('should require credentials or keyFilename', () => {
            assert.throws(() => (new GcsAdapter({ projectId, bucket })), /'keyFilename' or 'credentials'/);
        });
    });

    goferTests(adapter);
});
