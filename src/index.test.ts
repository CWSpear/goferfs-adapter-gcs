import { goferTests } from 'goferfs-test-suite';

import GcsAdapter from './.';

const API_KEY = process.env.GCS_API_KEY;
const BUCKET = process.env.GCS_BUCKET;
const PROJECT_ID = process.env.GCS_PROJECT_ID;

describe('Google Cloud Storage Adapter', function () {
    this.timeout(10000);

    const adapter = new GcsAdapter({
        projectId: PROJECT_ID,
        bucket: BUCKET,
        key: API_KEY,
    });

    goferTests(adapter);
});
