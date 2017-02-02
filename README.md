# Google Cloud Storage Adapter for Gofer

[Gofer](https://github.com/cohesivelabs/goferfs) is a file abstraction library written in Node. It aims to have one consistent API for multiple different storage solutions, called Adapters. This is the Adapter for Google Cloud Storage.

**Notice:** Due to an upstream issue with `grpc` (used by `google-cloude-node`), this may not work on Node 7... See https://github.com/GoogleCloudPlatform/google-cloud-node/issues/1753

## Getting Started

First, install Gofer and this Adapter:

```
npm install goferfs goferfs-adapter-gcs
```

To create an adapter, you need to provide your Project ID, a bucket name, and your authentication from https://console.cloud.google.com/storage.

You must create the bucket ahead of time, this adapter assumes one already exists.

Google Cloud supports 3 ways to authenticate: a path to a `keyfile.json`, the contents of a `keyfile.json` or an API key:
 

```js
import Gofer from 'goferfs';
import GcsAdapter from 'goferfs-adapter-gcs';

const gcsAdapter = new GcsAdapter({
    projectId: 'my-project',
    bucket: 'my-bucket',
    
    // provide ONE of the following:

    // the path to a keyfile.json...
    keyFilename: 'path/to/keyfile.json',
    // ...or the contents of a keyfile.json
    credentials: require('path/to/keyfile.json'),
});

const gofer = new Gofer(gcsAdapter);
```

## Docs

For documentation on usage, please visit the main [Gofer project](https://github.com/cohesivelabs/goferfs), while noting the caveats below:

## Caveats

Google Cloud Storage (GCS) does not have the concept of "directories." `createDirectory` will do nothing and always returns `Promise<null>`.

However, you _can_ delete by prefix, so `deleteDir('some/directory')` _will_ delete all the files prefixed with that, i.e. `some/directory/file1.txt` and `some/directory/file2.txt`, etc.

The `Public` visibility mode will make files publicly viewable via the web (i.e. via the `Share` checkbox in the console), whereas `Private` files are not. 

## Contribution

To contribute...
