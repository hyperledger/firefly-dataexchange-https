import * as chai from 'chai';
import { expect } from 'chai';
import sinonChai from 'sinon-chai';
import * as blobs from '../../src/handlers/blobs';
import { setLogLevel } from '../../src/lib/logger';
import * as utils from '../../src/lib/utils';
import path from 'path';
import mockFs from 'mock-fs';

chai.use(sinonChai);

let mockFilesystem = {
    'some/other/path': {/** another empty directory */ },
};
setLogLevel('debug');

afterEach(() => mockFs.restore());

describe('blobs', () => {
    it('deletes both blob file and metadata successfully when both exist', async () => {
        const testBlobPath = path.join(utils.constants.DATA_DIRECTORY, utils.constants.BLOBS_SUBDIRECTORY);
        mockFilesystem[testBlobPath as keyof typeof mockFilesystem] = {
            'test-blob': 'file content here',
            'test-blob.metadata.json': JSON.stringify({
                hash: 'testHash',
                lastUpdate: 123,
                size: 10
            })
        };

        mockFs(mockFilesystem);
        const metadata = await blobs.deleteBlob('test-blob');

        expect(metadata?.size).to.equal(10);
        expect(metadata?.hash).to.equal('testHash');
        expect(metadata?.lastUpdate).to.equal(123);
    });

    it('deletes metadata that exists when file does not exist', async () => {
        const testBlobPath = path.join(utils.constants.DATA_DIRECTORY, utils.constants.BLOBS_SUBDIRECTORY);
        mockFilesystem[testBlobPath as keyof typeof mockFilesystem] = {
            'test-blob.metadata.json': JSON.stringify({
                hash: 'testHash',
                lastUpdate: 123,
                size: 10
            })
        };

        mockFs(mockFilesystem);
        const metadata = await blobs.deleteBlob('test-blob');

        expect(metadata?.size).to.equal(10);
        expect(metadata?.hash).to.equal('testHash');
        expect(metadata?.lastUpdate).to.equal(123);
    });

    it('deletes blob file successfully even if metadata does not exist', async () => {
        const testBlobPath = path.join(utils.constants.DATA_DIRECTORY, utils.constants.BLOBS_SUBDIRECTORY);
        mockFilesystem[testBlobPath as keyof typeof mockFilesystem] = {
            'test-blob': 'file content here',
        };

        mockFs(mockFilesystem);
        const metadata = await blobs.deleteBlob('test-blob');

        expect(metadata).to.be.null;
    });

});
